import type { ZodError } from 'zod'

import type { ChargingStationTemplate } from '../types/index.js'

import { BaseError } from '../exception/index.js'
import { isEmpty, isNotEmptyString, logger } from '../utils/index.js'
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
    super(`${moduleName}: Template validation failed for '${context.filePath}':\n${fieldSummary}`)
    this.filePath = context.filePath
    this.fieldErrors = fieldErrors
    this.migratedFrom = context.migratedFrom
  }
}

/**
 * Validate a parsed template object through the migration → validation → transform pipeline.
 * @param parsed - Raw parsed JSON object
 * @param filePath - Template file path (for error messages)
 * @returns Validated and transformed ChargingStationTemplate
 */
export const validateTemplate = (
  parsed: Record<string, unknown>,
  filePath: string
): ChargingStationTemplate => {
  // Null/empty checks (absorbs checkTemplate's null/empty validation)
  if (isEmpty(parsed)) {
    throw new BaseError(
      `${moduleName}.validateTemplate: Empty charging station information from template file ${filePath}`
    )
  }

  // Version coercion and migration
  const version = coerceVersion(parsed.$schemaVersion)
  const migratedFrom = version < CURRENT_SCHEMA_VERSION ? version : undefined
  const migrated =
    version < CURRENT_SCHEMA_VERSION ? applyMigration(version, parsed, filePath) : parsed

  // Schema validation
  const result = TemplateSchema.safeParse(migrated)
  if (!result.success) {
    throw new TemplateValidationError(result.error, { filePath, migratedFrom })
  }

  return transformTemplate(result.data, filePath)
}

/**
 * Post-validation transform. Separate from schema because schemas must be pure (no side-effects).
 *
 * Preserves checkConnectorsConfiguration() mutation:
 * forces randomConnectors=true when connector count > configured connector definitions.
 *
 * Also warns about missing idTagsFile (non-fatal advisory from checkTemplate).
 * @param validated - Schema-validated template data
 * @param filePath - Template file path (for log messages)
 * @returns Transformed ChargingStationTemplate
 */
function transformTemplate (
  validated: Record<string, unknown>,
  filePath: string
): ChargingStationTemplate {
  // Advisory warning for missing idTagsFile (from checkTemplate)
  if (
    validated.idTagsFile == null ||
    (typeof validated.idTagsFile === 'string' && !isNotEmptyString(validated.idTagsFile))
  ) {
    logger.warn(
      `${moduleName}.transformTemplate: Missing id tags file in template file ${filePath}. That can lead to issues with the Automatic Transaction Generator`
    )
  }

  // Connector count check and randomConnectors mutation (from checkConnectorsConfiguration)
  if (validated.Connectors != null && typeof validated.Connectors === 'object') {
    const connectors = validated.Connectors as Record<string, unknown>
    const connectorKeys = Object.keys(connectors)
    const templateMaxConnectors = connectorKeys.length
    const templateMaxAvailableConnectors =
      connectors['0'] != null ? templateMaxConnectors - 1 : templateMaxConnectors

    // Determine configured max connectors
    let configuredMaxConnectors = 0
    if (Array.isArray(validated.numberOfConnectors)) {
      const arr = validated.numberOfConnectors as number[]
      configuredMaxConnectors = arr.length > 0 ? arr[0] : 0
    } else if (typeof validated.numberOfConnectors === 'number') {
      configuredMaxConnectors = validated.numberOfConnectors
    } else {
      configuredMaxConnectors = templateMaxAvailableConnectors
    }

    if (configuredMaxConnectors > templateMaxAvailableConnectors) {
      if (validated.randomConnectors !== true) {
        logger.warn(
          `${moduleName}.transformTemplate: Number of connectors exceeds the number of connector configurations in template ${filePath}, forcing random connector configurations affectation`
        )
        validated.randomConnectors = true
      }
    }

    if (templateMaxConnectors === 0) {
      logger.warn(
        `${moduleName}.transformTemplate: Charging station information from template ${filePath} with empty connectors configuration`
      )
    } else if (templateMaxConnectors < 0) {
      logger.error(
        `${moduleName}.transformTemplate: Charging station information from template ${filePath} with no connectors configuration defined`
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
