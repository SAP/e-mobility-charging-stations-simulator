/**
 * @file Tests for Constants
 * @description Unit tests for shared constant invariants.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { Constants } from '../../src/utils/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('Constants', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should deep-freeze DEFAULT_STATION_INFO', () => {
    const defaultStationInfo = Constants.DEFAULT_STATION_INFO
    assert.strictEqual(Object.isFrozen(defaultStationInfo), true)
    const firmwareUpgrade = defaultStationInfo.firmwareUpgrade
    assert.strictEqual(Object.isFrozen(firmwareUpgrade), true)
    assert.strictEqual(Object.isFrozen(firmwareUpgrade.versionUpgrade), true)
    assert.throws(() => {
      // @ts-expect-error - DEFAULT_STATION_INFO must expose its deeply frozen graph as readonly.
      firmwareUpgrade.versionUpgrade.step = 2
    }, TypeError)
  })
})
