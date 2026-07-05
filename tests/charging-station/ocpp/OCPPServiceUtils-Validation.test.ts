/**
 * @file Tests for OCPPServiceUtils command/trigger support validation
 * @description Verifies static methods that check whether incoming/outgoing commands
 *              and message triggers are supported by a charging station's configuration.
 *
 * Covers:
 * - OCPPServiceUtils.isIncomingRequestCommandSupported
 * - OCPPServiceUtils.isRequestCommandSupported
 * - OCPPServiceUtils.isMessageTriggerSupported
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/index.js'

import {
  isIncomingRequestCommandSupported,
  isMessageTriggerSupported,
  isRequestCommandSupported,
} from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import { IncomingRequestCommand, MessageTrigger, RequestCommand } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'

/**
 * Creates a minimal ChargingStation mock with the given stationInfo.
 * @param stationInfo - partial stationInfo to set on the mock
 * @returns A mock ChargingStation
 */
function makeStationMock (stationInfo?: Record<string, unknown>): ChargingStation {
  return {
    logPrefix: () => '[test-station]',
    stationInfo,
  } as unknown as ChargingStation
}

await describe('OCPPServiceUtils — command/trigger validation', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('isIncomingRequestCommandSupported', async () => {
    await it('should return true when command is not explicitly disabled', () => {
      const station = makeStationMock({
        commandsSupport: {
          incomingCommands: {
            [IncomingRequestCommand.RESET]: true,
          },
        },
      })

      const result = isIncomingRequestCommandSupported(station, IncomingRequestCommand.RESET)

      assert.strictEqual(result, true)
    })

    await it('should return false when command is explicitly disabled', () => {
      const station = makeStationMock({
        commandsSupport: {
          incomingCommands: {
            [IncomingRequestCommand.RESET]: false,
          },
        },
      })

      const result = isIncomingRequestCommandSupported(station, IncomingRequestCommand.RESET)

      assert.strictEqual(result, false)
    })

    await it('should return true when commandsSupport is undefined', () => {
      const station = makeStationMock({})

      const result = isIncomingRequestCommandSupported(station, IncomingRequestCommand.RESET)

      assert.strictEqual(result, true)
    })

    await it('should return true when incomingCommands is empty', () => {
      const station = makeStationMock({
        commandsSupport: {},
      })

      const result = isIncomingRequestCommandSupported(station, IncomingRequestCommand.RESET)

      assert.strictEqual(result, true)
    })
  })

  await describe('isRequestCommandSupported', async () => {
    await it('should return true when command is not explicitly disabled', () => {
      const station = makeStationMock({
        commandsSupport: {
          outgoingCommands: {
            [RequestCommand.HEARTBEAT]: true,
          },
        },
      })

      const result = isRequestCommandSupported(station, RequestCommand.HEARTBEAT)

      assert.strictEqual(result, true)
    })

    await it('should return false when command is explicitly disabled', () => {
      const station = makeStationMock({
        commandsSupport: {
          outgoingCommands: {
            [RequestCommand.HEARTBEAT]: false,
          },
        },
      })

      const result = isRequestCommandSupported(station, RequestCommand.HEARTBEAT)

      assert.strictEqual(result, false)
    })

    await it('should return true when commandsSupport is undefined', () => {
      const station = makeStationMock({})

      const result = isRequestCommandSupported(station, RequestCommand.HEARTBEAT)

      assert.strictEqual(result, true)
    })

    await it('should return true when outgoingCommands is empty', () => {
      const station = makeStationMock({
        commandsSupport: {},
      })

      const result = isRequestCommandSupported(station, RequestCommand.HEARTBEAT)

      assert.strictEqual(result, true)
    })
  })

  await describe('isMessageTriggerSupported', async () => {
    await it('should return true when trigger is not explicitly disabled', () => {
      const station = makeStationMock({
        messageTriggerSupport: {
          [MessageTrigger.Heartbeat]: true,
        },
      })

      const result = isMessageTriggerSupported(station, MessageTrigger.Heartbeat)

      assert.strictEqual(result, true)
    })

    await it('should return false when trigger is explicitly disabled', () => {
      const station = makeStationMock({
        messageTriggerSupport: {
          [MessageTrigger.Heartbeat]: false,
        },
      })

      const result = isMessageTriggerSupported(station, MessageTrigger.Heartbeat)

      assert.strictEqual(result, false)
    })

    await it('should return true when messageTriggerSupport is undefined', () => {
      const station = makeStationMock({})

      const result = isMessageTriggerSupported(station, MessageTrigger.Heartbeat)

      assert.strictEqual(result, true)
    })

    await it('should return true when messageTriggerSupport is null', () => {
      const station = makeStationMock({
        messageTriggerSupport: null,
      })

      const result = isMessageTriggerSupported(station, MessageTrigger.Heartbeat)

      assert.strictEqual(result, true)
    })
  })
})
