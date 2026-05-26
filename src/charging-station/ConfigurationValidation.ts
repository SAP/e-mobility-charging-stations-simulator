import type { ZodError } from 'zod'

import type { ConfigurationData } from '../types/index.js'

import { BaseError } from '../exception/index.js'
import { isEmpty, logger } from '../utils/index.js'
import {
  applyConfigurationMigration,
  coerceConfigurationVersion,
  CURRENT_CONFIGURATION_SCHEMA_VERSION,
  DEPRECATED_KEY_REMAPPINGS,
} from './ConfigurationMigrations.js'
import { ConfigurationSchema } from './ConfigurationSchema.js'

export const moduleName = 'ConfigurationValidation'

/**
 * Error thrown when a charging station configuration fails Zod validation.
 * Includes structured field errors and migration context for diagnostics.
 */
export class ConfigurationValidationError extends BaseError {
  public readonly fieldErrors: { message: string; path: string }[]
  public readonly filePath: string
  public readonly migratedFrom?: number

  public constructor (zodError: ZodError, context: { filePath: string; migratedFrom?: number }) {
    const fieldErrors = zodError.issues.map(issue => ({
      message: issue.message,
      path: issue.path.join('.'),
    }))
    const fieldSummary = fieldErrors
      .map(e => `  - ${e.path !== '' ? e.path : '(root)'}: ${e.message}`)
      .join('\n')
    const migrationNote =
      context.migratedFrom != null
        ? ` (migrated from v${context.migratedFrom.toString()} → v${CURRENT_CONFIGURATION_SCHEMA_VERSION.toString()})`
        : ''
    super(
      `${moduleName}: Configuration validation failed for '${context.filePath}'${migrationNote}:\n${fieldSummary}`
    )
    this.filePath = context.filePath
    this.fieldErrors = fieldErrors
    this.migratedFrom = context.migratedFrom
  }
}

/**
 * Validate a parsed configuration object through the migration → validation → transform pipeline.
 * @param parsed - Raw parsed JSON value (any type — guarded internally)
 * @param filePath - Configuration file path (for error messages)
 * @returns Validated and transformed ConfigurationData
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
  // Clone before mutating $schemaVersion below and inside applyConfigurationMigration,
  // so the caller's parsed JSON stays untouched.
  const parsedRecord = structuredClone(parsed) as Record<string, unknown>

  const version = coerceConfigurationVersion(parsedRecord.$schemaVersion)
  parsedRecord.$schemaVersion = version
  const migratedFrom = version < CURRENT_CONFIGURATION_SCHEMA_VERSION ? version : undefined
  const migrated =
    migratedFrom != null
      ? applyConfigurationMigration(version, parsedRecord, filePath)
      : parsedRecord

  const result = ConfigurationSchema.safeParse(migrated)
  if (!result.success) {
    throw new ConfigurationValidationError(result.error, { filePath, migratedFrom })
  }

  return transformConfiguration(result.data, filePath)
}

/**
 * Post-validation transform.
 *
 * Emits one `logger.warn` per deprecated top-level key still present in the
 * validated configuration. The actual remapping is performed by the v0→v1
 * migration step; this layer only informs the operator.
 * @param validated - Schema-validated configuration data
 * @param filePath - Configuration file path (for log messages)
 * @returns Transformed ConfigurationData (structurally identical clone)
 */
export const transformConfiguration = (validated: unknown, filePath: string): ConfigurationData => {
  const transformed = structuredClone(validated) as ConfigurationData
  for (const key of Object.keys(DEPRECATED_KEY_REMAPPINGS)) {
    if ((transformed as unknown as Record<string, unknown>)[key] != null) {
      const canonical = DEPRECATED_KEY_REMAPPINGS[key]
      logger.warn(
        `${moduleName}.transformConfiguration: deprecated configuration key '${key}' detected in '${filePath}'; will be removed in a future major version. Use '${canonical}' instead`
      )
    }
  }
  return transformed
}
