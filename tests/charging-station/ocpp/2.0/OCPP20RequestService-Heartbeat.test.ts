/**
 * @file Tests for OCPP20RequestService Heartbeat
 * @description Unit tests for OCPP 2.0 Heartbeat request building (G02)
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { OCPPConstants } from '../../../../src/charging-station/ocpp/OCPPConstants.js'
import {
  type OCPP20HeartbeatRequest,
  OCPP20RequestCommand,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { has } from '../../../../src/utils/index.js'
import { flushMicrotasks, standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGE_POINT_MODEL,
  TEST_CHARGE_POINT_SERIAL_NUMBER,
  TEST_CHARGE_POINT_VENDOR,
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_FIRMWARE_VERSION,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import {
  createOCPP20RequestTestContext,
  type TestableOCPP20RequestService,
} from './OCPP20TestUtils.js'

await describe('G02 - Heartbeat', async () => {
  let testableRequestService: TestableOCPP20RequestService
  let station: ChargingStation

  beforeEach(() => {
    const context = createOCPP20RequestTestContext({
      stationInfo: {
        chargePointModel: TEST_CHARGE_POINT_MODEL,
        chargePointSerialNumber: TEST_CHARGE_POINT_SERIAL_NUMBER,
        chargePointVendor: TEST_CHARGE_POINT_VENDOR,
        firmwareVersion: TEST_FIRMWARE_VERSION,
      },
    })
    testableRequestService = context.testableRequestService
    station = context.station
  })

  afterEach(() => {
    standardCleanup()
  })

  // FR: G02.FR.01
  await it('should build Heartbeat request payload correctly with empty object', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    assert.notStrictEqual(payload, undefined)
    assert.strictEqual(typeof payload, 'object')
    assert.strictEqual(Object.keys(payload as object).length, 0)
  })

  // FR: G02.FR.02
  await it('should build Heartbeat request payload correctly without parameters', () => {
    // Test without passing any request parameters
    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT
    )

    assert.notStrictEqual(payload, undefined)
    assert.strictEqual(typeof payload, 'object')
    assert.strictEqual(Object.keys(payload as object).length, 0)
  })

  // FR: G02.FR.03
  await it('should validate payload structure matches OCPP20HeartbeatRequest interface', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    // Validate that the payload is an empty object as required by OCPP 2.0 spec
    assert.strictEqual(typeof payload, 'object')
    assert.notStrictEqual(payload, null)
    assert.ok(!Array.isArray(payload))
    assert.strictEqual(Object.keys(payload as object).length, 0)
    assert.strictEqual(JSON.stringify(payload), '{}')
  })

  // FR: G02.FR.04
  await it('should handle Heartbeat request consistently across multiple calls', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    // Call buildRequestPayload multiple times to ensure consistency
    const payload1 = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    const payload2 = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    const payload3 = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT
    )

    // All payloads should be identical empty objects
    assert.deepStrictEqual(payload1, payload2)
    assert.deepStrictEqual(payload2, payload3)
    assert.strictEqual(JSON.stringify(payload1), '{}')
    assert.strictEqual(JSON.stringify(payload2), '{}')
    assert.strictEqual(JSON.stringify(payload3), '{}')
  })

  // FR: G02.FR.05
  await it('should handle Heartbeat request with different charging station configurations', () => {
    const { station: alternativeChargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: 120,
      stationInfo: {
        chargePointModel: 'Alternative Model',
        chargePointSerialNumber: 'ALT-SN-002',
        chargePointVendor: 'Alternative Vendor',
        firmwareVersion: '2.5.1',
        ocppStrictCompliance: true,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: 45,
    })

    const requestParams: OCPP20HeartbeatRequest = {}

    const payload = testableRequestService.buildRequestPayload(
      alternativeChargingStation,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    // Heartbeat payload should remain empty regardless of charging station configuration
    assert.notStrictEqual(payload, undefined)
    assert.strictEqual(typeof payload, 'object')
    assert.strictEqual(Object.keys(payload as object).length, 0)
    assert.strictEqual(JSON.stringify(payload), '{}')
  })

  // FR: G02.FR.06
  await it('should build empty Heartbeat request conforming to OCPP 2.0 specification', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    // According to OCPP 2.0 specification, Heartbeat request should be an empty object
    // This validates compliance with the official OCPP 2.0 standard
    assert.notStrictEqual(payload, undefined)
    assert.deepStrictEqual(payload, {})
    assert.strictEqual(has('constructor', payload), false)

    // Ensure it's a plain object and not an instance of another type
    assert.strictEqual(Object.getPrototypeOf(payload), Object.prototype)
  })

  await it('expires a sent request that receives no OCPP response', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    let messageSentCount = 0
    mock.method(
      wsConnection,
      'send',
      (_data: unknown, callback?: (error?: Error) => void): void => {
        callback?.()
      }
    )

    await assert.rejects(
      context.requestService.requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        {
          onMessageSent: () => {
            messageSentCount++
            throw new Error('observer failure')
          },
          responseTimeoutMs: 5,
          skipBufferingOnError: true,
          throwError: true,
        }
      ),
      /Timeout .* waiting for response/
    )
    assert.strictEqual(context.station.requests.size, 0)
    assert.strictEqual(messageSentCount, 1)
  })

  await it('cancels pending response timers when deleting the station', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.started = false
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    mock.method(
      wsConnection,
      'send',
      (_data: unknown, callback?: (error?: Error) => void): void => {
        callback?.()
      }
    )

    const pendingRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        responseTimeoutMs: 3_600_000,
        skipBufferingOnError: true,
        throwError: true,
      }
    )
    await flushMicrotasks()
    assert.strictEqual(context.station.requests.size, 1)
    const rejectedRequest = assert.rejects(
      pendingRequest,
      /deleted while awaiting an OCPP response/
    )
    await context.station.delete(false)

    await rejectedRequest
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('does not cancel an answered request while its response handler is running', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    mock.method(wsConnection, 'send', (_data: unknown, callback?: (error?: Error) => void) => {
      callback?.()
    })
    const responseHandlerGate = Promise.withResolvers<undefined>()
    const responseService = (
      context.requestService as unknown as {
        ocppResponseService: { responseHandler: () => Promise<undefined> }
      }
    ).ocppResponseService
    mock.method(responseService, 'responseHandler', () => responseHandlerGate.promise)
    const pendingRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await flushMicrotasks()
    const cachedRequest = [...context.station.requests.values()][0]

    cachedRequest[0]({ currentTime: new Date().toISOString() }, {})
    assert.strictEqual(context.station.requests.size, 0)
    context.requestService.cancelPendingRequests(context.station)
    responseHandlerGate.resolve(undefined)

    await pendingRequest
  })

  await it('cancels a request while WebSocket.send is still pending', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    let sendCallback: ((error?: Error) => void) | undefined
    mock.method(wsConnection, 'send', (_data: unknown, callback?: (error?: Error) => void) => {
      sendCallback = callback
    })

    const pendingRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    await flushMicrotasks()
    assert.strictEqual(context.station.requests.size, 1)
    const rejectedRequest = assert.rejects(pendingRequest, /cancelled during WebSocket send/)

    context.requestService.cancelPendingRequests(
      context.station,
      'Request cancelled during WebSocket send'
    )
    sendCallback?.()

    await rejectedRequest
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('does not resurrect a buffered request after cancellation', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    mock.method(wsConnection, 'send', () => undefined)

    const pendingRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: false, throwError: true }
    )
    await flushMicrotasks()
    const rejectedRequest = assert.rejects(pendingRequest, /cancelled during WebSocket send/)

    context.requestService.cancelPendingRequests(
      context.station,
      'Request cancelled during WebSocket send'
    )
    await rejectedRequest
    t.mock.timers.tick(OCPPConstants.OCPP_WEBSOCKET_TIMEOUT_MS)
    await flushMicrotasks()

    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.strictEqual(context.station.requests.size, 0)
    assert.strictEqual(bufferedStation.messageQueue.length, 0)
  })

  await it('cancels requests created by the stop sequence during deletion', async () => {
    const context = createOCPP20RequestTestContext()
    const pendingStopRequest = Promise.withResolvers<never>()
    context.station.started = true
    context.station.stop = (): Promise<void> => {
      context.station.requests.set('stop-request', [
        () => undefined,
        error => {
          pendingStopRequest.reject(error)
        },
        OCPP20RequestCommand.HEARTBEAT,
        {},
      ])
      return Promise.resolve()
    }
    const rejectedRequest = assert.rejects(
      pendingStopRequest.promise,
      /deleted while awaiting an OCPP response/
    )

    await context.station.delete(false)

    await rejectedRequest
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('preserves buffered requests during a restart cancellation', () => {
    const context = createOCPP20RequestTestContext()
    const errorCallback = mock.fn()
    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    context.station.requests.set('buffered', [
      () => undefined,
      errorCallback,
      OCPP20RequestCommand.HEARTBEAT,
      {},
    ])
    context.station.bufferMessage('[2,"buffered","Heartbeat",{}]')

    context.requestService.cancelPendingRequests(context.station)

    assert.strictEqual(context.station.requests.has('buffered'), true)
    assert.strictEqual(bufferedStation.messageQueue.length, 1)
    assert.strictEqual(errorCallback.mock.callCount(), 0)
  })

  await it('discards buffered frames when pending requests are cancelled', () => {
    const context = createOCPP20RequestTestContext()
    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    context.station.bufferMessage('[2,"buffered","Heartbeat",{}]')
    assert.strictEqual(bufferedStation.messageQueue.length, 1)

    context.requestService.cancelPendingRequests(context.station, undefined, true)

    assert.strictEqual(bufferedStation.messageQueue.length, 0)
  })

  await it('notifies when a CALLRESULT arrives before response handling completes', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    mock.method(
      wsConnection,
      'send',
      (_data: unknown, callback?: (error?: Error) => void): void => {
        callback?.()
      }
    )
    let responseReceivedCount = 0

    const requestPromise = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        onResponseReceived: () => {
          responseReceivedCount++
        },
        skipBufferingOnError: true,
        throwError: true,
      }
    )
    await flushMicrotasks()
    const cachedRequest = [...context.station.requests.values()].at(0)
    assert.ok(cachedRequest != null)
    const [responseCallback] = cachedRequest
    responseCallback({ currentTime: new Date() }, {})
    await requestPromise

    assert.strictEqual(responseReceivedCount, 1)
  })
})
