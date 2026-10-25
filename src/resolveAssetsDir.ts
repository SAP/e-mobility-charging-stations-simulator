// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Single source of truth for locating the project assets directory.
 *
 * Every on-disk asset path is derived from this helper so that there is only
 * one place describing how the `assets/` directory is resolved.
 *
 * The lookup order is:
 * 1. `EVSE_ASSETS_DIR` — explicit override, used for packaging and tests.
 *    Absolute paths are used as-is; relative paths are resolved against the
 *    current working directory. Some consumers resolve the directory once at
 *    module load or process start, so set this variable before starting the
 *    process.
 * 2. `<this-module-dir>/assets` — the `assets/` folder that sits beside this
 *    module.
 *
 * The resolved directory must contain the expected asset layout: a
 * `config.json` file (if absent, the simulator falls back to its built-in
 * default configuration), a `station-templates/` subdirectory with the
 * charging station configuration templates, a `json-schemas/` subdirectory
 * with the OCPP JSON schemas, and optionally RFID tags or ev-profiles
 * files. It must also be writable: the runtime creates a `configurations/`
 * subdirectory in it to persist per-station charging station
 * configuration, OCPP 2.0 certificates, and the simulator state.
 *
 * When the code is bundled (`pnpm build`), esbuild evaluates `import.meta.url`
 * to the output bundle, so this resolves to `dist/assets` for code bundled into
 * `dist/start.js`. When running directly from TypeScript sources via `tsx`
 * (development and tests), it resolves to `src/assets`, which is the single,
 * editable source of truth.
 */

import { dirname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * Resolves the directory that holds the project assets.
 * @returns Absolute path to the assets directory (see the module docs for the lookup order).
 */
export function resolveAssetsDir (): string {
  const override = process.env.EVSE_ASSETS_DIR
  if (override) {
    return isAbsolute(override) ? override : resolve(process.cwd(), override)
  }
  return join(dirname(fileURLToPath(import.meta.url)), 'assets')
}

/**
 * Resolves the directory that holds the OCPP JSON command schemas.
 * @returns `<assets-dir>/json-schemas/ocpp`
 */
export const getOcppSchemaBaseDir = (): string => join(resolveAssetsDir(), 'json-schemas', 'ocpp')
