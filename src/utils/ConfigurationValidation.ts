import type { ZodError } from 'zod'

import chalk from 'chalk'

import type { ConfigurationData, WorkerConfiguration } from '../types/index.js'
import type { FieldError } from './FieldError.js'

import { BaseError } from '../exception/index.js'
import {
  DEFAULT_POOL_MAX_SIZE,
  DEFAULT_POOL_MIN_SIZE,
  DEFAULT_WORKER_PROCESS_TYPE,
  WorkerProcessType,
} from '../worker/index.js'
import {
  applyConfigurationMigration,
  coerceConfigurationVersion,
  CURRENT_CONFIGURATION_SCHEMA_VERSION,
  remapDeprecatedKeys,
} from './ConfigurationMigrations.js'
import { ConfigurationSchema } from './ConfigurationSchema.js'
import { configurationLogPrefix } from './ConfigurationUtils.js'
import { formatFieldErrorsSummary, mapZodIssuesToFieldErrors } from './FieldError.js'
import { assertIsJsonObject, clone, isEmpty, isNotEmptyArray } from './Utils.js'

/**
 * Resolve the pool bounds of a dynamic-pool worker configuration.
 * A dynamic pool needs both bounds strictly ordered (min < max), and
 * `poolifier` rejects anything else with a `RangeError` during construction.
 * Bounds are validated and completed here, at validation time, so a bad
 * configuration fails with a structured error instead of a bare startup
 * exception.
 *
 * - Both explicit: they must be strictly ordered, otherwise the configuration
 *   is rejected with structured field errors.
 * - Only `poolMinSize`: the maximum is derived from the minimum, using the
 *   CPU-based default as a floor.
 * - Only `poolMaxSize`: the minimum is derived from the maximum, using the
 *   CPU-based default as a cap. A maximum of 1 cannot be worked around
 *   (the minimum would be 0) so the configuration is rejected.
 * - None explicit: the CPU-based defaults apply unchanged.
 *
 * Fixed-pool and worker-set configurations are returned unchanged: fixedPool
 * consumes only the maximum and workerSet ignores both bounds.
 * @param worker - the worker section from the schema-validated configuration
 * @param filePath - configuration file path (for error messages)
 * @param migratedFrom - source schema version when migration ran
 * @returns the worker section with bounds resolved
 */
const resolveDynamicPoolBounds = (
  worker: WorkerConfiguration,
  filePath: string,
  migratedFrom: number | undefined
): WorkerConfiguration => {
  const processType = worker.processType ?? DEFAULT_WORKER_PROCESS_TYPE
  if (processType !== WorkerProcessType.dynamicPool) {
    return worker
  }
  const configuredMin = worker.poolMinSize
  const configuredMax = worker.poolMaxSize
  if (configuredMin != null && configuredMax != null) {
    if (configuredMin >= configuredMax) {
      throw new ConfigurationValidationError(
        [
          {
            message: `dynamic pool maximum (${configuredMax.toString()}) must be greater than minimum (${configuredMin.toString()})`,
            path: 'worker.poolMaxSize',
          },
        ],
        { filePath, migratedFrom, phase: 'schema' }
      )
    }
    return worker
  }
  if (configuredMin != null) {
    return {
      ...worker,
      poolMaxSize: Math.max(DEFAULT_POOL_MAX_SIZE, configuredMin + 1),
    }
  }
  if (configuredMax != null) {
    const derivedMin = Math.min(DEFAULT_POOL_MIN_SIZE, configuredMax - 1)
    if (derivedMin < 1) {
      throw new ConfigurationValidationError(
        [
          {
            message: `dynamic pool maximum of ${configuredMax.toString()} is invalid without a minimum (minimum would be 0, and a dynamic pool requires min < max)`,
            path: 'worker.poolMaxSize',
          },
        ],
        { filePath, migratedFrom, phase: 'schema' }
      )
    }
    return { ...worker, poolMinSize: derivedMin }
  }
  return worker
}

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
  public override readonly name = 'ConfigurationValidationError' as const
  public readonly phase: ValidationPhase

  public constructor (
    fieldErrors: FieldError[],
    context: { filePath: string; migratedFrom?: number; phase: ValidationPhase }
  ) {
    const fieldSummary = formatFieldErrorsSummary(fieldErrors)
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
    const fieldErrors: FieldError[] = mapZodIssuesToFieldErrors(zodError)
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
  assertIsJsonObject(
    parsed,
    new BaseError(
      `${moduleName}.validateConfiguration: Invalid simulator configuration payload (not a JSON object) ${filePath}`
    )
  )
  if (isEmpty(parsed)) {
    throw new BaseError(
      `${moduleName}.validateConfiguration: Empty simulator configuration from file ${filePath}`
    )
  }
  // Defensive clone: $schemaVersion is rewritten below.
  const parsedRecord = clone(parsed) as Record<string, unknown>

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
  if (isNotEmptyArray(remapErrors)) {
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

  const worker =
    result.data.worker != null
      ? resolveDynamicPoolBounds(result.data.worker, filePath, migratedFrom)
      : undefined

  return transformConfiguration(
    worker != null ? { ...result.data, worker } : result.data,
    filePath
  )
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
): ConfigurationData => clone(validated)
