/**
 * @file Tests for assets fixture initialization
 * @description Verifies concurrent reader availability and non-destructive conflict handling.
 */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'

import { cleanupTempDirs, createTempDir } from '../helpers/TempFiles.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

interface FixtureModule {
  ensureAssetsFixture: () => void
  fixtureDir: string
  setupAssetsFixture: () => void
}

/**
 * Loads an unchanged copy of the fixture module against an isolated source tree.
 * @returns Fixture operations and paths without touching the shared test assets.
 */
const createFixture = async (): Promise<FixtureModule & { modulePath: string; root: string }> => {
  const root = realpathSync.native(createTempDir('assets-fixture-'))
  const modulePath = join(root, 'tests', 'stubs', 'setupAssetsFixture.mjs')
  mkdirSync(join(root, 'tests', 'stubs'), { recursive: true })
  for (const subtree of ['json-schemas', 'station-templates']) {
    mkdirSync(join(root, 'src', 'assets', subtree), { recursive: true })
    writeFileSync(join(root, 'src', 'assets', subtree, 'marker.json'), subtree)
  }
  copyFileSync(new URL('./setupAssetsFixture.mjs', import.meta.url), modulePath)
  // Each isolated tree needs its own module-relative fixture directory.
  const fixture = (await import(pathToFileURL(modulePath).href)) as FixtureModule
  return { ...fixture, modulePath, root }
}

/**
 * Confirms that both read-side fixture junctions still serve their original data.
 * @param fixtureDir - The fixture directory observed by an initialized reader.
 */
const assertReaderAvailable = (fixtureDir: string): void => {
  for (const subtree of ['json-schemas', 'station-templates']) {
    assert.strictEqual(readFileSync(join(fixtureDir, subtree, 'marker.json'), 'utf8'), subtree)
  }
}

afterEach(() => {
  cleanupTempDirs()
  standardCleanup()
})

await describe('setupAssetsFixture', async () => {
  await it('should keep a completed reader available during concurrent initialization', async () => {
    // Arrange: delay the contender immediately before and after its first real mutation.
    const fixture = await createFixture()
    const workerPath = join(fixture.root, 'contender.mjs')
    writeFileSync(
      workerPath,
      `
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { pathToFileURL } from 'node:url'
import { parentPort, workerData } from 'node:worker_threads'

const control = new Int32Array(workerData.control)
const originalRemove = fs.rmSync
const originalCreate = fs.symlinkSync
let scheduled = false
const mutate = (operation, args, destinationIndex) => {
  if (scheduled || args[destinationIndex] !== workerData.linkPath) {
    return Reflect.apply(operation, fs, args)
  }
  scheduled = true
  parentPort.postMessage('before')
  Atomics.wait(control, 0, 0)
  try {
    return Reflect.apply(operation, fs, args)
  } finally {
    parentPort.postMessage('after')
    Atomics.wait(control, 1, 0)
  }
}
fs.rmSync = (...args) => mutate(originalRemove, args, 0)
fs.symlinkSync = (...args) => mutate(originalCreate, args, 1)
syncBuiltinESMExports()
// Install scheduling barriers before the unchanged module captures the filesystem exports.
const { ensureAssetsFixture } = await import(pathToFileURL(workerData.modulePath).href)
ensureAssetsFixture()
`,
      'utf8'
    )
    const control = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2))
    const worker = new Worker(workerPath, {
      execArgv: [],
      workerData: {
        control: control.buffer,
        linkPath: join(fixture.fixtureDir, 'json-schemas'),
        modulePath: fixture.modulePath,
      },
    })
    try {
      assert.deepStrictEqual(
        await once(worker, 'message', { signal: AbortSignal.timeout(30_000) }),
        ['before']
      )
      fixture.ensureAssetsFixture()
      assertReaderAvailable(fixture.fixtureDir)

      // Act: let the delayed peer mutate the entry published by the completed initializer.
      const mutated = once(worker, 'message', { signal: AbortSignal.timeout(30_000) })
      Atomics.store(control, 0, 1)
      Atomics.notify(control, 0)
      assert.deepStrictEqual(await mutated, ['after'])

      // Assert: the ready reader remains usable even before the contender finishes.
      assertReaderAvailable(fixture.fixtureDir)
      const completed = once(worker, 'exit', { signal: AbortSignal.timeout(30_000) })
      Atomics.store(control, 1, 1)
      Atomics.notify(control, 1)
      assert.deepStrictEqual(await completed, [0])
      assertReaderAvailable(fixture.fixtureDir)
    } finally {
      Atomics.store(control, 0, 1)
      Atomics.store(control, 1, 1)
      Atomics.notify(control, 0)
      Atomics.notify(control, 1)
      await worker.terminate()
    }
  })

  await it('should preserve conflicting directory contents until an explicit reset', async () => {
    // Arrange
    const fixture = await createFixture()
    const conflictingDir = join(fixture.fixtureDir, 'json-schemas')
    mkdirSync(conflictingDir, { recursive: true })
    const sentinel = join(conflictingDir, 'user-data.json')
    writeFileSync(sentinel, 'preserve this data')
    const ignoreFile = join(fixture.fixtureDir, '.gitignore')
    writeFileSync(ignoreFile, 'preserve this ignore file')

    // Act and assert: ensure must reject the conflict without deleting the data.
    assert.throws(
      () => {
        fixture.ensureAssetsFixture()
      },
      { code: 'EEXIST' }
    )
    assert.strictEqual(readFileSync(sentinel, 'utf8'), 'preserve this data')

    // The explicit serial reset owns destructive repair and preserves the tracked ignore file.
    fixture.setupAssetsFixture()
    assert.strictEqual(existsSync(sentinel), false)
    assert.strictEqual(readFileSync(ignoreFile, 'utf8'), 'preserve this ignore file')
    assertReaderAvailable(fixture.fixtureDir)
  })

  await it('should preserve a conflicting file instead of replacing it with a junction', async () => {
    // Arrange
    const fixture = await createFixture()
    mkdirSync(fixture.fixtureDir, { recursive: true })
    const conflictingFile = join(fixture.fixtureDir, 'json-schemas')
    writeFileSync(conflictingFile, 'preserve these bytes')

    // Act and assert
    assert.throws(
      () => {
        fixture.ensureAssetsFixture()
      },
      { code: 'EEXIST' }
    )
    assert.strictEqual(readFileSync(conflictingFile, 'utf8'), 'preserve these bytes')
  })

  await it('should preserve an unusable junction and reject initialization', async () => {
    // Arrange
    const fixture = await createFixture()
    mkdirSync(fixture.fixtureDir, { recursive: true })
    const link = join(fixture.fixtureDir, 'json-schemas')
    symlinkSync(join(fixture.root, 'missing-target'), link, 'junction')
    const originalTarget = readlinkSync(link)

    // Act and assert
    assert.throws(
      () => {
        fixture.ensureAssetsFixture()
      },
      { code: 'EEXIST' }
    )
    assert.strictEqual(readlinkSync(link), originalTarget)
  })
})
