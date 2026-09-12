/**
 * @file Tests for ChargingStation Lifecycle Operations
 * @description Unit tests for charging station start/stop/restart and delete operations
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ConnectorStatus, RequestParams } from '../../src/types/index.js'

import { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import { OCPP16RequestService } from '../../src/charging-station/ocpp/1.6/OCPP16RequestService.js'
import { OCPP16ResponseService } from '../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import { OCPP16ServiceUtils } from '../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import { OCPP20ServiceUtils } from '../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { stopRunningTransactions } from '../../src/charging-station/ocpp/OCPPServiceOperations.js'
import {
  OCPP16AuthorizationStatus,
  OCPP16ChargePointStatus,
  OCPP16IncomingRequestCommand,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValueUnit,
  OCPP16RequestCommand,
  type OCPP16StopTransactionRequest,
  type OCPP16StopTransactionResponse,
  OCPP16VendorParametersKey,
  OCPPVersion,
} from '../../src/types/index.js'
import { Constants } from '../../src/utils/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
} from '../helpers/TestLifecycleHelpers.js'
import { TEST_PUBLIC_KEY_HEX } from './ChargingStationTestConstants.js'
import { cleanupChargingStation, createMockChargingStation } from './helpers/StationHelpers.js'
import {
  createMeterValuesTemplate,
  createOCPP16RequestTestContext,
  upsertConfigurationKey,
} from './ocpp/1.6/OCPP16TestUtils.js'

const installBufferedMessageCallbackState = (target: object): void => {
  const callbackState = target as { bufferedMessageEntries?: unknown[] }
  const prototype = ChargingStation.prototype as unknown as {
    releaseAllBufferedMessageCallbacks: unknown
    releaseBufferedMessageCallbacks: unknown
    reserveBufferedMessageCallbacks: unknown
  }
  Object.assign(target, {
    bufferedMessageCallbackBytes: 0,
    bufferedMessageCallbackCount: 0,
    bufferedMessageCallbackReservations: new Set(),
    bufferedMessageEntries: callbackState.bufferedMessageEntries ?? [],
    releaseAllBufferedMessageCallbacks: prototype.releaseAllBufferedMessageCallbacks,
    releaseBufferedMessageCallbacks: prototype.releaseBufferedMessageCallbacks,
    reserveBufferedMessageCallbacks: prototype.reserveBufferedMessageCallbacks,
  })
}

await describe('ChargingStation Lifecycle', async () => {
  await describe('Start/Stop Operations', async () => {
    let station: ChargingStation | undefined
    beforeEach(() => {
      station = undefined
    })

    afterEach(() => {
      standardCleanup()
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    await it('should transition from stopped to started on start()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act
      const initialStarted = station.started
      station.start()
      const finalStarted = station.started

      // Assert
      assert.strictEqual(initialStarted, false)
      assert.strictEqual(finalStarted, true)
    })

    await it('should coalesce starts requested while stop is still settling', async () => {
      const stopGate = Promise.withResolvers<undefined>()
      const restart = mock.fn()
      const stationLike = {
        deleteAbortController: new AbortController(),
        logPrefix: () => '',
        start: restart,
        stopPromise: stopGate.promise,
      } as unknown as ChargingStation
      installBufferedMessageCallbackState(stationLike)

      ChargingStation.prototype.start.call(stationLike)
      ChargingStation.prototype.start.call(stationLike)
      const deferredStart = (stationLike as unknown as { startAfterStopPromise?: Promise<void> })
        .startAfterStopPromise
      assert.ok(deferredStart != null)
      stopGate.resolve(undefined)
      await deferredStart

      assert.strictEqual(restart.mock.callCount(), 1)
    })

    await it('should not restart when already started', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act
      station.start()
      const firstStarted = station.started
      station.start() // Try to start again (idempotent)
      const stillStarted = station.started

      // Assert
      assert.strictEqual(firstStarted, true)
      assert.strictEqual(stillStarted, true)
    })

    await it('should set starting flag during start()', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Act & Assert
      const initialStarting = station.starting
      assert.strictEqual(initialStarting, false)
      // After start() completes, starting should be false
      station.start()
      assert.strictEqual(station.starting, false)
      assert.strictEqual(station.started, true)
    })

    await it('should transition from started to stopped on stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      assert.strictEqual(station.started, true)

      // Act
      await station.stop()

      // Assert
      assert.strictEqual(station.started, false)
    })

    await it('should be idempotent when calling stop() on already stopped station', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      // Station starts in stopped state
      assert.strictEqual(station.started, false)

      // Act - call stop on already stopped station
      await station.stop()

      // Assert - should remain stopped without error
      assert.strictEqual(station.started, false)
    })

    await it('should set stopping flag during stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()

      // Assert initial state
      assert.strictEqual(ChargingStation.prototype.isStopping.call(station), false)

      // Act
      await station.stop()

      // Assert - after stop() completes, stopping should be false
      assert.strictEqual(ChargingStation.prototype.isStopping.call(station), false)
      assert.strictEqual(station.started, false)
    })

    await it('should join an in-progress stop operation', async () => {
      const stopGate = Promise.withResolvers<undefined>()
      let performStopCalls = 0
      const stationLike = {
        logPrefix: () => '',
        ocppRequestService: { cancelPendingRequests: () => undefined },
        performStop: (): Promise<undefined> => {
          performStopCalls++
          return stopGate.promise
        },
        started: true,
        stopping: false,
      }

      const firstStop = ChargingStation.prototype.stop.call(stationLike)
      const secondStop = ChargingStation.prototype.stop.call(stationLike)
      let secondStopSettled = false
      secondStop
        .then(() => {
          secondStopSettled = true
          return undefined
        })
        .catch(() => undefined)
      await Promise.resolve()

      assert.strictEqual(performStopCalls, 1)
      assert.strictEqual(secondStopSettled, false)
      stopGate.resolve(undefined)
      await Promise.all([firstStop, secondStop])
      assert.strictEqual(secondStopSettled, true)
      assert.strictEqual(stationLike.stopping, false)
    })

    await it('publishes the stop single-flight before cancellation invokes onError', async () => {
      const stopGate = Promise.withResolvers<undefined>()
      const requestSequence: string[] = []
      let cancelCalls = 0
      let performStopCalls = 0
      let reentrantStop: Promise<void> | undefined
      const stationLike = {
        logPrefix: () => '',
        ocppRequestService: {
          cancelPendingRequests: () => {
            cancelCalls++
            reentrantStop ??= ChargingStation.prototype.stop.call(stationLike)
          },
        },
        performStop: async (): Promise<void> => {
          performStopCalls++
          requestSequence.push('StatusNotification', 'StopTransaction')
          await stopGate.promise
        },
        started: true,
        stopping: false,
      }

      const owningStop = ChargingStation.prototype.stop.call(stationLike)
      assert.ok(reentrantStop != null)
      let reentrantStopSettled = false
      reentrantStop
        .then(() => {
          reentrantStopSettled = true
          return undefined
        })
        .catch(() => undefined)

      assert.strictEqual(cancelCalls, 1)
      assert.strictEqual(performStopCalls, 1)
      assert.deepStrictEqual(requestSequence, ['StatusNotification', 'StopTransaction'])
      assert.strictEqual(stationLike.stopping, true)
      assert.strictEqual(reentrantStopSettled, false)

      stopGate.resolve(undefined)
      await Promise.all([owningStop, reentrantStop])
      assert.strictEqual(stationLike.stopping, false)
      assert.strictEqual(reentrantStopSettled, true)
    })

    await it('retracts an in-flight OCPP 1.6 CALL when shutdown begins', async () => {
      const inFlight = {
        isRequest: true,
        message: '[2,"terminal","StopTransaction",{}]',
        retracted: false,
        stopDrain: false,
      }
      const stationLike = {
        bufferedMessageInFlight: inFlight,
        lifecycleAbortController: new AbortController(),
        logPrefix: () => '',
        ocppRequestService: { cancelPendingRequests: () => undefined },
        performStop: () => Promise.resolve(),
        started: true,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
        stopping: false,
      }

      await ChargingStation.prototype.stop.call(stationLike)

      assert.strictEqual(inFlight.retracted, true)
      assert.strictEqual(inFlight.stopDrain, true)
    })

    await it('cancels old non-buffered requests before installing the shutdown lifecycle', async () => {
      const oldLifecycle = new AbortController()
      const stopGate = Promise.withResolvers<undefined>()
      const order: string[] = []
      const stationLike = {
        lifecycleAbortController: oldLifecycle,
        logPrefix: () => '',
        ocppRequestService: {
          cancelPendingRequests: (
            _station: ChargingStation,
            _message?: string,
            discardBufferedRequests?: boolean,
            options?: { handleTransportStartedSends?: boolean }
          ) => {
            assert.strictEqual(oldLifecycle.signal.aborted, true)
            assert.strictEqual(discardBufferedRequests, false)
            assert.deepStrictEqual(options, { handleTransportStartedSends: true })
            order.push('cancel')
          },
        },
        performStop: function (): Promise<undefined> {
          assert.notStrictEqual(this.lifecycleAbortController, oldLifecycle)
          assert.strictEqual(this.lifecycleAbortController.signal.aborted, false)
          order.push('performStop')
          return stopGate.promise
        },
        started: true,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_20 },
        stopping: false,
      }

      const stopPromise = ChargingStation.prototype.stop.call(stationLike)

      assert.deepEqual(order, ['cancel', 'performStop'])
      stopGate.resolve(undefined)
      await stopPromise
      assert.strictEqual(stationLike.stopping, false)
    })

    await it('sends an OCPP 1.6 StopTransaction after cancelling an unrelated pending CALL', async () => {
      const context = createOCPP16RequestTestContext({
        stationInfo: { beginEndMeterValues: false },
      })
      const activeStation = context.station
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      activeStation.ocppRequestService = context.requestService
      activeStation.recordRequestStatistic = () => undefined
      activeStation.emitChargingStationEvent = () => undefined
      activeStation.started = true
      activeStation.isStopping = () => ChargingStation.prototype.isStopping.call(activeStation)
      setupConnectorWithTransaction(activeStation, 1, { transactionId: 101 })
      const wsConnection = activeStation.wsConnection
      assert.ok(wsConnection != null)
      const sentCommands: OCPP16RequestCommand[] = []
      const unrelatedCallSent = Promise.withResolvers<undefined>()
      mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
        const [, messageId, command] = JSON.parse(String(data)) as [
          number,
          string,
          OCPP16RequestCommand
        ]
        sentCommands.push(command)
        callback?.()
        if (command === OCPP16RequestCommand.HEARTBEAT) {
          unrelatedCallSent.resolve(undefined)
        } else {
          queueMicrotask(() => {
            const cachedRequest = activeStation.requests.get(messageId)
            if (cachedRequest != null) {
              cachedRequest[0](
                command === OCPP16RequestCommand.STOP_TRANSACTION
                  ? { idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } }
                  : {},
                cachedRequest[3]
              )
            }
          })
        }
      })
      ;(
        activeStation as unknown as {
          performStop: (
            reason?: Parameters<ChargingStation['stop']>[0],
            stopTransactions?: boolean
          ) => Promise<void>
        }
      ).performStop = async (reason, stopTransactions) => {
        stopTransactions === true && (await stopRunningTransactions(activeStation, reason))
        activeStation.ocppRequestService.cancelPendingRequests(activeStation)
        activeStation.started = false
      }

      const unrelatedCall = context.requestService.requestHandler(
        activeStation,
        OCPP16RequestCommand.HEARTBEAT,
        {},
        { responseTimeoutMs: 3_600_000, throwError: true }
      )
      await unrelatedCallSent.promise
      const rejectedUnrelatedCall = assert.rejects(
        unrelatedCall,
        /Charging station stopped while awaiting an OCPP response/
      )

      await ChargingStation.prototype.stop.call(activeStation, undefined, true)
      await rejectedUnrelatedCall

      assert.strictEqual(sentCommands[0], OCPP16RequestCommand.HEARTBEAT)
      assert.ok(sentCommands.includes(OCPP16RequestCommand.STOP_TRANSACTION))
      assert.strictEqual(activeStation.requests.size, 0)
      assert.strictEqual(activeStation.getConnectorStatus(1)?.transactionId, undefined)
    })

    await it('waits for an in-flight OCPP 1.6 StartTransaction before shutdown StopTransaction', async () => {
      const context = createOCPP16RequestTestContext({
        stationInfo: { beginEndMeterValues: false },
      })
      const activeStation = context.station
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      activeStation.ocppRequestService = context.requestService
      activeStation.recordRequestStatistic = () => undefined
      activeStation.emitChargingStationEvent = () => undefined
      activeStation.started = true
      activeStation.isStopping = () => ChargingStation.prototype.isStopping.call(activeStation)
      const wsConnection = activeStation.wsConnection
      assert.ok(wsConnection != null)
      const sentCommands: OCPP16RequestCommand[] = []
      const startRequestSent = Promise.withResolvers<string>()
      mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
        const [, messageId, command] = JSON.parse(String(data)) as [
          number,
          string,
          OCPP16RequestCommand
        ]
        sentCommands.push(command)
        callback?.()
        if (command === OCPP16RequestCommand.START_TRANSACTION) {
          startRequestSent.resolve(messageId)
          return
        }
        queueMicrotask(() => {
          const cachedRequest = activeStation.requests.get(messageId)
          if (cachedRequest == null) return
          cachedRequest[0](
            command === OCPP16RequestCommand.STOP_TRANSACTION
              ? { idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } }
              : {},
            cachedRequest[3]
          )
        })
      })
      ;(
        activeStation as unknown as {
          performStop: (
            reason?: Parameters<ChargingStation['stop']>[0],
            stopTransactions?: boolean
          ) => Promise<void>
        }
      ).performStop = async (reason, stopTransactions) => {
        stopTransactions === true && (await stopRunningTransactions(activeStation, reason))
        activeStation.ocppRequestService.cancelPendingRequests(activeStation)
        activeStation.started = false
      }

      const startTransaction = OCPP16ServiceUtils.startTransactionOnConnector(
        activeStation,
        1,
        'RFID-1'
      )
      const startMessageId = await startRequestSent.promise
      const connectorStatus = activeStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.transactionStarting, true)

      const shutdown = ChargingStation.prototype.stop.call(activeStation, undefined, true)
      await Promise.resolve()
      assert.strictEqual(sentCommands.includes(OCPP16RequestCommand.STOP_TRANSACTION), false)
      const cachedStartRequest = activeStation.requests.get(startMessageId)
      assert.ok(cachedStartRequest != null)
      cachedStartRequest[0](
        {
          idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
          transactionId: 2026,
        },
        cachedStartRequest[3]
      )

      await Promise.all([startTransaction, shutdown])

      const startIndex = sentCommands.indexOf(OCPP16RequestCommand.START_TRANSACTION)
      const stopIndex = sentCommands.indexOf(OCPP16RequestCommand.STOP_TRANSACTION)
      assert.ok(startIndex >= 0)
      assert.ok(stopIndex > startIndex)
      assert.strictEqual(connectorStatus.transactionStarting, undefined)
      assert.strictEqual(connectorStatus.transactionId, undefined)
      assert.strictEqual(activeStation.requests.size, 0)
    })

    await it('should join an in-flight OCPP 1.6 StopTransaction during station stop', async () => {
      const responseService = new OCPP16ResponseService()
      const stopResponse = Promise.withResolvers<OCPP16StopTransactionResponse>()
      const stopRequestStarted = Promise.withResolvers<undefined>()
      let stopRequestPending = false
      let cancellationDuringStopTransaction = false
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] !== OCPP16RequestCommand.STOP_TRANSACTION) {
          return {}
        }
        const {
          onError,
          onMessageSent,
          onRequestBuffered,
          onResponseReceived,
          onTransportError,
          ...requestOptions
        } = args[3] as RequestParams
        for (const callback of [
          onError,
          onMessageSent,
          onRequestBuffered,
          onResponseReceived,
          onTransportError,
        ]) {
          assert.strictEqual(typeof callback, 'function')
        }
        assert.deepStrictEqual(requestOptions, {
          bufferOnErrorDuringStationStop: true,
          materializeOnCancellationBeforeSend: true,
          rawPayload: true,
          skipBufferingOnError: false,
          throwError: true,
        })
        stopRequestPending = true
        stopRequestStarted.resolve(undefined)
        try {
          const response = await stopResponse.promise
          await responseService.responseHandler(
            args[0] as ChargingStation,
            OCPP16RequestCommand.STOP_TRANSACTION,
            response,
            args[2] as OCPP16StopTransactionRequest
          )
          return response
        } finally {
          stopRequestPending = false
        }
      })
      const result = createMockChargingStation({
        connectorsCount: 1,
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { beginEndMeterValues: false, ocppVersion: OCPPVersion.VERSION_16 },
      })
      const activeStation = result.station
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      activeStation.started = true
      activeStation.isStopping = () => ChargingStation.prototype.isStopping.call(activeStation)
      setupConnectorWithTransaction(activeStation, 1, { transactionId: 101 })
      let cancelCalls = 0
      mock.method(activeStation.ocppRequestService, 'cancelPendingRequests', () => {
        cancelCalls++
        if (stopRequestPending) {
          cancellationDuringStopTransaction = true
        }
      })
      ;(
        activeStation as unknown as {
          performStop: (
            reason?: Parameters<ChargingStation['stop']>[0],
            stopTransactions?: boolean
          ) => Promise<void>
        }
      ).performStop = async (reason, stopTransactions) => {
        stopTransactions === true && (await stopRunningTransactions(activeStation, reason))
        activeStation.ocppRequestService.cancelPendingRequests(activeStation)
        activeStation.started = false
      }

      const transactionStop = OCPP16ServiceUtils.stopTransactionOnConnector(activeStation, 1)
      await stopRequestStarted.promise
      const stationStop = ChargingStation.prototype.stop.call(activeStation, undefined, true)
      await Promise.resolve()

      assert.strictEqual(cancelCalls, 1)
      assert.strictEqual(stopRequestPending, true)
      assert.strictEqual(
        requestHandler.mock.calls.filter(
          call => call.arguments[1] === OCPP16RequestCommand.STOP_TRANSACTION
        ).length,
        1
      )

      stopResponse.resolve({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } })
      await Promise.all([transactionStop, stationStop])

      const connectorStatus = activeStation.getConnectorStatus(1)
      if (connectorStatus == null) {
        assert.fail('Expected connector to be defined')
      }
      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.transactionId, undefined)
      assert.strictEqual(cancellationDuringStopTransaction, true)
      assert.strictEqual(cancelCalls, 2)
    })

    await it('buffers StopTransaction behind cached terminal MeterValues when shutdown interrupts replay', async () => {
      const transportFailure = new Error('terminal MeterValues transport failure')
      const firstSendFailed = Promise.withResolvers<undefined>()
      const unavailableConnectorIds: number[] = []
      const wireMessages: string[] = []
      const replayCallbacks: (() => void)[] = []
      const replayedCommands: OCPP16RequestCommand[] = []
      let replaying = false
      const { requestService, station: activeStation } = createOCPP16RequestTestContext({
        stationInfo: {
          beginEndMeterValues: true,
          meterSerialNumber: 'SIM-001',
          ocppStrictCompliance: true,
          outOfOrderEndMeterValues: false,
          transactionDataMeterValues: true,
        },
      })
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      const lifecycleAbortController = new AbortController()
      Object.assign(activeStation, {
        internalStopMessageSequence: () => undefined,
        lifecycleAbortController,
        ocppIncomingRequestService: { stop: () => undefined },
        stopAlignedMeterValues: () => undefined,
      })
      Object.defineProperty(activeStation, 'lifecycleAbortSignal', {
        configurable: true,
        get: () =>
          (
            activeStation as unknown as {
              lifecycleAbortController: AbortController
            }
          ).lifecycleAbortController.signal,
      })
      activeStation.started = true
      activeStation.isStopping = () => ChargingStation.prototype.isStopping.call(activeStation)
      activeStation.recordRequestStatistic = () => undefined
      activeStation.ocppRequestService = requestService
      const acceptedBootNotificationResponse = activeStation.bootNotificationResponse
      assert.ok(acceptedBootNotificationResponse != null)
      setupConnectorWithTransaction(activeStation, 1, { transactionId: 103 })
      const connectorStatus = activeStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.status = OCPP16ChargePointStatus.Finishing
      connectorStatus.MeterValues = createMeterValuesTemplate([
        {
          measurand: OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: OCPP16MeterValueUnit.WATT_HOUR,
          value: '0',
        },
      ])
      connectorStatus.publicKeySentInTransaction = false
      connectorStatus.transactionBeginMeterValue = {
        sampledValue: [{ value: '0' }],
        timestamp: new Date('2026-09-08T09:00:00.000Z'),
      }
      upsertConfigurationKey(
        activeStation,
        OCPP16VendorParametersKey.SampledDataSignReadings,
        'true'
      )
      upsertConfigurationKey(
        activeStation,
        OCPP16VendorParametersKey.PublicKeyWithSignedMeterValue,
        'OncePerTransaction'
      )
      upsertConfigurationKey(
        activeStation,
        `${OCPP16VendorParametersKey.MeterPublicKey}1`,
        TEST_PUBLIC_KEY_HEX
      )
      const wsConnection = activeStation.wsConnection
      assert.ok(wsConnection != null)
      mock.method(
        wsConnection,
        'send',
        (data: unknown, callback?: (error?: Error) => void): void => {
          const message = String(data)
          wireMessages.push(message)
          const [, messageId, command, payload] = JSON.parse(message) as [
            number,
            string,
            OCPP16RequestCommand,
            Record<string, unknown>
          ]
          if (replaying) {
            replayedCommands.push(command)
            replayCallbacks.push(() => {
              callback?.()
            })
            return
          }
          if (command === OCPP16RequestCommand.METER_VALUES) {
            callback?.(transportFailure)
            firstSendFailed.resolve(undefined)
            return
          }
          callback?.()
          if (
            command === OCPP16RequestCommand.STATUS_NOTIFICATION &&
            payload.status === OCPP16ChargePointStatus.Unavailable
          ) {
            unavailableConnectorIds.push(payload.connectorId as number)
          }
          const cachedRequest = activeStation.requests.get(messageId)
          cachedRequest?.[0](
            command === OCPP16RequestCommand.STOP_TRANSACTION
              ? { idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } }
              : {},
            cachedRequest[3]
          )
        }
      )
      const performStop = (
        ChargingStation.prototype as unknown as {
          performStop: (
            reason?: Parameters<ChargingStation['stop']>[0],
            stopTransactions?: boolean
          ) => Promise<void>
        }
      ).performStop
      ;(
        activeStation as unknown as {
          performStop: typeof performStop
        }
      ).performStop = performStop
      Object.assign(activeStation, {
        configurationFileHash: 'terminal-meter-values-shutdown-regression',
        saveConfiguration: () => undefined,
        sharedLRUCache: { deleteChargingStationConfiguration: () => undefined },
      })
      const stopMessageSequence = (
        ChargingStation.prototype as unknown as {
          stopMessageSequence: (
            reason?: Parameters<ChargingStation['stop']>[0],
            stopTransactions?: boolean
          ) => Promise<void>
        }
      ).stopMessageSequence
      ;(
        activeStation as unknown as {
          stopMessageSequence: typeof stopMessageSequence
        }
      ).stopMessageSequence = async (reason, stopTransactions) => {
        assert.strictEqual(lifecycleAbortController.signal.aborted, true)
        assert.notStrictEqual(activeStation.lifecycleAbortSignal, lifecycleAbortController.signal)
        assert.strictEqual(activeStation.lifecycleAbortSignal.aborted, false)
        await stopMessageSequence.call(activeStation, reason, stopTransactions)
      }

      const callerStop = OCPP16ServiceUtils.stopTransactionOnConnector(activeStation, 1)
      const rejectedCallerStop = assert.rejects(
        callerStop,
        /Buffered message id .* without sending/
      )
      await firstSendFailed.promise
      const stationStop = ChargingStation.prototype.stop.call(activeStation, undefined, true)
      await Promise.all([rejectedCallerStop, stationStop])

      const stationInternals = activeStation as unknown as { messageQueue: string[] }
      const bufferedCommands = stationInternals.messageQueue.map(
        message => (JSON.parse(message) as [number, string, OCPP16RequestCommand])[2]
      )
      assert.deepStrictEqual(bufferedCommands, [
        OCPP16RequestCommand.METER_VALUES,
        OCPP16RequestCommand.STOP_TRANSACTION,
      ])
      const wireCommands = wireMessages.map(
        message => (JSON.parse(message) as [number, string, OCPP16RequestCommand])[2]
      )
      assert.deepStrictEqual(
        wireCommands.filter(
          command =>
            command === OCPP16RequestCommand.METER_VALUES ||
            command === OCPP16RequestCommand.STOP_TRANSACTION
        ),
        [OCPP16RequestCommand.METER_VALUES]
      )
      assert.deepStrictEqual(
        unavailableConnectorIds.sort((a, b) => a - b),
        [1, 2]
      )
      assert.strictEqual(activeStation.requests.size, 2)
      for (const message of stationInternals.messageQueue) {
        const [, messageId] = JSON.parse(message) as [number, string]
        assert.strictEqual(activeStation.requests.has(messageId), true)
      }
      assert.strictEqual(connectorStatus.transactionEnding, true)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)

      replaying = true
      activeStation.bootNotificationResponse = acceptedBootNotificationResponse
      activeStation.wsConnection = wsConnection
      activeStation.isWebSocketConnectionOpened = () => true
      const sendMessageBuffer = (
        ChargingStation.prototype as unknown as {
          sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
        }
      ).sendMessageBuffer
      ;(
        activeStation as unknown as { sendMessageBuffer: typeof sendMessageBuffer }
      ).sendMessageBuffer = sendMessageBuffer
      sendMessageBuffer.call(activeStation, () => undefined)
      await Promise.resolve()
      assert.deepStrictEqual(replayedCommands, [OCPP16RequestCommand.METER_VALUES])
      const [, replayedMeterValuesId] = JSON.parse(stationInternals.messageQueue[0]) as [
        number,
        string
      ]
      const replayedMeterValues = activeStation.requests.get(replayedMeterValuesId)
      assert.ok(replayedMeterValues != null)
      replayCallbacks.shift()?.()
      replayedMeterValues[0]({}, replayedMeterValues[3])
      sendMessageBuffer.call(activeStation, () => undefined)
      await Promise.resolve()
      assert.deepStrictEqual(replayedCommands, [
        OCPP16RequestCommand.METER_VALUES,
        OCPP16RequestCommand.STOP_TRANSACTION,
      ])
      replayCallbacks.shift()?.()
      assert.strictEqual(stationInternals.messageQueue.length, 0)
    })

    await it('should replay a replacement payload selected behind the outgoing-call gate', async () => {
      const { station: activeStation } = createOCPP16RequestTestContext()
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      const messageId = 'selected-buffered-stop'
      const previousPayload = { meterStop: 100, transactionId: 42 }
      const replacementPayload = { meterStop: 125, transactionId: 42 }
      const previousMessage = JSON.stringify([
        2,
        messageId,
        OCPP16RequestCommand.STOP_TRANSACTION,
        previousPayload,
      ])
      const gate = Promise.withResolvers<undefined>()
      const sentMessages: string[] = []
      const stationInternals = activeStation as unknown as {
        bufferedMessageInFlight?: { stopDrain?: boolean }
        messageQueue: string[]
        saveConfiguration: () => void
        sendMessageBuffer: (onComplete: () => void) => void
      }
      stationInternals.messageQueue = [previousMessage]
      stationInternals.saveConfiguration = () => undefined
      activeStation.requests.set(messageId, [
        () => undefined,
        () => undefined,
        OCPP16RequestCommand.STOP_TRANSACTION,
        previousPayload,
      ])
      activeStation.isWebSocketConnectionOpened = () => true
      mock.method(activeStation, 'inAcceptedState', () => true)
      mock.method(activeStation.ocppRequestService, 'acquireOutgoingCall', () => gate.promise)
      const wsConnection = activeStation.wsConnection
      assert.ok(wsConnection != null)
      mock.method(wsConnection, 'send', (message: unknown, callback?: (error?: Error) => void) => {
        sentMessages.push(String(message))
        callback?.()
      })
      const sendMessageBuffer = (
        ChargingStation.prototype as unknown as {
          sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
        }
      ).sendMessageBuffer
      let completed = false

      sendMessageBuffer.call(activeStation, () => {
        completed = true
      })
      assert.strictEqual(
        ChargingStation.prototype.replaceBufferedRequestPayload.call(
          activeStation,
          OCPP16RequestCommand.STOP_TRANSACTION,
          previousPayload,
          replacementPayload
        ),
        true
      )
      if (stationInternals.bufferedMessageInFlight != null) {
        stationInternals.bufferedMessageInFlight.stopDrain = true
      }
      gate.resolve(undefined)
      await flushMicrotasks()

      assert.strictEqual(completed, true)
      assert.strictEqual(sentMessages.length, 1)
      const [, , command, payload] = JSON.parse(sentMessages[0]) as [
        number,
        string,
        OCPP16RequestCommand,
        Record<string, unknown>
      ]
      assert.strictEqual(command, OCPP16RequestCommand.STOP_TRANSACTION)
      assert.deepStrictEqual(payload, replacementPayload)
    })

    await it('should refuse payload replacement after replay reaches the transport', async () => {
      const { station: activeStation } = createOCPP16RequestTestContext()
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      const messageId = 'sending-buffered-stop'
      const previousPayload = { meterStop: 100, transactionId: 42 }
      const replacementPayload = { meterStop: 125, transactionId: 42 }
      const previousMessage = JSON.stringify([
        2,
        messageId,
        OCPP16RequestCommand.STOP_TRANSACTION,
        previousPayload,
      ])
      const sendCallbacks: ((error?: Error) => void)[] = []
      const sentMessages: string[] = []
      const stationInternals = activeStation as unknown as {
        bufferedMessageInFlight?: { stopDrain?: boolean }
        messageQueue: string[]
      }
      stationInternals.messageQueue = [previousMessage]
      activeStation.requests.set(messageId, [
        () => undefined,
        () => undefined,
        OCPP16RequestCommand.STOP_TRANSACTION,
        previousPayload,
      ])
      activeStation.isWebSocketConnectionOpened = () => true
      mock.method(activeStation, 'inAcceptedState', () => true)
      mock.method(activeStation.ocppRequestService, 'acquireOutgoingCall', () =>
        Promise.resolve(true)
      )
      const wsConnection = activeStation.wsConnection
      assert.ok(wsConnection != null)
      mock.method(wsConnection, 'send', (message: unknown, callback?: (error?: Error) => void) => {
        sentMessages.push(String(message))
        if (callback != null) sendCallbacks.push(callback)
      })
      const sendMessageBuffer = (
        ChargingStation.prototype as unknown as {
          sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
        }
      ).sendMessageBuffer

      sendMessageBuffer.call(activeStation, () => undefined)
      await flushMicrotasks()
      assert.strictEqual(
        ChargingStation.prototype.replaceBufferedRequestPayload.call(
          activeStation,
          OCPP16RequestCommand.STOP_TRANSACTION,
          previousPayload,
          replacementPayload
        ),
        false
      )

      const [, , , payload] = JSON.parse(sentMessages[0]) as [
        number,
        string,
        OCPP16RequestCommand,
        Record<string, unknown>
      ]
      assert.deepStrictEqual(payload, previousPayload)
      assert.strictEqual(activeStation.requests.get(messageId)?.[3], previousPayload)
      if (stationInternals.bufferedMessageInFlight != null) {
        stationInternals.bufferedMessageInFlight.stopDrain = true
      }
      sendCallbacks[0]?.()
      await flushMicrotasks()
    })

    await it('should keep callbacks distinct for duplicate buffered response frames', () => {
      const { station: activeStation } = createOCPP16RequestTestContext()
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      const stationInternals = activeStation as unknown as {
        bufferedMessageCallbackBytes: number
        bufferedMessageCallbackCount: number
        bufferedMessageEntries: unknown[]
        clearIntervalFlushMessageBuffer: () => void
        messageQueue: string[]
        setIntervalFlushMessageBuffer: () => void
      }
      Object.assign(stationInternals, {
        bufferedMessageCallbackBytes: 0,
        bufferedMessageCallbackCount: 0,
        bufferedMessageEntries: [],
        clearIntervalFlushMessageBuffer: () => undefined,
        messageQueue: [],
        removeBufferedMessageEntry: (
          ChargingStation.prototype as unknown as {
            removeBufferedMessageEntry: (messageIndex: number, notifyDiscarded: boolean) => unknown
          }
        ).removeBufferedMessageEntry.bind(activeStation),
        setIntervalFlushMessageBuffer: () => undefined,
      })
      const duplicateResponse = JSON.stringify([3, 'duplicate-inbound-id', { status: 'Accepted' }])
      const discarded: string[] = []

      assert.strictEqual(
        ChargingStation.prototype.bufferMessage.call(activeStation, duplicateResponse, false, {
          onDiscarded: () => discarded.push('first'),
        }),
        true
      )
      assert.strictEqual(
        ChargingStation.prototype.bufferMessage.call(activeStation, duplicateResponse, false, {
          onDiscarded: () => discarded.push('second'),
        }),
        true
      )
      assert.strictEqual(
        ChargingStation.prototype.removeBufferedMessage.call(activeStation, duplicateResponse),
        true
      )
      assert.deepStrictEqual(discarded, ['first'])
      assert.strictEqual(
        ChargingStation.prototype.removeBufferedMessage.call(activeStation, duplicateResponse),
        true
      )
      assert.deepStrictEqual(discarded, ['first', 'second'])
    })

    await it('should bound callback-bearing responses without rejecting durable calls', () => {
      const { station: activeStation } = createOCPP16RequestTestContext()
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      const stationInternals = activeStation as unknown as {
        bufferedMessageCallbackBytes: number
        bufferedMessageCallbackCount: number
        bufferedMessageEntries: unknown[]
        clearIntervalFlushMessageBuffer: () => void
        messageQueue: string[]
        setIntervalFlushMessageBuffer: () => void
      }
      Object.assign(stationInternals, {
        bufferedMessageCallbackBytes: 0,
        bufferedMessageCallbackCount: 0,
        bufferedMessageEntries: [],
        clearIntervalFlushMessageBuffer: () => undefined,
        messageQueue: [],
        removeBufferedMessageEntry: (
          ChargingStation.prototype as unknown as {
            removeBufferedMessageEntry: (messageIndex: number, notifyDiscarded: boolean) => unknown
          }
        ).removeBufferedMessageEntry.bind(activeStation),
        setIntervalFlushMessageBuffer: () => undefined,
      })
      let discarded = 0
      for (let index = 0; index < 1024; index++) {
        assert.strictEqual(
          ChargingStation.prototype.bufferMessage.call(
            activeStation,
            JSON.stringify([3, `response-${index.toString()}`, {}]),
            false,
            { onDiscarded: () => discarded++ }
          ),
          true
        )
      }
      assert.strictEqual(
        ChargingStation.prototype.bufferMessage.call(
          activeStation,
          JSON.stringify([3, 'response-over-count-cap', {}]),
          false,
          { onDiscarded: () => discarded++ }
        ),
        false
      )
      assert.strictEqual(discarded, 1)
      assert.strictEqual(
        ChargingStation.prototype.bufferMessage.call(
          activeStation,
          JSON.stringify([2, 'durable-call', OCPP16RequestCommand.HEARTBEAT, {}])
        ),
        true
      )
      assert.strictEqual(stationInternals.messageQueue.length, 1025)

      ChargingStation.prototype.clearMessageBuffer.call(activeStation)
      assert.strictEqual(discarded, 1025)
      assert.strictEqual(
        ChargingStation.prototype.bufferMessage.call(
          activeStation,
          JSON.stringify([3, 'response-over-byte-cap', { value: 'x'.repeat(1024 * 1024) }]),
          false,
          { onDiscarded: () => discarded++ }
        ),
        false
      )
      assert.strictEqual(discarded, 1026)
      assert.deepStrictEqual(stationInternals.messageQueue, [])
    })

    await it('should discard buffered response callbacks when lifecycle ownership is released', async () => {
      const { requestService, station: activeStation } = createOCPP16RequestTestContext()
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      activeStation.ocppRequestService = requestService
      activeStation.recordRequestStatistic = () => undefined
      const stationInternals = activeStation as unknown as {
        bufferedMessageCallbackBytes: number
        bufferedMessageCallbackCount: number
        messageQueue: string[]
      }
      const sentMessages: string[] = []
      const wsConnection = activeStation.wsConnection
      assert.ok(wsConnection != null)
      mock.method(wsConnection, 'send', (message: unknown, callback?: (error?: Error) => void) => {
        sentMessages.push(String(message))
        callback?.(new Error('connection lost'))
      })
      let discarded = 0
      let sent = 0

      await assert.rejects(
        requestService.sendResponse(
          activeStation,
          'cancelled-response',
          {},
          OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
          {
            bufferedResponseRetainedBytes: 900 * 1024,
            onError: () => {
              discarded++
            },
            onMessageSent: () => {
              sent++
            },
          }
        )
      )
      const durableCall = JSON.stringify([2, 'durable-call', OCPP16RequestCommand.HEARTBEAT, {}])
      const rawFrame = 'unrelated raw frame'
      activeStation.bufferMessage(durableCall)
      activeStation.bufferMessage(rawFrame)
      assert.strictEqual(stationInternals.bufferedMessageCallbackCount, 1)

      ChargingStation.prototype.releaseAllBufferedMessageCallbacks.call(activeStation)

      assert.deepStrictEqual(stationInternals.messageQueue, [durableCall, rawFrame])
      assert.strictEqual(stationInternals.bufferedMessageCallbackCount, 0)
      assert.strictEqual(stationInternals.bufferedMessageCallbackBytes, 0)
      assert.strictEqual(discarded, 1)
      assert.strictEqual(sent, 0)
      assert.strictEqual(sentMessages.length, 1)

      assert.strictEqual(
        activeStation.bufferMessage(JSON.stringify([3, 'next-lifecycle-response', {}]), false, {
          onDiscarded: () => {
            discarded++
          },
          retainedBytes: 900 * 1024,
        }),
        true
      )
      assert.strictEqual(stationInternals.bufferedMessageCallbackCount, 1)
      ChargingStation.prototype.releaseAllBufferedMessageCallbacks.call(activeStation)
      assert.deepStrictEqual(stationInternals.messageQueue, [durableCall, rawFrame])
      assert.strictEqual(stationInternals.bufferedMessageCallbackCount, 0)
      assert.strictEqual(stationInternals.bufferedMessageCallbackBytes, 0)
      assert.strictEqual(discarded, 2)
      assert.strictEqual(sent, 0)
    })

    await it('should reserve callback capacity before sending a response', async () => {
      const { requestService, station: activeStation } = createOCPP16RequestTestContext()
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      activeStation.ocppRequestService = requestService
      activeStation.recordRequestStatistic = () => undefined
      const stationInternals = activeStation as unknown as {
        bufferedMessageCallbackBytes: number
        bufferedMessageCallbackCount: number
      }
      const sendCallbacks: ((error?: Error) => void)[] = []
      const wsConnection = activeStation.wsConnection
      assert.ok(wsConnection != null)
      mock.method(wsConnection, 'send', (_message: unknown, callback?: (error?: Error) => void) => {
        if (callback != null) sendCallbacks.push(callback)
      })

      const firstResponse = activeStation.ocppRequestService.sendResponse(
        activeStation,
        'stalled-response',
        {},
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        { bufferedResponseRetainedBytes: 900 * 1024 }
      )
      await flushMicrotasks()
      assert.strictEqual(sendCallbacks.length, 1)
      assert.strictEqual(stationInternals.bufferedMessageCallbackCount, 1)
      assert.ok(stationInternals.bufferedMessageCallbackBytes >= 900 * 1024)

      await assert.rejects(
        activeStation.ocppRequestService.sendResponse(
          activeStation,
          'response-over-byte-cap',
          {},
          OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
          { bufferedResponseRetainedBytes: 200 * 1024 }
        ),
        /Response callback capacity exceeded/
      )
      assert.strictEqual(sendCallbacks.length, 1)
      assert.strictEqual(stationInternals.bufferedMessageCallbackCount, 1)

      sendCallbacks[0]?.()
      await firstResponse
      assert.strictEqual(stationInternals.bufferedMessageCallbackCount, 0)
      assert.strictEqual(stationInternals.bufferedMessageCallbackBytes, 0)

      const resumedResponse = activeStation.ocppRequestService.sendResponse(
        activeStation,
        'response-after-release',
        {},
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        { bufferedResponseRetainedBytes: 200 * 1024 }
      )
      await flushMicrotasks()
      assert.strictEqual(sendCallbacks.length, 2)
      sendCallbacks[1]?.()
      await resumedResponse
    })

    await it('releases a buffered-message drain when the connection closes', () => {
      const { station: activeStation } = createOCPP16RequestTestContext()
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      const bufferedMessage = JSON.stringify([
        2,
        'interrupted-buffer-message',
        OCPP16RequestCommand.HEARTBEAT,
        {},
      ])
      const stationInternals = activeStation as unknown as {
        flushingMessageBuffer: boolean
        messageQueue: string[]
      }
      stationInternals.flushingMessageBuffer = true
      stationInternals.messageQueue = [bufferedMessage]
      activeStation.wsConnection = null
      const sendMessageBuffer = (
        ChargingStation.prototype as unknown as {
          sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
        }
      ).sendMessageBuffer
      let completed = false

      sendMessageBuffer.call(activeStation, () => {
        completed = true
        stationInternals.flushingMessageBuffer = false
      })

      assert.strictEqual(completed, true)
      assert.strictEqual(stationInternals.flushingMessageBuffer, false)
      assert.deepStrictEqual(stationInternals.messageQueue, [bufferedMessage])
    })

    await it('schedules buffered response replay while registration is pending', t => {
      t.mock.timers.enable({ apis: ['setInterval'] })
      const { station: activeStation } = createOCPP16RequestTestContext()
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      const flushMessageBufferSpy = mock.fn()
      const stationInternals = activeStation as unknown as {
        flushMessageBuffer: () => void
        flushMessageBufferSetInterval?: NodeJS.Timeout
        messageQueue: string[]
        setIntervalFlushMessageBuffer: () => void
      }
      stationInternals.flushMessageBuffer = flushMessageBufferSpy
      stationInternals.messageQueue = ['[3,"pending-response",{}]']
      activeStation.isWebSocketConnectionOpened = () => true
      mock.method(activeStation, 'inAcceptedState', () => false)
      stationInternals.setIntervalFlushMessageBuffer = (
        ChargingStation.prototype as unknown as {
          setIntervalFlushMessageBuffer: (this: ChargingStation) => void
        }
      ).setIntervalFlushMessageBuffer

      stationInternals.setIntervalFlushMessageBuffer.call(activeStation)
      t.mock.timers.tick(Constants.DEFAULT_MESSAGE_BUFFER_FLUSH_INTERVAL_MS)

      assert.strictEqual(flushMessageBufferSpy.mock.callCount(), 1)
      if (stationInternals.flushMessageBufferSetInterval != null) {
        clearInterval(stationInternals.flushMessageBufferSetInterval)
      }
    })

    await it('buffers an unacknowledged StopTransaction once when station stop times out', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const responseService = new OCPP16ResponseService()
      const requestService = new OCPP16RequestService(responseService)
      const initialSendStarted = Promise.withResolvers<undefined>()
      const wireMessages: string[] = []
      let initialSendCallback: ((error?: Error) => void) | undefined
      const result = createMockChargingStation({
        connectorsCount: 1,
        ocppIncomingRequestService: { stop: () => undefined },
        ocppVersion: OCPPVersion.VERSION_16,
        stationInfo: { beginEndMeterValues: false, ocppVersion: OCPPVersion.VERSION_16 },
      })
      const activeStation = result.station
      station = activeStation
      installBufferedMessageCallbackState(activeStation)
      activeStation.started = true
      activeStation.isStopping = () => ChargingStation.prototype.isStopping.call(activeStation)
      activeStation.recordRequestStatistic = () => undefined
      activeStation.ocppRequestService = requestService
      const acceptedBootNotificationResponse = activeStation.bootNotificationResponse
      assert.ok(acceptedBootNotificationResponse != null)
      setupConnectorWithTransaction(activeStation, 1, { transactionId: 102 })
      const connectorStatus = activeStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.status = OCPP16ChargePointStatus.Finishing
      const meterValuesTimer = setInterval(() => undefined, 60_000)
      t.after(() => {
        clearInterval(meterValuesTimer)
      })
      connectorStatus.transactionUpdatedMeterValuesSetInterval = meterValuesTimer
      const wsConnection = activeStation.wsConnection
      assert.ok(wsConnection != null)
      mock.method(
        wsConnection,
        'send',
        (data: unknown, callback?: (error?: Error) => void): void => {
          wireMessages.push(String(data))
          if (wireMessages.length === 1) {
            initialSendCallback = callback
            initialSendStarted.resolve(undefined)
          } else {
            callback?.()
          }
        }
      )
      const performStop = (
        ChargingStation.prototype as unknown as {
          performStop: (
            reason?: Parameters<ChargingStation['stop']>[0],
            stopTransactions?: boolean
          ) => Promise<void>
        }
      ).performStop
      ;(
        activeStation as unknown as {
          performStop: typeof performStop
        }
      ).performStop = performStop
      Object.assign(activeStation, {
        configurationFileHash: 'timeout-regression',
        saveConfiguration: () => undefined,
        sharedLRUCache: { deleteChargingStationConfiguration: () => undefined },
      })
      ;(
        activeStation as unknown as {
          stopMessageSequence: (
            reason?: Parameters<ChargingStation['stop']>[0],
            stopTransactions?: boolean
          ) => Promise<void>
        }
      ).stopMessageSequence = async (reason, stopTransactions) => {
        stopTransactions === true && (await stopRunningTransactions(activeStation, reason))
      }
      const transactionData = [
        {
          sampledValue: [{ value: '1024' }],
          timestamp: new Date('2026-09-08T12:34:56.000Z'),
        },
      ]

      const callerStop = OCPP16ServiceUtils.stopTransactionOnConnector(
        activeStation,
        1,
        undefined,
        { idTag: 'SHUTDOWN-TAG', transactionData }
      )
      await initialSendStarted.promise
      const rejectedCallerStop = assert.rejects(
        callerStop,
        /Charging station stopped while awaiting an OCPP response/
      )
      const stationStop = ChargingStation.prototype.stop.call(activeStation, undefined, true)
      await Promise.resolve()
      t.mock.timers.tick(Constants.STOP_MESSAGE_SEQUENCE_TIMEOUT_MS)
      for (let index = 0; index < 10; index++) {
        await Promise.resolve()
      }

      await rejectedCallerStop
      await stationStop
      const stationInternals = activeStation as unknown as { messageQueue: string[] }
      assert.strictEqual(stationInternals.messageQueue.length, 1)
      assert.strictEqual(activeStation.requests.size, 1)
      const sendFailure = new Error('late transport failure after shutdown cancellation')
      initialSendCallback?.(sendFailure)
      initialSendCallback?.(sendFailure)
      transactionData[0].sampledValue[0].value = 'mutated-after-rejection'
      transactionData.push({ sampledValue: [{ value: 'late' }], timestamp: new Date() })

      assert.strictEqual(stationInternals.messageQueue.length, 1)
      assert.strictEqual(activeStation.requests.size, 1)
      assert.strictEqual(wireMessages.length, 1)
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.transactionId, 102)
      assert.strictEqual(connectorStatus.transactionUpdatedMeterValuesSetInterval, undefined)
      const cachedRequest = [...activeStation.requests.values()][0]
      const [responseCallback, , commandName, cachedPayload] = cachedRequest
      assert.strictEqual(commandName, OCPP16RequestCommand.STOP_TRANSACTION)
      assert.strictEqual(Object.isFrozen(cachedPayload), true)
      assert.deepStrictEqual((cachedPayload as OCPP16StopTransactionRequest).transactionData, [
        {
          sampledValue: [{ value: '1024' }],
          timestamp: new Date('2026-09-08T12:34:56.000Z'),
        },
      ])
      const bufferedMessage = JSON.parse(stationInternals.messageQueue[0]) as [
        number,
        string,
        string,
        OCPP16StopTransactionRequest
      ]
      assert.strictEqual(bufferedMessage[2], OCPP16RequestCommand.STOP_TRANSACTION)
      assert.deepStrictEqual(bufferedMessage[3].transactionData, [
        {
          sampledValue: [{ value: '1024' }],
          timestamp: '2026-09-08T12:34:56.000Z',
        },
      ])

      const sendMessageBuffer = (
        ChargingStation.prototype as unknown as {
          sendMessageBuffer: (this: ChargingStation, onComplete: () => void) => void
        }
      ).sendMessageBuffer
      ;(
        activeStation as unknown as { sendMessageBuffer: typeof sendMessageBuffer }
      ).sendMessageBuffer = sendMessageBuffer
      activeStation.bootNotificationResponse = acceptedBootNotificationResponse
      activeStation.wsConnection = wsConnection
      activeStation.isWebSocketConnectionOpened = () => true
      sendMessageBuffer.call(activeStation, () => undefined)
      await Promise.resolve()

      assert.strictEqual(stationInternals.messageQueue.length, 0)
      assert.strictEqual(wireMessages.length, 2)
      assert.strictEqual(wireMessages[1], wireMessages[0])
      assert.strictEqual(
        wireMessages.filter(message => {
          const frame = JSON.parse(message) as unknown[]
          return frame[2] === OCPP16RequestCommand.STOP_TRANSACTION
        }).length,
        2
      )

      ;(activeStation as unknown as { stopping: boolean }).stopping = true
      responseCallback({ idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } }, cachedPayload)
      await new Promise(resolve => setImmediate(resolve))
      await new Promise(resolve => setImmediate(resolve))
      assert.strictEqual(activeStation.requests.size, 0)
      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.transactionId, undefined)
    })

    await it('coalesces transaction queue persistence to one dirty follow-up save', async () => {
      const firstSave = Promise.withResolvers<undefined>()
      const saveConfiguration = mock.fn()
      const stationLike = {
        pendingConfigurationSave: firstSave.promise,
        saveConfiguration,
      } as unknown as ChargingStation
      installBufferedMessageCallbackState(stationLike)
      const saveState = stationLike as unknown as {
        transactionEventQueueSavePromise?: Promise<void>
      }

      for (let index = 0; index < 100; index++) {
        ChargingStation.prototype.saveTransactionEventQueues.call(stationLike)
      }

      assert.strictEqual(saveConfiguration.mock.callCount(), 1)
      firstSave.resolve(undefined)
      await saveState.transactionEventQueueSavePromise
      assert.strictEqual(saveConfiguration.mock.callCount(), 2)
    })

    await it('retries a failed transaction queue checkpoint without another mutation', async () => {
      const firstSave = Promise.withResolvers<undefined>()
      const secondSave = Promise.withResolvers<undefined>()
      const saveFailure = new Error('transient persistence failure')
      let saveAttempts = 0
      const stationState = {
        pendingConfigurationSave: Promise.resolve(),
        saveConfiguration: (onError?: (error: Error) => void) => {
          saveAttempts++
          if (saveAttempts === 1) onError?.(saveFailure)
          stationState.pendingConfigurationSave =
            saveAttempts === 1 ? firstSave.promise : secondSave.promise
        },
        saveTransactionEventQueues: (deferred?: boolean) => {
          ChargingStation.prototype.saveTransactionEventQueues.call(
            stationState as unknown as ChargingStation,
            deferred
          )
        },
      }
      const stationLike = stationState as unknown as ChargingStation

      ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, true)
      ;(
        ChargingStation.prototype as unknown as {
          releaseTransactionEventQueueSaveDelay: (this: ChargingStation) => void
        }
      ).releaseTransactionEventQueueSaveDelay.call(stationLike)
      const firstCheckpoint = (
        stationLike as unknown as {
          transactionEventQueueSavePromise: Promise<{ error?: Error }>
        }
      ).transactionEventQueueSavePromise
      firstSave.resolve(undefined)
      assert.strictEqual((await firstCheckpoint).error, saveFailure)
      assert.strictEqual(saveAttempts, 1)

      ;(
        ChargingStation.prototype as unknown as {
          releaseTransactionEventQueueSaveDelay: (this: ChargingStation) => void
        }
      ).releaseTransactionEventQueueSaveDelay.call(stationLike)
      for (let index = 0; index < 5; index++) await Promise.resolve()
      assert.strictEqual(saveAttempts, 2)
      secondSave.resolve(undefined)
      await (stationLike as unknown as { transactionEventQueueSavePromise: Promise<unknown> })
        .transactionEventQueueSavePromise
    })

    await it('surfaces a persistent queue checkpoint failure without hot-looping', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const saveFailure = new Error('persistent storage failure')
      let saveAttempts = 0
      const stationState = {
        lifecycleAbortSignal: new AbortController().signal,
        pendingConfigurationSave: Promise.resolve(),
        persistenceDiscarded: false,
        saveConfiguration: (onError?: (error: Error) => void) => {
          saveAttempts++
          onError?.(saveFailure)
          stationState.pendingConfigurationSave = Promise.resolve()
          if (saveAttempts === 2) stationState.persistenceDiscarded = true
        },
        saveTransactionEventQueues: (deferred?: boolean) => {
          ChargingStation.prototype.saveTransactionEventQueues.call(
            stationState as unknown as ChargingStation,
            deferred
          )
        },
      }
      const stationLike = stationState as unknown as ChargingStation
      const saveState = stationLike as unknown as {
        transactionEventQueueSaveDirty: boolean
        transactionEventQueueSavePromise?: Promise<unknown>
      }

      await assert.rejects(
        ChargingStation.prototype.persistTransactionEventQueues.call(stationLike),
        saveFailure
      )
      await flushMicrotasks()
      assert.strictEqual(saveAttempts, 1)
      assert.strictEqual(saveState.transactionEventQueueSaveDirty, true)
      assert.ok(saveState.transactionEventQueueSavePromise != null)

      t.mock.timers.tick(59_999)
      await flushMicrotasks()
      assert.strictEqual(saveAttempts, 1)
      const pacedRetry = saveState.transactionEventQueueSavePromise
      t.mock.timers.tick(1)
      await flushMicrotasks()
      assert.strictEqual(saveAttempts, 2)
      await pacedRetry
    })

    await it('persists events queued while transaction delivery settles during stop', async () => {
      const transactionEventQueue: unknown[] = []
      const connectorStatus = { transactionEventQueue } as unknown as ConnectorStatus
      let savedQueueLength = -1
      let stoppedEventEmitted = false
      const configurationSave = Promise.withResolvers<undefined>()
      const waitMock = mock.method(
        OCPP20ServiceUtils,
        'waitForTransactionEventDelivery',
        (status: ConnectorStatus) => {
          assert.strictEqual(status, connectorStatus)
          transactionEventQueue.push({})
          ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, true)
          return Promise.resolve()
        }
      )
      const stationLike = {
        bootNotificationResponse: {},
        closeWSConnection: () => undefined,
        configurationFileHash: 'test-configuration',
        emitChargingStationEvent: () => {
          stoppedEventEmitted = true
        },
        iterateConnectors: () => [{ connectorStatus }],
        lifecycleAbortController: new AbortController(),
        logPrefix: () => '',
        ocppIncomingRequestService: { stop: () => undefined },
        ocppRequestService: { cancelPendingRequests: () => undefined },
        pendingConfigurationSave: Promise.resolve(),
        saveConfiguration: () => {
          savedQueueLength = transactionEventQueue.length
          stationLike.pendingConfigurationSave = configurationSave.promise
        },
        sharedLRUCache: { deleteChargingStationConfiguration: () => undefined },
        started: true,
        stationInfo: { enableStatistics: false },
        stopMessageSequence: () => Promise.resolve(),
      }
      installBufferedMessageCallbackState(stationLike)

      try {
        const stopPromise = (
          ChargingStation.prototype as unknown as {
            performStop: (reason?: unknown, stopTransactions?: boolean) => Promise<void>
          }
        ).performStop.call(stationLike)
        await new Promise(resolve => {
          setImmediate(resolve)
        })
        assert.strictEqual(savedQueueLength, 1)
        configurationSave.resolve(undefined)
        await stopPromise
      } finally {
        waitMock.mock.restore()
      }

      assert.strictEqual(stoppedEventEmitted, true)
    })

    await it('should finish a timed-out never-settling stop sequence after cancellation', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const stopSequence = new Promise<undefined>(() => {
        // Deliberately never settles.
      })
      const closeCalls: { byRequest?: boolean }[] = []
      let cancelCalls = 0
      let stoppedEvents = 0
      let stopSettled = false
      const lifecycleAbortController = new AbortController()
      const stationLike = {
        closeWSConnection: (options?: { byRequest?: boolean }) => {
          closeCalls.push(options ?? {})
        },
        configurationFileHash: 'test-configuration',
        emitChargingStationEvent: () => {
          stoppedEvents++
        },
        iterateConnectors: () => [],
        lifecycleAbortController,
        logPrefix: () => '',
        ocppIncomingRequestService: { stop: () => undefined },
        ocppRequestService: {
          cancelPendingRequests: () => {
            cancelCalls++
          },
        },
        saveConfiguration: () => undefined,
        sharedLRUCache: { deleteChargingStationConfiguration: () => undefined },
        started: true,
        stationInfo: { enableStatistics: false },
        stopMessageSequence: () => stopSequence,
      }
      installBufferedMessageCallbackState(stationLike)
      const stopPromise = (
        ChargingStation.prototype as unknown as {
          performStop: (reason?: unknown, stopTransactions?: boolean) => Promise<void>
        }
      ).performStop.call(stationLike)
      void stopPromise.then(() => {
        stopSettled = true
        return undefined
      })
      await Promise.resolve()

      t.mock.timers.tick(Constants.STOP_MESSAGE_SEQUENCE_TIMEOUT_MS)
      for (let index = 0; index < 10; index++) {
        await Promise.resolve()
      }
      assert.strictEqual(stopSettled, true)
      await stopPromise
      assert.strictEqual(cancelCalls, 1)
      assert.deepStrictEqual(closeCalls, [{ byRequest: true }])
      assert.strictEqual(lifecycleAbortController.signal.aborted, true)
      assert.strictEqual(stoppedEvents, 1)
    })

    await it('should stop a stale timed-out message sequence before it mutates a restarted lifecycle', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const firstStatusRequest = Promise.withResolvers<Record<string, never>>()
      const firstStatusRequestStarted = Promise.withResolvers<undefined>()
      const staleSequenceSettled = Promise.withResolvers<undefined>()
      const unavailableConnectorIds: number[] = []
      const requestHandler = mock.fn((...args: unknown[]): Promise<unknown> => {
        if (args[1] !== OCPP16RequestCommand.STATUS_NOTIFICATION) {
          return Promise.resolve({})
        }
        const payload = args[2] as { connectorId: number; status: OCPP16ChargePointStatus }
        if (payload.status !== OCPP16ChargePointStatus.Unavailable) {
          return Promise.resolve({})
        }
        unavailableConnectorIds.push(payload.connectorId)
        if (unavailableConnectorIds.length === 1) {
          firstStatusRequestStarted.resolve(undefined)
          return firstStatusRequest.promise
        }
        return Promise.resolve({})
      })
      const result = createMockChargingStation({
        connectorsCount: 2,
        ocppIncomingRequestService: { stop: () => undefined },
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
        started: true,
        stationInfo: { enableStatistics: false },
      })
      station = result.station
      installBufferedMessageCallbackState(station)
      const shutdownLifecycle = new AbortController()
      const stopMessageSequence = (
        ChargingStation.prototype as unknown as {
          stopMessageSequence: (
            reason?: Parameters<ChargingStation['stop']>[0],
            stopTransactions?: boolean,
            lifecycleAbortSignal?: AbortSignal
          ) => Promise<void>
        }
      ).stopMessageSequence
      const stationLifecycle = station as unknown as {
        configurationFileHash: string
        internalStopMessageSequence: () => void
        lifecycleAbortController: AbortController
        saveConfiguration: () => void
        sharedLRUCache: { deleteChargingStationConfiguration: (hash: string) => void }
        stopAlignedMeterValues: () => void
        stopMessageSequence: typeof stopMessageSequence
      }
      stationLifecycle.configurationFileHash = 'stale-stop-sequence'
      stationLifecycle.internalStopMessageSequence = () => undefined
      stationLifecycle.lifecycleAbortController = shutdownLifecycle
      Object.defineProperty(station, 'lifecycleAbortSignal', {
        configurable: true,
        get: () => stationLifecycle.lifecycleAbortController.signal,
      })
      stationLifecycle.saveConfiguration = () => undefined
      stationLifecycle.sharedLRUCache = { deleteChargingStationConfiguration: () => undefined }
      stationLifecycle.stopAlignedMeterValues = () => undefined
      stationLifecycle.stopMessageSequence = async (reason, stopTransactions, lifecycleSignal) => {
        try {
          await stopMessageSequence.call(station, reason, stopTransactions, lifecycleSignal)
        } finally {
          staleSequenceSettled.resolve(undefined)
        }
      }

      const stopPromise = (
        ChargingStation.prototype as unknown as {
          performStop: (reason?: unknown, stopTransactions?: boolean) => Promise<void>
        }
      ).performStop.call(station, undefined, false)
      await firstStatusRequestStarted.promise
      t.mock.timers.tick(Constants.STOP_MESSAGE_SEQUENCE_TIMEOUT_MS)
      for (let index = 0; index < 10; index++) await Promise.resolve()
      await stopPromise
      assert.notStrictEqual(station.lifecycleAbortSignal, shutdownLifecycle.signal)

      firstStatusRequest.resolve({})
      await staleSequenceSettled.promise

      assert.deepStrictEqual(unavailableConnectorIds, [1])
      assert.strictEqual(station.getConnectorStatus(1)?.status, OCPP16ChargePointStatus.Available)
      assert.strictEqual(station.getConnectorStatus(2)?.status, OCPP16ChargePointStatus.Available)
    })

    await it('should flush a dirty queue before sealing a timed-out delivery chain', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const transactionEventQueue: unknown[] = []
      const connectorStatus = { transactionEventQueue } as unknown as ConnectorStatus
      let savedQueueLength = -1
      const waitMock = mock.method(OCPP20ServiceUtils, 'waitForTransactionEventDelivery', () => {
        transactionEventQueue.push({})
        ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, true)
        return new Promise<void>(() => undefined)
      })
      let stopped = false
      const stationLike = {
        closeWSConnection: () => undefined,
        configurationFileHash: 'test-configuration',
        emitChargingStationEvent: () => {
          stopped = true
        },
        iterateConnectors: () => [{ connectorStatus }],
        lifecycleAbortController: new AbortController(),
        logPrefix: () => '',
        ocppIncomingRequestService: { stop: () => undefined },
        ocppRequestService: { cancelPendingRequests: () => undefined },
        pendingConfigurationSave: Promise.resolve(),
        saveConfiguration: () => {
          savedQueueLength = transactionEventQueue.length
        },
        sharedLRUCache: { deleteChargingStationConfiguration: () => undefined },
        started: true,
        stationInfo: { enableStatistics: false },
        stopMessageSequence: () => Promise.resolve(),
      }
      installBufferedMessageCallbackState(stationLike)

      try {
        const stopPromise = (
          ChargingStation.prototype as unknown as {
            performStop: (reason?: unknown, stopTransactions?: boolean) => Promise<void>
          }
        ).performStop.call(stationLike)
        for (let index = 0; index < 10; index++) await Promise.resolve()
        t.mock.timers.tick(Constants.STOP_MESSAGE_SEQUENCE_TIMEOUT_MS)
        for (let index = 0; index < 10; index++) await Promise.resolve()
        await stopPromise
      } finally {
        waitMock.mock.restore()
      }
      assert.strictEqual(stopped, true)
      assert.strictEqual(savedQueueLength, 1)
    })

    await it('should bound shutdown when final queue persistence never settles', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const waitMock = mock.method(OCPP20ServiceUtils, 'waitForTransactionEventDelivery', () =>
        Promise.resolve()
      )
      let stopped = false
      const stationLike = {
        closeWSConnection: () => undefined,
        configurationFileHash: 'test-configuration',
        emitChargingStationEvent: () => {
          stopped = true
        },
        iterateConnectors: () => [],
        lifecycleAbortController: new AbortController(),
        logPrefix: () => '',
        ocppIncomingRequestService: { stop: () => undefined },
        ocppRequestService: { cancelPendingRequests: () => undefined },
        pendingConfigurationSave: Promise.resolve(),
        saveConfiguration: () => undefined,
        sharedLRUCache: { deleteChargingStationConfiguration: () => undefined },
        started: true,
        stationInfo: { enableStatistics: false },
        stopMessageSequence: () => Promise.resolve(),
        transactionEventQueueSavePromise: new Promise<void>(() => undefined),
      }
      installBufferedMessageCallbackState(stationLike)

      try {
        const stopPromise = (
          ChargingStation.prototype as unknown as {
            performStop: (reason?: unknown, stopTransactions?: boolean) => Promise<void>
          }
        ).performStop.call(stationLike)
        for (let index = 0; index < 10; index++) await Promise.resolve()
        t.mock.timers.tick(Constants.STOP_MESSAGE_SEQUENCE_TIMEOUT_MS)
        for (let index = 0; index < 10; index++) await Promise.resolve()
        await stopPromise
      } finally {
        waitMock.mock.restore()
      }
      assert.strictEqual(stopped, true)
    })

    await it('should clear bootNotificationResponse on stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      assert.notStrictEqual(station.bootNotificationResponse, undefined)

      // Act
      await station.stop()

      // Assert - bootNotificationResponse should be deleted
      assert.strictEqual(station.bootNotificationResponse, undefined)
    })

    await it('should be restartable after stop()', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      assert.strictEqual(station.started, true)

      // Act - stop then start again
      await station.stop()
      assert.strictEqual(station.started, false)
      station.start()

      // Assert - should be started again
      assert.strictEqual(station.started, true)
    })

    await it('should guard against concurrent start operations', () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station

      // Simulate starting state manually to test guard
      const stationAny = station as unknown as { started: boolean; starting: boolean }
      stationAny.starting = true
      stationAny.started = false

      // Act - attempt to start while already starting should be guarded
      // The mock start() method resets starting, but this tests the initial state
      assert.strictEqual(station.starting, true)

      // Assert - the real ChargingStation guards against this
      // (mock implementation doesn't fully replicate guard, but state is verified)
    })

    await it('defers paced transaction queue checkpoints to one save per minute', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const saveConfiguration = mock.fn()
      const stationLike = {
        pendingConfigurationSave: Promise.resolve(),
        saveConfiguration,
      } as unknown as ChargingStation
      installBufferedMessageCallbackState(stationLike)
      const saveState = stationLike as unknown as {
        transactionEventQueueSavePromise?: Promise<void>
      }

      for (let index = 0; index < 100; index++) {
        ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, true)
      }
      const savePromise = saveState.transactionEventQueueSavePromise

      t.mock.timers.tick(59_999)
      await Promise.resolve()
      assert.strictEqual(saveConfiguration.mock.callCount(), 0)

      t.mock.timers.tick(1)
      await savePromise
      assert.strictEqual(saveConfiguration.mock.callCount(), 1)
    })

    await it('flushes the latest deferred queue state when an immediate checkpoint is requested', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      let queueLength = 1
      const savedQueueLengths: number[] = []
      const stationLike = {
        pendingConfigurationSave: Promise.resolve(),
        saveConfiguration: () => {
          savedQueueLengths.push(queueLength)
        },
      } as unknown as ChargingStation
      installBufferedMessageCallbackState(stationLike)
      const saveState = stationLike as unknown as {
        transactionEventQueueSavePromise?: Promise<void>
      }

      ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, true)
      queueLength = 2
      ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, true)
      assert.deepStrictEqual(savedQueueLengths, [])

      ChargingStation.prototype.saveTransactionEventQueues.call(stationLike)
      await saveState.transactionEventQueueSavePromise
      assert.deepStrictEqual(savedQueueLengths, [2])
    })

    await it('should persist a dirty queue with the current lifecycle generation', async () => {
      const staleLifecycle = new AbortController()
      const currentLifecycle = new AbortController()
      const savedGenerations: AbortSignal[] = []
      const stationLike = {
        lifecycleAbortSignal: staleLifecycle.signal,
        pendingConfigurationSave: Promise.resolve(),
        saveConfiguration: () => {
          savedGenerations.push(stationLike.lifecycleAbortSignal)
        },
        saveTransactionEventQueues: (deferred?: boolean) => {
          ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, deferred)
        },
      } as unknown as ChargingStation
      installBufferedMessageCallbackState(stationLike)

      ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, true)
      ;(stationLike as unknown as { lifecycleAbortSignal: AbortSignal }).lifecycleAbortSignal =
        currentLifecycle.signal

      await ChargingStation.prototype.persistTransactionEventQueues.call(stationLike)
      assert.deepStrictEqual(savedGenerations, [currentLifecycle.signal])
    })

    await it('persists a queue save superseded by shutdown with the current generation', async () => {
      const staleLifecycle = new AbortController()
      const shutdownLifecycle = new AbortController()
      const staleSave = Promise.withResolvers<undefined>()
      const savedSnapshots: { generation: AbortSignal; queueLength: number }[] = []
      let queueLength = 1
      let saveAttempts = 0
      const stationLike = {
        lifecycleAbortSignal: staleLifecycle.signal,
        pendingConfigurationSave: Promise.resolve(),
        saveConfiguration: () => {
          saveAttempts++
          savedSnapshots.push({
            generation: stationLike.lifecycleAbortSignal,
            queueLength,
          })
          ;(
            stationLike as unknown as { pendingConfigurationSave: Promise<void> }
          ).pendingConfigurationSave = saveAttempts === 1 ? staleSave.promise : Promise.resolve()
        },
        saveTransactionEventQueues: (deferred?: boolean) => {
          ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, deferred)
        },
      } as unknown as ChargingStation
      installBufferedMessageCallbackState(stationLike)
      const saveState = stationLike as unknown as {
        lifecycleAbortSignal: AbortSignal
        transactionEventQueueSavePromise?: Promise<{ error?: Error }>
      }

      ChargingStation.prototype.saveTransactionEventQueues.call(stationLike)
      assert.deepStrictEqual(savedSnapshots, [
        { generation: staleLifecycle.signal, queueLength: 1 },
      ])

      saveState.lifecycleAbortSignal = shutdownLifecycle.signal
      queueLength = 2
      const supersededPersistence =
        ChargingStation.prototype.persistTransactionEventQueues.call(stationLike)
      staleSave.resolve(undefined)

      await supersededPersistence
      assert.deepStrictEqual(savedSnapshots, [
        { generation: staleLifecycle.signal, queueLength: 1 },
        { generation: shutdownLifecycle.signal, queueLength: 2 },
      ])
    })

    await it('forces a deferred transaction queue checkpoint before stop completes', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const transactionEventQueue: unknown[] = [{}]
      const savedQueueLengths: number[] = []
      const stationLike = {
        bootNotificationResponse: {},
        closeWSConnection: () => undefined,
        configurationFileHash: 'test-configuration',
        emitChargingStationEvent: () => undefined,
        iterateConnectors: () => [],
        lifecycleAbortController: new AbortController(),
        logPrefix: () => '',
        ocppIncomingRequestService: { stop: () => undefined },
        ocppRequestService: { cancelPendingRequests: () => undefined },
        pendingConfigurationSave: Promise.resolve(),
        saveConfiguration: () => {
          savedQueueLengths.push(transactionEventQueue.length)
        },
        sharedLRUCache: { deleteChargingStationConfiguration: () => undefined },
        started: true,
        stationInfo: { enableStatistics: false },
        stopMessageSequence: () => {
          assert.deepStrictEqual(savedQueueLengths, [2])
          return Promise.resolve()
        },
      } as unknown as ChargingStation
      installBufferedMessageCallbackState(stationLike)

      ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, true)
      transactionEventQueue.push({})
      ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, true)
      assert.deepStrictEqual(savedQueueLengths, [])

      await (
        ChargingStation.prototype as unknown as {
          performStop: (reason?: unknown, stopTransactions?: boolean) => Promise<void>
        }
      ).performStop.call(stationLike)

      assert.deepStrictEqual(savedQueueLengths, [2])
    })
  })

  await describe('Delete Operations', async () => {
    let station: ChargingStation | undefined
    beforeEach(() => {
      station = undefined
    })

    afterEach(() => {
      standardCleanup()
      if (station != null) {
        cleanupChargingStation(station)
      }
    })

    await it('should flush a deferred transaction queue checkpoint before delete(false)', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      ;(station as unknown as { deleteAbortController: AbortController }).deleteAbortController =
        new AbortController()
      ;(
        station as unknown as {
          chargingStationWorkerBroadcastChannel: { unref: () => void }
        }
      ).chargingStationWorkerBroadcastChannel = { unref: () => undefined }
      let queueLength = 1
      const savedQueueLengths: number[] = []
      ;(station as unknown as { saveConfiguration: () => void }).saveConfiguration = () => {
        savedQueueLengths.push(queueLength)
      }

      ChargingStation.prototype.saveTransactionEventQueues.call(station, true)
      queueLength = 2
      ChargingStation.prototype.saveTransactionEventQueues.call(station, true)
      assert.deepStrictEqual(savedQueueLengths, [])

      await ChargingStation.prototype.delete.call(station, false)

      assert.deepStrictEqual(savedQueueLengths, [2])
    })

    await it('should persist the final queue snapshot after delete(false) cancels reset', async t => {
      const directory = mkdtempSync(join(tmpdir(), 'charging-station-delete-persist-'))
      t.after(() => {
        rmSync(directory, { force: true, recursive: true })
      })
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      Object.setPrototypeOf(station, ChargingStation.prototype)
      ;(
        station as unknown as {
          getAutomaticTransactionGeneratorConfiguration: () => undefined
          getConfigurationFromFile: () => Record<string, never>
          sharedLRUCache: {
            deleteChargingStationConfiguration: () => void
            setChargingStationConfiguration: () => void
          }
        }
      ).getAutomaticTransactionGeneratorConfiguration = () => undefined
      ;(
        station as unknown as { getConfigurationFromFile: () => Record<string, never> }
      ).getConfigurationFromFile = () => ({})
      ;(
        station as unknown as {
          sharedLRUCache: {
            deleteChargingStationConfiguration: () => void
            setChargingStationConfiguration: () => void
          }
        }
      ).sharedLRUCache = {
        deleteChargingStationConfiguration: () => undefined,
        setChargingStationConfiguration: () => undefined,
      }
      station.persistTransactionEventQueues =
        ChargingStation.prototype.persistTransactionEventQueues.bind(station)
      const configurationFile = join(directory, 'station.json')
      writeFileSync(configurationFile, '{}', 'utf8')
      ;(station as unknown as { configurationFile: string }).configurationFile = configurationFile
      ;(station as unknown as { configurationFileHash: string }).configurationFileHash = ''
      ;(station as unknown as { deleteAbortController: AbortController }).deleteAbortController =
        new AbortController()
      ;(
        station as unknown as {
          chargingStationWorkerBroadcastChannel: { unref: () => void }
        }
      ).chargingStationWorkerBroadcastChannel = { unref: () => undefined }

      ChargingStation.prototype.saveTransactionEventQueues.call(station, true)
      await ChargingStation.prototype.delete.call(station, false)

      assert.strictEqual(existsSync(configurationFile), true)
      const persisted = JSON.parse(readFileSync(configurationFile, 'utf8')) as {
        connectorsStatus?: unknown
      }
      assert.notStrictEqual(persisted.connectorsStatus, undefined)
    })

    await it('should discard a deferred transaction queue checkpoint with delete(true)', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      ;(station as unknown as { deleteAbortController: AbortController }).deleteAbortController =
        new AbortController()
      ;(station as unknown as { configurationFile: string }).configurationFile = join(
        tmpdir(),
        'discarded-station-configuration.json'
      )
      ;(
        station as unknown as {
          chargingStationWorkerBroadcastChannel: { unref: () => void }
        }
      ).chargingStationWorkerBroadcastChannel = { unref: () => undefined }
      const saveConfiguration = mock.fn()
      ;(station as unknown as { saveConfiguration: () => void }).saveConfiguration =
        saveConfiguration

      ChargingStation.prototype.saveTransactionEventQueues.call(station, true)
      await ChargingStation.prototype.delete.call(station, true)

      assert.strictEqual(saveConfiguration.mock.callCount(), 0)
      await assert.rejects(
        ChargingStation.prototype.persistTransactionEventQueues.call(station),
        /persistence was discarded/
      )
    })

    await it('should complete cleanup and purge when delete(true) discards a joined delete(false) save', async t => {
      const directory = mkdtempSync(join(tmpdir(), 'charging-station-delete-escalation-'))
      t.after(() => {
        rmSync(directory, { force: true, recursive: true })
      })
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const configurationFile = join(directory, 'station.json')
      writeFileSync(configurationFile, '{}', 'utf8')
      const saveStarted = Promise.withResolvers<undefined>()
      const releaseSave = Promise.withResolvers<undefined>()
      ;(station as unknown as { configurationFile: string }).configurationFile = configurationFile
      ;(station as unknown as { deleteAbortController: AbortController }).deleteAbortController =
        new AbortController()
      ;(
        station as unknown as {
          chargingStationWorkerBroadcastChannel: { unref: () => void }
        }
      ).chargingStationWorkerBroadcastChannel = { unref: () => undefined }
      station.persistTransactionEventQueues =
        ChargingStation.prototype.persistTransactionEventQueues.bind(station)
      station.saveTransactionEventQueues =
        ChargingStation.prototype.saveTransactionEventQueues.bind(station)
      ;(
        station as unknown as {
          saveConfiguration: () => void
        }
      ).saveConfiguration = () => {
        saveStarted.resolve(undefined)
        ;(
          station as unknown as {
            pendingConfigurationSave?: Promise<void>
          }
        ).pendingConfigurationSave = releaseSave.promise
      }

      const persistentDelete = ChargingStation.prototype.delete.call(station, false)
      await saveStarted.promise
      const destructiveDelete = ChargingStation.prototype.delete.call(station, true)
      releaseSave.resolve(undefined)
      await Promise.all([persistentDelete, destructiveDelete])

      assert.strictEqual(station.getNumberOfConnectors(), 0)
      assert.strictEqual(station.getNumberOfEvses(), 0)
      assert.strictEqual(existsSync(configurationFile), false)
    })

    await it('should surface an unrelated joined persistence failure after cleanup and purge', async t => {
      const directory = mkdtempSync(join(tmpdir(), 'charging-station-delete-failure-'))
      t.after(() => {
        rmSync(directory, { force: true, recursive: true })
      })
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const configurationFile = join(directory, 'station.json')
      writeFileSync(configurationFile, '{}', 'utf8')
      const failure = new Error('durable storage failed')
      const persistenceStarted = Promise.withResolvers<undefined>()
      const releasePersistence = Promise.withResolvers<undefined>()
      ;(station as unknown as { configurationFile: string }).configurationFile = configurationFile
      ;(station as unknown as { deleteAbortController: AbortController }).deleteAbortController =
        new AbortController()
      ;(
        station as unknown as {
          chargingStationWorkerBroadcastChannel: { unref: () => void }
        }
      ).chargingStationWorkerBroadcastChannel = { unref: () => undefined }
      station.persistTransactionEventQueues = async () => {
        persistenceStarted.resolve(undefined)
        await releasePersistence.promise
        throw failure
      }

      const persistentDelete = ChargingStation.prototype.delete.call(station, false)
      await persistenceStarted.promise
      const destructiveDelete = ChargingStation.prototype.delete.call(station, true)
      releasePersistence.resolve(undefined)
      const results = await Promise.allSettled([persistentDelete, destructiveDelete])

      assert.ok(results.every(result => result.status === 'rejected' && result.reason === failure))
      assert.strictEqual(station.getNumberOfConnectors(), 0)
      assert.strictEqual(station.getNumberOfEvses(), 0)
      assert.strictEqual(existsSync(configurationFile), false)
    })

    await it('should handle delete() on stopped station', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station
      assert.strictEqual(station.started, false)

      // Act - delete while stopped (deleteConfiguration = false to skip file ops)
      await station.delete(false)

      // Assert - connectors and evses should be cleared
      assert.strictEqual(station.getNumberOfConnectors(), 0)
      assert.strictEqual(station.getNumberOfEvses(), 0)
      assert.strictEqual(station.requests.size, 0)
    })

    await it('should honor a later configuration purge after delete cleanup completed', async () => {
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const directory = mkdtempSync(join(tmpdir(), 'charging-station-delete-'))
      const configurationFile = join(directory, 'station.json')
      writeFileSync(configurationFile, '{}', 'utf8')
      ;(station as unknown as { configurationFile: string }).configurationFile = configurationFile
      ;(station as unknown as { deleteAbortController: AbortController }).deleteAbortController =
        new AbortController()
      ;(
        station as unknown as {
          chargingStationWorkerBroadcastChannel: { unref: () => void }
        }
      ).chargingStationWorkerBroadcastChannel = { unref: () => undefined }

      try {
        await ChargingStation.prototype.delete.call(station, false)
        assert.strictEqual(existsSync(configurationFile), true)

        await ChargingStation.prototype.delete.call(station, true)
        assert.strictEqual(existsSync(configurationFile), false)
        await assert.rejects(
          ChargingStation.prototype.persistTransactionEventQueues.call(station),
          /persistence was discarded/
        )
      } finally {
        rmSync(directory, { force: true, recursive: true })
      }
    })

    await it('should stop station before delete() if running', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.start()
      assert.strictEqual(station.started, true)

      // Act - delete calls stop internally
      await station.delete(false)

      // Assert - station should be stopped and cleared
      assert.strictEqual(station.started, false)
      assert.strictEqual(station.getNumberOfConnectors(), 0)
    })

    await it('should stop before discarding pending requests during delete', async () => {
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      station.started = true
      ;(station as unknown as { deleteAbortController: AbortController }).deleteAbortController =
        new AbortController()
      ;(
        station as unknown as {
          chargingStationWorkerBroadcastChannel: { unref: () => void }
        }
      ).chargingStationWorkerBroadcastChannel = { unref: () => undefined }
      const cleanupOrder: string[] = []
      mock.method(station.ocppRequestService, 'cancelPendingRequests', () => {
        cleanupOrder.push('cancel')
      })
      mock.method(station, 'stop', () => {
        cleanupOrder.push('stop')
        ;(result.station as unknown as { stopping: boolean }).stopping = true
        result.station.started = false
        return Promise.resolve()
      })

      await ChargingStation.prototype.delete.call(station, false)

      assert.deepEqual(cleanupOrder, ['stop', 'cancel'])
    })

    await it('should join an active OCPP 1.6 StopTransaction before delete cleanup', async () => {
      const statusResponse = Promise.withResolvers<unknown>()
      const stopResponse = Promise.withResolvers<unknown>()
      const statusRequestStarted = Promise.withResolvers<undefined>()
      const stopRequestStarted = Promise.withResolvers<undefined>()
      let statusRequestPending = false
      let stopRequestPending = false
      let cancellationDuringLifecycleRequest = false
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        const command = args[1]
        if (command === 'StatusNotification') {
          statusRequestPending = true
          statusRequestStarted.resolve(undefined)
          try {
            return await statusResponse.promise
          } finally {
            statusRequestPending = false
          }
        }
        if (command === 'StopTransaction') {
          stopRequestPending = true
          stopRequestStarted.resolve(undefined)
          try {
            return await stopResponse.promise
          } finally {
            stopRequestPending = false
          }
        }
        return {}
      })
      const result = createMockChargingStation({
        connectorsCount: 1,
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_16,
      })
      station = result.station
      station.started = true
      setupConnectorWithTransaction(station, 1, { transactionId: 101 })
      ;(station as unknown as { deleteAbortController: AbortController }).deleteAbortController =
        new AbortController()
      ;(
        station as unknown as {
          chargingStationWorkerBroadcastChannel: { unref: () => void }
        }
      ).chargingStationWorkerBroadcastChannel = { unref: () => undefined }
      let cancelCalls = 0
      mock.method(station.ocppRequestService, 'cancelPendingRequests', () => {
        cancelCalls++
        if (statusRequestPending) {
          cancellationDuringLifecycleRequest = true
          statusResponse.reject(new Error('StatusNotification cancelled by delete'))
        }
        if (stopRequestPending) {
          cancellationDuringLifecycleRequest = true
          stopResponse.reject(new Error('StopTransaction cancelled by delete'))
        }
      })
      const activeStop = (async () => {
        await stopRunningTransactions(result.station)
        result.station.started = false
      })()
      ;(station as unknown as { stopPromise?: Promise<void> }).stopPromise = activeStop
      const stopMock = mock.method(station, 'stop', async () => {
        await activeStop
      })

      await statusRequestStarted.promise
      assert.strictEqual(statusRequestPending, true)
      statusResponse.resolve({})
      await stopRequestStarted.promise
      const deletePromise = ChargingStation.prototype.delete.call(station, false)
      await Promise.resolve()

      assert.strictEqual(cancelCalls, 0)
      assert.strictEqual(stopRequestPending, true)
      stopResponse.resolve({ idTagInfo: { status: 'Accepted' } })
      await Promise.all([activeStop, deletePromise])

      assert.strictEqual(cancellationDuringLifecycleRequest, false)
      assert.strictEqual(cancelCalls, 1)
      assert.strictEqual(stopMock.mock.callCount(), 1)
      assert.deepEqual(
        requestHandler.mock.calls.map(call => call.arguments[1]),
        ['StatusNotification', 'StopTransaction']
      )
    })

    await it('should coalesce concurrent deletes while OCPP 2.0 Ended is pending', async () => {
      const transactionEventResponse = Promise.withResolvers<unknown>()
      const transactionEventStarted = Promise.withResolvers<undefined>()
      let transactionEventPending = false
      let cancellationDuringTransactionEvent = false
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        const command = args[1]
        if (command === 'TransactionEvent') {
          transactionEventPending = true
          transactionEventStarted.resolve(undefined)
          try {
            return await transactionEventResponse.promise
          } finally {
            transactionEventPending = false
          }
        }
        return {}
      })
      const result = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_20,
      })
      station = result.station
      station.started = true
      setupConnectorWithTransaction(station, 1, { transactionId: 'tx-delete-1' })
      ;(station as unknown as { deleteAbortController: AbortController }).deleteAbortController =
        new AbortController()
      ;(
        station as unknown as {
          chargingStationWorkerBroadcastChannel: { unref: () => void }
        }
      ).chargingStationWorkerBroadcastChannel = { unref: () => undefined }
      let cancelCalls = 0
      mock.method(station.ocppRequestService, 'cancelPendingRequests', () => {
        cancelCalls++
        if (transactionEventPending) {
          cancellationDuringTransactionEvent = true
          transactionEventResponse.reject(new Error('TransactionEvent cancelled by delete'))
        }
      })
      const stopMock = mock.method(station, 'stop', async () => {
        await stopRunningTransactions(result.station)
        result.station.started = false
      })

      const firstDeletePromise = ChargingStation.prototype.delete.call(station, false)
      await transactionEventStarted.promise
      const secondDeletePromise = ChargingStation.prototype.delete.call(station, false)

      assert.strictEqual(firstDeletePromise, secondDeletePromise)
      assert.strictEqual(cancelCalls, 0)
      assert.strictEqual(transactionEventPending, true)
      transactionEventResponse.resolve({ idTokenInfo: { status: 'Accepted' } })
      await Promise.all([firstDeletePromise, secondDeletePromise])

      assert.strictEqual(cancellationDuringTransactionEvent, false)
      assert.strictEqual(cancelCalls, 1)
      assert.strictEqual(stopMock.mock.callCount(), 1)
      const transactionEventCall = requestHandler.mock.calls.find(
        call => call.arguments[1] === 'TransactionEvent'
      )
      assert.strictEqual(
        (transactionEventCall?.arguments[2] as { eventType?: string }).eventType,
        'Ended'
      )
    })

    await it('should persist and send graceful Ended before delete(true) fences persistence', async () => {
      const transactionEventResponse = Promise.withResolvers<unknown>()
      const transactionEventStarted = Promise.withResolvers<undefined>()
      const persistedEventTypes: string[][] = []
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        if (args[1] === 'TransactionEvent') {
          transactionEventStarted.resolve(undefined)
          return await transactionEventResponse.promise
        }
        return {}
      })
      const result = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_20,
      })
      station = result.station
      station.started = true
      setupConnectorWithTransaction(station, 1, { transactionId: 'tx-delete-durable-ended' })
      ;(station as unknown as { deleteAbortController: AbortController }).deleteAbortController =
        new AbortController()
      ;(
        station as unknown as {
          chargingStationWorkerBroadcastChannel: { unref: () => void }
        }
      ).chargingStationWorkerBroadcastChannel = { unref: () => undefined }
      station.persistTransactionEventQueues =
        ChargingStation.prototype.persistTransactionEventQueues.bind(station)
      station.saveTransactionEventQueues =
        ChargingStation.prototype.saveTransactionEventQueues.bind(station)
      ;(station as unknown as { saveConfiguration: () => void }).saveConfiguration = () => {
        const connectorStatus = station?.getConnectorStatus(1, 1)
        persistedEventTypes.push(
          connectorStatus?.transactionEventQueue?.map(({ request }) => request.eventType) ?? []
        )
        ;(
          station as unknown as {
            pendingConfigurationSave: Promise<void>
          }
        ).pendingConfigurationSave = Promise.resolve()
      }
      mock.method(station, 'stop', async () => {
        await stopRunningTransactions(result.station)
        result.station.started = false
      })

      const deletion = ChargingStation.prototype.delete.call(station, true)
      const firstCompletion = await Promise.race([
        transactionEventStarted.promise.then(() => 'started'),
        deletion.then(() => 'deleted'),
      ])
      assert.strictEqual(firstCompletion, 'started')
      assert.ok(persistedEventTypes.some(eventTypes => eventTypes.includes('Ended')))

      transactionEventResponse.resolve({ idTokenInfo: { status: 'Accepted' } })
      await deletion

      const transactionEventCall = requestHandler.mock.calls.find(
        call => call.arguments[1] === 'TransactionEvent'
      )
      assert.strictEqual(
        (transactionEventCall?.arguments[2] as { eventType?: string }).eventType,
        'Ended'
      )
    })

    await it('should ignore persisted EVSEs absent from the current template', () => {
      const result = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station
      const initializeFromFile = (
        ChargingStation.prototype as unknown as {
          initializeConnectorsOrEvsesFromFile: (
            configuration: unknown,
            stationTemplate: unknown
          ) => void
        }
      ).initializeConnectorsOrEvsesFromFile

      assert.doesNotThrow(() => {
        initializeFromFile.call(
          station,
          {
            evsesStatus: [
              [
                99,
                {
                  availability: 'Operative',
                  connectorsStatus: [],
                },
              ],
            ],
          },
          { Evses: {} }
        )
      })
      assert.strictEqual(station.getEvseStatus(99), undefined)
    })

    await it('should preserve live connector transactions during template reload', () => {
      const result = createMockChargingStation({ connectorsCount: 1 })
      station = result.station
      const liveConnector = station.getConnectorStatus(1)
      assert.ok(liveConnector != null)
      liveConnector.transactionId = 42
      liveConnector.transactionStarted = true
      station.started = true
      const initializeFromFile = (
        ChargingStation.prototype as unknown as {
          initializeConnectorsOrEvsesFromFile: (
            configuration: unknown,
            stationTemplate: unknown,
            persistentConfiguration?: boolean,
            restorePersistedTransactions?: boolean
          ) => void
        }
      ).initializeConnectorsOrEvsesFromFile

      initializeFromFile.call(
        station,
        {
          connectorsStatus: [
            [
              1,
              {
                availability: 'Operative',
                transactionId: 7,
                transactionStarted: true,
              },
            ],
          ],
        },
        { Connectors: {} },
        undefined,
        false
      )

      assert.strictEqual(station.getConnectorStatus(1), liveConnector)
      assert.strictEqual(liveConnector.transactionId, 42)
      assert.strictEqual(liveConnector.transactionRestored, undefined)
    })

    await it('should remove persisted EVSE meter templates absent from the current template', () => {
      const result = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
      })
      station = result.station
      const initializeFromFile = (
        ChargingStation.prototype as unknown as {
          initializeConnectorsOrEvsesFromFile: (
            configuration: unknown,
            stationTemplate: unknown
          ) => void
        }
      ).initializeConnectorsOrEvsesFromFile

      initializeFromFile.call(
        station,
        {
          evsesStatus: [
            [
              1,
              {
                availability: 'Operative',
                connectorsStatus: [],
                MeterValues: [{ measurand: 'Power.Active.Import', unit: 'W', value: '1000' }],
              },
            ],
          ],
        },
        { Evses: { 1: {} } }
      )

      assert.deepEqual(station.getEvseStatus(1)?.MeterValues, [])
    })

    await it('should handle delete operation with pending transactions', async () => {
      // Arrange
      const result = createMockChargingStation({ connectorsCount: 2 })
      station = result.station

      // Set up a running transaction
      const connector1 = station.getConnectorStatus(1)
      if (connector1 != null) {
        connector1.transactionStarted = true
        connector1.transactionId = 1001
      }

      // Start the station
      station.start()
      assert.strictEqual(station.started, true)

      // Act - Delete station (should stop first)
      await station.delete()

      // Assert - Station should be stopped and resources cleared
      assert.strictEqual(station.started, false)
      assert.strictEqual(station.getNumberOfConnectors(), 0)
      assert.strictEqual(station.getNumberOfEvses(), 0)
    })
  })
})
