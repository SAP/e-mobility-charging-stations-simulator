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
    await it('should return 0 initially', () => {
      const version = manager.getVersion()

      assert.strictEqual(version, 0)
    })
  })

  await describe('addEntry and getEntry', async () => {
    await it('should add and retrieve an entry', () => {
      const entry = createEntry('tag-001', 'Accepted', {
        expiryDate: new Date('2030-01-01'),
        parentId: 'parent-001',
      })

      manager.addEntry(entry)
      const result = manager.getEntry('tag-001')

      if (result == null) {
        assert.fail('Expected entry to be defined')
      }
      assert.strictEqual(result.identifier, 'tag-001')
      assert.strictEqual(result.status, 'Accepted')
      assert.strictEqual(result.parentId, 'parent-001')
      assert.deepStrictEqual(result.expiryDate, new Date('2030-01-01'))
    })

    await it('should update existing entry with same identifier', () => {
      // Arrange
      const original = createEntry('tag-001', 'Accepted')
      const updated = createEntry('tag-001', 'Blocked')

      // Act
      manager.addEntry(original)
      manager.addEntry(updated)
      const result = manager.getEntry('tag-001')

      // Assert
      assert.strictEqual(result?.status, 'Blocked')
      const all = manager.getAllEntries()
      assert.strictEqual(all.length, 1)
    })
  })

  await describe('removeEntry', async () => {
    await it('should remove an existing entry', () => {
      manager.addEntry(createEntry('tag-001'))

      manager.removeEntry('tag-001')
      const result = manager.getEntry('tag-001')

      assert.strictEqual(result, undefined)
    })

    await it('should be a no-op for non-existent identifier', () => {
      manager.addEntry(createEntry('tag-001'))

      manager.removeEntry('non-existent')
      const all = manager.getAllEntries()

      assert.strictEqual(all.length, 1)
    })
  })

  await describe('clearAll', async () => {
    await it('should remove all entries but not reset version', () => {
      // Arrange
      manager.addEntry(createEntry('tag-001'))
      manager.addEntry(createEntry('tag-002'))
      manager.addEntry(createEntry('tag-003'))
      manager.updateVersion(5)

      // Act
      manager.clearAll()

      // Assert
      const all = manager.getAllEntries()
      assert.strictEqual(all.length, 0)
      const version = manager.getVersion()
      assert.strictEqual(version, 5)
    })
  })

  await describe('updateVersion', async () => {
    await it('should set version correctly', () => {
      manager.updateVersion(42)
      const version = manager.getVersion()

      assert.strictEqual(version, 42)
    })
  })

  await describe('getAllEntries', async () => {
    await it('should return complete array of entries', () => {
      // Arrange
      const entries = [
        createEntry('tag-001', 'Accepted'),
        createEntry('tag-002', 'Blocked'),
        createEntry('tag-003', 'Expired'),
      ]

      // Act
      for (const entry of entries) {
        manager.addEntry(entry)
      }
      const all = manager.getAllEntries()

      // Assert
      assert.strictEqual(all.length, 3)
      const identifiers = all.map(e => e.identifier).sort()
      assert.deepStrictEqual(identifiers, ['tag-001', 'tag-002', 'tag-003'])
    })
  })

  await describe('setEntries (full update)', async () => {
    await it('should clear old entries, set new ones, and set version', () => {
      // Arrange
      manager.addEntry(createEntry('old-001'))
      manager.addEntry(createEntry('old-002'))
      manager.updateVersion(1)
      const newEntries = [createEntry('new-001', 'Accepted'), createEntry('new-002', 'Blocked')]

      // Act
      manager.setEntries(newEntries, 5)

      // Assert
      const all = manager.getAllEntries()
      assert.strictEqual(all.length, 2)
      const identifiers = all.map(e => e.identifier).sort()
      assert.deepStrictEqual(identifiers, ['new-001', 'new-002'])
      assert.strictEqual(manager.getEntry('old-001'), undefined)
      assert.strictEqual(manager.getVersion(), 5)
    })
  })

  await describe('applyDifferentialUpdate', async () => {
    await it('should add a new entry when status is defined', () => {
      const diffEntries: DifferentialAuthEntry[] = [{ identifier: 'new-tag', status: 'Accepted' }]

      manager.applyDifferentialUpdate(diffEntries, 1)
      const result = manager.getEntry('new-tag')

      if (result == null) {
        assert.fail('Expected entry to be defined')
      }
      assert.strictEqual(result.status, 'Accepted')
    })

    await it('should update an existing entry when status is defined', () => {
      manager.addEntry(createEntry('tag-001', 'Accepted'))
      const diffEntries: DifferentialAuthEntry[] = [{ identifier: 'tag-001', status: 'Blocked' }]

      manager.applyDifferentialUpdate(diffEntries, 2)
      const result = manager.getEntry('tag-001')

      assert.strictEqual(result?.status, 'Blocked')
    })

    await it('should remove an entry when status is undefined', () => {
      manager.addEntry(createEntry('tag-001', 'Accepted'))
      const diffEntries: DifferentialAuthEntry[] = [{ identifier: 'tag-001' }]

      manager.applyDifferentialUpdate(diffEntries, 2)
      const result = manager.getEntry('tag-001')

      assert.strictEqual(result, undefined)
    })

    await it('should handle mixed add, update, and remove in one call', () => {
      // Arrange
      manager.addEntry(createEntry('existing-update', 'Accepted'))
      manager.addEntry(createEntry('existing-remove', 'Accepted'))
      const diffEntries: DifferentialAuthEntry[] = [
        { identifier: 'brand-new', status: 'Accepted' },
        { identifier: 'existing-update', status: 'Blocked' },
        { identifier: 'existing-remove' },
      ]

      // Act
      manager.applyDifferentialUpdate(diffEntries, 10)

      // Assert
      const brandNew = manager.getEntry('brand-new')
      if (brandNew == null) {
        assert.fail('Expected brand-new entry to be defined')
      }
      assert.strictEqual(brandNew.status, 'Accepted')

      const updated = manager.getEntry('existing-update')
      assert.strictEqual(updated?.status, 'Blocked')

      const removed = manager.getEntry('existing-remove')
      assert.strictEqual(removed, undefined)

      assert.strictEqual(manager.getVersion(), 10)
    })
  })

  await describe('maxEntries limit', async () => {
    await it('should throw when adding exceeds capacity', () => {
      const limitedManager = new InMemoryLocalAuthListManager(2)
      limitedManager.addEntry(createEntry('tag-001'))
      limitedManager.addEntry(createEntry('tag-002'))

      assert.throws(
        () => {
          limitedManager.addEntry(createEntry('tag-003'))
        },
        {
          message: /maximum capacity of 2 entries reached/,
        }
      )
    })

    await it('should not block updates to existing entries', () => {
      const limitedManager = new InMemoryLocalAuthListManager(2)
      limitedManager.addEntry(createEntry('tag-001', 'Accepted'))
      limitedManager.addEntry(createEntry('tag-002', 'Accepted'))

      limitedManager.addEntry(createEntry('tag-001', 'Blocked'))
      const result = limitedManager.getEntry('tag-001')

      assert.strictEqual(result?.status, 'Blocked')
    })

    await it('should not partially mutate on capacity error in applyDifferentialUpdate', () => {
      const limitedManager = new InMemoryLocalAuthListManager(3)
      limitedManager.setEntries(
        [createEntry('TAG001'), createEntry('TAG002'), createEntry('TAG003')],
        1
      )

      assert.throws(
        () => {
          limitedManager.applyDifferentialUpdate(
            [
              { identifier: 'TAG004', status: 'Accepted' },
              { identifier: 'TAG005', status: 'Accepted' },
            ],
            2
          )
        },
        { message: /maximum capacity of 3 entries/ }
      )

      const entries = limitedManager.getAllEntries()
      assert.strictEqual(entries.length, 3)
      const identifiers = entries.map(e => e.identifier).sort()
      assert.deepStrictEqual(identifiers, ['TAG001', 'TAG002', 'TAG003'])

      const version = limitedManager.getVersion()
      assert.strictEqual(version, 1)
    })
  })
})
