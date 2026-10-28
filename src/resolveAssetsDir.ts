// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { env } from 'node:process'

import { AssetsDirError } from './exception/AssetsDirError.js'

/**
 * @file Single source of truth for locating the project assets directory.
 *
 * Every on-disk asset path is derived from this module so that there is only
 * one place describing how the `assets/` directory is resolved.
 *
 * Contract: the resolved directory must contain the expected asset layout: a
 * `config.json` file (if absent, the simulator falls back to its built-in
 * default configuration), a `station-templates/` subdirectory with the
 * charging station configuration templates, a `json-schemas/` subdirectory
 * with the OCPP JSON schemas, and optionally RFID tags or ev-profiles files.
 * It must also be writable: the runtime creates a `configurations/`
 * subdirectory in it (lazily, on the first persistence write) to persist
 * per-station charging station configuration, OCPP 2.0 certificates, and the
 * simulator state. The expected layout is a contract, not validated: the
 * resolver asserts that an override target exists and is a directory, and
 * never checks the content, so a wrong layout fails at the scattered
 * downstream readers. The source tree additionally holds a `ui-protocol/`
 * subdirectory with Insomnia WebSocket request collections (see the README);
 * it is an artifact for humans: no code reads it, and `pnpm build` removes
 * it from `dist/assets`.
 *
 * Bundle: when the code is bundled (`pnpm build`), `import.meta.dirname`
 * evaluates to the output bundle directory, so this resolves to `dist/assets`
 * for code bundled into `dist/start.js`. When running directly from TypeScript
 * sources via `tsx` (development and tests), it resolves to `src/assets`, which
 * is the single, editable source of truth.
 */

/**
 * Resolves the directory that holds the project assets.
 *
 * Lookup order:
 * 1. `EVSE_ASSETS_DIR` — explicit override, set by the test scripts, and
 *    available for packaging or custom deployments. An empty value is treated
 *    as unset. A non-empty value must point to an existing directory,
 *    otherwise {@link AssetsDirError} is thrown. Absolute paths are used as-is;
 *    relative paths are resolved against the current working directory. Some
 *    consumers resolve the directory once at module load or process start, so
 *    set this variable before starting the process.
 * 2. `<this-module-dir>/assets` — the `assets/` folder that sits beside this
 *    module. It is never validated, as it exists by construction (`src/assets`
 *    is tracked in the repository and `dist/assets` is created by `pnpm build`).
 * @throws {AssetsDirError} When `EVSE_ASSETS_DIR` is set but does not point to an existing directory.
 * @returns Absolute path to the assets directory.
 */
export function resolveAssetsDir (): string {
  const override = env.EVSE_ASSETS_DIR
  if (override) {
    const dir = isAbsolute(override) ? override : resolve(process.cwd(), override)
    assertAssetsDir(override, dir)
    return dir
  }
  return join(import.meta.dirname, 'assets')
}

/**
 * Asserts that the directory an `EVSE_ASSETS_DIR` override resolves to exists
 * and is a directory. Validated on every call (no memoization) so that a
 * directory created or removed after a first call stays observable. Call
 * sites span process startup, per-station setup, and per-transaction paths,
 * so the per-call cost must stay negligible: one `statSync` when an override
 * is set, no syscall on the no-override fallback.
 * @param override - The raw `EVSE_ASSETS_DIR` value, for the error message.
 * @param dir - The resolved directory to assert.
 * @throws {AssetsDirError} When the directory does not exist or is not a directory.
 */
function assertAssetsDir (override: string, dir: string): void {
  if (statSync(dir, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new AssetsDirError(
      `EVSE_ASSETS_DIR is set to '${override}', which resolves to '${dir}', but that path does not exist or is not a directory. ` +
        'Check the path, or unset EVSE_ASSETS_DIR to use the built-in assets directory.'
    )
  }
}

/**
 * Builds an absolute asset file path from a subpath relative to the assets
 * directory. Single join primitive shared by every derived asset path so that
 * the `<assets-dir>/<subpath>` layout stays in one place.
 * @param subpath - Asset path relative to the assets directory (e.g. `configurations`, `station-templates`).
 * @returns Absolute path to the asset file.
 */
export const getAssetFilePath = (subpath: string): string => join(resolveAssetsDir(), subpath)

/**
 * Resolves the directory that holds the charging station configurations.
 * @returns `<assets-dir>/configurations`
 */
export const getConfigurationsDir = (): string => getAssetFilePath('configurations')

/**
 * Resolves the directory that holds the charging station configuration templates.
 * @returns `<assets-dir>/station-templates`
 */
export const getStationTemplatesDir = (): string => getAssetFilePath('station-templates')

/**
 * Resolves the path of the simulator configuration file.
 * @returns `<assets-dir>/config.json`
 */
export const getConfigFilePath = (): string => getAssetFilePath('config.json')

/**
 * OCPP JSON schemas subdirectory, relative to the assets directory. It holds
 * one subdirectory per OCPP schema version (`1.6`, `2.0`).
 */
export const OCPP_SCHEMA_SUBDIR = 'json-schemas/ocpp'

/**
 * Resolves the directory that holds the OCPP JSON command schemas.
 * @returns `<assets-dir>/json-schemas/ocpp`
 */
export const getOcppSchemaBaseDir = (): string => getAssetFilePath(OCPP_SCHEMA_SUBDIR)
