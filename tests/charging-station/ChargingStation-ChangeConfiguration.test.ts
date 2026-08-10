/**
 * @file Tests for ChargingStation.changeConfiguration emit gating
 * @description The public changeConfiguration delegate must emit
 *   ChargingStationEvents.updated (which drives the Web UI read-view refresh)
 *   only when the underlying change was applied (Accepted / RebootRequired),
 *   and must never emit for a rejected or unsupported change.
 */

import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'

import { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import { ChargingStationEvents, ConfigurationStatus } from '../../src/types/index.js'

interface ChangeConfigurationContext {
  emitChargingStationEvent: (event: ChargingStationEvents) => void
  ocppIncomingRequestService: {
    changeConfiguration: (station: unknown, key: string, value: string) => ConfigurationStatus
  }
}

/**
 * Invokes the real ChargingStation.changeConfiguration against a minimal `this`
 * so the emit-gating branch is exercised without constructing a full station.
 * @param status - The status the incoming-request service returns
 * @returns The emit spy and the returned status
 */
const runChangeConfiguration = (status: ConfigurationStatus) => {
  const emitSpy = mock.fn()
  const context: ChangeConfigurationContext = {
    emitChargingStationEvent: emitSpy,
    ocppIncomingRequestService: {
      changeConfiguration: () => status,
    },
  }
  const returned = ChargingStation.prototype.changeConfiguration.call(
    context as unknown as ChargingStation,
    'MeterValueSampleInterval',
    '30'
  )
  return { emitSpy, returned }
}

await describe('ChargingStation.changeConfiguration emit gating', async () => {
  await it('should emit updated and return the status when the change is Accepted', () => {
    const { emitSpy, returned } = runChangeConfiguration(ConfigurationStatus.ACCEPTED)
    assert.strictEqual(returned, ConfigurationStatus.ACCEPTED)
    assert.strictEqual(emitSpy.mock.callCount(), 1)
    assert.strictEqual(emitSpy.mock.calls[0].arguments[0], ChargingStationEvents.updated)
  })

  await it('should emit updated when the change is RebootRequired (value was applied)', () => {
    const { emitSpy, returned } = runChangeConfiguration(ConfigurationStatus.REBOOT_REQUIRED)
    assert.strictEqual(returned, ConfigurationStatus.REBOOT_REQUIRED)
    assert.strictEqual(emitSpy.mock.callCount(), 1)
    assert.strictEqual(emitSpy.mock.calls[0].arguments[0], ChargingStationEvents.updated)
  })

  await it('should not emit when the change is Rejected', () => {
    const { emitSpy, returned } = runChangeConfiguration(ConfigurationStatus.REJECTED)
    assert.strictEqual(returned, ConfigurationStatus.REJECTED)
    assert.strictEqual(emitSpy.mock.callCount(), 0)
  })

  await it('should not emit when the change is NotSupported', () => {
    const { emitSpy, returned } = runChangeConfiguration(ConfigurationStatus.NOT_SUPPORTED)
    assert.strictEqual(returned, ConfigurationStatus.NOT_SUPPORTED)
    assert.strictEqual(emitSpy.mock.callCount(), 0)
  })
})
