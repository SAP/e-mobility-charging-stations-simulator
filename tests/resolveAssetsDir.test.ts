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

const expectedOverrideMessage = (override: string) =>
  `EVSE_ASSETS_DIR is set to '${override}', which resolves to '${override}', but that path does not exist or is not a directory. Check the path, or unset EVSE_ASSETS_DIR to use the built-in assets directory.`

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
    assert.throws(() => resolveAssetsDir(), {
      message: expectedOverrideMessage(join(fixtureDir, 'missing')),
      name: 'AssetsDirError',
    })
  })

  await it('should throw AssetsDirError when the override points to a file', () => {
    const filePath = join(fixtureDir, 'file.json')
    writeFileSync(filePath, '')
    process.env[OVERRIDE_KEY] = filePath
    assert.throws(() => resolveAssetsDir(), {
      message: expectedOverrideMessage(filePath),
      name: 'AssetsDirError',
    })
  })
})
