/**
 * @file Tests for resolveAssetsDir
 * @description Verifies the single source of truth for the assets directory:
 * the EVSE_ASSETS_DIR override (absolute used as-is, relative resolved against
 * the current working directory, existing directory required) and the
 * `<module-dir>/assets` fallback.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  getConfigFilePath,
  getConfigurationsDir,
  getOcppSchemaBaseDir,
  resolveAssetsDir,
} from '../src/resolveAssetsDir.js'
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
  originalOverride = process.env[OVERRIDE_KEY]
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

  await it('should follow absolute override transitions from one directory to another and back', () => {
    const secondDir = join(fixtureDir, 'second')
    mkdirSync(secondDir)
    writeFileSync(join(fixtureDir, 'config.json'), 'first')
    writeFileSync(join(secondDir, 'config.json'), 'second')
    for (const [directory, marker] of [
      [fixtureDir, 'first'],
      [secondDir, 'second'],
      [fixtureDir, 'first'],
    ]) {
      process.env[OVERRIDE_KEY] = directory
      assert.strictEqual(resolveAssetsDir(), directory)
      assert.strictEqual(readFileSync(getConfigFilePath(), 'utf8'), marker)
    }
  })

  for (const unsetOverride of [undefined, '']) {
    await it(`should fall back after clearing an override with ${String(unsetOverride)}`, () => {
      // Arrange
      process.env[OVERRIDE_KEY] = fixtureDir
      assert.strictEqual(resolveAssetsDir(), fixtureDir)

      // Act
      if (unsetOverride === undefined) {
        Reflect.deleteProperty(process.env, OVERRIDE_KEY)
      } else {
        process.env[OVERRIDE_KEY] = unsetOverride
      }
      const fallbackDir = join(import.meta.dirname, '..', 'src', 'assets')

      // Assert
      assert.strictEqual(resolveAssetsDir(), fallbackDir)
      assert.strictEqual(getConfigurationsDir(), join(fallbackDir, 'configurations'))
      rmSync(fixtureDir, { recursive: true })
      process.env[OVERRIDE_KEY] = fixtureDir
      assertAssetsDirError(() => resolveAssetsDir(), fixtureDir)
    })
  }

  await it('should reject an invalid override after a successful selection', () => {
    process.env[OVERRIDE_KEY] = fixtureDir
    assert.strictEqual(resolveAssetsDir(), fixtureDir)
    const missingDir = join(fixtureDir, 'missing')
    process.env[OVERRIDE_KEY] = missingDir
    assertAssetsDirError(() => getConfigurationsDir(), missingDir)
  })

  await it('should retry a missing override after its directory is created', () => {
    const missingDir = join(fixtureDir, 'created-later')
    process.env[OVERRIDE_KEY] = missingDir
    assertAssetsDirError(() => resolveAssetsDir(), missingDir)
    mkdirSync(missingDir)
    writeFileSync(join(missingDir, 'config.json'), 'created')
    assert.strictEqual(resolveAssetsDir(), missingDir)
    assert.strictEqual(readFileSync(getConfigFilePath(), 'utf8'), 'created')
  })

  await it('should follow cwd changes for the same relative override including missing targets', () => {
    // Arrange
    const originalCwd = process.cwd()
    const firstCwd = join(fixtureDir, 'first')
    const firstCwdAlias = join(fixtureDir, 'first-alias')
    const secondCwd = join(fixtureDir, 'second')
    const missingCwd = join(fixtureDir, 'missing')
    mkdirSync(join(firstCwd, 'assets'), { recursive: true })
    mkdirSync(join(secondCwd, 'assets'), { recursive: true })
    writeFileSync(join(firstCwd, 'assets', 'config.json'), 'first')
    writeFileSync(join(secondCwd, 'assets', 'config.json'), 'second')
    mkdirSync(missingCwd)
    symlinkSync(firstCwd, firstCwdAlias, 'junction')
    process.env[OVERRIDE_KEY] = 'assets'

    try {
      // Act and assert
      for (const [cwd, marker] of [
        [firstCwdAlias, 'first'],
        [secondCwd, 'second'],
        [firstCwdAlias, 'first'],
      ]) {
        process.chdir(cwd)
        const expectedAssetsDir = join(process.cwd(), 'assets')
        assert.strictEqual(resolveAssetsDir(), expectedAssetsDir)
        assert.strictEqual(readFileSync(getConfigFilePath(), 'utf8'), marker)
      }
      process.chdir(missingCwd)
      const missingAssetsDir = join(process.cwd(), 'assets')
      assertAssetsDirError(() => getOcppSchemaBaseDir(), 'assets', missingAssetsDir)
      mkdirSync(missingAssetsDir)
      assert.strictEqual(resolveAssetsDir(), missingAssetsDir)
    } finally {
      process.chdir(originalCwd)
    }
  })

  await it('should discard a successful selection before rejecting a different override', () => {
    // Arrange
    const firstDir = join(fixtureDir, 'first')
    const missingDir = join(fixtureDir, 'missing')
    mkdirSync(firstDir)
    process.env[OVERRIDE_KEY] = firstDir
    assert.strictEqual(resolveAssetsDir(), firstDir)

    // Act
    process.env[OVERRIDE_KEY] = missingDir
    assertAssetsDirError(() => resolveAssetsDir(), missingDir)
    rmSync(firstDir, { recursive: true })
    process.env[OVERRIDE_KEY] = firstDir

    // Assert
    assertAssetsDirError(() => resolveAssetsDir(), firstDir)
  })

  await it('should read and persist in the filesystem-selected root with a parent segment', () => {
    // Arrange
    const physicalRoot = join(fixtureDir, 'physical', 'assets')
    const lexicalRoot = join(fixtureDir, 'assets')
    const alias = join(fixtureDir, 'alias')
    mkdirSync(join(fixtureDir, 'physical', 'child'), { recursive: true })
    mkdirSync(physicalRoot)
    mkdirSync(lexicalRoot)
    symlinkSync(join(fixtureDir, 'physical', 'child'), alias, 'junction')
    writeFileSync(join(physicalRoot, 'config.json'), 'physical')
    writeFileSync(join(lexicalRoot, 'config.json'), 'lexical')
    const override = `${alias}${sep}..${sep}assets${sep}`
    process.env[OVERRIDE_KEY] = override

    // Act and assert: use native filesystem traversal as the expected identity,
    // including Windows, where parent segments can be normalized before junctions.
    assert.strictEqual(resolveAssetsDir(), override)
    assert.strictEqual(
      readFileSync(getConfigFilePath(), 'utf8'),
      readFileSync(`${override}config.json`, 'utf8')
    )
    mkdirSync(getConfigurationsDir())
    writeFileSync(join(getConfigurationsDir(), 'state.json'), '{"persisted":true}')
    assert.deepStrictEqual(
      JSON.parse(readFileSync(`${override}configurations${sep}state.json`, 'utf8')),
      { persisted: true }
    )
  })

  await it('should retain a selected physical root until the selection is invalidated', () => {
    // Arrange
    const firstRoot = join(fixtureDir, 'first')
    const secondRoot = join(fixtureDir, 'second')
    const alias = join(fixtureDir, 'alias')
    mkdirSync(firstRoot)
    mkdirSync(secondRoot)
    writeFileSync(join(firstRoot, 'config.json'), 'first')
    writeFileSync(join(secondRoot, 'config.json'), 'second')
    symlinkSync(firstRoot, alias, 'junction')
    const override = `${alias}${sep}`
    process.env[OVERRIDE_KEY] = override
    assert.strictEqual(resolveAssetsDir(), override)

    // Act
    rmSync(alias, { force: true, recursive: true })
    symlinkSync(secondRoot, alias, 'junction')

    // Assert
    assert.strictEqual(readFileSync(getConfigFilePath(), 'utf8'), 'first')
    Reflect.deleteProperty(process.env, OVERRIDE_KEY)
    resolveAssetsDir()
    process.env[OVERRIDE_KEY] = override
    assert.strictEqual(resolveAssetsDir(), override)
    assert.strictEqual(readFileSync(getConfigFilePath(), 'utf8'), 'second')
  })
})
