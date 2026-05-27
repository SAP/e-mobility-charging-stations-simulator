import { isDeepStrictEqual } from 'node:util'

// Direct path: the `exception/index.js` barrel re-exports OCPPError, causing a TDZ cycle.
import { BaseError } from '../exception/BaseError.js'

const moduleName = 'ConfigurationMigrations'

/**
 * Deprecated configuration key → canonical destination mapping.
 *
 * - `string` (top-level or dotted path): remap value to that destination.
 * - `null`: deprecated key with no canonical destination; delete + warn only.
 *
 * Source keys may be dotted to express nested deprecations
 * (e.g. `'worker.elementStartDelay'`). Single source of truth for both the
 * migration sweep (consumed by `remapDeprecatedKeys`) and the schema's
 * `@deprecated` `.describe()` strings (sync enforced by
 * `ConfigurationSchema.test.ts`).
 */
export const DEPRECATED_KEY_REMAPPINGS: Readonly<Record<string, null | string>> = {
  autoReconnectMaxRetries: null,
  chargingStationsPerWorker: 'worker.elementsPerWorker',
  distributeStationsToTenantsEqually: null,
  distributeStationToTenantEqually: null,
  elementAddDelay: 'worker.elementAddDelay',
  logConsole: 'log.console',
  logEnabled: 'log.enabled',
  logErrorFile: 'log.errorFile',
  logFile: 'log.file',
  logFormat: 'log.format',
  logLevel: 'log.level',
  logMaxFiles: 'log.maxFiles',
  logMaxSize: 'log.maxSize',
  logRotate: 'log.rotate',
  logStatisticsInterval: 'log.statisticsInterval',
  stationTemplateURLs: 'stationTemplateUrls',
  supervisionURLs: 'supervisionUrls',
  uiWebSocketServer: null,
  useWorkerPool: null,
  'worker.elementStartDelay': 'worker.elementAddDelay',
  workerPoolMaxSize: 'worker.poolMaxSize',
  workerPoolMinSize: 'worker.poolMinSize',
  workerPoolSize: 'worker.poolMaxSize',
  workerPoolStrategy: null,
  workerProcess: 'worker.processType',
  workerStartDelay: 'worker.startDelay',
}

/**
 * Current schema version for charging station configurations.
 * Bump only on breaking changes (field rename, removal, type narrowing).
 * Single authoritative location — concurrent bumps force git merge conflict.
 */
export const CURRENT_CONFIGURATION_SCHEMA_VERSION = 1

export interface FieldError {
  message: string
  path: string
}

export type MigrationFn = (
  config: Record<string, unknown>,
  filePath: string
) => Record<string, unknown>

export interface RemapDeprecatedKeysResult {
  config: Record<string, unknown>
  fieldErrors: FieldError[]
  warnings: RemapWarning[]
}

interface RemapWarning {
  canonicalDestination: null | string
  sourceKey: string
}

/**
 * Read the value at a dotted `path`. Returns `{ found: false }` if any
 * intermediate segment is non-object, an array, or missing.
 * @param target - source object
 * @param path - dotted path (e.g. `'worker.elementStartDelay'`)
 * @returns `{ found, value }`
 */
const getAtPath = (
  target: Record<string, unknown>,
  path: string
): { found: boolean; value: unknown } => {
  const parts = path.split('.')
  let cursor: unknown = target
  for (const part of parts) {
    if (cursor == null || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return { found: false, value: undefined }
    }
    const obj = cursor as Record<string, unknown>
    if (!(part in obj)) {
      return { found: false, value: undefined }
    }
    cursor = obj[part]
  }
  return { found: true, value: cursor }
}

/**
 * Delete the leaf at a dotted `path`. Intermediate non-object segments
 * cause the deletion to be a no-op (defensive against external mutation).
 * @param target - object to mutate in place
 * @param path - dotted path of the leaf to delete
 */
const deleteAtPath = (target: Record<string, unknown>, path: string): void => {
  const parts = path.split('.')
  let cursor: Record<string, unknown> = target
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cursor[parts[i]]
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      return
    }
    cursor = next as Record<string, unknown>
  }
  Reflect.deleteProperty(cursor, parts[parts.length - 1])
}

/**
 * Write `value` at dotted `path`, creating intermediate objects as needed.
 * Records two failure modes via `fieldErrors`: non-object intermediate, and
 * leaf collision with a non-equal value. Equal-value writes are no-ops.
 * @param target - object to mutate in place
 * @param path - dotted destination path
 * @param value - value to write at the leaf
 * @param source - originating deprecated key (for error messages)
 * @param fieldErrors - error accumulator
 * @returns true on write or no-op, false when an error is recorded
 */
const setAtPath = (
  target: Record<string, unknown>,
  path: string,
  value: unknown,
  source: string,
  fieldErrors: FieldError[]
): boolean => {
  const parts = path.split('.')
  let cursor: Record<string, unknown> = target
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    const next = cursor[part]
    if (next == null) {
      cursor[part] = {}
      cursor = cursor[part] as Record<string, unknown>
      continue
    }
    if (typeof next !== 'object' || Array.isArray(next)) {
      fieldErrors.push({
        message: `cannot migrate deprecated key '${source}' to '${path}': intermediate '${parts
          .slice(0, i + 1)
          .join('.')}' is not an object`,
        path: source,
      })
      return false
    }
    cursor = next as Record<string, unknown>
  }
  const leaf = parts[parts.length - 1]
  if (leaf in cursor) {
    if (!isDeepStrictEqual(cursor[leaf], value)) {
      fieldErrors.push({
        message: `deprecated key '${source}' value conflicts with existing '${path}' (canonical key or another deprecated alias resolved here)`,
        path: source,
      })
      return false
    }
    return true
  }
  cursor[leaf] = value
  return true
}

