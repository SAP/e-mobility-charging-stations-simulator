/**
 * @file Tests for BootstrapStateUtils
 * @description Unit tests for simulator state file read/write and template index reconstruction
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { TemplateStatistics } from '../../src/types/index.js'

import {
  deleteStateFile,
  readStateFile,
  reconstructTemplateIndexes,
  STATE_FILE_VERSION,
  writeStateFile,
} from '../../src/charging-station/BootstrapStateUtils.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('BootstrapStateUtils', async () => {
  let testDir: string
  let stateFilePath: string
  let configurationsDir: string

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `bootstrap-state-test-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`
    )
    configurationsDir = join(testDir, 'configurations')
    stateFilePath = join(testDir, 'state.json')
    mkdirSync(configurationsDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true })
    standardCleanup()
  })

  await describe('writeStateFile', async () => {
    await it('should write state file with started true', async () => {
      // Act
      await writeStateFile(stateFilePath, true)

      // Assert
      assert.strictEqual(existsSync(stateFilePath), true)
      const content = JSON.parse(readFileSync(stateFilePath, 'utf8')) as {
        started: boolean
        version: number
      }
      assert.strictEqual(content.version, STATE_FILE_VERSION)
      assert.strictEqual(content.started, true)
    })

    await it('should write state file with started false', async () => {
      // Act
      await writeStateFile(stateFilePath, false)

      // Assert
      const content = JSON.parse(readFileSync(stateFilePath, 'utf8')) as {
        started: boolean
        version: number
      }
      assert.strictEqual(content.started, false)
    })

    await it('should atomically overwrite existing state file', async () => {
      // Arrange
      await writeStateFile(stateFilePath, true)

      // Act
      await writeStateFile(stateFilePath, false)

      // Assert
      const content = JSON.parse(readFileSync(stateFilePath, 'utf8')) as {
        started: boolean
        version: number
      }
      assert.strictEqual(content.started, false)
    })

    await it('should create parent directory if it does not exist', async () => {
      // Arrange
      const deepPath = join(testDir, 'nested', 'dir', 'state.json')

      // Act
      await writeStateFile(deepPath, true)

      // Assert
      assert.strictEqual(existsSync(deepPath), true)
    })

    await it('should not leave tmp file after successful write', async () => {
      // Act
      await writeStateFile(stateFilePath, true)

      // Assert
      assert.strictEqual(existsSync(`${stateFilePath}.tmp`), false)
    })

    await it('should not throw when target path is rejected by the OS', async () => {
      // Arrange
      const invalidPath = join(testDir, 'does-not-exist', '\0invalid', 'state.json')

      // Act & Assert: writeStateFile must swallow filesystem errors so callers
      // (Bootstrap.start/stop) do not surface persistence failures as fatal errors.
      await assert.doesNotReject(async () => {
        await writeStateFile(invalidPath, true)
      })
    })

    await it('should clean up tmp file when atomic rename fails', async () => {
      // Arrange
      mkdirSync(stateFilePath, { recursive: true })
      writeFileSync(join(stateFilePath, 'placeholder'), 'x', 'utf8')

      // Act
      await writeStateFile(stateFilePath, true)

      // Assert
      assert.strictEqual(existsSync(`${stateFilePath}.tmp`), false)
    })
  })

  await describe('readStateFile', async () => {
    await it('should return undefined when file does not exist', () => {
      // Act
      const result = readStateFile(stateFilePath)

      // Assert
      assert.strictEqual(result, undefined)
    })

    await it('should return parsed state when file is valid', async () => {
      // Arrange
      await writeStateFile(stateFilePath, true)

      // Act
      const result = readStateFile(stateFilePath)

      // Assert
      assert.notStrictEqual(result, undefined)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by notStrictEqual
      assert.strictEqual(result!.version, STATE_FILE_VERSION)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by notStrictEqual
      assert.strictEqual(result!.started, true)
    })

    await it('should return undefined and delete file when content is corrupt JSON', () => {
      // Arrange
      writeFileSync(stateFilePath, '{not valid json', 'utf8')

      // Act
      const result = readStateFile(stateFilePath)

      // Assert
      assert.strictEqual(result, undefined)
      assert.strictEqual(existsSync(stateFilePath), false)
    })

    await it('should return undefined and quarantine file when schema version is incompatible', () => {
      // Arrange
      writeFileSync(stateFilePath, JSON.stringify({ started: true, version: 999 }), 'utf8')

      // Act
      const result = readStateFile(stateFilePath)

      // Assert
      assert.strictEqual(result, undefined)
      assert.strictEqual(existsSync(stateFilePath), false)
      assert.strictEqual(existsSync(`${stateFilePath}.v999.bak`), true)
    })

    await it('should return undefined and delete file when started field is missing', () => {
      // Arrange
      writeFileSync(stateFilePath, JSON.stringify({ version: STATE_FILE_VERSION }), 'utf8')

      // Act
      const result = readStateFile(stateFilePath)

      // Assert
      assert.strictEqual(result, undefined)
      assert.strictEqual(existsSync(stateFilePath), false)
    })

    await it('should return undefined and delete file when version field is missing', () => {
      // Arrange
      writeFileSync(stateFilePath, JSON.stringify({ started: true }), 'utf8')

      // Act
      const result = readStateFile(stateFilePath)

      // Assert
      assert.strictEqual(result, undefined)
      assert.strictEqual(existsSync(stateFilePath), false)
    })

    await it('should return undefined and delete file when content is JSON null', () => {
      // Arrange
      writeFileSync(stateFilePath, 'null', 'utf8')

      // Act
      const result = readStateFile(stateFilePath)

      // Assert
      assert.strictEqual(result, undefined)
      assert.strictEqual(existsSync(stateFilePath), false)
    })

    await it('should return undefined and delete file when content is a JSON primitive', () => {
      // Arrange
      writeFileSync(stateFilePath, '42', 'utf8')

      // Act
      const result = readStateFile(stateFilePath)

      // Assert
      assert.strictEqual(result, undefined)
      assert.strictEqual(existsSync(stateFilePath), false)
    })

    await it('should return undefined and delete file when content is a JSON array', () => {
      // Arrange
      writeFileSync(stateFilePath, '[]', 'utf8')

      // Act
      const result = readStateFile(stateFilePath)

      // Assert
      assert.strictEqual(result, undefined)
      assert.strictEqual(existsSync(stateFilePath), false)
    })
  })

  await describe('deleteStateFile', async () => {
    await it('should delete existing state file', async () => {
      // Arrange
      await writeStateFile(stateFilePath, true)

      // Act
      deleteStateFile(stateFilePath)

      // Assert
      assert.strictEqual(existsSync(stateFilePath), false)
    })

    await it('should not throw when file does not exist', () => {
      // Act & Assert
      assert.doesNotThrow(() => {
        deleteStateFile(stateFilePath)
      })
    })
  })

  await describe('reconstructTemplateIndexes', async () => {
    const createTemplateStatistics = (
      entries: [string, number][]
    ): Map<string, TemplateStatistics> => {
      return new Map(
        entries.map(([name, configured]) => [
          name,
          { added: 0, configured, indexes: new Set<number>(), provisioned: 0, started: 0 },
        ])
      )
    }

    await it('should reconstruct indexes from valid station config files', () => {
      // Arrange
      const templateStatistics = createTemplateStatistics([['template-a', 2]])
      writeFileSync(
        join(configurationsDir, 'station1.json'),
        JSON.stringify({ stationInfo: { templateIndex: 1, templateName: 'template-a' } }),
        'utf8'
      )
      writeFileSync(
        join(configurationsDir, 'station2.json'),
        JSON.stringify({ stationInfo: { templateIndex: 2, templateName: 'template-a' } }),
        'utf8'
      )

      // Act
      reconstructTemplateIndexes(configurationsDir, templateStatistics)

      // Assert
      const indexes = templateStatistics.get('template-a')?.indexes
      assert.notStrictEqual(indexes, undefined)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by notStrictEqual
      assert.strictEqual(indexes!.size, 2)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by notStrictEqual
      assert.strictEqual(indexes!.has(1), true)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by notStrictEqual
      assert.strictEqual(indexes!.has(2), true)
    })

    await it('should skip files for templates not in templateStatistics', () => {
      // Arrange
      const templateStatistics = createTemplateStatistics([['template-a', 1]])
      writeFileSync(
        join(configurationsDir, 'station1.json'),
        JSON.stringify({
          stationInfo: { templateIndex: 1, templateName: 'removed-template' },
        }),
        'utf8'
      )

      // Act
      reconstructTemplateIndexes(configurationsDir, templateStatistics)

      // Assert
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.size, 0)
    })

    await it('should skip files missing templateName', () => {
      // Arrange
      const templateStatistics = createTemplateStatistics([['template-a', 1]])
      writeFileSync(
        join(configurationsDir, 'station1.json'),
        JSON.stringify({ stationInfo: { templateIndex: 1 } }),
        'utf8'
      )

      // Act
      reconstructTemplateIndexes(configurationsDir, templateStatistics)

      // Assert
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.size, 0)
    })

    await it('should skip files missing templateIndex', () => {
      // Arrange
      const templateStatistics = createTemplateStatistics([['template-a', 1]])
      writeFileSync(
        join(configurationsDir, 'station1.json'),
        JSON.stringify({ stationInfo: { templateName: 'template-a' } }),
        'utf8'
      )

      // Act
      reconstructTemplateIndexes(configurationsDir, templateStatistics)

      // Assert
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.size, 0)
    })

    await it('should skip corrupt JSON files', () => {
      // Arrange
      const templateStatistics = createTemplateStatistics([['template-a', 1]])
      writeFileSync(join(configurationsDir, 'corrupt.json'), '{not valid}', 'utf8')

      // Act
      reconstructTemplateIndexes(configurationsDir, templateStatistics)

      // Assert
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.size, 0)
    })

    await it('should skip non-JSON files', () => {
      // Arrange
      const templateStatistics = createTemplateStatistics([['template-a', 1]])
      writeFileSync(join(configurationsDir, 'readme.txt'), 'not a config', 'utf8')

      // Act
      reconstructTemplateIndexes(configurationsDir, templateStatistics)

      // Assert
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.size, 0)
    })

    await it('should handle empty configurations directory', () => {
      // Arrange
      const templateStatistics = createTemplateStatistics([['template-a', 1]])

      // Act
      reconstructTemplateIndexes(configurationsDir, templateStatistics)

      // Assert
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.size, 0)
    })

    await it('should handle non-existent configurations directory', () => {
      // Arrange
      const templateStatistics = createTemplateStatistics([['template-a', 1]])
      const nonExistentDir = join(testDir, 'nonexistent')

      // Act
      reconstructTemplateIndexes(nonExistentDir, templateStatistics)

      // Assert
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.size, 0)
    })

    await it('should reconstruct indexes for multiple templates', () => {
      // Arrange
      const templateStatistics = createTemplateStatistics([
        ['template-a', 2],
        ['template-b', 1],
      ])
      writeFileSync(
        join(configurationsDir, 'stationA1.json'),
        JSON.stringify({ stationInfo: { templateIndex: 1, templateName: 'template-a' } }),
        'utf8'
      )
      writeFileSync(
        join(configurationsDir, 'stationB1.json'),
        JSON.stringify({ stationInfo: { templateIndex: 1, templateName: 'template-b' } }),
        'utf8'
      )
      writeFileSync(
        join(configurationsDir, 'stationA2.json'),
        JSON.stringify({ stationInfo: { templateIndex: 2, templateName: 'template-a' } }),
        'utf8'
      )

      // Act
      reconstructTemplateIndexes(configurationsDir, templateStatistics)

      // Assert
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.size, 2)
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.has(1), true)
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.has(2), true)
      assert.strictEqual(templateStatistics.get('template-b')?.indexes.size, 1)
      assert.strictEqual(templateStatistics.get('template-b')?.indexes.has(1), true)
    })

    await it('should handle files missing stationInfo entirely', () => {
      // Arrange
      const templateStatistics = createTemplateStatistics([['template-a', 1]])
      writeFileSync(
        join(configurationsDir, 'station1.json'),
        JSON.stringify({ connectorsStatus: [] }),
        'utf8'
      )

      // Act
      reconstructTemplateIndexes(configurationsDir, templateStatistics)

      // Assert
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.size, 0)
    })

    await it('should skip dot-prefixed metadata files', () => {
      // Arrange
      const templateStatistics = createTemplateStatistics([['template-a', 1]])
      writeFileSync(
        join(configurationsDir, '.simulator-state.json'),
        JSON.stringify({ started: true, version: 1 }),
        'utf8'
      )
      writeFileSync(
        join(configurationsDir, 'station1.json'),
        JSON.stringify({ stationInfo: { templateIndex: 1, templateName: 'template-a' } }),
        'utf8'
      )

      // Act
      reconstructTemplateIndexes(configurationsDir, templateStatistics)

      // Assert
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.size, 1)
      assert.strictEqual(templateStatistics.get('template-a')?.indexes.has(1), true)
    })
  })
})
