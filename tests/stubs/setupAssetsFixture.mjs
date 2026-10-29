/**
 * @file Prepares the hermetic test assets fixture (`tests/stubs/assets`).
 *
 * Invoked directly (`node tests/stubs/setupAssetsFixture.mjs`) — e.g. from the
 * `test`, `test:debug` and `test:coverage` scripts (package.json) — it
 * regenerates the fixture from scratch: stale content is removed and the
 * layout is rebuilt, so every run starts from the CI baseline (fresh checkout).
 *
 * The fixture is referenced through `EVSE_ASSETS_DIR` (set by
 * `tests/stubs/testEnvBootstrap.mjs`) so that no test reads user-generated
 * assets (`config.json`, `configurations/`, idtags, ev-profiles) from
 * `src/assets`.
 *
 * `ensureAssetsFixture()` is the non-destructive counterpart used by the
 * bootstrap: it creates only missing layout parts without removing content,
 * which makes it safe to run concurrently from the test runner's per-file
 * child processes.
 * Unusable existing entries are rejected; explicit serial setup owns repair.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const thisDir = dirname(fileURLToPath(import.meta.url))
const srcAssetsDir = join(thisDir, '..', '..', 'src', 'assets')

/**
 * The fixture directory: `tests/stubs/assets`.
 */
export const fixtureDir = join(thisDir, 'assets')

// Tracked, read-only sub-trees are shared with src/assets via directory junctions:
// single source of truth, identical content in CI and local dev, no duplication.
// 'junction' creates a directory junction on Windows (no elevation needed) and a
// directory symlink on POSIX.
/**
 * Checks whether an existing fixture entry is a symbolic link with a live target.
 * @param linkPath - The fixture entry to inspect.
 * @returns Whether the entry can be reused without replacing it.
 */
const isUsableFixtureLink = linkPath => {
  try {
    // `lstatSync` does not follow the link; `existsSync` verifies its target.
    return lstatSync(linkPath).isSymbolicLink() && existsSync(linkPath)
  } catch (err) {
    if (!(err instanceof Error) || err.code !== 'ENOENT') {
      throw err
    }
    return false
  }
}

/**
 * Ensures the fixture layout exists, creating only missing parts.
 * Non-destructive and concurrency-safe: existing content is left in place,
 * so it is safe to call from multiple test-runner child processes.
 * Unusable conflicts are preserved and require explicit serial setup.
 */
export const ensureAssetsFixture = () => {
  // Create the fixture root, then the read-side junctions first and the write
  // target (`configurations/`) last: by the time the directory is write-ready,
  // every startup read target (JSON schemas, station templates) is complete.
  // This closes the read-race window when multiple test-runner child processes
  // run this concurrently; the runtime additionally creates parent directories
  // on demand (`atomicWriteFile`, `ensureDir`).
  mkdirSync(fixtureDir, { recursive: true })

  for (const sub of ['json-schemas', 'station-templates']) {
    const linkPath = join(fixtureDir, sub)
    if (isUsableFixtureLink(linkPath)) {
      continue
    }
    try {
      symlinkSync(join(srcAssetsDir, sub), linkPath, 'junction')
    } catch (err) {
      // A peer may have won creation. Accept only a still-usable entry.
      if (!(err instanceof Error) || err.code !== 'EEXIST' || !isUsableFixtureLink(linkPath)) {
        throw err
      }
    }
  }

  // Write target for the OCPP 2.0 certificate manager and the Bootstrap state file.
  mkdirSync(join(fixtureDir, 'configurations'), { recursive: true })
}

/**
 * Regenerates the fixture from scratch, removing any stale content first.
 * Run serially, before starting readers or concurrent initializers (idempotent).
 */
export const setupAssetsFixture = () => {
  if (!existsSync(fixtureDir)) {
    mkdirSync(fixtureDir, { recursive: true })
  }

  for (const entry of readdirSync(fixtureDir)) {
    if (entry !== '.gitignore') {
      rmSync(join(fixtureDir, entry), { force: true, recursive: true })
    }
  }

  ensureAssetsFixture()
}

// Regenerate when invoked directly (`node tests/stubs/setupAssetsFixture.mjs`),
// e.g. from the package.json scripts; not when imported (testEnvBootstrap.mjs).
// `process.argv[1]` is the entry point as spelled on the command line (possibly
// relative); canonicalizing both sides makes relative invocations and symlinked
// checkouts compare equal to `import.meta.url`.
const entryPath = process.argv[1]
const entryIsThisModule =
  entryPath !== undefined && realpathSync(resolve(entryPath)) === fileURLToPath(import.meta.url)

if (entryIsThisModule) {
  setupAssetsFixture()
}
