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
 * Sequential migration chain. Index `i` migrates a v`i` template to v`i+1`.
 * To add schema version N+1: append one `migrateV{N}ToV{N+1}` function and
 * bump `CURRENT_SCHEMA_VERSION`.
 */
const migrationChain: readonly MigrationFn[] = [migrateV0ToV1]

/**
 * Strict integer-string pattern for `$schemaVersion`. Rejects permissive
 * `Number()` coercions (`'1.0'`, `'0x1'`, `'1e0'`, `' 1 '`, `''`, `'+1'`).
 */
const SCHEMA_VERSION_STRING_PATTERN = /^\d+$/

/**
 * Coerce a raw `$schemaVersion` value to a validated integer.
 * - Missing → 0 (legacy/pre-versioning template — triggers v0→CURRENT migration
 *   so deprecated keys (`supervisionUrl`, `authorizationFile`,
 *   `payloadSchemaValidation`, `mustAuthorizeAtRemoteStart`) are renamed
 *   before strict schema validation)
 * - Non-negative integer (number or canonical decimal string) → parsed integer
 * - Anything else (negative, float, NaN, Infinity, hex/exponential/whitespace
 *   string, future version) → fatal error
 * @param raw - Raw value from parsed JSON
 * @returns Validated integer version
 */
export const coerceVersion = (raw: unknown): number => {
  if (raw == null) {
    return 0
  }
  let parsed: number
  let rawStr: string
  if (typeof raw === 'number') {
    parsed = raw
    rawStr = String(raw)
  } else if (typeof raw === 'string' && SCHEMA_VERSION_STRING_PATTERN.test(raw)) {
    parsed = Number(raw)
    rawStr = raw
  } else {
    if (typeof raw === 'object') {
      rawStr = JSON.stringify(raw)
    } else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      rawStr = String(raw)
    } else if (typeof raw === 'bigint') {
      rawStr = `${raw.toString()}n`
    } else if (typeof raw === 'symbol') {
      rawStr = raw.toString()
    } else {
      rawStr = 'unknown'
    }
    throw new BaseError(
      `${moduleName}.coerceVersion: Invalid $schemaVersion value '${rawStr}' — must be a non-negative integer`
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
 * Apply migrations sequentially from the given source version to
 * `CURRENT_SCHEMA_VERSION`, advancing `$schemaVersion` after each hop.
 * Mutates `template` in place and returns the same reference. Callers that
 * need to preserve their input must clone before invocation.
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
  if (sourceVersion < 0 || sourceVersion >= CURRENT_SCHEMA_VERSION) {
    throw new BaseError(
      `${moduleName}.applyMigration: No migration defined for $schemaVersion ${sourceVersion.toString()} → ${CURRENT_SCHEMA_VERSION.toString()}`
    )
  }
  logger.debug(
    `${moduleName}.applyMigration: Migrating template${filePath != null ? ` '${filePath}'` : ''} from v${sourceVersion.toString()} to v${CURRENT_SCHEMA_VERSION.toString()}`
  )
  let migrated = template
  for (let v = sourceVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    migrated = migrationChain[v](migrated)
    migrated.$schemaVersion = v + 1
  }
  return migrated
}

/**
 * Migrate a v0 template to v1 by renaming deprecated keys to their v1 equivalents.
 * @param template - Pre-migration template object
 * @returns Same reference with deprecated keys renamed
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
