// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { env } from 'node:process'

import { AssetsDirError } from './exception/AssetsDirError.js'

const DEFAULT_ASSETS_DIR = join(import.meta.dirname, 'assets')
const CONFIGURATIONS_DIR_NAME = 'configurations'
const STATION_TEMPLATES_DIR_NAME = 'station-templates'

let cachedSelection:
  | undefined
  | { canonicalDir: string; cwd?: string; dir: string; lexicalDir?: string; override: string }

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
 *    Each successful selection is validated and its physical root cached until
 *    a lookup observes a changed override, a changed working directory for a
 *    relative override, or an unset override. Derived paths stay anchored to
 *    that physical root; retargeting a symlink alone does not refresh them.
 *    The public return value retains the original absolute spelling.
 *    Downstream readers handle later removal or replacement of the selected
 *    physical directory. Failed selections are not cached.
 * 2. `<this-module-dir>/assets` — the `assets/` folder that sits beside this
 *    module. It is never validated, as it exists by construction (`src/assets`
 *    is tracked in the repository and `dist/assets` is created by `pnpm build`).
 * @throws {AssetsDirError} When `EVSE_ASSETS_DIR` is set but does not point to an existing directory.
 * @returns Absolute path to the assets directory.
 */
export function resolveAssetsDir (): string {
  const override = env.EVSE_ASSETS_DIR
  if (!override) {
    cachedSelection = undefined
    return DEFAULT_ASSETS_DIR
  }
  if (cachedSelection?.override === override && cachedSelection.cwd === undefined) {
    return cachedSelection.dir
  }
  const cwd = isAbsolute(override) ? undefined : process.cwd()
  if (cachedSelection?.override === override && cachedSelection.cwd === cwd) {
    return cachedSelection.dir
  }
  cachedSelection = undefined
  const dir = cwd === undefined ? override : resolve(cwd, override)
  assertAssetsDir(override, dir)
  const canonicalDir = realpathSync.native(dir)
  cachedSelection = {
    canonicalDir,
    cwd,
    dir,
    lexicalDir: getEquivalentLexicalDir(dir, canonicalDir),
    override,
  }
  return dir
}

/**
 * Asserts that a new `EVSE_ASSETS_DIR` selection exists and is a directory
 * before caching it. Repeated calls for that selection need no filesystem
 * access; a failed assertion leaves no cached selection.
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
 * Retains a normalized alias only when it denotes the selected physical root.
 * Lexical normalization can otherwise select a different directory when a
 * parent segment follows a symlink.
 * @param dir - Selected directory before lexical normalization.
 * @param canonicalDir - Selected physical directory.
 * @returns An equivalent lexical alias, or undefined when none is needed or proven.
 */
function getEquivalentLexicalDir (dir: string, canonicalDir: string): string | undefined {
  const lexicalDir = normalize(dir)
  if (lexicalDir === canonicalDir) {
    return
  }
  if (lexicalDir === dir) {
    return lexicalDir
  }
  try {
    if (realpathSync.native(lexicalDir) === canonicalDir) {
      return lexicalDir
    }
  } catch {
    // The normalized spelling is optional; the selected physical root is valid.
  }
}

/**
 * Checks whether a relative path stays inside its base directory.
 * @param subpath - Path relative to the base directory.
 * @returns Whether the path names the base or one of its descendants.
 */
const isRelativeSubpath = (subpath: string): boolean =>
  subpath !== '..' && !subpath.startsWith(`..${sep}`) && !isAbsolute(subpath)

/**
 * Builds an absolute asset file path from a subpath relative to the assets
 * directory. Single join primitive shared by every derived asset path so that
 * the `<assets-dir>/<subpath>` layout stays in one place.
 * @param subpath - Asset path relative to the assets directory (e.g. `configurations`, `station-templates`).
 * @returns Absolute path to the asset file.
 */
export const getAssetFilePath = (subpath: string): string => {
  const dir = resolveAssetsDir()
  return join(cachedSelection?.canonicalDir ?? dir, subpath)
}

/**
 * Resolves the directory that holds the charging station configurations.
 * @returns `<assets-dir>/configurations`
 */
export const getConfigurationsDir = (): string => getAssetFilePath(CONFIGURATIONS_DIR_NAME)

/**
 * Resolves the directory that holds the charging station configuration templates.
 * @returns `<assets-dir>/station-templates`
 */
export const getStationTemplatesDir = (): string => getAssetFilePath(STATION_TEMPLATES_DIR_NAME)

/**
 * Resolves a template path relative to the selected templates directory.
 * Equivalent selected-root aliases retain their logical subpaths, including
 * child junctions. The most specific matching root wins when aliases overlap.
 * Paths outside that tree retain lexical relative semantics. Relative inputs
 * are interpreted against the selected templates directory, matching template
 * file dispatch.
 * @param templatePath - Template file or directory path.
 * @returns Path relative to the selected templates directory.
 */
export const getStationTemplateRelativePath = (templatePath: string): string => {
  const templatesDir = getStationTemplatesDir()
  const absoluteTemplatePath = isAbsolute(templatePath)
    ? templatePath
    : join(templatesDir, templatePath)
  const subpath = relative(templatesDir, absoluteTemplatePath)
  if (cachedSelection?.lexicalDir !== undefined) {
    const lexicalTemplatesDir = join(cachedSelection.lexicalDir, STATION_TEMPLATES_DIR_NAME)
    const lexicalSubpath = relative(lexicalTemplatesDir, absoluteTemplatePath)
    if (
      isRelativeSubpath(lexicalSubpath) &&
      (!isRelativeSubpath(subpath) || lexicalTemplatesDir.length > templatesDir.length)
    ) {
      return lexicalSubpath
    }
  }
  return subpath
}

/**
 * Resolves the persistence directory for a charging station template, preserving
 * its parent subpath under the canonical templates directory. External template
 * trees use the nearest exact `station-templates` ancestor; templates without one
 * retain storage beside the template file.
 * @param templateFile - Charging station template file path.
 * @returns Absolute directory for the template's per-station configuration files.
 */
export const getStationConfigurationDir = (templateFile: string): string => {
  const templateParent = dirname(resolve(templateFile))
  const templateSubpath = getStationTemplateRelativePath(templateParent)
  if (isRelativeSubpath(templateSubpath)) {
    return join(getConfigurationsDir(), templateSubpath)
  }
  let ancestor = templateParent
  for (;;) {
    if (basename(ancestor) === STATION_TEMPLATES_DIR_NAME) {
      return join(dirname(ancestor), CONFIGURATIONS_DIR_NAME, relative(ancestor, templateParent))
    }
    const parent = dirname(ancestor)
    if (parent === ancestor) {
      return templateParent
    }
    ancestor = parent
  }
}

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