/**
 * Apply the deprecated-key remap table to `config`.
 *
 * Pure: returns a new object; `config` is not mutated.
 * Always safe to call — idempotent when no deprecated keys are present.
 *
 * - emits one `warning` entry per deprecated key encountered so the caller
 *   can route them to the appropriate IO channel
 * - records collision and non-object-intermediate failures as `fieldErrors`
 *   for the caller to surface as a typed error
 * - equal-value collisions are no-ops (tolerates copy-paste between
 *   deprecated and canonical keys)
 *
 * Designed to run unconditionally regardless of `$schemaVersion` so that
 * v1 configurations still containing deprecated keys never silently drop
 * user values.
 * @param config - raw parsed configuration object
 * @returns `{ config, fieldErrors, warnings }`
 */
export const remapDeprecatedKeys = (config: Record<string, unknown>): RemapDeprecatedKeysResult => {
  const out = structuredClone(config)
  const fieldErrors: FieldError[] = []
  const warnings: RemapWarning[] = []

  for (const [sourceKey, canonicalDestination] of Object.entries(DEPRECATED_KEY_REMAPPINGS)) {
    const { found, value } = getAtPath(out, sourceKey)
    if (!found) {
      continue
    }
    warnings.push({ canonicalDestination, sourceKey })
    if (canonicalDestination != null && canonicalDestination !== sourceKey) {
      const ok = setAtPath(out, canonicalDestination, value, sourceKey, fieldErrors)
      if (!ok) {
        // Leave source key in place so its name is referenced in the error.
        continue
      }
    }
    deleteAtPath(out, sourceKey)
  }

  return { config: out, fieldErrors, warnings }
}

/**
 * v0 → v1: pure version-bump. Deprecated-key remapping happens upstream
 * in `remapDeprecatedKeys`. `$schemaVersion` is stamped by
 * `applyConfigurationMigration`.
 * @param config - source configuration object
 * @param _filePath - configuration file path (unused)
 * @returns new configuration object
 */
const migrateV0ToV1: MigrationFn = (config, _filePath) => structuredClone(config)

/**
 * Sequential migration chain. Index `i` migrates a v`i` configuration to v`i+1`.
 * To add schema version N+1: append one `migrateV{N}ToV{N+1}` function and
 * bump `CURRENT_CONFIGURATION_SCHEMA_VERSION`.
 */
export const migrationChain: readonly MigrationFn[] = [migrateV0ToV1]

/**
 * Strict integer-string pattern for `$schemaVersion`. Rejects permissive
 * `Number()` coercions (`'1.0'`, `'0x1'`, `'1e0'`, `' 1 '`, `''`, `'+1'`).
 */
const SCHEMA_VERSION_STRING_PATTERN = /^\d+$/

/**
 * Coerce a raw `$schemaVersion` value to a validated integer.
 * - Missing → 0 (legacy/pre-versioning configuration — triggers v0→CURRENT migration)
 * - Non-negative integer (number or canonical decimal string) → parsed integer
 * - Anything else (negative, float, NaN, Infinity, hex/exponential/whitespace
 *   string, future version) → fatal error
 * @param raw - Raw value from parsed JSON
 * @returns Validated integer version
 */
export const coerceConfigurationVersion = (raw: unknown): number => {
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
    } else if (typeof raw === 'string' || typeof raw === 'boolean') {
      rawStr = String(raw)
    } else if (typeof raw === 'bigint') {
      rawStr = `${raw.toString()}n`
    } else if (typeof raw === 'symbol') {
      rawStr = raw.toString()
    } else {
      rawStr = 'unknown'
    }
    throw new BaseError(
      `${moduleName}.coerceConfigurationVersion: Invalid $schemaVersion value '${rawStr}' — must be a non-negative integer`
    )
  }
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BaseError(
      `${moduleName}.coerceConfigurationVersion: Invalid $schemaVersion value '${rawStr}' — must be a non-negative integer`
    )
  }
  if (parsed > CURRENT_CONFIGURATION_SCHEMA_VERSION) {
    throw new BaseError(
      `${moduleName}.coerceConfigurationVersion: Configuration $schemaVersion ${parsed.toString()} is newer than supported version ${CURRENT_CONFIGURATION_SCHEMA_VERSION.toString()}. Update the simulator to handle this configuration`
    )
  }
  return parsed
}

/**
 * Apply migrations sequentially from the given source version to
 * `CURRENT_CONFIGURATION_SCHEMA_VERSION`, advancing `$schemaVersion` after each hop.
 * Returns a new object; the input `config` is not mutated.
 * @param sourceVersion - Source schema version to migrate from
 * @param config - Raw parsed configuration object (already remapped)
 * @param filePath - File path for error messages
 * @returns Migrated configuration object
 */
export const applyConfigurationMigration = (
  sourceVersion: number,
  config: Record<string, unknown>,
  filePath: string
): Record<string, unknown> => {
  if (sourceVersion < 0 || sourceVersion >= CURRENT_CONFIGURATION_SCHEMA_VERSION) {
    throw new BaseError(
      `${moduleName}.applyConfigurationMigration: No migration defined for $schemaVersion ${sourceVersion.toString()} → ${CURRENT_CONFIGURATION_SCHEMA_VERSION.toString()}`
    )
  }
  let migrated = structuredClone(config)
  for (let v = sourceVersion; v < CURRENT_CONFIGURATION_SCHEMA_VERSION; v++) {
    migrated = migrationChain[v](migrated, filePath)
    migrated.$schemaVersion = v + 1
  }
  return migrated
}
