import type { ZodError } from 'zod'

import chalk from 'chalk'

import type { ConfigurationData } from '../types/index.js'
import type { FieldError } from './ConfigurationMigrations.js'

import { BaseError } from '../exception/index.js'
import {
  applyConfigurationMigration,
  coerceConfigurationVersion,
  CURRENT_CONFIGURATION_SCHEMA_VERSION,
  remapDeprecatedKeys,
} from './ConfigurationMigrations.js'
import { ConfigurationSchema } from './ConfigurationSchema.js'
import { configurationLogPrefix } from './ConfigurationUtils.js'
import { isEmpty } from './Utils.js'

const moduleName = 'ConfigurationValidation'

/**
 * Phase of the validation pipeline that produced a failure.
 * - `remap`: deprecated-key sweep (collisions, non-object intermediates)
 * - `schema`: strict Zod parse against `ConfigurationSchema`
 *
 * Schema-version migration-chain failures (`coerceConfigurationVersion`,
 * `applyConfigurationMigration`) propagate as bare `BaseError`, mirroring
 * `TemplateValidation`.
 */
type ValidationPhase = 'remap' | 'schema'

/**
 * Error thrown when a configuration fails the migration sweep or the strict
 * schema validation. Carries structured field errors plus migration context.
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
   * Wrap a Zod validation failure with `phase: 'schema'`.
   * @param zodError - the underlying Zod error
   * @param context - file path + optional migration source version
   * @param context.filePath - configuration file path
   * @param context.migratedFrom - source schema version when migration ran
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
 * Validate a parsed configuration through the
 * remap → migrate → strict-parse → transform pipeline.
 * Throws `BaseError` for shape failures, `ConfigurationValidationError`
 * for migration collisions or schema failures.
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
  // Defensive clone: $schemaVersion is rewritten below.
  const parsedRecord = structuredClone(parsed) as Record<string, unknown>

  const version = coerceConfigurationVersion(parsedRecord.$schemaVersion)
  parsedRecord.$schemaVersion = version
  const migratedFrom = version < CURRENT_CONFIGURATION_SCHEMA_VERSION ? version : undefined

  const { config: swept, fieldErrors: remapErrors, warnings } = remapDeprecatedKeys(parsedRecord)
  for (const { canonicalDestination, sourceKey } of warnings) {
    const guidance =
      canonicalDestination == null
        ? 'no longer used; remove it from the configuration'
        : `use '${canonicalDestination}' instead`
    // console.warn: logger.warn would recurse via Configuration → validateConfiguration.
    console.warn(
      `${chalk.green(configurationLogPrefix())} ${chalk.yellow(
        `${moduleName}: deprecated configuration key '${sourceKey}' detected in '${filePath}'; ${guidance}`
      )}`
    )
  }
  if (remapErrors.length > 0) {
    throw new ConfigurationValidationError(remapErrors, {
      filePath,
      migratedFrom,
      phase: 'remap',
    })
  }

  const migrated =
    migratedFrom != null ? applyConfigurationMigration(version, swept, filePath) : swept

  const result = ConfigurationSchema.safeParse(migrated)
  if (!result.success) {
    throw ConfigurationValidationError.fromZodError(result.error, { filePath, migratedFrom })
  }

  return transformConfiguration(result.data, filePath)
}

/**
 * Post-validation transform: deep clone so callers may mutate the result.
 * @param validated - schema-validated configuration data
 * @param _filePath - configuration file path (unused)
 * @returns deep clone of the validated configuration
 */
const transformConfiguration = (
  validated: ConfigurationData,
  _filePath: string
): ConfigurationData => structuredClone(validated)
