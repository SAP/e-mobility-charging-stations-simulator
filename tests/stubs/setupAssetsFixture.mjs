/**
 * @file Prepares the hermetic test assets fixture (`tests/stubs/assets`) before
 *   the test suite runs. The fixture is referenced through `EVSE_ASSETS_DIR`
 *   in the `test`, `test:debug` and `test:coverage` scripts (package.json) so
 *   that no test reads user-generated assets (`config.json`, `configurations/`,
 *   idtags, ev-profiles) from `src/assets`.
 * Idempotent: stale content is removed and regenerated on every invocation.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const thisDir = dirname(fileURLToPath(import.meta.url))
const fixtureDir = join(thisDir, 'assets')
const srcAssetsDir = join(thisDir, '..', '..', 'src', 'assets')

if (!existsSync(fixtureDir)) {
  mkdirSync(fixtureDir, { recursive: true })
}

for (const entry of readdirSync(fixtureDir)) {
  if (entry !== '.gitignore') {
    rmSync(join(fixtureDir, entry), { force: true, recursive: true })
  }
}

// Write target for the OCPP 2.0 certificate manager and the Bootstrap state file.
mkdirSync(join(fixtureDir, 'configurations'), { recursive: true })

// Tracked, read-only sub-trees are shared with src/assets via directory junctions:
// single source of truth, identical content in CI and local dev, no duplication.
// 'junction' creates a directory junction on Windows (no elevation needed) and a
// directory symlink on POSIX.
for (const sub of ['json-schemas', 'station-templates']) {
  symlinkSync(join(srcAssetsDir, sub), join(fixtureDir, sub), 'junction')
}
