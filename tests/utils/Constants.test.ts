/**
 * @file Tests for Constants
 * @description Unit tests for shared constant invariants.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { Constants } from '../../src/utils/index.js'

await describe('Constants', async () => {
  await it('should deep-freeze DEFAULT_STATION_INFO', () => {
    const defaultStationInfo = Constants.DEFAULT_STATION_INFO
    assert.strictEqual(Object.isFrozen(defaultStationInfo), true)
    const firmwareUpgrade = defaultStationInfo.firmwareUpgrade
    assert.ok(firmwareUpgrade != null)
    assert.strictEqual(Object.isFrozen(firmwareUpgrade), true)
    assert.ok(firmwareUpgrade.versionUpgrade != null)
    assert.strictEqual(Object.isFrozen(firmwareUpgrade.versionUpgrade), true)
  })
})
