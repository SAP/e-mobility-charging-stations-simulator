/**
 * @file Tests for OCPP20RequestService Heartbeat
 * @description Unit tests for OCPP 2.0 Heartbeat request building (G02)
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { BroadcastChannel } from 'node:worker_threads'

import { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import { addConfigurationKey } from '../../../../src/charging-station/index.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPPConstants } from '../../../../src/charging-station/ocpp/OCPPConstants.js'
import { OCPPError } from '../../../../src/exception/index.js'
import {
  type EmptyObject,
  ErrorType,
  GenericStatus,
  OCPP20ComponentName,
  type OCPP20HeartbeatRequest,
  OCPP20IncomingRequestCommand,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  OCPP20TransactionEventEnumType,
  type OCPP20TransactionEventRequest,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
  RegistrationStatusEnumType,
  type RequestParams,
  WebSocketCloseEventStatusCode,
} from '../../../../src/types/index.js'
import { Constants, has } from '../../../../src/utils/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
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

  await it('should force persisted TransactionEvent schema validation when strict mode is disabled', () => {
    assert.ok(station.stationInfo != null)
    station.stationInfo.ocppStrictCompliance = false
    const invalidRequest = {
      eventType: OCPP20TransactionEventEnumType.Updated,
      seqNo: 0,
      timestamp: new Date(),
      transactionInfo: { transactionId: 'transaction-id' },
      triggerReason: 'InvalidTriggerReason',
    } as unknown as OCPP20TransactionEventRequest

    assert.strictEqual(
      station.ocppRequestService.validateRequestPayload(
        station,
        OCPP20RequestCommand.TRANSACTION_EVENT,
        invalidRequest
      ),
      true
    )
    assert.throws(
      () =>
        station.ocppRequestService.validateRequestPayload(
          station,
          OCPP20RequestCommand.TRANSACTION_EVENT,
          invalidRequest,
          { forceValidation: true }
        ),
      (error: unknown) => error instanceof OCPPError && error.code === ErrorType.FORMAT_VIOLATION
    )
  })

  await it('serializes concurrent outgoing CALLs and releases before response handlers', async t => {
    const workerChannelSubscriber = new BroadcastChannel('worker')
    workerChannelSubscriber.onmessage = () => undefined
    t.after(() => {
      workerChannelSubscriber.close()
    })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })
    const responseHandlerGate = Promise.withResolvers<undefined>()
    const responseService = (
      context.requestService as unknown as {
        ocppResponseService: { responseHandler: () => Promise<undefined> }
      }
    ).ocppResponseService
    mock.method(responseService, 'responseHandler', () => responseHandlerGate.promise)

    const first = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    const second = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    const [firstMessageType, firstMessageId] = JSON.parse(wireMessages[0]) as [number, string]
    assert.strictEqual(firstMessageType, 2)
    context.station.requests.get(firstMessageId)?.[0]({ currentTime: new Date() }, {})
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)

    const [, secondMessageId] = JSON.parse(wireMessages[1]) as [number, string]
    context.station.requests.get(secondMessageId)?.[0]({ currentTime: new Date() }, {})
    responseHandlerGate.resolve(undefined)
    await Promise.all([first, second])
  })

  await it('rejects a CALL whose station state becomes pending while it waits for the gate', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    context.station.bootNotificationResponse = {
      currentTime: new Date(),
      interval: 60,
      status: RegistrationStatusEnumType.ACCEPTED,
    }
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })
    const pendingResponse = {
      currentTime: new Date(),
      interval: 60,
      status: RegistrationStatusEnumType.PENDING,
    }
    const responseService = (
      context.requestService as unknown as {
        ocppResponseService: { responseHandler: () => Promise<undefined> }
      }
    ).ocppResponseService
    mock.method(responseService, 'responseHandler', () => {
      context.station.bootNotificationResponse = pendingResponse
      return Promise.resolve(undefined)
    })

    const bootNotification = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    const heartbeat = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    const heartbeatRejected = assert.rejects(heartbeat, error => {
      assert.ok(error instanceof OCPPError)
      assert.strictEqual(error.code, ErrorType.SECURITY_ERROR)
      assert.match(error.message, /Pending state/)
      return true
    })
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)
    const [, bootMessageId, bootCommand] = JSON.parse(wireMessages[0]) as [number, string, string]
    assert.strictEqual(bootCommand, OCPP20RequestCommand.BOOT_NOTIFICATION)

    context.station.requests.get(bootMessageId)?.[0](pendingResponse, {})
    await Promise.all([bootNotification, heartbeatRejected])

    assert.strictEqual(wireMessages.length, 1)
    assert.strictEqual(context.station.requests.size, 0)

    const nextBootNotification = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)
    const [, nextBootMessageId, nextBootCommand] = JSON.parse(wireMessages[1]) as [
      number,
      string,
      string
    ]
    assert.strictEqual(nextBootCommand, OCPP20RequestCommand.BOOT_NOTIFICATION)
    context.station.requests.get(nextBootMessageId)?.[0](pendingResponse, {})
    await nextBootNotification
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('cancels an immediately acquired CALL before its request is cached', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const sendSpy = mock.method(wsConnection, 'send')
    const transportAmbiguities: boolean[] = []
    const directTransport = context.requestService as unknown as {
      sendMessage: (
        chargingStation: ChargingStation,
        messageId: string,
        messagePayload: EmptyObject,
        commandName: OCPP20RequestCommand,
        params: RequestParams
      ) => Promise<unknown>
    }

    const pendingRequest = directTransport.sendMessage(
      context.station,
      'cancelled-before-cache',
      {},
      OCPP20RequestCommand.HEARTBEAT,
      {
        onTransportError: (_error, deliveryAmbiguous) => {
          transportAmbiguities.push(deliveryAmbiguous)
        },
        responseTimeoutMs: 3_600_000,
        skipBufferingOnError: true,
        throwError: true,
      }
    )
    const rejectedRequest = assert.rejects(
      pendingRequest,
      /Charging station stopped while awaiting an OCPP response/
    )
    context.requestService.cancelPendingRequests(context.station)

    await rejectedRequest
    assert.strictEqual(sendSpy.mock.callCount(), 0)
    assert.deepStrictEqual(transportAmbiguities, [false])
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('does not overwrite an immediate destructive cancellation with a later retained one', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const sendSpy = mock.method(wsConnection, 'send')
    const directTransport = context.requestService as unknown as {
      sendMessage: (
        chargingStation: ChargingStation,
        messageId: string,
        messagePayload: EmptyObject,
        commandName: OCPP20RequestCommand,
        params: RequestParams
      ) => Promise<unknown>
    }

    const pendingRequest = directTransport.sendMessage(
      context.station,
      'destructive-cancellation-before-cache',
      {},
      OCPP20RequestCommand.HEARTBEAT,
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    const rejectedRequest = assert.rejects(pendingRequest, /Station permanently deleted/)
    context.requestService.cancelPendingRequests(
      context.station,
      'Station permanently deleted',
      true
    )
    context.requestService.cancelPendingRequests(context.station, 'WebSocket closed', false)

    await rejectedRequest
    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.strictEqual(sendSpy.mock.callCount(), 0)
    assert.strictEqual(context.station.requests.size, 0)
    assert.deepStrictEqual(bufferedStation.messageQueue, [])
  })

  await it('rejects a CALL created by a callback while permanent cancellation completes', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const sendSpy = mock.method(
      wsConnection,
      'send',
      (_data: unknown, callback?: (error?: Error) => void) => {
        callback?.()
      }
    )
    let reentrantRequest: Promise<unknown> | undefined
    const pendingRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        onError: () => {
          reentrantRequest = context.requestService.requestHandler(
            context.station,
            OCPP20RequestCommand.BOOT_NOTIFICATION,
            {},
            { throwError: true }
          )
        },
        responseTimeoutMs: 3_600_000,
        throwError: true,
      }
    )
    await flushMicrotasks()
    const rejectedPending = assert.rejects(pendingRequest, /Station permanently deleted/)

    context.requestService.cancelPendingRequests(
      context.station,
      'Station permanently deleted',
      true
    )
    await rejectedPending
    assert.ok(reentrantRequest != null)
    await assert.rejects(reentrantRequest, /Station permanently deleted/)

    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.strictEqual(sendSpy.mock.callCount(), 1)
    assert.strictEqual(context.station.requests.size, 0)
    assert.deepStrictEqual(bufferedStation.messageQueue, [])
  })

  await it('lets an incoming CALL response bypass a blocked outgoing CALL', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    const outgoing = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await flushMicrotasks()
    await context.requestService.sendResponse(
      context.station,
      'incoming-call',
      { status: GenericStatus.Accepted },
      OCPP20IncomingRequestCommand.RESET
    )

    assert.deepStrictEqual(
      wireMessages.map(message => (JSON.parse(message) as [number])[0]),
      [2, 3]
    )
    const [, outgoingMessageId] = JSON.parse(wireMessages[0]) as [number, string]
    context.station.requests.get(outgoingMessageId)?.[0]({ currentTime: new Date() }, {})
    await outgoing
  })

  await it('rejects a CALL suspended in its pre-request hook after station stop cancellation', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })
    const preRequestHookEntered = Promise.withResolvers<undefined>()
    const resumePreRequestHook = Promise.withResolvers<undefined>()
    let preRequestHookCalls = 0
    const requestServiceInternals = context.requestService as unknown as {
      preRequestHook: () => Promise<void>
    }
    requestServiceInternals.preRequestHook = async (): Promise<void> => {
      preRequestHookCalls++
      if (preRequestHookCalls === 1) {
        preRequestHookEntered.resolve(undefined)
        await resumePreRequestHook.promise
      }
    }
    let stopping = false
    context.station.isStopping = () => stopping

    const staleRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await preRequestHookEntered.promise
    const cancellationMessage = 'Station stopped during pre-request hook'
    const staleRequestRejected = assert.rejects(
      staleRequest,
      (error: unknown) => error instanceof OCPPError && error.message === cancellationMessage
    )
    stopping = true
    context.requestService.cancelPendingRequests(context.station, cancellationMessage)
    resumePreRequestHook.resolve(undefined)
    await staleRequestRejected
    assert.deepStrictEqual(wireMessages, [])
    assert.strictEqual(context.station.requests.size, 0)

    const shutdownRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        bufferOnErrorDuringStationStop: true,
        responseTimeoutMs: 3_600_000,
        throwError: true,
      }
    )
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)
    const [, shutdownMessageId] = JSON.parse(wireMessages[0]) as [number, string]
    context.station.requests.get(shutdownMessageId)?.[0]({ currentTime: new Date() }, {})
    await shutdownRequest
  })

  await it('bounds stalled outgoing CALL waiters and clears them on cancellation', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    const sendSpy = mock.method(
      wsConnection,
      'send',
      (_data: unknown, callback?: (error?: Error) => void) => {
        callback?.()
      }
    )
    const activeMessageId = 'bounded-active-call'
    await context.requestService.acquireOutgoingCall(context.station, activeMessageId, 3_600_000)
    const waiters = Array.from({ length: Constants.MAX_OUTGOING_CALL_WAITERS }, (_, index) =>
      context.requestService.acquireOutgoingCall(
        context.station,
        `bounded-waiter-${index.toString()}`,
        3_600_000
      )
    )
    const settledWaiters = Promise.allSettled(waiters)
    const outgoingCallGates = (
      context.requestService as unknown as {
        outgoingCallGates: WeakMap<ChargingStation, { waiters: unknown[] }>
      }
    ).outgoingCallGates
    const gate = outgoingCallGates.get(context.station)
    assert.ok(gate != null)
    assert.strictEqual(gate.waiters.length, Constants.MAX_OUTGOING_CALL_WAITERS)

    await assert.rejects(
      context.requestService.requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        { responseTimeoutMs: 3_600_000, throwError: true }
      ),
      (error: unknown) =>
        error instanceof OCPPError &&
        error.message.includes(
          `waiter limit of ${Constants.MAX_OUTGOING_CALL_WAITERS.toString()} reached`
        )
    )
    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.strictEqual(gate.waiters.length, Constants.MAX_OUTGOING_CALL_WAITERS)
    assert.strictEqual(sendSpy.mock.callCount(), 0)
    assert.strictEqual(context.station.requests.size, 0)
    assert.deepStrictEqual(bufferedStation.messageQueue, [])

    const cancellationMessage = 'Station stopped with a saturated CALL gate'
    context.requestService.cancelPendingRequests(context.station, cancellationMessage)
    const outcomes = await settledWaiters
    assert.strictEqual(gate.waiters.length, 0)
    assert.ok(
      outcomes.every(
        outcome =>
          outcome.status === 'rejected' &&
          outcome.reason instanceof OCPPError &&
          outcome.reason.message === cancellationMessage
      )
    )
    context.requestService.releaseOutgoingCall(context.station, activeMessageId)
  })

  await it('should preserve a retainable active CALL during its acquire-to-send handoff', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    context.station.isStopping = () => true
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })
    const directTransport = context.requestService as unknown as {
      sendMessage: (
        chargingStation: ChargingStation,
        messageId: string,
        messagePayload: EmptyObject,
        commandName: OCPP20RequestCommand,
        params: RequestParams
      ) => Promise<unknown>
    }

    const retained = directTransport.sendMessage(
      context.station,
      'retainable-active',
      {},
      OCPP20RequestCommand.HEARTBEAT,
      {
        bufferOnErrorDuringStationStop: true,
        materializeOnCancellationBeforeSend: true,
        responseTimeoutMs: 3_600_000,
        throwError: true,
      }
    )
    context.requestService.cancelPendingRequests(context.station)
    await flushMicrotasks()

    assert.strictEqual(wireMessages.length, 1)
    const [, messageId] = JSON.parse(wireMessages[0]) as [number, string]
    assert.strictEqual(messageId, 'retainable-active')
    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.deepStrictEqual(bufferedStation.messageQueue, [])
    context.station.requests.get(messageId)?.[0]({ currentTime: new Date() }, {})
    await retained
  })

  await it('should materialize active and queued shutdown CALLs with their exact payloads once', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    context.station.isStopping = () => true
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })
    const directTransport = context.requestService as unknown as {
      sendMessage: (
        chargingStation: ChargingStation,
        messageId: string,
        messagePayload: EmptyObject,
        commandName: OCPP20RequestCommand,
        params: RequestParams
      ) => Promise<unknown>
    }
    const callbackCounts = new Map<string, { buffered: number; sent: number; transport: number }>()
    const sendTerminalCall = (messageId: string): Promise<unknown> => {
      const counts = { buffered: 0, sent: 0, transport: 0 }
      callbackCounts.set(messageId, counts)
      return directTransport.sendMessage(
        context.station,
        messageId,
        {},
        OCPP20RequestCommand.HEARTBEAT,
        {
          bufferOnErrorDuringStationStop: true,
          materializeOnCancellationBeforeSend: true,
          onMessageSent: () => {
            counts.sent++
          },
          onRequestBuffered: () => {
            counts.buffered++
          },
          onTransportError: () => {
            counts.transport++
          },
          responseTimeoutMs: 3_600_000,
          throwError: true,
        }
      )
    }

    const active = sendTerminalCall('terminal-active')
    const queued = sendTerminalCall('terminal-queued')
    const rejected = Promise.all([
      assert.rejects(active, /shutdown materialization/),
      assert.rejects(queued, /shutdown materialization/),
    ])
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    context.requestService.cancelPendingRequests(
      context.station,
      'shutdown materialization',
      false,
      { handleTransportStartedSends: true, preserveRetainableWaiters: false }
    )
    await rejected

    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.deepStrictEqual(
      bufferedStation.messageQueue
        .map(message => JSON.parse(message) as [number, string])
        .map(([, id]) => id),
      ['terminal-active', 'terminal-queued']
    )
    assert.deepStrictEqual(
      callbackCounts,
      new Map([
        ['terminal-active', { buffered: 1, sent: 1, transport: 0 }],
        ['terminal-queued', { buffered: 1, sent: 0, transport: 1 }],
      ])
    )

    context.requestService.cancelPendingRequests(
      context.station,
      'repeated shutdown materialization',
      false,
      { handleTransportStartedSends: true, preserveRetainableWaiters: false }
    )
    assert.strictEqual(bufferedStation.messageQueue.length, 2)
    assert.deepStrictEqual(
      callbackCounts,
      new Map([
        ['terminal-active', { buffered: 1, sent: 1, transport: 0 }],
        ['terminal-queued', { buffered: 1, sent: 0, transport: 1 }],
      ])
    )
  })

  await it('cancels FIFO waiters without leaving the station CALL gate locked', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    const first = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    const second = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    const firstRejected = assert.rejects(first, /station stopped/)
    const secondRejected = assert.rejects(second, /station stopped/)
    await flushMicrotasks()
    context.requestService.cancelPendingRequests(context.station)
    await Promise.all([firstRejected, secondRejected])

    const third = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)
    const [, thirdMessageId] = JSON.parse(wireMessages[1]) as [number, string]
    context.station.requests.get(thirdMessageId)?.[0]({ currentTime: new Date() }, {})
    await third
  })

  await it('expires a FIFO waiter without disturbing the active CALL or the next caller', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const activeMessageId = 'active'
    await context.requestService.acquireOutgoingCall(context.station, activeMessageId, 100)
    const expiredWaiter = context.requestService.acquireOutgoingCall(
      context.station,
      'expired-waiter',
      100
    )
    const waiterRejected = assert.rejects(
      expiredWaiter,
      /waiting to acquire the outgoing CALL gate/
    )

    t.mock.timers.tick(200)
    await waiterRejected
    context.requestService.releaseOutgoingCall(context.station, activeMessageId)

    await context.requestService.acquireOutgoingCall(context.station, 'next', 100)
    context.requestService.releaseOutgoingCall(context.station, 'next')
  })

  await it('uses the active CALL deadline when a short-budget waiter joins the gate', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    const active = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    let waiterSettled = false
    const waiter = context.requestService
      .requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        {
          responseTimeoutMs: 1_000,
          skipBufferingOnError: true,
          throwError: true,
        }
      )
      .finally(() => {
        waiterSettled = true
      })
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    t.mock.timers.tick(61_000)
    await flushMicrotasks()
    assert.strictEqual(waiterSettled, false)
    assert.strictEqual(wireMessages.length, 1)

    const [, activeMessageId] = JSON.parse(wireMessages[0]) as [number, string]
    context.station.requests.get(activeMessageId)?.[0]({ currentTime: new Date() }, {})
    await active
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)

    const [, waiterMessageId] = JSON.parse(wireMessages[1]) as [number, string]
    context.station.requests.get(waiterMessageId)?.[0]({ currentTime: new Date() }, {})
    await waiter
  })

  await it('budgets both WebSocket send and response phases for an active CALL slot', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      if (wireMessages.length === 1) {
        setTimeout(() => callback?.(), 59_000)
      } else {
        callback?.()
      }
    })

    const active = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 30_001, skipBufferingOnError: true, throwError: true }
    )
    let waiterSettled = false
    const waiter = context.requestService
      .requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        {
          responseTimeoutMs: 30_001,
          skipBufferingOnError: true,
          throwError: true,
        }
      )
      .finally(() => {
        waiterSettled = true
      })
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    t.mock.timers.tick(59_000)
    await flushMicrotasks()
    t.mock.timers.tick(1_000)
    await flushMicrotasks()
    assert.strictEqual(waiterSettled, false)
    assert.strictEqual(wireMessages.length, 1)

    t.mock.timers.tick(29_000)
    const [, activeMessageId] = JSON.parse(wireMessages[0]) as [number, string]
    context.station.requests.get(activeMessageId)?.[0]({ currentTime: new Date() }, {})
    await active
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)

    const [, waiterMessageId] = JSON.parse(wireMessages[1]) as [number, string]
    context.station.requests.get(waiterMessageId)?.[0]({ currentTime: new Date() }, {})
    await waiter
    assert.strictEqual(waiterSettled, true)
  })

  await it('budgets one timeout window for every CALL ahead in the FIFO', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const activeMessageId = 'fifo-active'
    const firstWaiterId = 'fifo-first'
    const secondWaiterId = 'fifo-second'
    const thirdWaiterId = 'fifo-third'
    await context.requestService.acquireOutgoingCall(context.station, activeMessageId, 100)
    const firstWaiter = context.requestService.acquireOutgoingCall(
      context.station,
      firstWaiterId,
      100
    )
    const firstWaiterRejected = assert.rejects(
      firstWaiter,
      /waiting to acquire the outgoing CALL gate/
    )
    const secondWaiter = context.requestService.acquireOutgoingCall(
      context.station,
      secondWaiterId,
      100
    )
    const thirdWaiter = context.requestService.acquireOutgoingCall(
      context.station,
      thirdWaiterId,
      100
    )

    t.mock.timers.tick(200)
    await firstWaiterRejected
    context.requestService.releaseOutgoingCall(context.station, activeMessageId)
    await secondWaiter
    context.requestService.releaseOutgoingCall(context.station, secondWaiterId)
    await thirdWaiter
    context.requestService.releaseOutgoingCall(context.station, thirdWaiterId)
  })

  await it('buffers a gate waiter retained by ordinary pending-request cancellation', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    let online = true
    context.station.isWebSocketConnectionOpened = () => online
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    const activeCall = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    const retainedWaiter = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    const activeRejected = assert.rejects(activeCall, /station stopped/)
    const waiterRejected = assert.rejects(retainedWaiter, /WebSocket closed/)
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)
    online = false

    context.requestService.cancelPendingRequests(context.station)
    await Promise.all([activeRejected, waiterRejected])

    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.strictEqual(bufferedStation.messageQueue.length, 1)
    assert.strictEqual((JSON.parse(bufferedStation.messageQueue[0]) as [number])[0], 2)
    assert.strictEqual(context.station.requests.size, 1)

    context.requestService.cancelPendingRequests(context.station, undefined, true)
    assert.deepStrictEqual(bufferedStation.messageQueue, [])
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('does not retain an ordinary buffered waiter during station stop', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    let stopping = false
    context.station.isStopping = () => stopping
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    const activeCall = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    const ordinaryWaiter = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    const activeRejected = assert.rejects(activeCall, /station stopped/)
    const waiterRejected = assert.rejects(ordinaryWaiter, /station stopped/)
    await flushMicrotasks()
    stopping = true

    context.requestService.cancelPendingRequests(context.station)
    await Promise.all([activeRejected, waiterRejected])

    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.strictEqual(wireMessages.length, 1)
    assert.deepStrictEqual(bufferedStation.messageQueue, [])
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('keeps a graceful-stop CALL active until its response timeout', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    let stopping = false
    context.station.isStopping = () => stopping
    mock.method(wsConnection, 'send', (_data: unknown, callback?: (error?: Error) => void) => {
      callback?.()
    })

    const pendingCall = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        responseTimeoutMs: 1_000,
        skipBufferingOnError: true,
        throwError: true,
        waitForResponseOnStationStop: true,
      }
    )
    const timedOut = assert.rejects(pendingCall, /Timeout/)
    await flushMicrotasks()
    stopping = true
    context.requestService.cancelPendingRequests(context.station)

    assert.strictEqual(context.station.requests.size, 1)
    t.mock.timers.tick(1_000)
    await timedOut
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('settles a transport-started graceful-stop CALL during final cancellation', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    mock.method(wsConnection, 'send', (_data: unknown, callback?: (error?: Error) => void) => {
      callback?.()
    })

    const pendingCall = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        responseTimeoutMs: 3_600_000,
        skipBufferingOnError: true,
        throwError: true,
        waitForResponseOnStationStop: true,
      }
    )
    const rejected = assert.rejects(pendingCall, /final shutdown/)
    await flushMicrotasks()

    context.requestService.cancelPendingRequests(context.station, 'final shutdown', false, {
      handleTransportStartedSends: true,
      preserveRetainableWaiters: false,
    })

    await rejected
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('evaluates stop-only waiter retention when cancellation begins', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    let online = true
    let stopping = false
    context.station.isWebSocketConnectionOpened = () => online
    context.station.isStopping = () => stopping
    mock.method(wsConnection, 'send', (_data: unknown, callback?: (error?: Error) => void) => {
      callback?.()
    })

    const activeCall = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    const retainedWaiter = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        bufferOnErrorDuringStationStop: true,
        responseTimeoutMs: 3_600_000,
        skipBufferingOnError: true,
        throwError: true,
      }
    )
    const activeRejected = assert.rejects(activeCall, /station stopped/)
    const waiterRejected = assert.rejects(retainedWaiter, /WebSocket closed/)
    await flushMicrotasks()
    stopping = true
    online = false

    context.requestService.cancelPendingRequests(context.station)
    await Promise.all([activeRejected, waiterRejected])

    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.strictEqual(bufferedStation.messageQueue.length, 1)
    assert.strictEqual(context.station.requests.size, 1)

    context.requestService.cancelPendingRequests(context.station, undefined, true)
  })

  await it('discards a buffered gate waiter during permanent deletion cancellation', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    const activeCall = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    const discardedWaiter = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    const activeRejected = assert.rejects(activeCall, /station deleted/)
    const waiterRejected = assert.rejects(discardedWaiter, /station deleted/)
    await flushMicrotasks()

    context.requestService.cancelPendingRequests(context.station, 'Charging station deleted', true)
    await Promise.all([activeRejected, waiterRejected])

    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.strictEqual(wireMessages.length, 1)
    assert.deepStrictEqual(bufferedStation.messageQueue, [])
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('defers saturated buffered replay until a later interval without a busy loop', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    const realSetInterval = globalThis.setInterval
    let flushIntervalCallback: (() => void) | undefined
    mock.method(globalThis, 'setInterval', ((callback: () => void, delay?: number) => {
      if (delay === Constants.DEFAULT_MESSAGE_BUFFER_FLUSH_INTERVAL_MS) {
        flushIntervalCallback = callback
      }
      return realSetInterval(() => undefined, 3_600_000)
    }) as typeof setInterval)
    const tickFlushInterval = (): void => {
      assert.ok(flushIntervalCallback != null)
      flushIntervalCallback()
    }
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    await assert.rejects(
      context.requestService.requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        { bufferWithoutSending: true, responseTimeoutMs: 3_600_000, throwError: true }
      ),
      /Buffered message id/
    )
    const bufferedStation = context.station as unknown as {
      clearIntervalFlushMessageBuffer: () => void
      flushMessageBuffer: () => void
      messageQueue: string[]
      sendMessageBuffer: (onComplete: () => void) => void
      setIntervalFlushMessageBuffer: () => void
    }
    const bufferMethods = ChargingStation.prototype as unknown as {
      clearIntervalFlushMessageBuffer: (this: ChargingStation) => void
      flushMessageBuffer: (this: ChargingStation) => void
      sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
      setIntervalFlushMessageBuffer: (this: ChargingStation) => void
    }
    bufferedStation.clearIntervalFlushMessageBuffer = bufferMethods.clearIntervalFlushMessageBuffer
    bufferedStation.flushMessageBuffer = bufferMethods.flushMessageBuffer
    bufferedStation.sendMessageBuffer = bufferMethods.sendMessageBuffer
    bufferedStation.setIntervalFlushMessageBuffer = bufferMethods.setIntervalFlushMessageBuffer
    const bufferedCall = bufferedStation.messageQueue[0]

    const activeCall = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)
    const waitingIds = Array.from(
      { length: Constants.MAX_OUTGOING_CALL_WAITERS },
      (_, index) => `saturated-replay-waiter-${index.toString()}`
    )
    const waiters = waitingIds.map(messageId =>
      context.requestService.acquireOutgoingCall(context.station, messageId, 3_600_000)
    )
    const settledWaiters = Promise.allSettled(waiters)
    const acquireSpy = mock.method(context.requestService, 'acquireOutgoingCall')
    let completedDrains = 0

    bufferedStation.sendMessageBuffer(() => {
      completedDrains++
    })
    await flushMicrotasks()
    assert.strictEqual(acquireSpy.mock.callCount(), 1)
    assert.strictEqual(completedDrains, 1)
    assert.strictEqual(wireMessages.length, 1)
    assert.deepStrictEqual(bufferedStation.messageQueue, [bufferedCall])
    tickFlushInterval()
    await flushMicrotasks()
    assert.strictEqual(acquireSpy.mock.callCount(), 2)
    assert.strictEqual(wireMessages.length, 1)

    const cancellationError = new OCPPError(ErrorType.GENERIC_ERROR, 'clear saturated waiters')
    for (const messageId of waitingIds) {
      assert.strictEqual(
        context.requestService.cancelOutgoingCallWaiter(
          context.station,
          messageId,
          cancellationError
        ),
        true
      )
    }
    const waiterOutcomes = await settledWaiters
    assert.ok(waiterOutcomes.every(outcome => outcome.status === 'rejected'))
    const [, activeMessageId] = JSON.parse(wireMessages[0]) as [number, string]
    context.station.requests.get(activeMessageId)?.[0]({ currentTime: new Date() }, {})
    await activeCall

    tickFlushInterval()
    await flushMicrotasks()
    assert.deepStrictEqual(wireMessages, [wireMessages[0], bufferedCall])
    assert.deepStrictEqual(bufferedStation.messageQueue, [])
    const [, replayedMessageId] = JSON.parse(bufferedCall) as [number, string]
    context.station.requests.get(replayedMessageId)?.[0]({ currentTime: new Date() }, {})
    await flushMicrotasks()
    tickFlushInterval()
    assert.strictEqual(wireMessages.length, 2)
    bufferedStation.clearIntervalFlushMessageBuffer()
  })

  await it('serializes buffered replay with live CALL traffic', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })
    const responseService = (
      context.requestService as unknown as {
        ocppResponseService: { responseHandler: () => Promise<undefined> }
      }
    ).ocppResponseService
    mock.method(responseService, 'responseHandler', () => Promise.resolve(undefined))

    const buffered = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { bufferWithoutSending: true, responseTimeoutMs: 3_600_000, throwError: true }
    )
    await assert.rejects(buffered, /Buffered message id/)
    const sendMessageBuffer = (
      ChargingStation.prototype as unknown as {
        sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
      }
    ).sendMessageBuffer
    ;(
      context.station as unknown as { sendMessageBuffer: typeof sendMessageBuffer }
    ).sendMessageBuffer = sendMessageBuffer
    sendMessageBuffer.call(context.station, () => undefined)
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    const live = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    const [, replayedMessageId] = JSON.parse(wireMessages[0]) as [number, string]
    context.station.requests.get(replayedMessageId)?.[0]({ currentTime: new Date() }, {})
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)
    const [, liveMessageId] = JSON.parse(wireMessages[1]) as [number, string]
    context.station.requests.get(liveMessageId)?.[0]({ currentTime: new Date() }, {})
    await live
  })

  await it('budgets a buffered replay slot through its cached response timeout', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const responseService = (
      context.requestService as unknown as {
        ocppResponseService: { responseHandler: () => Promise<undefined> }
      }
    ).ocppResponseService
    mock.method(responseService, 'responseHandler', () => Promise.resolve(undefined))

    await assert.rejects(
      context.requestService.requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        { bufferWithoutSending: true, responseTimeoutMs: 120_000, throwError: true }
      ),
      /Buffered message id/
    )
    const bufferedStation = context.station as unknown as {
      messageQueue: string[]
      sendMessageBuffer: (onComplete: () => void) => void
    }
    const sendMessageBuffer = (
      ChargingStation.prototype as unknown as {
        sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
      }
    ).sendMessageBuffer
    bufferedStation.sendMessageBuffer = sendMessageBuffer
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      if (wireMessages.length === 1) {
        setTimeout(() => callback?.(), 59_000)
      } else {
        callback?.()
      }
    })

    bufferedStation.sendMessageBuffer(() => undefined)
    await flushMicrotasks()
    let waiterSettled = false
    const waiter = context.requestService
      .requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        {
          responseTimeoutMs: 1_000,
          skipBufferingOnError: true,
          throwError: true,
        }
      )
      .finally(() => {
        waiterSettled = true
      })
    assert.strictEqual(wireMessages.length, 1)

    t.mock.timers.tick(59_000)
    await flushMicrotasks()
    t.mock.timers.tick(62_000)
    await flushMicrotasks()
    assert.strictEqual(waiterSettled, false)
    assert.strictEqual(wireMessages.length, 1)

    t.mock.timers.tick(57_999)
    const [, replayedMessageId] = JSON.parse(wireMessages[0]) as [number, string]
    context.station.requests.get(replayedMessageId)?.[0]({ currentTime: new Date() }, {})
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)

    const [, waiterMessageId] = JSON.parse(wireMessages[1]) as [number, string]
    context.station.requests.get(waiterMessageId)?.[0]({ currentTime: new Date() }, {})
    await waiter
  })

  await it('retains a replayed CALL when registration becomes pending during gate handoff', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const acceptedBootNotificationResponse = context.station.bootNotificationResponse
    assert.ok(acceptedBootNotificationResponse != null)
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    await assert.rejects(
      context.requestService.requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        { bufferWithoutSending: true, responseTimeoutMs: 3_600_000, throwError: true }
      ),
      /Buffered message id/
    )
    const bufferedStation = context.station as unknown as {
      clearIntervalFlushMessageBuffer: () => void
      messageQueue: string[]
      sendMessageBuffer: (onComplete: () => void) => void
    }
    const bufferMethods = ChargingStation.prototype as unknown as {
      clearIntervalFlushMessageBuffer: (this: ChargingStation) => void
      sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
    }
    bufferedStation.clearIntervalFlushMessageBuffer = bufferMethods.clearIntervalFlushMessageBuffer
    bufferedStation.sendMessageBuffer = bufferMethods.sendMessageBuffer
    bufferedStation.clearIntervalFlushMessageBuffer()
    const bufferedCall = bufferedStation.messageQueue[0]
    const [, bufferedMessageId] = JSON.parse(bufferedCall) as [number, string]
    const activeMessageId = 'pending-handoff-active-call'
    await context.requestService.acquireOutgoingCall(context.station, activeMessageId, 3_600_000)
    bufferedStation.sendMessageBuffer(() => undefined)
    await flushMicrotasks()
    assert.deepStrictEqual(wireMessages, [])

    context.station.bootNotificationResponse = {
      ...acceptedBootNotificationResponse,
      status: RegistrationStatusEnumType.PENDING,
    }
    context.requestService.releaseOutgoingCall(context.station, activeMessageId)
    await flushMicrotasks()

    assert.deepStrictEqual(wireMessages, [])
    assert.deepStrictEqual(bufferedStation.messageQueue, [bufferedCall])
    assert.strictEqual(context.station.requests.has(bufferedMessageId), true)

    context.station.bootNotificationResponse = acceptedBootNotificationResponse
    bufferedStation.sendMessageBuffer(() => undefined)
    await flushMicrotasks()
    assert.deepStrictEqual(wireMessages, [bufferedCall])
    assert.deepStrictEqual(bufferedStation.messageQueue, [])
    context.station.requests.get(bufferedMessageId)?.[0]({ currentTime: new Date() }, {})
    await flushMicrotasks()
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('keeps a TransactionEvent waiter alive for the active WebSocket send budget', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    addConfigurationKey(
      context.station,
      `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageTimeout}.Default`,
      '30',
      undefined,
      { save: false }
    )
    const transactionId = 'transaction-event-gate-timeout'
    setupConnectorWithTransaction(context.station, 1, { transactionId })
    const wireMessages: string[] = []
    let activeSendCallback: ((error?: Error) => void) | undefined
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      if (wireMessages.length === 1) {
        activeSendCallback = callback
      } else {
        callback?.()
      }
    })

    const active = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    const activeRejected = assert.rejects(active, /Timeout .* reached/)
    await flushMicrotasks()
    assert.ok(activeSendCallback != null)
    const transactionEvent = OCPP20ServiceUtils.sendTransactionEvent(
      context.station,
      OCPP20TransactionEventEnumType.Updated,
      OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      1,
      transactionId,
      {},
      { skipBufferingOnError: true, throwError: true }
    )
    await flushMicrotasks()

    t.mock.timers.tick(30_000)
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    t.mock.timers.tick(30_000)
    await activeRejected
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)
    const [, transactionEventMessageId, , transactionEventPayload] = JSON.parse(
      wireMessages[1]
    ) as [number, string, OCPP20RequestCommand, OCPP20TransactionEventRequest]
    context.station.requests.get(transactionEventMessageId)?.[0]({}, transactionEventPayload)
    await transactionEvent
  })

  await it('persists an Ended event while the global CALL gate blocks its first send', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const transactionId = 'transaction-ended-global-gate'
    setupConnectorWithTransaction(context.station, 1, { transactionId })
    const connectorStatus = context.station.getConnectorStatus(1)
    assert.ok(connectorStatus != null)
    const durableSnapshots: OCPP20TransactionEventEnumType[][] = []
    context.station.saveTransactionEventQueues = () => {
      durableSnapshots.push(
        (connectorStatus.transactionEventQueue ?? []).map(({ request }) => request.eventType)
      )
    }
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    const heartbeat = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    await flushMicrotasks()
    const ended = OCPP20ServiceUtils.sendTransactionEvent(
      context.station,
      OCPP20TransactionEventEnumType.Ended,
      OCPP20TriggerReasonEnumType.StopAuthorized,
      1,
      transactionId,
      {},
      { throwError: true }
    )
    await flushMicrotasks()

    assert.strictEqual(wireMessages.length, 1)
    assert.deepStrictEqual(
      connectorStatus.transactionEventQueue?.map(({ request }) => request.eventType),
      [OCPP20TransactionEventEnumType.Ended]
    )
    assert.deepStrictEqual(durableSnapshots.at(-1), [OCPP20TransactionEventEnumType.Ended])

    const [, heartbeatMessageId] = JSON.parse(wireMessages[0]) as [number, string]
    context.station.requests.get(heartbeatMessageId)?.[0]({ currentTime: new Date() }, {})
    await heartbeat
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)
    const [, endedMessageId, , endedPayload] = JSON.parse(wireMessages[1]) as [
      number,
      string,
      OCPP20RequestCommand,
      OCPP20TransactionEventRequest
    ]
    context.station.requests.get(endedMessageId)?.[0]({}, endedPayload)
    await ended

    assert.deepStrictEqual(connectorStatus.transactionEventQueue ?? [], [])
    assert.deepStrictEqual(durableSnapshots.at(-1), [])
  })

  await it('retries and retains a TransactionEvent that expires behind the CALL gate', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    addConfigurationKey(
      context.station,
      `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
      '2',
      undefined,
      { save: false }
    )
    addConfigurationKey(
      context.station,
      `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttemptInterval}.TransactionEvent`,
      '0',
      undefined,
      { save: false }
    )
    const transactionId = 'transaction-event-expired-gate'
    setupConnectorWithTransaction(context.station, 1, { transactionId })
    const connectorStatus = context.station.getConnectorStatus(1)
    assert.ok(connectorStatus != null)
    const activeMessageId = 'blocked-global-call'
    await context.requestService.acquireOutgoingCall(context.station, activeMessageId, 1)
    const transportAmbiguities: boolean[] = []

    const transactionEvent = OCPP20ServiceUtils.sendTransactionEvent(
      context.station,
      OCPP20TransactionEventEnumType.Updated,
      OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      1,
      transactionId,
      {},
      {
        onTransportError: (_error, deliveryAmbiguous) => {
          transportAmbiguities.push(deliveryAmbiguous)
        },
        responseTimeoutMs: 1,
        throwError: true,
      }
    )
    await flushMicrotasks()

    t.mock.timers.tick(OCPPConstants.OCPP_WEBSOCKET_TIMEOUT_MS + 2)
    await flushMicrotasks()
    t.mock.timers.tick(1_000)
    await flushMicrotasks()
    assert.deepStrictEqual(transportAmbiguities, [false])

    t.mock.timers.tick(OCPPConstants.OCPP_WEBSOCKET_TIMEOUT_MS + 1)
    await transactionEvent
    assert.deepStrictEqual(transportAmbiguities, [false, false])
    assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
    assert.strictEqual(
      connectorStatus.transactionEventQueue.at(0)?.request.transactionInfo.transactionId,
      transactionId
    )

    context.station.isWebSocketConnectionOpened = () => false
    context.requestService.releaseOutgoingCall(context.station, activeMessageId)
    await flushMicrotasks()
  })

  await it('uses the configured OCPP 2.0 MessageTimeout to release the CALL gate', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    addConfigurationKey(
      context.station,
      `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageTimeout}.Default`,
      '120',
      undefined,
      { save: false }
    )
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    const first = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { skipBufferingOnError: true, throwError: true }
    )
    const firstRejected = assert.rejects(first, /Timeout .* waiting for response/)
    const second = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    t.mock.timers.tick(Constants.DEFAULT_MESSAGE_TIMEOUT_SECONDS * 1000)
    await flushMicrotasks()
    assert.strictEqual(context.station.requests.size, 1)
    assert.strictEqual(wireMessages.length, 1)

    t.mock.timers.tick(90_000)
    await firstRejected
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)

    const [, secondMessageId] = JSON.parse(wireMessages[1]) as [number, string]
    context.station.requests.get(secondMessageId)?.[0]({ currentTime: new Date() }, {})
    await second
  })

  await it('should bound a persisted MessageTimeout to the canonical timer range', () => {
    const context = createOCPP20RequestTestContext()
    addConfigurationKey(
      context.station,
      `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageTimeout}.Default`,
      Number.MAX_SAFE_INTEGER.toString(),
      undefined,
      { save: false }
    )

    const timeoutMs = OCPP20ServiceUtils.getMessageTimeout(context.station)

    assert.strictEqual(timeoutMs, 3_600_000)
    assert.strictEqual(Number.isFinite(timeoutMs), true)
  })

  await it('cancels active and waiting CALLs when the WebSocket closes', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.started = false
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    const first = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    const second = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    const firstRejected = assert.rejects(first, /WebSocket closed while awaiting/)
    const secondRejected = assert.rejects(second, /WebSocket closed while awaiting/)
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    const stationInternals = context.station as unknown as {
      restoreAcknowledgedBufferedMessages: () => void
      wsConnection: null | typeof wsConnection
      wsConnectionsClosedByRequest: WeakSet<object>
    }
    stationInternals.restoreAcknowledgedBufferedMessages = () => undefined
    stationInternals.wsConnectionsClosedByRequest = new WeakSet()
    ;(
      ChargingStation.prototype as unknown as {
        onClose: (
          this: ChargingStation,
          connection: typeof wsConnection,
          code: WebSocketCloseEventStatusCode,
          reason: Buffer
        ) => void
      }
    ).onClose.call(
      context.station,
      wsConnection,
      WebSocketCloseEventStatusCode.CLOSE_NORMAL,
      Buffer.from('')
    )
    await Promise.all([firstRejected, secondRejected])

    stationInternals.wsConnection = wsConnection
    const next = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)
    const [, nextMessageId] = JSON.parse(wireMessages[1]) as [number, string]
    context.station.requests.get(nextMessageId)?.[0]({ currentTime: new Date() }, {})
    await next
  })

  await it('buffers a retainable CALL waiting behind the active request when the connection closes', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.started = false
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    const active = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    const waiting = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    const activeRejected = assert.rejects(active, /WebSocket closed while awaiting/)
    const waitingRejected = assert.rejects(waiting, /WebSocket closed/)
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    const stationInternals = context.station as unknown as {
      messageQueue: string[]
      restoreAcknowledgedBufferedMessages: () => void
      wsConnection: null | typeof wsConnection
      wsConnectionsClosedByRequest: WeakSet<object>
    }
    stationInternals.restoreAcknowledgedBufferedMessages = () => undefined
    stationInternals.wsConnectionsClosedByRequest = new WeakSet()
    ;(
      ChargingStation.prototype as unknown as {
        onClose: (
          this: ChargingStation,
          connection: typeof wsConnection,
          code: WebSocketCloseEventStatusCode,
          reason: Buffer
        ) => void
      }
    ).onClose.call(
      context.station,
      wsConnection,
      WebSocketCloseEventStatusCode.CLOSE_NORMAL,
      Buffer.from('')
    )
    await Promise.all([activeRejected, waitingRejected])

    assert.strictEqual(wireMessages.length, 1)
    assert.strictEqual(stationInternals.messageQueue.length, 1)
    const [, , bufferedCommand] = JSON.parse(stationInternals.messageQueue[0]) as [
      number,
      string,
      string
    ]
    assert.strictEqual(bufferedCommand, OCPP20RequestCommand.HEARTBEAT)
    assert.strictEqual(context.station.requests.size, 1)

    context.requestService.cancelPendingRequests(context.station, undefined, true)
  })

  await it('buffers an in-flight WebSocket send exactly once when the connection closes', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.started = false
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    let sendCallback: ((error?: Error) => void) | undefined
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      sendCallback = callback
    })

    const request = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    const rejectedRequest = assert.rejects(request, /WebSocket closed while awaiting/)
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)
    assert.strictEqual(context.station.requests.size, 1)

    const stationInternals = context.station as unknown as {
      messageQueue: string[]
      restoreAcknowledgedBufferedMessages: () => void
      wsConnection: null | typeof wsConnection
      wsConnectionsClosedByRequest: WeakSet<object>
    }
    stationInternals.restoreAcknowledgedBufferedMessages = () => undefined
    stationInternals.wsConnectionsClosedByRequest = new WeakSet()
    ;(
      ChargingStation.prototype as unknown as {
        onClose: (
          this: ChargingStation,
          connection: typeof wsConnection,
          code: WebSocketCloseEventStatusCode,
          reason: Buffer
        ) => void
      }
    ).onClose.call(
      context.station,
      wsConnection,
      WebSocketCloseEventStatusCode.CLOSE_NORMAL,
      Buffer.from('')
    )
    await rejectedRequest

    assert.strictEqual(stationInternals.wsConnection, null)
    assert.deepStrictEqual(stationInternals.messageQueue, [wireMessages[0]])
    assert.strictEqual(context.station.requests.size, 1)

    sendCallback?.()
    sendCallback?.(new OCPPError(ErrorType.GENERIC_ERROR, 'late send failure'))
    assert.deepStrictEqual(stationInternals.messageQueue, [wireMessages[0]])
    assert.strictEqual(context.station.requests.size, 1)

    context.requestService.cancelPendingRequests(context.station, undefined, true)
    assert.deepStrictEqual(stationInternals.messageQueue, [])
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('keeps an interrupted TransactionEvent out of the raw message buffer', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.started = false
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const transactionId = 'transaction-event-in-flight-close'
    setupConnectorWithTransaction(context.station, 1, { transactionId })
    addConfigurationKey(
      context.station,
      `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
      '1',
      undefined,
      { save: false }
    )
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown) => {
      wireMessages.push(String(data))
    })

    const delivery = OCPP20ServiceUtils.sendTransactionEvent(
      context.station,
      OCPP20TransactionEventEnumType.Updated,
      OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      1,
      transactionId
    )
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    const stationInternals = context.station as unknown as {
      messageQueue: string[]
      restoreAcknowledgedBufferedMessages: () => void
      wsConnection: null | typeof wsConnection
      wsConnectionsClosedByRequest: WeakSet<object>
    }
    stationInternals.restoreAcknowledgedBufferedMessages = () => undefined
    stationInternals.wsConnectionsClosedByRequest = new WeakSet()
    ;(
      ChargingStation.prototype as unknown as {
        onClose: (
          this: ChargingStation,
          connection: typeof wsConnection,
          code: WebSocketCloseEventStatusCode,
          reason: Buffer
        ) => void
      }
    ).onClose.call(
      context.station,
      wsConnection,
      WebSocketCloseEventStatusCode.CLOSE_NORMAL,
      Buffer.from('')
    )
    await delivery

    const connectorStatus = context.station.getConnectorStatus(1)
    assert.ok(connectorStatus != null)
    assert.deepStrictEqual(stationInternals.messageQueue, [])
    assert.deepStrictEqual(
      connectorStatus.transactionEventQueue?.map(({ request }) => request.eventType),
      [OCPP20TransactionEventEnumType.Updated]
    )
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('retracts a replay promoted during CALL gate handoff so a buffered CALLRESULT passes first', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    await assert.rejects(
      context.requestService.requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        { bufferWithoutSending: true, responseTimeoutMs: 3_600_000, throwError: true }
      ),
      /Buffered message id/
    )
    const bufferedStation = context.station as unknown as {
      bufferMessage: (message: string, prepend?: boolean) => void
      flushMessageBuffer: () => void
      messageQueue: string[]
      sendMessageBuffer: (onComplete: () => void) => void
      setIntervalFlushMessageBuffer: () => void
    }
    const bufferMethods = ChargingStation.prototype as unknown as {
      bufferMessage: (this: ChargingStation, message: string, prepend?: boolean) => void
      clearIntervalFlushMessageBuffer: (this: ChargingStation) => void
      flushMessageBuffer: (this: ChargingStation) => void
      sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
    }
    bufferMethods.clearIntervalFlushMessageBuffer.call(context.station)
    bufferedStation.setIntervalFlushMessageBuffer = () => undefined
    bufferedStation.bufferMessage = bufferMethods.bufferMessage
    bufferedStation.flushMessageBuffer = bufferMethods.flushMessageBuffer
    bufferedStation.sendMessageBuffer = bufferMethods.sendMessageBuffer
    const bufferedCall = bufferedStation.messageQueue[0]
    const [, bufferedMessageId] = JSON.parse(bufferedCall) as [number, string]
    const activeMessageId = 'active-call'
    await context.requestService.acquireOutgoingCall(context.station, activeMessageId, 3_600_000)
    bufferMethods.sendMessageBuffer.call(context.station, () => undefined)
    await flushMicrotasks()
    assert.deepStrictEqual(wireMessages, [])

    context.requestService.releaseOutgoingCall(context.station, activeMessageId)
    const bufferedResponse = '[3,"incoming-call",{}]'
    context.station.bufferMessage(bufferedResponse)
    await flushMicrotasks()

    assert.deepStrictEqual(wireMessages, [bufferedResponse])
    assert.deepStrictEqual(bufferedStation.messageQueue, [bufferedCall])
    t.mock.timers.tick(60_000)
    await flushMicrotasks()
    assert.deepStrictEqual(wireMessages, [bufferedResponse, bufferedCall])
    assert.strictEqual(wireMessages.filter(message => message === bufferedCall).length, 1)
    assert.deepStrictEqual(bufferedStation.messageQueue, [])

    context.station.requests.get(bufferedMessageId)?.[0]({ currentTime: new Date() }, {})
    await flushMicrotasks()
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('prioritizes a buffered CALLRESULT over a replay CALL waiting for the gate', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const wireMessages: string[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.()
    })

    await assert.rejects(
      context.requestService.requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        { bufferWithoutSending: true, responseTimeoutMs: 3_600_000, throwError: true }
      ),
      /Buffered message id/
    )
    const bufferedStation = context.station as unknown as {
      bufferMessage: (message: string, prepend?: boolean) => void
      clearIntervalFlushMessageBuffer: () => void
      flushMessageBuffer: () => void
      messageQueue: string[]
      sendMessageBuffer: (onComplete: () => void) => void
      setIntervalFlushMessageBuffer: () => void
    }
    bufferedStation.clearIntervalFlushMessageBuffer = () => undefined
    bufferedStation.setIntervalFlushMessageBuffer = () => undefined
    const bufferMethods = ChargingStation.prototype as unknown as {
      bufferMessage: (this: ChargingStation, message: string, prepend?: boolean) => void
      flushMessageBuffer: (this: ChargingStation) => void
      sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
    }
    bufferedStation.bufferMessage = bufferMethods.bufferMessage
    bufferedStation.flushMessageBuffer = bufferMethods.flushMessageBuffer
    bufferedStation.sendMessageBuffer = bufferMethods.sendMessageBuffer
    const bufferedCall = bufferedStation.messageQueue[0]

    const live = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await flushMicrotasks()
    bufferMethods.sendMessageBuffer.call(context.station, () => undefined)
    await flushMicrotasks()
    assert.deepStrictEqual(
      wireMessages.map(message => (JSON.parse(message) as [number])[0]),
      [2]
    )

    const bufferedResponse = '[3,"incoming-call",{}]'
    context.station.bufferMessage(bufferedResponse)
    await flushMicrotasks()
    assert.deepStrictEqual(
      wireMessages.map(message => (JSON.parse(message) as [number])[0]),
      [2, 3]
    )

    t.mock.timers.tick(60_000)
    await flushMicrotasks()
    const [, liveMessageId] = JSON.parse(wireMessages[0]) as [number, string]
    context.station.requests.get(liveMessageId)?.[0]({ currentTime: new Date() }, {})
    await live
    await flushMicrotasks()
    assert.deepStrictEqual(
      wireMessages.map(message => (JSON.parse(message) as [number])[0]),
      [2, 3, 2]
    )

    const [, bufferedMessageId] = JSON.parse(bufferedCall) as [number, string]
    context.station.requests.get(bufferedMessageId)?.[0]({ currentTime: new Date() }, {})
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

  await it('reports an asynchronous WebSocket send failure as delivery-ambiguous', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const observedTransportErrors: [OCPPError, boolean][] = []
    const socketFailure = new OCPPError(ErrorType.GENERIC_ERROR, 'socket write failed')
    mock.method(
      wsConnection,
      'send',
      (_data: unknown, callback?: (error?: Error) => void): void => {
        callback?.(socketFailure)
      }
    )

    await assert.rejects(
      context.requestService.requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        {
          onTransportError: (error, deliveryAmbiguous) => {
            observedTransportErrors.push([error, deliveryAmbiguous])
          },
          skipBufferingOnError: true,
          throwError: true,
        }
      ),
      /WebSocket errored/
    )

    assert.strictEqual(observedTransportErrors.length, 1)
    assert.match(observedTransportErrors[0][0].message, /WebSocket errored/)
    assert.strictEqual(observedTransportErrors[0][1], true)
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('does not resurrect a request discarded by its transport-error hook', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    let sendCallback: ((error?: Error) => void) | undefined
    let sendCount = 0
    mock.method(wsConnection, 'send', (_data: unknown, callback?: (error?: Error) => void) => {
      sendCount++
      sendCallback = callback
    })

    const request = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        onTransportError: () => {
          context.requestService.cancelPendingRequests(
            context.station,
            'Transport hook discarded request',
            true
          )
        },
        throwError: true,
      }
    )
    await flushMicrotasks()
    assert.ok(sendCallback != null)
    const rejectedRequest = assert.rejects(request, /Transport hook discarded request/)

    sendCallback(new OCPPError(ErrorType.GENERIC_ERROR, 'socket write failed'))
    await rejectedRequest

    const bufferedStation = context.station as unknown as {
      messageQueue: string[]
      sendMessageBuffer: (onComplete: () => void) => void
    }
    bufferedStation.sendMessageBuffer = (
      ChargingStation.prototype as unknown as {
        sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
      }
    ).sendMessageBuffer
    assert.strictEqual(context.station.requests.size, 0)
    assert.deepStrictEqual(bufferedStation.messageQueue, [])

    sendCallback()
    bufferedStation.sendMessageBuffer(() => undefined)
    await flushMicrotasks()
    assert.strictEqual(sendCount, 1)
    assert.strictEqual(context.station.requests.size, 0)
    assert.deepStrictEqual(bufferedStation.messageQueue, [])
  })

  await it('does not duplicate a request retained by its transport-error hook', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    let stopping = true
    context.station.isStopping = () => stopping
    const wireMessages: string[] = []
    let firstSendCallback: ((error?: Error) => void) | undefined
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      if (wireMessages.length === 1) {
        firstSendCallback = callback
      } else {
        callback?.()
      }
    })

    const request = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        bufferOnErrorDuringStationStop: true,
        onTransportError: () => {
          context.requestService.cancelPendingRequests(
            context.station,
            'Transport hook retained request'
          )
        },
        responseTimeoutMs: 3_600_000,
        skipBufferingOnError: true,
        throwError: true,
      }
    )
    await flushMicrotasks()
    assert.ok(firstSendCallback != null)
    const rejectedRequest = assert.rejects(request, /Transport hook retained request/)

    firstSendCallback(new OCPPError(ErrorType.GENERIC_ERROR, 'socket write failed'))
    await rejectedRequest

    const bufferedStation = context.station as unknown as {
      messageQueue: string[]
      sendMessageBuffer: (onComplete: () => void) => void
    }
    bufferedStation.sendMessageBuffer = (
      ChargingStation.prototype as unknown as {
        sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
      }
    ).sendMessageBuffer
    assert.deepStrictEqual(bufferedStation.messageQueue, [wireMessages[0]])
    assert.strictEqual(context.station.requests.size, 1)

    firstSendCallback()
    stopping = false
    bufferedStation.sendMessageBuffer(() => undefined)
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)
    assert.deepStrictEqual(bufferedStation.messageQueue, [])

    const [, messageId] = JSON.parse(wireMessages[1]) as [number, string]
    context.station.requests.get(messageId)?.[0]({ currentTime: new Date() }, {})
    await flushMicrotasks()
    assert.strictEqual(context.station.requests.size, 0)
    bufferedStation.sendMessageBuffer(() => undefined)
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)
  })

  await it('releases the CALL gate before a transport-error hook starts a nested CALL', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const events: string[] = []
    const wireMessages: string[] = []
    const socketFailure = new OCPPError(ErrorType.GENERIC_ERROR, 'socket write failed')
    const releaseOutgoingCall = context.requestService.releaseOutgoingCall.bind(
      context.requestService
    )
    mock.method(
      context.requestService,
      'releaseOutgoingCall',
      (station: ChargingStation, messageId: string): void => {
        events.push(`release:${messageId}`)
        releaseOutgoingCall(station, messageId)
      }
    )
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      callback?.(wireMessages.length === 1 ? socketFailure : undefined)
    })
    let nestedRequest: Promise<unknown> | undefined

    await assert.rejects(
      context.requestService.requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        {
          onTransportError: () => {
            events.push('transport-error-hook')
            nestedRequest = context.requestService.requestHandler(
              context.station,
              OCPP20RequestCommand.HEARTBEAT,
              {},
              { responseTimeoutMs: 3_600_000, throwError: true }
            )
          },
          skipBufferingOnError: true,
          throwError: true,
        }
      ),
      /WebSocket errored/
    )
    await flushMicrotasks()

    assert.match(events[0], /^release:/)
    assert.strictEqual(events[1], 'transport-error-hook')
    assert.strictEqual(wireMessages.length, 2)
    assert.ok(nestedRequest != null)
    const [, nestedMessageId] = JSON.parse(wireMessages[1]) as [number, string]
    context.station.requests.get(nestedMessageId)?.[0]({ currentTime: new Date() }, {})
    await nestedRequest
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('marks a stalled WebSocket send callback as delivery-ambiguous', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const observedAmbiguity: boolean[] = []
    mock.method(wsConnection, 'send', () => undefined)

    const request = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        onTransportError: (_error, deliveryAmbiguous) => {
          observedAmbiguity.push(deliveryAmbiguous)
        },
        skipBufferingOnError: true,
        throwError: true,
      }
    )
    const rejectedRequest = assert.rejects(request, /Timeout .* reached for non buffered message/)
    await flushMicrotasks()
    t.mock.timers.tick(OCPPConstants.OCPP_WEBSOCKET_TIMEOUT_MS)

    await rejectedRequest
    assert.deepStrictEqual(observedAmbiguity, [true])
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('reports a synchronous WebSocket send throw as definitely not sent', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const observedAmbiguity: boolean[] = []
    const socketFailure = new OCPPError(ErrorType.GENERIC_ERROR, 'synchronous socket failure')
    mock.method(wsConnection, 'send', () => {
      throw socketFailure
    })

    await assert.rejects(
      context.requestService.requestHandler(
        context.station,
        OCPP20RequestCommand.HEARTBEAT,
        {},
        {
          onTransportError: (_error, deliveryAmbiguous) => {
            observedAmbiguity.push(deliveryAmbiguous)
          },
          skipBufferingOnError: true,
          throwError: true,
        }
      ),
      /WebSocket errored/
    )

    assert.deepStrictEqual(observedAmbiguity, [false])
    assert.strictEqual(context.station.requests.size, 0)
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

  await it('buffers an unacknowledged station-stop request exactly once before cancellation', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    context.station.isStopping = () => true
    let sendCallback: ((error?: Error) => void) | undefined
    let serializedMessage: string | undefined
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      serializedMessage = String(data)
      sendCallback = callback
    })

    const pendingRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        bufferOnErrorDuringStationStop: true,
        responseTimeoutMs: 3_600_000,
        skipBufferingOnError: true,
        throwError: true,
      }
    )
    const rejectedRequest = assert.rejects(pendingRequest, /cancelled during station stop/)
    await flushMicrotasks()

    context.requestService.cancelPendingRequests(
      context.station,
      'Request cancelled during station stop'
    )
    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.deepStrictEqual(bufferedStation.messageQueue, [serializedMessage])
    assert.strictEqual(context.station.requests.size, 1)

    sendCallback?.(new Error('late send failure'))
    sendCallback?.(new Error('duplicate late send failure'))
    await rejectedRequest

    assert.deepStrictEqual(bufferedStation.messageQueue, [serializedMessage])
    assert.strictEqual(context.station.requests.size, 1)
  })

  await it('force-buffers an acknowledged station-stop request exactly once before cancellation', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    context.station.isStopping = () => true
    let serializedMessage: string | undefined
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      serializedMessage = String(data)
      callback?.()
    })

    const pendingRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        bufferOnErrorDuringStationStop: true,
        responseTimeoutMs: 3_600_000,
        skipBufferingOnError: true,
        throwError: true,
      }
    )
    const rejectedRequest = assert.rejects(pendingRequest, /cancelled during station stop/)
    await flushMicrotasks()

    context.requestService.cancelPendingRequests(
      context.station,
      'Request cancelled during station stop',
      false,
      { bufferInFlightSends: true }
    )
    await rejectedRequest
    const bufferedStation = context.station as unknown as { messageQueue: string[] }

    assert.deepStrictEqual(bufferedStation.messageQueue, [serializedMessage])
    assert.strictEqual(context.station.requests.size, 1)
  })

  await it('does not buffer an acknowledged ordinary request during station stop', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    context.station.isStopping = () => true
    mock.method(wsConnection, 'send', (_data: unknown, callback?: (error?: Error) => void) => {
      callback?.()
    })

    const pendingRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, skipBufferingOnError: true, throwError: true }
    )
    const rejectedRequest = assert.rejects(pendingRequest, /cancelled during station stop/)
    await flushMicrotasks()

    context.requestService.cancelPendingRequests(
      context.station,
      'Request cancelled during station stop',
      false,
      { bufferInFlightSends: true }
    )
    await rejectedRequest
    const bufferedStation = context.station as unknown as { messageQueue: string[] }

    assert.deepStrictEqual(bufferedStation.messageQueue, [])
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('retracts an acknowledged force-buffered request during an unrelated flush', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    context.station.isStopping = () => true
    const wireMessages: string[] = []
    let initialSendCallback: ((error?: Error) => void) | undefined
    let bufferedSendCallback: ((error?: Error) => void) | undefined
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      if (wireMessages.length === 1) {
        initialSendCallback = callback
      } else if (wireMessages.length === 2) {
        bufferedSendCallback = callback
      } else {
        callback?.()
      }
    })
    const responseService = (
      context.requestService as unknown as {
        ocppResponseService: { responseHandler: () => Promise<undefined> }
      }
    ).ocppResponseService
    mock.method(responseService, 'responseHandler', () => Promise.resolve(undefined))

    const pendingRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        bufferOnErrorDuringStationStop: true,
        responseTimeoutMs: 3_600_000,
        skipBufferingOnError: true,
        throwError: true,
      }
    )
    const rejectedRequest = assert.rejects(pendingRequest, /cancelled during station stop/)
    await flushMicrotasks()
    const serializedRequest = wireMessages[0]
    const unrelatedMessage = '[2,"unrelated","Heartbeat",{}]'
    context.station.bufferMessage(unrelatedMessage)

    context.requestService.cancelPendingRequests(
      context.station,
      'Request cancelled during station stop'
    )
    await rejectedRequest
    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.deepStrictEqual(bufferedStation.messageQueue, [unrelatedMessage, serializedRequest])
    const cachedRequest = [...context.station.requests.values()][0]
    context.station.isStopping = () => false

    const sendMessageBuffer = (
      ChargingStation.prototype as unknown as {
        sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
      }
    ).sendMessageBuffer
    ;(
      context.station as unknown as { sendMessageBuffer: typeof sendMessageBuffer }
    ).sendMessageBuffer = sendMessageBuffer
    sendMessageBuffer.call(context.station, () => undefined)
    await flushMicrotasks()
    assert.deepStrictEqual(wireMessages, [serializedRequest, unrelatedMessage])

    cachedRequest[0]({ currentTime: new Date().toISOString() }, {})
    assert.deepStrictEqual(bufferedStation.messageQueue, [unrelatedMessage])
    assert.strictEqual(context.station.requests.size, 0)

    bufferedSendCallback?.()
    t.mock.timers.tick(60_000)
    await flushMicrotasks()

    assert.deepStrictEqual(bufferedStation.messageQueue, [])
    assert.deepStrictEqual(wireMessages, [serializedRequest, unrelatedMessage])
    initialSendCallback?.(new Error('late send failure'))
    cachedRequest[0]({ currentTime: new Date().toISOString() }, {})
    assert.deepStrictEqual(wireMessages, [serializedRequest, unrelatedMessage])
  })

  await it('retracts a force-buffered request when CALLERROR terminates it', async () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    context.station.isStopping = () => true
    mock.method(wsConnection, 'send', () => undefined)

    const pendingRequest = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      {
        bufferOnErrorDuringStationStop: true,
        responseTimeoutMs: 3_600_000,
        skipBufferingOnError: true,
        throwError: true,
      }
    )
    const rejectedRequest = assert.rejects(pendingRequest, /cancelled during station stop/)
    await flushMicrotasks()
    context.requestService.cancelPendingRequests(
      context.station,
      'Request cancelled during station stop'
    )
    await rejectedRequest
    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.strictEqual(bufferedStation.messageQueue.length, 1)
    const cachedRequest = [...context.station.requests.values()][0]

    cachedRequest[1](new OCPPError(ErrorType.GENERIC_ERROR, 'Terminal CALLERROR'))
    cachedRequest[1](new OCPPError(ErrorType.GENERIC_ERROR, 'Duplicate CALLERROR'))

    assert.deepStrictEqual(bufferedStation.messageQueue, [])
    assert.strictEqual(context.station.requests.size, 0)
  })

  await it('does not remove the next frame when an in-flight buffered frame is retracted', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    const targetMessage = '[2,"target","Heartbeat",{}]'
    const unrelatedMessage = '[2,"unrelated","Heartbeat",{}]'
    const wireMessages: string[] = []
    const sendCallbacks: ((error?: Error) => void)[] = []
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      if (callback != null) sendCallbacks.push(callback)
    })
    context.station.bufferMessage(targetMessage)
    context.station.bufferMessage(unrelatedMessage)
    const stationBuffer = context.station as unknown as {
      bufferedMessageInFlight?: { message: string; retracted: boolean }
      clearIntervalFlushMessageBuffer: () => void
      messageQueue: string[]
      sendMessageBuffer: (onComplete: () => void) => void
    }
    stationBuffer.clearIntervalFlushMessageBuffer = () => undefined
    const stationBufferMethods = ChargingStation.prototype as unknown as {
      removeBufferedMessage: (this: ChargingStation, message: string) => boolean
      sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
    }
    stationBuffer.sendMessageBuffer = stationBufferMethods.sendMessageBuffer
    stationBufferMethods.sendMessageBuffer.call(context.station, () => undefined)
    await flushMicrotasks()
    assert.deepStrictEqual(wireMessages, [targetMessage])
    assert.strictEqual(
      stationBufferMethods.removeBufferedMessage.call(context.station, targetMessage),
      true
    )
    assert.deepStrictEqual(stationBuffer.messageQueue, [unrelatedMessage])

    sendCallbacks.shift()?.()
    assert.deepStrictEqual(stationBuffer.messageQueue, [unrelatedMessage])
    t.mock.timers.tick(60_000)
    await flushMicrotasks()

    assert.deepStrictEqual(wireMessages, [targetMessage, unrelatedMessage])
    sendCallbacks.shift()?.()
    assert.deepStrictEqual(stationBuffer.messageQueue, [])
  })

  await it('releases the CALL gate when a buffered replay send callback times out', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.recordRequestStatistic = () => undefined
    context.station.emitChargingStationEvent = () => undefined
    const replayMessage = '[2,"replay-timeout","Heartbeat",{}]'
    const wireMessages: string[] = []
    let replaySendCallback: (error?: Error) => void = () => undefined
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      if (wireMessages.length === 1 && callback != null) replaySendCallback = callback
      else callback?.()
    })
    context.station.bufferMessage(replayMessage)
    const stationBuffer = context.station as unknown as {
      clearIntervalFlushMessageBuffer: () => void
      messageQueue: string[]
    }
    stationBuffer.clearIntervalFlushMessageBuffer = () => undefined
    const sendMessageBuffer = (
      ChargingStation.prototype as unknown as {
        sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
      }
    ).sendMessageBuffer
    sendMessageBuffer.call(context.station, () => undefined)
    await flushMicrotasks()
    assert.deepStrictEqual(wireMessages, [replayMessage])

    const live = context.requestService.requestHandler(
      context.station,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      { responseTimeoutMs: 3_600_000, throwError: true }
    )
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 1)

    t.mock.timers.tick(OCPPConstants.OCPP_WEBSOCKET_TIMEOUT_MS)
    await flushMicrotasks()
    assert.strictEqual(wireMessages.length, 2)
    assert.deepStrictEqual(stationBuffer.messageQueue, [replayMessage])

    const [, liveMessageId] = JSON.parse(wireMessages[1]) as [number, string]
    context.station.requests.get(liveMessageId)?.[0]({ currentTime: new Date() }, {})
    await live
    replaySendCallback()
    assert.deepStrictEqual(stationBuffer.messageQueue, [replayMessage])
    assert.strictEqual(wireMessages.length, 2)
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
    const transientErrorCallback = mock.fn()
    context.station.requests.set('transient', [
      () => undefined,
      transientErrorCallback,
      OCPP20RequestCommand.HEARTBEAT,
      {},
    ])
    context.station.bufferMessage('[2,"buffered","Heartbeat",{}]')

    context.requestService.cancelPendingRequests(context.station)

    assert.strictEqual(context.station.requests.has('buffered'), true)
    assert.strictEqual(bufferedStation.messageQueue.length, 1)
    assert.strictEqual(errorCallback.mock.callCount(), 0)
    assert.strictEqual(context.station.requests.has('transient'), false)
    assert.strictEqual(transientErrorCallback.mock.callCount(), 1)
  })

  await it('discards buffered frames when pending requests are cancelled', () => {
    const context = createOCPP20RequestTestContext()
    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    context.station.bufferMessage('[2,"buffered","Heartbeat",{}]')
    assert.strictEqual(bufferedStation.messageQueue.length, 1)

    context.requestService.cancelPendingRequests(context.station, undefined, true)

    assert.strictEqual(bufferedStation.messageQueue.length, 0)
  })

  await it('replays a response behind a blocked CALL while registration is pending', () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.isStopping = () => false
    context.station.inAcceptedState = () => false
    const wireMessages: string[] = []
    let sendCallback: ((error?: Error) => void) | undefined
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      sendCallback = callback
    })
    const blockedCall = '[2,"call","Heartbeat",{}]'
    const allowedResponse = '[3,"response",{}]'
    context.station.bufferMessage(blockedCall)
    context.station.bufferMessage(allowedResponse)
    const sendMessageBuffer = (
      ChargingStation.prototype as unknown as {
        sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
      }
    ).sendMessageBuffer
    ;(
      context.station as unknown as { sendMessageBuffer: typeof sendMessageBuffer }
    ).sendMessageBuffer = sendMessageBuffer

    sendMessageBuffer.call(context.station, () => undefined)
    assert.deepStrictEqual(wireMessages, [allowedResponse])
    sendCallback?.()
    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.deepStrictEqual(bufferedStation.messageQueue, [blockedCall])
  })

  await it('discards only a selected non-array frame behind a pending CALL', () => {
    const context = createOCPP20RequestTestContext()
    const wsConnection = context.station.wsConnection
    assert.ok(wsConnection != null)
    context.station.isStopping = () => false
    context.station.inAcceptedState = () => false
    const wireMessages: string[] = []
    let sendCallback: ((error?: Error) => void) | undefined
    mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
      wireMessages.push(String(data))
      sendCallback = callback
    })
    const blockedCall = '[2,"call","Heartbeat",{}]'
    const allowedResponse = '[3,"response",{}]'
    context.station.bufferMessage(blockedCall)
    context.station.bufferMessage('{}')
    context.station.bufferMessage(allowedResponse)
    const sendMessageBuffer = (
      ChargingStation.prototype as unknown as {
        sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
      }
    ).sendMessageBuffer
    ;(
      context.station as unknown as { sendMessageBuffer: typeof sendMessageBuffer }
    ).sendMessageBuffer = sendMessageBuffer

    sendMessageBuffer.call(context.station, () => undefined)
    assert.deepStrictEqual(wireMessages, [allowedResponse])
    sendCallback?.()
    const bufferedStation = context.station as unknown as { messageQueue: string[] }
    assert.deepStrictEqual(bufferedStation.messageQueue, [blockedCall])
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
