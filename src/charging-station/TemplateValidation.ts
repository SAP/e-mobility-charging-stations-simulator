import type { ZodError } from 'zod'

import type { ChargingStationTemplate } from '../types/index.js'

import { BaseError } from '../exception/index.js'
import { isEmpty, isNotEmptyString, logger } from '../utils/index.js'
import { getMaxConfiguredNumberOfConnectors } from './Helpers.js'
import { applyMigration, coerceVersion, CURRENT_SCHEMA_VERSION } from './TemplateMigrations.js'
import { TemplateSchema } from './TemplateSchema.js'

const moduleName = 'TemplateValidation'

/**
 * Error thrown when a charging station template fails Zod validation.
 * Includes structured field errors and migration context for diagnostics.
 */
export class TemplateValidationError extends BaseError {
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
        ? ` (migrated from v${context.migratedFrom.toString()} → v${CURRENT_SCHEMA_VERSION.toString()})`
        : ''
    super(
      `${moduleName}: Template validation failed for '${context.filePath}'${migrationNote}:\n${fieldSummary}`
    )
    this.filePath = context.filePath
    this.fieldErrors = fieldErrors
    this.migratedFrom = context.migratedFrom
  }
}

/**
 * Validate a parsed template object through the migration → validation → transform pipeline.
 * @param parsed - Raw parsed JSON value (any type — guarded internally)
 * @param filePath - Template file path (for error messages)
 * @returns Validated and transformed ChargingStationTemplate
 */
export const validateTemplate = (parsed: unknown, filePath: string): ChargingStationTemplate => {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BaseError(
      `${moduleName}.validateTemplate: Invalid charging station template payload (not a JSON object) in template file ${filePath}`
    )
  }
  if (isEmpty(parsed)) {
    throw new BaseError(
      `${moduleName}.validateTemplate: Empty charging station information from template file ${filePath}`
    )
  }
  // Clone before mutating $schemaVersion below and inside applyMigration,
  // so the caller's parsed JSON stays untouched.
  const parsedRecord = structuredClone(parsed) as Record<string, unknown>

  const version = coerceVersion(parsedRecord.$schemaVersion)
  parsedRecord.$schemaVersion = version
  const migratedFrom = version < CURRENT_SCHEMA_VERSION ? version : undefined
  const migrated =
    migratedFrom != null ? applyMigration(version, parsedRecord, filePath) : parsedRecord

  const result = TemplateSchema.safeParse(migrated)
  if (!result.success) {
    throw new TemplateValidationError(result.error, { filePath, migratedFrom })
  }

  return transformTemplate(result.data, filePath)
}

/**
 * Post-validation transform.
 *
 * Forces `randomConnectors=true` when the worst-case configured connector
 * count (max of `numberOfConnectors[]`, or its scalar value) exceeds the
 * available connector definitions in the template — runtime random pick
 * can hit any value of the array, so any value above the available count
 * requires `randomConnectors=true` to be safe under any pick.
 *
 * Warns about missing `idTagsFile` (advisory, non-fatal).
 *
 * Warnings fire once per `(templateFile, schemaVersion)` cache miss,
 * not per station instance.
 *
 * Connector-count diagnostics fire only for the `Connectors` topology;
 * the `Evses` topology does not currently emit equivalent warnings.
 * @param validated - Schema-validated template data
 * @param filePath - Template file path (for log messages)
 * @returns Transformed ChargingStationTemplate
 */
function transformTemplate (
  validated: Record<string, unknown>,
  filePath: string
): ChargingStationTemplate {
  if (
    validated.idTagsFile == null ||
    (typeof validated.idTagsFile === 'string' && !isNotEmptyString(validated.idTagsFile))
  ) {
    logger.warn(
      `${moduleName}.transformTemplate: Missing id tags file in template file ${filePath}. That can lead to issues with the Automatic Transaction Generator`
    )
  }

  if (validated.Connectors != null && typeof validated.Connectors === 'object') {
    const connectors = validated.Connectors as Record<string, unknown>
    const templateMaxConnectors = Object.keys(connectors).length
    const templateMaxAvailableConnectors =
      connectors['0'] != null ? templateMaxConnectors - 1 : templateMaxConnectors

    const configuredMaxConnectors =
      getMaxConfiguredNumberOfConnectors(
        validated.numberOfConnectors as number | readonly number[] | undefined
      ) ?? templateMaxAvailableConnectors

    if (
      configuredMaxConnectors > templateMaxAvailableConnectors &&
      validated.randomConnectors !== true
    ) {
      logger.warn(
        `${moduleName}.transformTemplate: Number of connectors (${configuredMaxConnectors.toString()}) exceeds the number of connector configurations (${templateMaxAvailableConnectors.toString()}) in template ${filePath}, forcing random connector configurations affectation`
      )
      validated.randomConnectors = true
    }

    if (templateMaxConnectors === 0) {
      logger.warn(
        `${moduleName}.transformTemplate: Charging station information from template ${filePath} with empty connectors configuration`
      )
    }

    if (configuredMaxConnectors <= 0) {
      logger.warn(
        `${moduleName}.transformTemplate: Charging station information from template ${filePath} with ${configuredMaxConnectors.toString()} connectors`
      )
    }
  }

  return validated as unknown as ChargingStationTemplate
}
