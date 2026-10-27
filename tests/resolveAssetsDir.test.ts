/**
 * @file Tests for resolveAssetsDir
 * @description Verifies the single source of truth for the assets directory:
 * the EVSE_ASSETS_DIR override (absolute used as-is, relative resolved against
 * the current working directory, existing directory required) and the
 * `<module-dir>/assets` fallback.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { resolveAssetsDir } from '../src/resolveAssetsDir.js'
import { standardCleanup } from './helpers/TestLifecycleHelpers.js'

const OVERRIDE_KEY = 'EVSE_ASSETS_DIR'

/**
 * Asserts that `fn` throws an `AssetsDirError` whose message names each of
 * the given paths (the raw override and the resolved directory) and the
 * stable failure phrasing. Substring-based, following the suite's regex
 * message-assertion convention, so it does not duplicate the full message
 * format of the implementation.
 * @param fn - The function expected to throw.
 * @param expectedPaths - The paths the error message must name.
 */
const assertAssetsDirError = (fn: () => string, ...expectedPaths: string[]): void => {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof Error, `expected an Error, got: ${String(err)}`)
    assert.strictEqual(err.name, 'AssetsDirError')
    assert.match(err.message, /does not exist or is not a directory/)
    for (const expectedPath of expectedPaths) {
      assert.ok(
        err.message.includes(`'${expectedPath}'`),
        `expected the message to name '${expectedPath}', got: ${err.message}`
      )
    }
    return true
  })
}

let originalOverride: string | undefined
let fixtureDir: string

beforeEach(() => {
  originalOverride ??= process.env[OVERRIDE_KEY]
  Reflect.deleteProperty(process.env, OVERRIDE_KEY)
  fixtureDir = mkdtempSync(join(tmpdir(), 'evse-assets-'))
  standardCleanup()
})

afterEach(() => {
  rmSync(fixtureDir, { force: true, recursive: true })
  standardCleanup()
  if (originalOverride === undefined) {
    Reflect.deleteProperty(process.env, OVERRIDE_KEY)
  } else {
    process.env[OVERRIDE_KEY] = originalOverride
  }
})

await describe('resolveAssetsDir', async () => {
  await it('should fall back to the module-side assets directory when no override is set', () => {
    assert.strictEqual(resolveAssetsDir(), join(import.meta.dirname, '..', 'src', 'assets'))
  })

  await it('should return an absolute override as-is', () => {
    process.env[OVERRIDE_KEY] = fixtureDir
    assert.strictEqual(resolveAssetsDir(), fixtureDir)
  })

  await it('should keep a trailing slash on an absolute override', () => {
    // Contract: absolute paths are used as-is; consumers normalize via join/resolve.
    process.env[OVERRIDE_KEY] = `${fixtureDir}/`
    assert.strictEqual(resolveAssetsDir(), `${fixtureDir}/`)
  })

  await it('should resolve a relative override against the current working directory', () => {
    const originalCwd = process.cwd()
    try {
      process.chdir(fixtureDir)
      mkdirSync(join(fixtureDir, 'sub'))
      process.env[OVERRIDE_KEY] = 'sub'
      assert.strictEqual(resolveAssetsDir(), resolve(process.cwd(), 'sub'))
    } finally {
      process.chdir(originalCwd)
    }
  })

  await it('should treat an empty override as unset', () => {
    process.env[OVERRIDE_KEY] = ''
    assert.strictEqual(resolveAssetsDir(), join(import.meta.dirname, '..', 'src', 'assets'))
  })

  await it('should throw AssetsDirError when the override points to a missing directory', () => {
    process.env[OVERRIDE_KEY] = join(fixtureDir, 'missing')
    assertAssetsDirError(() => resolveAssetsDir(), join(fixtureDir, 'missing'))
  })

  await it('should throw AssetsDirError for a missing relative override target', () => {
    const originalCwd = process.cwd()
    try {
      process.chdir(fixtureDir)
      process.env[OVERRIDE_KEY] = 'missing-sub'
      assertAssetsDirError(
        () => resolveAssetsDir(),
        'missing-sub',
        join(process.cwd(), 'missing-sub')
      )
    } finally {
      process.chdir(originalCwd)
    }
  })

  await it('should throw AssetsDirError when the override points to a file', () => {
    const filePath = join(fixtureDir, 'file.json')
    writeFileSync(filePath, '')
    process.env[OVERRIDE_KEY] = filePath
    assertAssetsDirError(() => resolveAssetsDir(), filePath)
  })
})
