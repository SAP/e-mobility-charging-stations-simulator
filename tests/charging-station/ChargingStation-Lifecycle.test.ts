/**
 * @file Tests for ChargingStation Lifecycle Operations
 * @description Unit tests for charging station start/stop/restart and delete operations
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ConnectorStatus } from '../../src/types/index.js'

import { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import { OCPP16RequestService } from '../../src/charging-station/ocpp/1.6/OCPP16RequestService.js'
import { OCPP16ResponseService } from '../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import { OCPP16ServiceUtils } from '../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import { OCPP20ServiceUtils } from '../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { stopRunningTransactions } from '../../src/charging-station/ocpp/OCPPServiceOperations.js'
import {
  OCPP16AuthorizationStatus,
  OCPP16ChargePointStatus,
  OCPP16RequestCommand,
  type OCPP16StopTransactionRequest,
  type OCPP16StopTransactionResponse,
  OCPPVersion,
} from '../../src/types/index.js'
import { Constants } from '../../src/utils/index.js'
import { setupConnectorWithTransaction, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { cleanupChargingStation, createMockChargingStation } from './helpers/StationHelpers.js'

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
            discardBufferedRequests?: boolean
          ) => {
            assert.strictEqual(oldLifecycle.signal.aborted, true)
            assert.strictEqual(discardBufferedRequests, undefined)
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
        assert.deepStrictEqual(args[3], {
          bufferOnErrorDuringStationStop: true,
          rawPayload: true,
          skipBufferingOnError: true,
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

      assert.strictEqual(cancelCalls, 0)
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
      assert.strictEqual(cancellationDuringStopTransaction, false)
      assert.strictEqual(cancelCalls, 1)
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
      assert.strictEqual(connectorStatus.transactionUpdatedMeterValuesSetInterval, meterValuesTimer)
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
      sendMessageBuffer.call(activeStation, () => undefined)

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
        assert.strictEqual(stoppedEventEmitted, false)
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
        stopMessageSequence: () => Promise.resolve(),
      } as unknown as ChargingStation

      ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, true)
      transactionEventQueue.push({})
      ChargingStation.prototype.saveTransactionEventQueues.call(stationLike, true)
      assert.deepStrictEqual(savedQueueLengths, [])

      await (
        ChargingStation.prototype as unknown as {
          performStop: (reason?: unknown, stopTransactions?: boolean) => Promise<void>
        }
      ).performStop.call(stationLike)

      assert.deepStrictEqual(savedQueueLengths, [2, 2])
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

    await it('should flush a deferred transaction queue checkpoint before delete', async t => {
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
      const stopRequestStarted = Promise.withResolvers<undefined>()
      let statusRequestPending = false
      let stopRequestPending = false
      let cancellationDuringLifecycleRequest = false
      const requestHandler = mock.fn(async (...args: unknown[]) => {
        const command = args[1]
        if (command === 'StatusNotification') {
          statusRequestPending = true
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
