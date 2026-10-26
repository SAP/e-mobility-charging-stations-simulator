/**
 * @file Test environment bootstrap, loaded via `node --import` in the `test`,
 *   `test:debug` and `test:coverage` scripts (package.json) so that the test
 *   suite always runs against the hermetic assets fixture instead of the
 *   user-generated `src/assets` content (`config.json`, `configurations/`,
 *   idtags, ev-profiles).
 *
 * Standalone runs (test files outside of `pnpm test`) bypass the package.json
 * scripts and therefore need the bootstrap flag to be equally hermetic, e.g.:
 *
 *   node --import tsx --import ./tests/stubs/testEnvBootstrap.mjs --test --test-force-exit tests/utils/Configuration.test.ts
 *
 * The module runs before any test file is imported: it sets the variables
 * that `resolveAssetsDir()` (src/resolveAssetsDir.ts) reads at module load,
 * then ensures the fixture layout exists. All paths are derived from
 * `import.meta.url`, so behavior is independent of the working directory.
 *
 * Effects (all idempotent — the test runner may evaluate this module once per
 * test file, in the per-file child processes of `--test-isolation=process`):
 * 1. Sets `EVSE_ASSETS_DIR` to the absolute fixture path when unset, so
 *    `resolveAssetsDir()` returns the fixture. An explicit user override is
 *    honored.
 * 2. Sets `NODE_ENV` to `test` unconditionally, mirroring the `cross-env`
 *    of the package.json scripts (`src/utils/Logger.ts` silences its file
 *    transports under `NODE_ENV=test`).
 * 3. Ensures the fixture layout (`configurations/` + the directory junctions
 *    to the tracked `src/assets` sub-trees) without deleting content; the
 *    per-run full regeneration is performed by the
 *    `node tests/stubs/setupAssetsFixture.mjs` step that precedes `node` in
 *    the package.json scripts.
 */
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'

import { ensureAssetsFixture, fixtureDir } from './setupAssetsFixture.mjs'

// 1. Hermetic assets: point `resolveAssetsDir()` at the fixture unless the
//    user explicitly overrode `EVSE_ASSETS_DIR`.
if (!process.env.EVSE_ASSETS_DIR) {
  process.env.EVSE_ASSETS_DIR = fixtureDir
}

// 2. Test environment: silence log file transports (src/utils/Logger.ts).
// Unconditional, like the scripts' `cross-env NODE_ENV=test`: a standalone
// run must observe the same environment as `pnpm test`.
process.env.NODE_ENV = 'test'

// 3. Ensure the fixture layout when the effective assets dir is the fixture
//    (absolute or relative, resolved exactly like `resolveAssetsDir()`).
const assetsDir = process.env.EVSE_ASSETS_DIR
const assetsTarget = isAbsolute(assetsDir) ? assetsDir : resolve(process.cwd(), assetsDir)

if (assetsTarget === fixtureDir) {
  ensureAssetsFixture()
}
