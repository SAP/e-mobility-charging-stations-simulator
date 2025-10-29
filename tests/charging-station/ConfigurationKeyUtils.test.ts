import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import {
  addConfigurationKey,
  deleteConfigurationKey,
  getConfigurationKey,
  setConfigurationKeyValue,
} from '../../src/charging-station/ConfigurationKeyUtils.js'
import { logger } from '../../src/utils/Logger.js'
import { createChargingStation } from '../ChargingStationFactory.js'

const TEST_KEY_1 = 'TestKey1'
const MIXED_CASE_KEY = 'MiXeDkEy'
const VALUE_A = 'ValueA'
const VALUE_B = 'ValueB'

await describe('ConfigurationKeyUtils test suite', async () => {
  await describe('getConfigurationKey()', async () => {
    await it('returns undefined when configurationKey array is missing', () => {
      const cs = createChargingStation()
      // remove array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      cs.ocppConfiguration = {} as any
      expect(getConfigurationKey(cs, TEST_KEY_1)).toBeUndefined()
    })

    await it('finds existing key (case-sensitive)', () => {
      const cs = createChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })
      const k = getConfigurationKey(cs, TEST_KEY_1)
      expect(k?.key).toBe(TEST_KEY_1)
      expect(k?.value).toBe(VALUE_A)
    })

    await it('respects case sensitivity (no match)', () => {
      const cs = createChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })
      expect(getConfigurationKey(cs, MIXED_CASE_KEY.toLowerCase())).toBeUndefined()
    })

    await it('supports caseInsensitive lookup', () => {
      const cs = createChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })
      const k = getConfigurationKey(cs, MIXED_CASE_KEY.toLowerCase(), true)
      expect(k?.key).toBe(MIXED_CASE_KEY)
    })
  })

  await describe('addConfigurationKey()', async () => {
    await it('no-op when configurationKey array missing', () => {
      const cs = createChargingStation()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      cs.ocppConfiguration = {} as any
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A)
      expect(getConfigurationKey(cs, TEST_KEY_1)).toBeUndefined()
    })

    await it('adds new key with default options', () => {
      const cs = createChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })
      const k = getConfigurationKey(cs, TEST_KEY_1)
      expect(k).toBeDefined()
      expect(k?.value).toBe(VALUE_A)
      // defaults
      expect(k?.readonly).toBe(false)
      expect(k?.reboot).toBe(false)
      expect(k?.visible).toBe(true)
    })

    await it('adds new key with custom options', () => {
      const cs = createChargingStation()
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_A,
        { readonly: true, reboot: true, visible: false },
        { save: false }
      )
      const k = getConfigurationKey(cs, TEST_KEY_1)
      expect(k?.readonly).toBe(true)
      expect(k?.reboot).toBe(true)
      expect(k?.visible).toBe(false)
    })

    await it('logs error and does not overwrite value when key exists and overwrite=false', t => {
      const cs = createChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, { readonly: false }, { save: false })
      const errorMock = t.mock.method(logger, 'error')
      // Attempt to add same key with different value and option change
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_B,
        { readonly: true, reboot: true, visible: false },
        { overwrite: false, save: false }
      )
      const k = getConfigurationKey(cs, TEST_KEY_1)
      // value unchanged
      expect(k?.value).toBe(VALUE_A)
      // options updated only where differing (all provided differ)
      expect(k?.reboot).toBe(true)
      expect(k?.readonly).toBe(true)
      expect(k?.visible).toBe(false)
      expect(errorMock.mock.calls.length).toBe(1)
    })

    await it('logs error and leaves key untouched when identical options & value attempted (overwrite=false)', t => {
      const cs = createChargingStation()
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_A,
        { readonly: true, reboot: false, visible: true },
        { save: false }
      )
      const errorMock = t.mock.method(logger, 'error')
      // Attempt to add same key with identical value and options
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_A,
        { readonly: true, reboot: false, visible: true },
        { overwrite: false, save: false }
      )
      const k = getConfigurationKey(cs, TEST_KEY_1)
      expect(k?.value).toBe(VALUE_A)
      expect(k?.readonly).toBe(true)
      expect(k?.reboot).toBe(false)
      expect(k?.visible).toBe(true)
      expect(errorMock.mock.calls.length).toBe(1)
    })

    await it('overwrites existing key value and options when overwrite=true', () => {
      const cs = createChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, { readonly: false }, { save: false })
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_B,
        { readonly: true, reboot: true, visible: false },
        { overwrite: true, save: false }
      )
      const k = getConfigurationKey(cs, TEST_KEY_1)
      expect(k?.value).toBe(VALUE_B)
      expect(k?.readonly).toBe(true)
      expect(k?.reboot).toBe(true)
      expect(k?.visible).toBe(false)
    })

    await it('caseInsensitive overwrite updates existing differently cased key', () => {
      const cs = createChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })
      addConfigurationKey(
        cs,
        MIXED_CASE_KEY.toLowerCase(),
        VALUE_B,
        { readonly: true },
        { caseInsensitive: true, overwrite: true, save: false }
      )
      const k = getConfigurationKey(cs, MIXED_CASE_KEY)
      expect(k?.value).toBe(VALUE_B)
      expect(k?.readonly).toBe(true)
    })

    await it('case-insensitive false creates separate key with different case', () => {
      const cs = createChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })
      addConfigurationKey(cs, MIXED_CASE_KEY.toLowerCase(), VALUE_B, undefined, {
        overwrite: true,
        save: false,
      })
      const orig = getConfigurationKey(cs, MIXED_CASE_KEY)
      const second = getConfigurationKey(cs, MIXED_CASE_KEY.toLowerCase())
      expect(orig).toBeDefined()
      expect(second).toBeDefined()
      expect(orig).not.toBe(second)
    })

    await it('calls saveOcppConfiguration when params.save=true (new key)', t => {
      const cs = createChargingStation()
      const saveMock = t.mock.method(cs, 'saveOcppConfiguration')
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: true })
      expect(saveMock.mock.calls.length).toBe(1)
    })

    await it('calls saveOcppConfiguration when overwriting existing key and save=true', t => {
      const cs = createChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })
      const saveMock = t.mock.method(cs, 'saveOcppConfiguration')
      addConfigurationKey(
        cs,
        TEST_KEY_1,
        VALUE_B,
        { readonly: true },
        { overwrite: true, save: true }
      )
      expect(saveMock.mock.calls.length).toBe(1)
    })
  })

  await describe('setConfigurationKeyValue()', async () => {
    await it('returns undefined and logs error for non-existing key', t => {
      const cs = createChargingStation()
      const errorMock = t.mock.method(logger, 'error')
      const res = setConfigurationKeyValue(cs, TEST_KEY_1, VALUE_A)
      expect(res).toBeUndefined()
      expect(errorMock.mock.calls.length).toBe(1)
    })

    await it('returns undefined without logging when configurationKey array missing', t => {
      const cs = createChargingStation()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      cs.ocppConfiguration = {} as any
      const errorMock = t.mock.method(logger, 'error')
      const res = setConfigurationKeyValue(cs, TEST_KEY_1, VALUE_A)
      expect(res).toBeUndefined()
      expect(errorMock.mock.calls.length).toBe(0)
    })

    await it('updates existing key value and saves', t => {
      const cs = createChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })
      const saveMock = t.mock.method(cs, 'saveOcppConfiguration')
      const updated = setConfigurationKeyValue(cs, TEST_KEY_1, VALUE_B)
      expect(updated?.value).toBe(VALUE_B)
      expect(saveMock.mock.calls.length).toBe(1)
    })

    await it('caseInsensitive value update works', () => {
      const cs = createChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })
      const updated = setConfigurationKeyValue(cs, MIXED_CASE_KEY.toLowerCase(), VALUE_B, true)
      expect(updated?.value).toBe(VALUE_B)
    })
  })

  await describe('deleteConfigurationKey()', async () => {
    await it('returns undefined when configurationKey array missing', () => {
      const cs = createChargingStation()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      cs.ocppConfiguration = {} as any
      const res = deleteConfigurationKey(cs, TEST_KEY_1)
      expect(res).toBeUndefined()
    })

    await it('returns undefined when key does not exist', () => {
      const cs = createChargingStation()
      const res = deleteConfigurationKey(cs, TEST_KEY_1)
      expect(res).toBeUndefined()
    })

    await it('deletes existing key and saves by default', t => {
      const cs = createChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })
      const saveMock = t.mock.method(cs, 'saveOcppConfiguration')
      const deleted = deleteConfigurationKey(cs, TEST_KEY_1)
      expect(Array.isArray(deleted)).toBe(true)
      expect(deleted).toHaveLength(1)
      expect(deleted?.[0].key).toBe(TEST_KEY_1)
      expect(getConfigurationKey(cs, TEST_KEY_1)).toBeUndefined()
      expect(saveMock.mock.calls.length).toBe(1)
    })

    await it('does not save when params.save=false', t => {
      const cs = createChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, undefined, { save: false })
      const saveMock = t.mock.method(cs, 'saveOcppConfiguration')
      const deleted = deleteConfigurationKey(cs, TEST_KEY_1, { save: false })
      expect(deleted).toHaveLength(1)
      expect(saveMock.mock.calls.length).toBe(0)
    })

    await it('caseInsensitive deletion removes key with different case', () => {
      const cs = createChargingStation()
      addConfigurationKey(cs, MIXED_CASE_KEY, VALUE_A, undefined, { save: false })
      const deleted = deleteConfigurationKey(cs, MIXED_CASE_KEY.toLowerCase(), {
        caseInsensitive: true,
        save: false,
      })
      expect(deleted).toHaveLength(1)
      expect(getConfigurationKey(cs, MIXED_CASE_KEY)).toBeUndefined()
    })
  })

  await describe('Combined scenarios', async () => {
    await it('add then set then delete lifecycle', () => {
      const cs = createChargingStation()
      addConfigurationKey(cs, TEST_KEY_1, VALUE_A, { readonly: false }, { save: false })
      const setRes = setConfigurationKeyValue(cs, TEST_KEY_1, VALUE_B)
      expect(setRes?.value).toBe(VALUE_B)
      const delRes = deleteConfigurationKey(cs, TEST_KEY_1, { save: false })
      expect(delRes).toHaveLength(1)
      expect(getConfigurationKey(cs, TEST_KEY_1)).toBeUndefined()
    })
  })
})
