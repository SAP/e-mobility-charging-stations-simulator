import { BaseError } from '../exception/index.js'
import { isNotEmptyString, logger } from '../utils/index.js'

const moduleName = 'TemplateMigrations'

/**
 * Current schema version for charging station templates.
 * Bump only on breaking changes (field rename, removal, type narrowing).
 * Single authoritative location — concurrent bumps force git merge conflict.
 */
export const CURRENT_SCHEMA_VERSION = 1

type MigrationFn = (template: Record<string, unknown>) => Record<string, unknown>

/**
 * Migration registry: maps source version to a function that migrates
 * directly to CURRENT_SCHEMA_VERSION.
 */
const migrations: ReadonlyMap<number, MigrationFn> = new Map<number, MigrationFn>([
  [0, migrateV0ToV1],
])

/**
 * Coerce a raw `$schemaVersion` value to a validated integer.
 * - Missing → 1 (default)
 * - String numeric → parsed integer
 * - Negative, float, or future → fatal error
 * @param raw - Raw value from parsed JSON
 * @returns Validated integer version
 */
export const coerceVersion = (raw: unknown): number => {
  if (raw == null) {
    return 1
  }
  let rawStr: string
  if (typeof raw === 'object') {
    rawStr = JSON.stringify(raw)
  } else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    rawStr = String(raw)
  } else {
    rawStr = 'unknown'
  }
  const parsed = typeof raw === 'string' ? Number(raw) : raw
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new BaseError(
      `${moduleName}.coerceVersion: Invalid $schemaVersion value '${rawStr}' — must be a positive integer`
    )
  }
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BaseError(
      `${moduleName}.coerceVersion: Invalid $schemaVersion value '${rawStr}' — must be a non-negative integer`
    )
  }
  if (parsed > CURRENT_SCHEMA_VERSION) {
    throw new BaseError(
      `${moduleName}.coerceVersion: Template $schemaVersion ${parsed.toString()} is newer than supported version ${CURRENT_SCHEMA_VERSION.toString()}. Update the simulator to handle this template`
    )
  }
  return parsed
}

/**
 * Apply migration from the given source version to CURRENT_SCHEMA_VERSION.
 * Returns the migrated template (mutated in place for efficiency).
 * @param sourceVersion - Source schema version to migrate from
 * @param template - Raw parsed template object
 * @param filePath - Optional file path for log messages
 * @returns Migrated template object
 */
export const applyMigration = (
  sourceVersion: number,
  template: Record<string, unknown>,
  filePath?: string
): Record<string, unknown> => {
  const migrationFn = migrations.get(sourceVersion)
  if (migrationFn == null) {
    throw new BaseError(
      `${moduleName}.applyMigration: No migration defined for $schemaVersion ${sourceVersion.toString()} → ${CURRENT_SCHEMA_VERSION.toString()}`
    )
  }
  logger.debug(
    `${moduleName}.applyMigration: Migrating template${filePath != null ? ` '${filePath}'` : ''} from v${sourceVersion.toString()} to v${CURRENT_SCHEMA_VERSION.toString()}`
  )
  const migrated = migrationFn(template)
  migrated.$schemaVersion = CURRENT_SCHEMA_VERSION
  return migrated
}

/**
 * Migrate v0 (no $schemaVersion) to v1.
 * Replaces warnTemplateKeysDeprecation() — renames 4 deprecated keys.
 * @param template - Raw parsed template object with deprecated keys
 * @returns Template with deprecated keys migrated
 */
function migrateV0ToV1 (template: Record<string, unknown>): Record<string, unknown> {
  const deprecatedKeys: { deprecatedKey: string; key?: string }[] = [
    { deprecatedKey: 'supervisionUrl', key: 'supervisionUrls' },
    { deprecatedKey: 'authorizationFile', key: 'idTagsFile' },
    { deprecatedKey: 'payloadSchemaValidation', key: 'ocppStrictCompliance' },
    { deprecatedKey: 'mustAuthorizeAtRemoteStart', key: 'remoteAuthorization' },
  ]
  for (const { deprecatedKey, key } of deprecatedKeys) {
    if (template[deprecatedKey] != null) {
      const logMsg = `Deprecated template key '${deprecatedKey}' found${
        isNotEmptyString(key) ? `. Use '${key}' instead` : ''
      }`
      logger.warn(`${moduleName}.migrateV0ToV1: ${logMsg}`)
      if (key != null) {
        template[key] = template[deprecatedKey]
      }
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete template[deprecatedKey]
    }
  }
  return template
}
