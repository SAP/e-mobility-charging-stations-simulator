import { BaseError } from '../exception/BaseError.js'

const moduleName = 'ConfigurationMigrations'

/**
 * Deprecated top-level key → canonical destination mapping.
 * Keys with dotted destinations (e.g. `'log.enabled'`) are written into the
 * nested sub-section by the v0→v1 migration step; intermediate objects are
 * created if absent.
 * Used by both `transformConfiguration` (warnings) and the v0→v1 migration step.
 */
export const DEPRECATED_KEY_REMAPPINGS: Readonly<Record<string, string>> = {
  autoReconnectMaxRetries: 'autoReconnectMaxRetries',
  chargingStationsPerWorker: 'worker.elementsPerWorker',
  distributeStationsToTenantsEqually: 'supervisionUrlDistribution',
  distributeStationToTenantEqually: 'supervisionUrlDistribution',
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
  uiWebSocketServer: 'uiServer',
  useWorkerPool: 'worker.processType',
  workerPoolMaxSize: 'worker.poolMaxSize',
  workerPoolMinSize: 'worker.poolMinSize',
  workerPoolSize: 'worker.poolMaxSize',
  workerPoolStrategy: 'worker.processType',
  workerProcess: 'worker.processType',
  workerStartDelay: 'worker.startDelay',
}

/**
 * Current schema version for charging station configurations.
 * Bump only on breaking changes (field rename, removal, type narrowing).
 * Single authoritative location — concurrent bumps force git merge conflict.
 */
export const CURRENT_CONFIGURATION_SCHEMA_VERSION = 1

export type MigrationFn = (
  config: Record<string, unknown>,
  filePath: string
) => Record<string, unknown>

/**
 * Write a value at a dotted path into `target`, creating intermediate objects as needed.
 * Only writes if the canonical key is not already present (conflict: canonical wins).
 * @param target
 * @param path
 * @param value
 */
function setAtPath (target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let cursor: Record<string, unknown> = target
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (cursor[part] == null || typeof cursor[part] !== 'object') {
      cursor[part] = {}
    }
    cursor = cursor[part] as Record<string, unknown>
  }
  const leaf = parts[parts.length - 1]
  cursor[leaf] ??= value
}

/**
 * v0 → v1: remap all deprecated top-level keys to their canonical destinations.
 * Pure function — returns a new object; `config` is not mutated.
 * Warnings are emitted by `transformConfiguration` (T9); this step only moves data.
 * @param config
 * @param _filePath
 */
const migrateV0ToV1: MigrationFn = (config, _filePath) => {
  let out = structuredClone(config)
  for (const [legacy, canonical] of Object.entries(DEPRECATED_KEY_REMAPPINGS)) {
    if (legacy in out) {
      if (legacy !== canonical) {
        if (canonical.includes('.')) {
          setAtPath(out, canonical, out[legacy])
        } else if (!(canonical in out)) {
          out[canonical] = out[legacy]
        }
      }
      out = Object.fromEntries(Object.entries(out).filter(([k]) => k !== legacy))
    }
  }
  out.$schemaVersion = 1
  return out
}

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
 * @param config - Raw parsed configuration object
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
  let migrated = { ...config }
  for (let v = sourceVersion; v < CURRENT_CONFIGURATION_SCHEMA_VERSION; v++) {
    migrated = migrationChain[v](migrated, filePath)
    migrated.$schemaVersion = v + 1
  }
  return migrated
}
