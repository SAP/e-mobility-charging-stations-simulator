/**
 * @file Tests for ConfigurationKeyUtils
 * @description Unit tests for OCPP configuration key management utilities
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStationOcppConfiguration } from '../../src/types/index.js'

import {
  addConfigurationKey,
  deleteConfigurationKey,
  getConfigurationKey,
  setConfigurationKeyValue,
} from '../../src/charging-station/ConfigurationKeyUtils.js'
import { logger } from '../../src/utils/Logger.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from './ChargingStationTestUtils.js'

const TEST_KEY_1 = 'TestKey1'
const MIXED_CASE_KEY = 'MiXeDkEy'
const VALUE_A = 'ValueA'
const VALUE_B = 'ValueB'

await describe('ConfigurationKeyUtils', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await describe('GetConfigurationKey', async () => {
    await it('should return undefined when configurationKey array is missing', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      // Simulate missing configurationKey array
      cs.ocppConfiguration = {} as Partial<ChargingStationOcppConfiguration>

      // Act & Assert
      assert.strictEqual(getConfigurationKey(cs, TEST_KEY_1), undefined)
    })

    await it('should find existing key (case-sensitive)', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })

      // Act
      const k = getConfigurationKey(cs, TEST_KEY_1)

      // Assert
      if (k == null) {
        assert.fail('Expected configuration key to be found')
      }
      assert.strictEqual(k.key, TEST_KEY_1)
      assert.strictEqual(k.value, VALUE_A)
    })

    await it('should respect case sensitivity (no match)', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })

      // Act & Assert
      assert.strictEqual(getConfigurationKey(cs, MIXED_CASE_KEY.toLowerCase()), undefined)
    })

    await it('should support caseInsensitive lookup', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })

      // Act
      const k = getConfigurationKey(cs, MIXED_CASE_KEY.toLowerCase(), true)

      // Assert
      if (k == null) {
        assert.fail('Expected configuration key to be found')
      }
      assert.strictEqual(k.key, MIXED_CASE_KEY)
    })
  })

  await describe('AddConfigurationKey', async () => {
    await it('should no-op when configurationKey array missing', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      // Simulate missing configurationKey array
      cs.ocppConfiguration = {} as Partial<ChargingStationOcppConfiguration>

      // Act
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A)

      // Assert
      assert.strictEqual(getConfigurationKey(cs, TEST_KEY_1), undefined)
    })

    await it('should add new key with default options', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()

      // Act
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })
      const k = getConfigurationKey(cs, TEST_KEY_1)

      // Assert
      if (k == null) {
        assert.fail('Expected configuration key to be found')
      }
      assert.strictEqual(k.value, VALUE_A)
      // defaults
      assert.strictEqual(k.readonly, false)
      assert.strictEqual(k.reboot, false)
      assert.strictEqual(k.visible, true)
    })

    await it('should add new key with custom options', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()

      // Act
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_A,
        { readonly: true, reboot: true, visible: false },
        { save: false }
      )
      const k = getConfigurationKey(cs, TEST_KEY_1)

      // Assert
      if (k == null) {
        assert.fail('Expected configuration key to be found')
      }
      assert.strictEqual(k.readonly, true)
      assert.strictEqual(k.reboot, true)
      assert.strictEqual(k.visible, false)
    })

    await it('should log error and not overwrite value when key exists and overwrite=false', t => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, { readonly: false }, { save: false })
      const errorMock = t.mock.method(logger, 'error')

      // Act
      // Attempt to add same key with different value and option change
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_B,
        { readonly: true, reboot: true, visible: false },
        { overwrite: false, save: false }
      )
      const k = getConfigurationKey(cs, TEST_KEY_1)

      // Assert
      if (k == null) {
        assert.fail('Expected configuration key to be found')
      }
      // value unchanged
      assert.strictEqual(k.value, VALUE_A)
      // options updated only where differing (all provided differ)
      assert.strictEqual(k.reboot, true)
      assert.strictEqual(k.readonly, true)
      assert.strictEqual(k.visible, false)
      assert.strictEqual(errorMock.mock.calls.length, 1)
    })

    await it('should log error and leave key untouched when identical options & value attempted (overwrite=false)', t => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_A,
        { readonly: true, reboot: false, visible: true },
        { save: false }
      )
      const errorMock = t.mock.method(logger, 'error')

      // Act
      // Attempt to add same key with identical value and options
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_A,
        { readonly: true, reboot: false, visible: true },
        { overwrite: false, save: false }
      )
      const k = getConfigurationKey(cs, TEST_KEY_1)

      // Assert
      if (k == null) {
        assert.fail('Expected configuration key to be found')
      }
      assert.strictEqual(k.value, VALUE_A)
      assert.strictEqual(k.readonly, true)
      assert.strictEqual(k.reboot, false)
      assert.strictEqual(k.visible, true)
      assert.strictEqual(errorMock.mock.calls.length, 1)
    })

    await it('should overwrite existing key value and options when overwrite=true', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, { readonly: false }, { save: false })

      // Act
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_B,
        { readonly: true, reboot: true, visible: false },
        { overwrite: true, save: false }
      )
      const k = getConfigurationKey(cs, TEST_KEY_1)

      // Assert
      if (k == null) {
        assert.fail('Expected configuration key to be found')
      }
      assert.strictEqual(k.value, VALUE_B)
      assert.strictEqual(k.readonly, true)
      assert.strictEqual(k.reboot, true)
      assert.strictEqual(k.visible, false)
    })

    await it('should caseInsensitive overwrite update existing differently cased key', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })

      // Act
      addConfigurationKey(
        cs,
        MIXED_CASE_KEY.toLowerCase(),
        VALUE_B,
        { readonly: true },
        { caseInsensitive: true, overwrite: true, save: false }
      )
      const k = getConfigurationKey(cs, MIXED_CASE_KEY)

      // Assert
      if (k == null) {
        assert.fail('Expected configuration key to be found')
      }
      assert.strictEqual(k.value, VALUE_B)
      assert.strictEqual(k.readonly, true)
    })

    await it('should case-insensitive false create separate key with different case', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })

      // Act
      addConfigurationKey(cs, MIXED_CASE_KEY.toLowerCase(), VALUE_B, undefined, {
        overwrite: true,
        save: false,
      })
      const orig = getConfigurationKey(cs, MIXED_CASE_KEY)
      const second = getConfigurationKey(cs, MIXED_CASE_KEY.toLowerCase())

      // Assert
      assert.notStrictEqual(orig, undefined)
      assert.notStrictEqual(second, undefined)
      assert.notStrictEqual(orig, second)
    })

    await it('should call saveOcppConfiguration when params.save=true (new key)', t => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      const saveMock = t.mock.method(cs, 'saveOcppConfiguration')

      // Act
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: true })

      // Assert
      assert.strictEqual(saveMock.mock.calls.length, 1)
    })

    await it('should call saveOcppConfiguration when overwriting existing key and save=true', t => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })
      const saveMock = t.mock.method(cs, 'saveOcppConfiguration')

      // Act
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_B,
        { readonly: true },
        { overwrite: true, save: true }
      )

      // Assert
      assert.strictEqual(saveMock.mock.calls.length, 1)
    })
  })

  await describe('SetConfigurationKeyValue', async () => {
    await it('should return undefined and log error for non-existing key', t => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      const errorMock = t.mock.method(logger, 'error')

      // Act
      const res = setConfigurationKeyValue(cs, TEST_KEY_1, VALUE_A)

      // Assert
      assert.strictEqual(res, undefined)
      assert.strictEqual(errorMock.mock.calls.length, 1)
    })

    await it('should return undefined without logging when configurationKey array missing', t => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      // Simulate missing configurationKey array
      cs.ocppConfiguration = {} as Partial<ChargingStationOcppConfiguration>
      const errorMock = t.mock.method(logger, 'error')

      // Act
      const res = setConfigurationKeyValue(cs, TEST_KEY_1, VALUE_A)

      // Assert
      assert.strictEqual(res, undefined)
      assert.strictEqual(errorMock.mock.calls.length, 0)
    })

    await it('should update existing key value and save', t => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })
      const saveMock = t.mock.method(cs, 'saveOcppConfiguration')

      // Act
      const updated = setConfigurationKeyValue(cs, TEST_KEY_1, VALUE_B)

      // Assert
      assert.strictEqual(updated?.value, VALUE_B)
      assert.strictEqual(saveMock.mock.calls.length, 1)
    })

    await it('should caseInsensitive value update work', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })

      // Act
      const updated = setConfigurationKeyValue(cs, MIXED_CASE_KEY.toLowerCase(), VALUE_B, true)

      // Assert
      assert.strictEqual(updated?.value, VALUE_B)
    })
  })

  await describe('DeleteConfigurationKey', async () => {
    await it('should return undefined when configurationKey array missing', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      // Simulate missing configurationKey array
      cs.ocppConfiguration = {} as Partial<ChargingStationOcppConfiguration>

      // Act
      const res = deleteConfigurationKey(cs, TEST_KEY_1)

      // Assert
      assert.strictEqual(res, undefined)
    })

    await it('should return undefined when key does not exist', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()

      // Act
      const res = deleteConfigurationKey(cs, TEST_KEY_1)

      // Assert
      assert.strictEqual(res, undefined)
    })

    await it('should delete existing key and save by default', t => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })
      const saveMock = t.mock.method(cs, 'saveOcppConfiguration')

      // Act
      const deleted = deleteConfigurationKey(cs, TEST_KEY_1)

      // Assert
      if (deleted == null) {
        assert.fail('Expected deleted to be defined')
      }
      assert.ok(Array.isArray(deleted))
      assert.strictEqual(deleted.length, 1)
      assert.strictEqual(deleted[0].key, TEST_KEY_1)
      assert.strictEqual(getConfigurationKey(cs, TEST_KEY_1), undefined)
      assert.strictEqual(saveMock.mock.calls.length, 1)
    })

    await it('should not save when params.save=false', t => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })
      const saveMock = t.mock.method(cs, 'saveOcppConfiguration')

      // Act
      const deleted = deleteConfigurationKey(cs, TEST_KEY_1, { save: false })

      // Assert
      if (deleted == null) {
        assert.fail('Expected deleted to be defined')
      }
      assert.strictEqual(deleted.length, 1)
      assert.strictEqual(saveMock.mock.calls.length, 0)
    })

    await it('should caseInsensitive deletion remove key with different case', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })

      // Act
      const deleted = deleteConfigurationKey(cs, MIXED_CASE_KEY.toLowerCase(), {
        caseInsensitive: true,
        save: false,
      })

      // Assert
      if (deleted == null) {
        assert.fail('Expected deleted to be defined')
      }
      assert.strictEqual(deleted.length, 1)
      assert.strictEqual(getConfigurationKey(cs, MIXED_CASE_KEY), undefined)
    })
  })

  await describe('Combined scenarios', async () => {
    await it('should add then set then delete lifecycle', () => {
      // Arrange
      const { station: cs } = createMockChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, { readonly: false }, { save: false })

      // Act
      const setRes = setConfigurationKeyValue(cs, TEST_KEY_1, VALUE_B)
      const delRes = deleteConfigurationKey(cs, TEST_KEY_1, { save: false })

      // Assert
      assert.strictEqual(setRes?.value, VALUE_B)
      assert.strictEqual(delRes?.length, 1)
      assert.strictEqual(getConfigurationKey(cs, TEST_KEY_1), undefined)
    })
  })
})
