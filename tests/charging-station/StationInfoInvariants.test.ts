/**
 * @file Tests for StationInfoInvariants
 * @description Unit tests for the stationInfo invariants flyweight: reference
 *   sharing, deep-freeze immutability, provenance gate, wsOptions exclusion,
 *   skip-when-empty, and serialization byte-identity.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStationInfo } from '../../src/types/index.js'

import {
  clearStationInfoInvariantsCache,
  internStationInfoInvariants,
} from '../../src/charging-station/StationInfoInvariants.js'
import { Constants } from '../../src/utils/index.js'

const buildStationInfo = (overrides: Partial<ChargingStationInfo> = {}): ChargingStationInfo =>
  ({
    hashId: 'test-hash',
    templateIndex: 0,
    templateName: 'test-template',
    ...overrides,
  }) as ChargingStationInfo

await describe('StationInfoInvariants', async () => {
  afterEach(() => {
    clearStationInfoInvariantsCache()
  })

  await it('should share an interned invariant object by reference across equal-content stations', () => {
    const stationInfoA = buildStationInfo({
      firmwareUpgrade: { reset: false, versionUpgrade: { step: 2 } },
    })
    const stationInfoB = buildStationInfo({
      firmwareUpgrade: { reset: false, versionUpgrade: { step: 2 } },
    })

    internStationInfoInvariants(stationInfoA)
    internStationInfoInvariants(stationInfoB)

    assert.strictEqual(stationInfoA.firmwareUpgrade, stationInfoB.firmwareUpgrade)
  })

  await it('should not share invariant objects across different-content stations', () => {
    const stationInfoA = buildStationInfo({ firmwareUpgrade: { reset: false } })
    const stationInfoB = buildStationInfo({
      firmwareUpgrade: { reset: true, versionUpgrade: { step: 5 } },
    })

    internStationInfoInvariants(stationInfoA)
    internStationInfoInvariants(stationInfoB)

    assert.notStrictEqual(stationInfoA.firmwareUpgrade, stationInfoB.firmwareUpgrade)
  })

  await it('should deep-freeze the interned invariant object', () => {
    const stationInfo = buildStationInfo({
      firmwareUpgrade: { reset: false, versionUpgrade: { step: 2 } },
    })

    internStationInfoInvariants(stationInfo)

    const firmwareUpgrade = stationInfo.firmwareUpgrade
    assert.ok(firmwareUpgrade != null)
    assert.strictEqual(Object.isFrozen(firmwareUpgrade), true)
    assert.throws(() => {
      firmwareUpgrade.reset = true
    }, TypeError)
  })

  await it('should skip a field still pointing at the shared DEFAULT reference', () => {
    const stationInfo = buildStationInfo({
      firmwareUpgrade: Constants.DEFAULT_STATION_INFO.firmwareUpgrade,
    })

    internStationInfoInvariants(stationInfo)

    assert.strictEqual(stationInfo.firmwareUpgrade, Constants.DEFAULT_STATION_INFO.firmwareUpgrade)
  })

  await it('should not intern or freeze wsOptions', () => {
    const wsOptions = { handshakeTimeout: 1000 }
    const stationInfo = buildStationInfo({ wsOptions })

    internStationInfoInvariants(stationInfo)

    assert.strictEqual(stationInfo.wsOptions, wsOptions)
    assert.strictEqual(Object.isFrozen(stationInfo.wsOptions), false)
  })

  await it('should be a no-op when no invariant object field is declared', () => {
    const stationInfo = buildStationInfo({ chargePointModel: 'Model', chargePointVendor: 'Vendor' })
    const before = JSON.stringify(stationInfo)

    internStationInfoInvariants(stationInfo)

    assert.strictEqual(JSON.stringify(stationInfo), before)
    assert.strictEqual(stationInfo.firmwareUpgrade, undefined)
  })

  await it('should preserve JSON serialization byte-for-byte after interning', () => {
    const stationInfo = buildStationInfo({
      firmwareUpgrade: { reset: false, versionUpgrade: { step: 2 } },
    })
    const before = JSON.stringify(stationInfo)

    internStationInfoInvariants(stationInfo)

    assert.strictEqual(JSON.stringify(stationInfo), before)
  })

  await it('should intern every invariant object key and share it with a cache-hit consumer', () => {
    const commandsSupport = {
      incomingCommands: { Reset: true },
    } as NonNullable<ChargingStationInfo['commandsSupport']>
    const messageTriggerSupport = {
      Heartbeat: true,
    } as NonNullable<ChargingStationInfo['messageTriggerSupport']>
    const overrides = (): Partial<ChargingStationInfo> => ({
      commandsSupport: structuredClone(commandsSupport),
      firmwareUpgrade: { reset: false, versionUpgrade: { step: 2 } },
      messageTriggerSupport: structuredClone(messageTriggerSupport),
    })
    const producer = buildStationInfo(overrides())
    const consumer = buildStationInfo({ ...overrides(), chargePointVendor: 'Vendor' })
    const consumerBefore = JSON.stringify(consumer)

    internStationInfoInvariants(producer)
    internStationInfoInvariants(consumer)

    assert.strictEqual(consumer.commandsSupport, producer.commandsSupport)
    assert.strictEqual(consumer.firmwareUpgrade, producer.firmwareUpgrade)
    assert.strictEqual(consumer.messageTriggerSupport, producer.messageTriggerSupport)
    assert.strictEqual(JSON.stringify(consumer), consumerBefore)
  })

  await it('should not cross-bleed invariant keys across disjoint key-sets', () => {
    const stationInfoA = buildStationInfo({
      commandsSupport: {
        incomingCommands: { Reset: true },
      } as NonNullable<ChargingStationInfo['commandsSupport']>,
    })
    const stationInfoB = buildStationInfo({
      messageTriggerSupport: {
        Heartbeat: true,
      } as NonNullable<ChargingStationInfo['messageTriggerSupport']>,
    })

    internStationInfoInvariants(stationInfoA)
    internStationInfoInvariants(stationInfoB)

    assert.strictEqual(stationInfoA.messageTriggerSupport, undefined)
    assert.strictEqual(stationInfoB.commandsSupport, undefined)
    assert.ok(stationInfoA.commandsSupport != null)
    assert.ok(stationInfoB.messageTriggerSupport != null)
  })

  await it('should not inject a foreign invariant key on a partial cache-hit', () => {
    const producer = buildStationInfo({
      commandsSupport: {
        incomingCommands: { Reset: true },
      } as NonNullable<ChargingStationInfo['commandsSupport']>,
      firmwareUpgrade: { reset: false, versionUpgrade: { step: 2 } },
    })
    const consumer = buildStationInfo({
      firmwareUpgrade: { reset: false, versionUpgrade: { step: 2 } },
    })
    const consumerBefore = JSON.stringify(consumer)

    internStationInfoInvariants(producer)
    internStationInfoInvariants(consumer)

    assert.strictEqual(Object.hasOwn(consumer, 'commandsSupport'), false)
    assert.strictEqual(JSON.stringify(consumer), consumerBefore)
  })

  await it('should never set an interned key to undefined', () => {
    const stationInfo = buildStationInfo({
      commandsSupport: {
        incomingCommands: { Reset: true },
      } as NonNullable<ChargingStationInfo['commandsSupport']>,
      firmwareUpgrade: { reset: false },
      messageTriggerSupport: {
        Heartbeat: true,
      } as NonNullable<ChargingStationInfo['messageTriggerSupport']>,
    })

    internStationInfoInvariants(stationInfo)

    assert.notStrictEqual(stationInfo.commandsSupport, undefined)
    assert.notStrictEqual(stationInfo.firmwareUpgrade, undefined)
    assert.notStrictEqual(stationInfo.messageTriggerSupport, undefined)
  })
})
