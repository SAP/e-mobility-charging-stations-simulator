/**
 * @file Tests for InMemoryLocalAuthListManager
 * @description Unit tests for in-memory local authorization list management
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { DifferentialAuthEntry } from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'
import type { LocalAuthEntry } from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { InMemoryLocalAuthListManager } from '../../../../../src/charging-station/ocpp/auth/cache/InMemoryLocalAuthListManager.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'

const createEntry = (
  identifier: string,
  status = 'Accepted',
  overrides?: Partial<LocalAuthEntry>
): LocalAuthEntry => ({
  identifier,
  status,
  ...overrides,
})

await describe('InMemoryLocalAuthListManager', async () => {
  let manager: InMemoryLocalAuthListManager

  beforeEach(() => {
    manager = new InMemoryLocalAuthListManager()
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('getVersion', async () => {
    await it('should return 0 initially', async () => {
      const version = await manager.getVersion()

      assert.strictEqual(version, 0)
    })
  })

  await describe('addEntry and getEntry', async () => {
    await it('should add and retrieve an entry', async () => {
      const entry = createEntry('tag-001', 'Accepted', {
        expiryDate: new Date('2030-01-01'),
        parentId: 'parent-001',
      })

      await manager.addEntry(entry)
      const result = await manager.getEntry('tag-001')

      if (result == null) {
        assert.fail('Expected entry to be defined')
      }
      assert.strictEqual(result.identifier, 'tag-001')
      assert.strictEqual(result.status, 'Accepted')
      assert.strictEqual(result.parentId, 'parent-001')
      assert.deepStrictEqual(result.expiryDate, new Date('2030-01-01'))
    })

    await it('should update existing entry with same identifier', async () => {
      // Arrange
      const original = createEntry('tag-001', 'Accepted')
      const updated = createEntry('tag-001', 'Blocked')

      // Act
      await manager.addEntry(original)
      await manager.addEntry(updated)
      const result = await manager.getEntry('tag-001')

      // Assert
      assert.strictEqual(result?.status, 'Blocked')
      const all = await manager.getAllEntries()
      assert.strictEqual(all.length, 1)
    })
  })

  await describe('removeEntry', async () => {
    await it('should remove an existing entry', async () => {
      await manager.addEntry(createEntry('tag-001'))

      await manager.removeEntry('tag-001')
      const result = await manager.getEntry('tag-001')

      assert.strictEqual(result, undefined)
    })

    await it('should be a no-op for non-existent identifier', async () => {
      await manager.addEntry(createEntry('tag-001'))

      await manager.removeEntry('non-existent')
      const all = await manager.getAllEntries()

      assert.strictEqual(all.length, 1)
    })
  })

  await describe('clearAll', async () => {
    await it('should remove all entries but not reset version', async () => {
      // Arrange
      await manager.addEntry(createEntry('tag-001'))
      await manager.addEntry(createEntry('tag-002'))
      await manager.addEntry(createEntry('tag-003'))
      await manager.updateVersion(5)

      // Act
      await manager.clearAll()

      // Assert
      const all = await manager.getAllEntries()
      assert.strictEqual(all.length, 0)
      const version = await manager.getVersion()
      assert.strictEqual(version, 5)
    })
  })

  await describe('updateVersion', async () => {
    await it('should set version correctly', async () => {
      await manager.updateVersion(42)
      const version = await manager.getVersion()

      assert.strictEqual(version, 42)
    })
  })

  await describe('getAllEntries', async () => {
    await it('should return complete array of entries', async () => {
      // Arrange
      const entries = [
        createEntry('tag-001', 'Accepted'),
        createEntry('tag-002', 'Blocked'),
        createEntry('tag-003', 'Expired'),
      ]

      // Act
      for (const entry of entries) {
        await manager.addEntry(entry)
      }
      const all = await manager.getAllEntries()

      // Assert
      assert.strictEqual(all.length, 3)
      const identifiers = all.map(e => e.identifier).sort()
      assert.deepStrictEqual(identifiers, ['tag-001', 'tag-002', 'tag-003'])
    })
  })

  await describe('setEntries (full update)', async () => {
    await it('should clear old entries, set new ones, and set version', async () => {
      // Arrange
      await manager.addEntry(createEntry('old-001'))
      await manager.addEntry(createEntry('old-002'))
      await manager.updateVersion(1)
      const newEntries = [createEntry('new-001', 'Accepted'), createEntry('new-002', 'Blocked')]

      // Act
      await manager.setEntries(newEntries, 5)

      // Assert
      const all = await manager.getAllEntries()
      assert.strictEqual(all.length, 2)
      const identifiers = all.map(e => e.identifier).sort()
      assert.deepStrictEqual(identifiers, ['new-001', 'new-002'])
      assert.strictEqual(await manager.getEntry('old-001'), undefined)
      assert.strictEqual(await manager.getVersion(), 5)
    })
  })

  await describe('applyDifferentialUpdate', async () => {
    await it('should add a new entry when status is defined', async () => {
      const diffEntries: DifferentialAuthEntry[] = [{ identifier: 'new-tag', status: 'Accepted' }]

      await manager.applyDifferentialUpdate(diffEntries, 1)
      const result = await manager.getEntry('new-tag')

      if (result == null) {
        assert.fail('Expected entry to be defined')
      }
      assert.strictEqual(result.status, 'Accepted')
    })

    await it('should update an existing entry when status is defined', async () => {
      await manager.addEntry(createEntry('tag-001', 'Accepted'))
      const diffEntries: DifferentialAuthEntry[] = [{ identifier: 'tag-001', status: 'Blocked' }]

      await manager.applyDifferentialUpdate(diffEntries, 2)
      const result = await manager.getEntry('tag-001')

      assert.strictEqual(result?.status, 'Blocked')
    })

    await it('should remove an entry when status is undefined', async () => {
      await manager.addEntry(createEntry('tag-001', 'Accepted'))
      const diffEntries: DifferentialAuthEntry[] = [{ identifier: 'tag-001' }]

      await manager.applyDifferentialUpdate(diffEntries, 2)
      const result = await manager.getEntry('tag-001')

      assert.strictEqual(result, undefined)
    })

    await it('should handle mixed add, update, and remove in one call', async () => {
      // Arrange
      await manager.addEntry(createEntry('existing-update', 'Accepted'))
      await manager.addEntry(createEntry('existing-remove', 'Accepted'))
      const diffEntries: DifferentialAuthEntry[] = [
        { identifier: 'brand-new', status: 'Accepted' },
        { identifier: 'existing-update', status: 'Blocked' },
        { identifier: 'existing-remove' },
      ]

      // Act
      await manager.applyDifferentialUpdate(diffEntries, 10)

      // Assert
      const brandNew = await manager.getEntry('brand-new')
      if (brandNew == null) {
        assert.fail('Expected brand-new entry to be defined')
      }
      assert.strictEqual(brandNew.status, 'Accepted')

      const updated = await manager.getEntry('existing-update')
      assert.strictEqual(updated?.status, 'Blocked')

      const removed = await manager.getEntry('existing-remove')
      assert.strictEqual(removed, undefined)

      assert.strictEqual(await manager.getVersion(), 10)
    })
  })

  await describe('maxEntries limit', async () => {
    await it('should throw when adding exceeds capacity', async () => {
      const limitedManager = new InMemoryLocalAuthListManager(2)
      await limitedManager.addEntry(createEntry('tag-001'))
      await limitedManager.addEntry(createEntry('tag-002'))

      await assert.rejects(limitedManager.addEntry(createEntry('tag-003')), {
        message: /maximum capacity of 2 entries reached/,
      })
    })

    await it('should not block updates to existing entries', async () => {
      const limitedManager = new InMemoryLocalAuthListManager(2)
      await limitedManager.addEntry(createEntry('tag-001', 'Accepted'))
      await limitedManager.addEntry(createEntry('tag-002', 'Accepted'))

      await limitedManager.addEntry(createEntry('tag-001', 'Blocked'))
      const result = await limitedManager.getEntry('tag-001')

      assert.strictEqual(result?.status, 'Blocked')
    })

    await it('should not partially mutate on capacity error in applyDifferentialUpdate', async () => {
      const limitedManager = new InMemoryLocalAuthListManager(3)
      await limitedManager.setEntries(
        [createEntry('TAG001'), createEntry('TAG002'), createEntry('TAG003')],
        1
      )

      await assert.rejects(
        limitedManager.applyDifferentialUpdate(
          [
            { identifier: 'TAG004', status: 'Accepted' },
            { identifier: 'TAG005', status: 'Accepted' },
          ],
          2
        ),
        { message: /maximum capacity of 3 entries/ }
      )

      const entries = await limitedManager.getAllEntries()
      assert.strictEqual(entries.length, 3)
      const identifiers = entries.map(e => e.identifier).sort()
      assert.deepStrictEqual(identifiers, ['TAG001', 'TAG002', 'TAG003'])

      const version = await limitedManager.getVersion()
      assert.strictEqual(version, 1)
    })
  })
})
