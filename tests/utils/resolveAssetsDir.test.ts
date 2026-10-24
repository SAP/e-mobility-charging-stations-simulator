/**
 * @file Tests for resolveAssetsDir
 * @description Verifies the single source of truth for the assets directory:
 * the EVSE_ASSETS_DIR override (absolute used as-is, relative resolved against
 * the current working directory) and the `<module-dir>/assets` fallback.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { resolveAssetsDir } from '../../src/resolveAssetsDir.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

const OVERRIDE_KEY = 'EVSE_ASSETS_DIR'

let originalOverride: string | undefined

beforeEach(() => {
  originalOverride ??= process.env[OVERRIDE_KEY]
  Reflect.deleteProperty(process.env, OVERRIDE_KEY)
  standardCleanup()
})

afterEach(() => {
  standardCleanup()
  if (originalOverride === undefined) {
    Reflect.deleteProperty(process.env, OVERRIDE_KEY)
  } else {
    process.env[OVERRIDE_KEY] = originalOverride
  }
})

await describe('resolveAssetsDir', async () => {
  await it('should fall back to the module-side assets directory when no override is set', () => {
    const dir = resolveAssetsDir()
    assert.ok(dir.endsWith('assets'))
    assert.ok(existsSync(dir), 'the resolved assets directory must exist on disk')
  })

  await it('should return an absolute override as-is', () => {
    process.env[OVERRIDE_KEY] = '/tmp/evse-stubs'
    assert.strictEqual(resolveAssetsDir(), '/tmp/evse-stubs')
  })

  await it('should keep a trailing slash on an absolute override', () => {
    // Contract: absolute paths are used as-is; consumers normalize via join/resolve.
    process.env[OVERRIDE_KEY] = '/tmp/evse-stubs/'
    assert.strictEqual(resolveAssetsDir(), '/tmp/evse-stubs/')
  })

  await it('should resolve a relative override against the current working directory', () => {
    process.env[OVERRIDE_KEY] = 'assets/sub'
    assert.strictEqual(resolveAssetsDir(), resolve(process.cwd(), 'assets/sub'))
  })

  await it('should treat an empty override as unset', () => {
    process.env[OVERRIDE_KEY] = ''
    const dir = resolveAssetsDir()
    assert.ok(dir.endsWith('assets'))
    assert.ok(existsSync(dir), 'the resolved assets directory must exist on disk')
  })
})
