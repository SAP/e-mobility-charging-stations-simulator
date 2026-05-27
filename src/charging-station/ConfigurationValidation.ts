import type { ZodError } from 'zod'

import chalk from 'chalk'

import type { ConfigurationData } from '../types/index.js'

import { BaseError } from '../exception/index.js'
import { logPrefix } from '../utils/ConfigurationUtils.js'
import { isEmpty } from '../utils/index.js'
import {
  applyConfigurationMigration,
  coerceConfigurationVersion,
  CURRENT_CONFIGURATION_SCHEMA_VERSION,
  remapDeprecatedKeys,
} from './ConfigurationMigrations.js'
import { ConfigurationSchema } from './ConfigurationSchema.js'

const moduleName = 'ConfigurationValidation'

interface FieldError {
  message: string
  path: string
}

/**
 * Phase of the validation pipeline that produced a failure.
 * - `migration`: deprecated-key sweep (collisions, non-object intermediates)
 * - `schema`: strict Zod parse against `ConfigurationSchema`
 */
type ValidationPhase = 'migration' | 'schema'

/**
 * Error thrown when a charging station simulator configuration fails
 * the migration sweep or the strict schema validation.
 *
 * Carries structured field errors plus migration context for diagnostics.
 * Use the `fromZodError` factory when wrapping a Zod failure; the primary
 * constructor accepts pre-built `FieldError[]` for migration-phase errors.
 */
export class ConfigurationValidationError extends BaseError {
  public readonly fieldErrors: FieldError[]
  public readonly filePath: string
  public readonly migratedFrom?: number
  public readonly phase: ValidationPhase

  public constructor (
    fieldErrors: FieldError[],
    context: { filePath: string; migratedFrom?: number; phase: ValidationPhase }
  ) {
    const fieldSummary = fieldErrors
      .map(e => `  - ${e.path !== '' ? e.path : '(root)'}: ${e.message}`)
      .join('\n')
    const migrationNote =
      context.migratedFrom != null
        ? ` (migrated from v${context.migratedFrom.toString()} → v${CURRENT_CONFIGURATION_SCHEMA_VERSION.toString()})`
        : ''
    super(
      `${moduleName}: Configuration validation failed [${context.phase}] for '${context.filePath}'${migrationNote}:\n${fieldSummary}`
    )
    this.filePath = context.filePath
    this.fieldErrors = fieldErrors
    this.migratedFrom = context.migratedFrom
    this.phase = context.phase
  }

  /**
   * Wrap a Zod validation failure as a `ConfigurationValidationError`
   * with `phase: 'schema'`.
   * @param zodError - the underlying Zod error
   * @param context - contextual metadata for the wrapped error
   * @param context.filePath - configuration file path that failed validation
   * @param context.migratedFrom - source schema version when migration ran, or undefined
   * @returns a typed validation error ready to throw
   */
  public static fromZodError (
    zodError: ZodError,
    context: { filePath: string; migratedFrom?: number }
  ): ConfigurationValidationError {
    const fieldErrors: FieldError[] = zodError.issues.map(issue => ({
      message: issue.message,
      path: issue.path.join('.'),
    }))
    return new ConfigurationValidationError(fieldErrors, { ...context, phase: 'schema' })
  }
}

/**
 * Validate a parsed configuration object through the
 * remap → migrate → strict-parse → transform pipeline.
 *
 * Pipeline stages:
 *  1. Shape guard (object, non-array, non-empty).
 *  2. `coerceConfigurationVersion` on `$schemaVersion` (rejects future versions).
 *  3. `remapDeprecatedKeys` — UNCONDITIONAL deprecated-key sweep:
 *     emits one `console.warn` per deprecated key encountered, throws a
 *     `ConfigurationValidationError` (phase=`migration`) on collision or
 *     non-object intermediate. Runs regardless of `$schemaVersion` so v1
 *     configs still containing deprecated keys do not silently drop values.
 *  4. `applyConfigurationMigration` — version-bump chain (only if older).
 *  5. `ConfigurationSchema.safeParse` — strict schema parse; throws a
 *     `ConfigurationValidationError` (phase=`schema`) on failure.
 *  6. `transformConfiguration` — pure deep clone (slot for future
 *     cross-field invariants).
 * @param parsed - Raw parsed JSON value (any type — guarded internally)
 * @param filePath - Configuration file path (for error messages)
 * @returns Validated and transformed `ConfigurationData`
 */
export const validateConfiguration = (parsed: unknown, filePath: string): ConfigurationData => {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BaseError(
      `${moduleName}.validateConfiguration: Invalid simulator configuration payload (not a JSON object) ${filePath}`
    )
  }
  if (isEmpty(parsed)) {
    throw new BaseError(
      `${moduleName}.validateConfiguration: Empty simulator configuration from file ${filePath}`
    )
  }
  // Clone before mutating $schemaVersion below and inside the migration chain,
  // so the caller's parsed JSON stays untouched.
  const parsedRecord = structuredClone(parsed) as Record<string, unknown>

  const version = coerceConfigurationVersion(parsedRecord.$schemaVersion)
  parsedRecord.$schemaVersion = version
  const migratedFrom = version < CURRENT_CONFIGURATION_SCHEMA_VERSION ? version : undefined

  // Stage 3 — unconditional deprecated-key sweep.
  const { config: swept, fieldErrors: remapErrors, warnings } = remapDeprecatedKeys(parsedRecord)
  for (const { canonicalDestination, sourceKey } of warnings) {
    const guidance =
      canonicalDestination == null
        ? 'no longer used; remove it from the configuration'
        : `use '${canonicalDestination}' instead`
    // `console.warn` (not `logger.warn`) avoids a re-entrant call into the
    // `Configuration` singleton during static initialization. The Logger
    // proxy resolves its writer lazily via `Configuration.getConfigurationSection('log')`,
    // which triggers `getConfigurationData()` → `validateConfiguration()` recursion
    // when this warning fires from inside the boot path.
    console.warn(
      `${chalk.green(logPrefix())} ${chalk.yellow(
        `${moduleName}: deprecated configuration key '${sourceKey}' detected in '${filePath}'; ${guidance}`
      )}`
    )
  }
  if (remapErrors.length > 0) {
    throw new ConfigurationValidationError(remapErrors, {
      filePath,
      migratedFrom,
      phase: 'migration',
    })
  }

  // Stage 4 — version-bump migration chain (lean post-sweep).
  const migrated =
    migratedFrom != null ? applyConfigurationMigration(version, swept, filePath) : swept

  // Stage 5 — strict schema parse.
  const result = ConfigurationSchema.safeParse(migrated)
  if (!result.success) {
    throw ConfigurationValidationError.fromZodError(result.error, { filePath, migratedFrom })
  }

  // Stage 6 — pure post-validation transform.
  return transformConfiguration(result.data, filePath)
}

/**
 * Post-validation transform.
 *
 * Currently a structurally identical deep clone of the validated
 * configuration (returns a fresh object on every call so callers can
 * mutate the result without affecting subsequent validations).
 *
 * Cross-field invariants (e.g. `worker.poolMaxSize >= worker.poolMinSize`)
 * can be added here in a future task without changing the public signature.
 * @param validated - schema-validated configuration data
 * @param _filePath - configuration file path (unused at this step)
 * @returns deep clone of the validated configuration
 */
export const transformConfiguration = (
  validated: ConfigurationData,
  _filePath: string
): ConfigurationData => structuredClone(validated)
