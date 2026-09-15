/**
 * @file Tests for OCPP20IncomingRequestService Reset
 * @description Unit tests for OCPP 2.0 Reset command handling (B11/B12)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type {
  OCPP20ResetRequest,
  OCPP20ResetResponse,
  Reservation,
} from '../../../../src/types/index.js'
import type { MockChargingStation } from '../../helpers/StationHelpers.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { VARIABLE_REGISTRY } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableRegistry.js'
import {
  FirmwareStatus,
  OCPP20ComponentName,
  OCPP20IncomingRequestCommand,
  ReasonCodeEnumType,
  ResetEnumType,
  ResetStatusEnumType,
} from '../../../../src/types/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_ONE_HOUR_MS } from '../../ChargingStationTestConstants.js'
import { ResetTestFixtures } from './OCPP20TestUtils.js'

await describe('B11 & B12 - Reset', async () => {
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('B11 - Reset - Without Ongoing Transaction', async () => {
    let mockStation: MockChargingStation

    beforeEach(() => {
      mockStation = ResetTestFixtures.createStandardStation()
    })

    // FR: B11.FR.03
    await it('should handle EVSE-specific reset request when no transactions', () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      assert.notStrictEqual(response, undefined)
      assert.notStrictEqual(response.status, undefined)
      assert.ok(
        [
          ResetStatusEnumType.Accepted,
          ResetStatusEnumType.Rejected,
          ResetStatusEnumType.Scheduled,
        ].includes(response.status)
      )
    })

    await it('should send the Reset response before starting the station reset', async () => {
      mockStation.started = true
      mockStation.inAcceptedState = () => true
      mockStation.recordRequestStatistic = () => undefined
      const callOrder: string[] = []
      const reset = mock.method(mockStation, 'reset', () => {
        callOrder.push('reset')
        return Promise.resolve()
      })
      const sendResponse = mock.method(
        mockStation.ocppRequestService,
        'sendResponse',
        (...args: unknown[]) => {
          callOrder.push('response')
          const requestParams = args[4] as undefined | { onMessageSent?: () => void }
          requestParams?.onMessageSent?.()
          return Promise.resolve()
        }
      )

      await incomingRequestService.incomingRequestHandler(
        mockStation,
        'reset-response-before-stop',
        OCPP20IncomingRequestCommand.RESET,
        { type: ResetEnumType.Immediate }
      )

      assert.strictEqual(sendResponse.mock.callCount(), 1)
      assert.strictEqual(reset.mock.callCount(), 1)
      assert.deepStrictEqual(callOrder, ['response', 'reset'])
    })

    await it('should resolve reset-created async work against the replacement lifecycle', async () => {
      const stationLifecycle = mockStation as unknown as {
        lifecycleAbortController: AbortController
      }
      const stationStates = incomingRequestService as unknown as {
        stationsState: WeakMap<object, { certSigningRetryManager?: unknown; stopped?: boolean }>
      }
      stationLifecycle.lifecycleAbortController = new AbortController()
      Object.defineProperty(mockStation, 'lifecycleAbortSignal', {
        configurable: true,
        get: () => stationLifecycle.lifecycleAbortController.signal,
      })
      mockStation.started = true
      mockStation.inAcceptedState = () => true
      mockStation.recordRequestStatistic = () => undefined
      const resetFinished = Promise.withResolvers<undefined>()
      let oldState: undefined | { certSigningRetryManager?: unknown; stopped?: boolean }
      let freshState: undefined | { certSigningRetryManager?: unknown; stopped?: boolean }
      let retryManager: unknown
      mock.method(mockStation, 'reset', async () => {
        oldState = stationStates.stationsState.get(mockStation)
        incomingRequestService.stop(mockStation)
        stationLifecycle.lifecycleAbortController.abort()
        stationLifecycle.lifecycleAbortController = new AbortController()
        incomingRequestService.activate(
          mockStation,
          stationLifecycle.lifecycleAbortController.signal
        )
        freshState = stationStates.stationsState.get(mockStation)
        await Promise.resolve()
        retryManager = incomingRequestService.getCertSigningRetryManager(mockStation)
        resetFinished.resolve(undefined)
      })
      mock.method(mockStation.ocppRequestService, 'sendResponse', (...args: unknown[]) => {
        const requestParams = args[4] as undefined | { onMessageSent?: () => void }
        requestParams?.onMessageSent?.()
        return Promise.resolve()
      })

      await incomingRequestService.incomingRequestHandler(
        mockStation,
        'reset-context-exit',
        OCPP20IncomingRequestCommand.RESET,
        { type: ResetEnumType.Immediate }
      )
      await resetFinished.promise

      assert.ok(oldState != null)
      assert.ok(freshState != null)
      assert.notStrictEqual(freshState, oldState)
      assert.strictEqual(oldState.stopped, true)
      assert.notStrictEqual(retryManager, undefined)
      assert.strictEqual(freshState.certSigningRetryManager, retryManager)
      assert.strictEqual(oldState.certSigningRetryManager, undefined)
    })

    for (const scope of ['evse', 'station'] as const) {
      for (const type of [ResetEnumType.Immediate, ResetEnumType.OnIdle] as const) {
        await it(`should re-evaluate a ${scope} ${type} reset when a transaction starts before response delivery`, async () => {
          const responseStarted = Promise.withResolvers<undefined>()
          const releaseResponse = Promise.withResolvers<undefined>()
          let responseCallbacks: undefined | { onMessageSent?: () => void }
          let responseStatus: ResetStatusEnumType | undefined
          mockStation.started = true
          mockStation.inAcceptedState = () => true
          mockStation.recordRequestStatistic = () => undefined
          mock.method(
            mockStation.ocppRequestService,
            'sendResponse',
            (...args: unknown[]): Promise<void> => {
              responseStatus = (args[2] as OCPP20ResetResponse).status
              responseCallbacks = args[4] as typeof responseCallbacks
              responseStarted.resolve(undefined)
              return releaseResponse.promise
            }
          )
          const resetActions = incomingRequestService as unknown as {
            scheduleEvseReset: (...args: unknown[]) => void
            scheduleEvseResetOnIdle: (...args: unknown[]) => void
            scheduleResetOnIdle: (...args: unknown[]) => void
            terminateAllTransactions: (...args: unknown[]) => Promise<void>
            terminateEvseTransactions: (...args: unknown[]) => Promise<void>
          }
          const scheduleEvseReset = mock.method(resetActions, 'scheduleEvseReset', () => undefined)
          const scheduleEvseResetOnIdle = mock.method(
            resetActions,
            'scheduleEvseResetOnIdle',
            () => undefined
          )
          const scheduleResetOnIdle = mock.method(
            resetActions,
            'scheduleResetOnIdle',
            () => undefined
          )
          const terminateAllTransactions = mock.method(
            resetActions,
            'terminateAllTransactions',
            () => Promise.resolve()
          )
          const terminateEvseTransactions = mock.method(
            resetActions,
            'terminateEvseTransactions',
            () => Promise.resolve()
          )
          const reset = mock.method(mockStation, 'reset', () => Promise.resolve())
          const request: OCPP20ResetRequest = {
            ...(scope === 'evse' && { evseId: 1 }),
            type,
          }

          const handling = incomingRequestService.incomingRequestHandler(
            mockStation,
            `delayed-${scope}-${type}`,
            OCPP20IncomingRequestCommand.RESET,
            request
          )
          await responseStarted.promise
          setupConnectorWithTransaction(mockStation, 1, { transactionId: 'delayed-reset-tx' })
          if (scope === 'station') mockStation.getNumberOfRunningTransactions = () => 1
          responseCallbacks?.onMessageSent?.()
          releaseResponse.resolve(undefined)
          await handling
          await flushMicrotasks()

          assert.strictEqual(responseStatus, ResetStatusEnumType.Accepted)
          if (type === ResetEnumType.Immediate) {
            assert.strictEqual(terminateEvseTransactions.mock.callCount(), scope === 'evse' ? 1 : 0)
            assert.strictEqual(
              terminateAllTransactions.mock.callCount(),
              scope === 'station' ? 1 : 0
            )
            assert.strictEqual(scheduleEvseReset.mock.callCount(), scope === 'evse' ? 1 : 0)
            assert.strictEqual(reset.mock.callCount(), scope === 'station' ? 1 : 0)
          } else {
            assert.strictEqual(scheduleEvseResetOnIdle.mock.callCount(), scope === 'evse' ? 1 : 0)
            assert.strictEqual(scheduleResetOnIdle.mock.callCount(), scope === 'station' ? 1 : 0)
            assert.strictEqual(reset.mock.callCount(), 0)
          }
        })
      }
    }

    await it('should discard a Reset action when its response settles in a newer lifecycle', async () => {
      const responseStarted = Promise.withResolvers<undefined>()
      const releaseResponse = Promise.withResolvers<undefined>()
      const stationLifecycle = mockStation as unknown as {
        lifecycleAbortController: AbortController
      }
      stationLifecycle.lifecycleAbortController = new AbortController()
      Object.defineProperty(mockStation, 'lifecycleAbortSignal', {
        configurable: true,
        get: () => stationLifecycle.lifecycleAbortController.signal,
      })
      mockStation.started = true
      mockStation.inAcceptedState = () => true
      mockStation.recordRequestStatistic = () => undefined
      const reset = mock.method(mockStation, 'reset', () => Promise.resolve())
      mock.method(mockStation.ocppRequestService, 'sendResponse', () => {
        responseStarted.resolve(undefined)
        return releaseResponse.promise
      })

      const handling = incomingRequestService.incomingRequestHandler(
        mockStation,
        'stale-reset-response',
        OCPP20IncomingRequestCommand.RESET,
        { type: ResetEnumType.Immediate }
      )
      await responseStarted.promise
      stationLifecycle.lifecycleAbortController.abort()
      stationLifecycle.lifecycleAbortController = new AbortController()
      releaseResponse.resolve(undefined)
      await handling

      assert.strictEqual(reset.mock.callCount(), 0)
    })

    await it('should reject reset for non-existent EVSE when no transactions', () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 999, // Non-existent EVSE
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, ResetStatusEnumType.Rejected)
      if (response.statusInfo == null) {
        assert.fail('Expected statusInfo to be defined')
      }
      assert.strictEqual(response.statusInfo.reasonCode, ReasonCodeEnumType.UnknownEvse)
      if (response.statusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.ok(response.statusInfo.additionalInfo.includes('EVSE 999'))
    })

    // FR: B11.FR.01
    await it('should return proper response structure for immediate reset without transactions', () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      assert.notStrictEqual(response, undefined)
      assert.notStrictEqual(response.status, undefined)
      assert.strictEqual(typeof response.status, 'string')

      // B11.FR.02: Immediate reset without transactions returns Accepted
      if (mockStation.getNumberOfRunningTransactions() === 0) {
        assert.strictEqual(response.status, ResetStatusEnumType.Accepted)
      }
    })

    await it('should return proper response structure for OnIdle reset without transactions', () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, ResetStatusEnumType.Accepted)
    })

    await it('should reject EVSE-specific reset when EVSEs not supported (non-EVSE mode)', () => {
      // Station configured without EVSE support
      Object.defineProperty(mockStation, 'hasEvses', {
        configurable: true,
        value: false,
        writable: true,
      })

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, ResetStatusEnumType.Rejected)
      if (response.statusInfo == null) {
        assert.fail('Expected statusInfo to be defined')
      }
      assert.strictEqual(response.statusInfo.reasonCode, ReasonCodeEnumType.UnsupportedRequest)
      if (response.statusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.ok(
        response.statusInfo.additionalInfo.includes('does not support resetting individual EVSE')
      )

      // Restore EVSE support
      Object.defineProperty(mockStation, 'hasEvses', {
        configurable: true,
        value: true,
        writable: true,
      })
    })

    await it('should handle EVSE-specific reset without transactions', () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, ResetStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })
  })

  await describe('B12 - Reset - With Ongoing Transaction', async () => {
    let mockStation: MockChargingStation

    beforeEach(() => {
      // Station uses ResetTestFixtures.createStandardStation() with 0 transactions by default
      mockStation = ResetTestFixtures.createStandardStation()
    })

    // FR: B12.FR.02
    await it('should handle immediate reset with active transactions', () => {
      // Set active transaction count to 1
      mockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, ResetStatusEnumType.Accepted) // Should accept immediate reset
      assert.strictEqual(response.statusInfo, undefined)
    })
    // FR: B12.FR.01
    await it('should handle OnIdle reset with active transactions', () => {
      // Set active transaction count to 1
      mockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, ResetStatusEnumType.Scheduled) // Should schedule OnIdle reset
      assert.strictEqual(response.statusInfo, undefined)
    })

    // FR: B12.FR.03
    await it('should handle EVSE-specific reset with active transactions', () => {
      // Set active transaction count to 1
      mockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      assert.notStrictEqual(response, undefined)
      assert.notStrictEqual(response.status, undefined)
      assert.ok(
        [ResetStatusEnumType.Accepted, ResetStatusEnumType.Scheduled].includes(response.status)
      )
    })

    await it('should reject EVSE reset when not supported with active transactions', () => {
      // Station configured without EVSE support and active transactions
      Object.defineProperty(mockStation, 'hasEvses', {
        configurable: true,
        value: false,
        writable: true,
      })
      mockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, ResetStatusEnumType.Rejected)
      if (response.statusInfo == null) {
        assert.fail('Expected statusInfo to be defined')
      }
      assert.strictEqual(response.statusInfo.reasonCode, ReasonCodeEnumType.UnsupportedRequest)
      if (response.statusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.ok(
        response.statusInfo.additionalInfo.includes('does not support resetting individual EVSE')
      )

      // Restore EVSE support
      Object.defineProperty(mockStation, 'hasEvses', {
        configurable: false,
        value: true,
        writable: false,
      })
    })

    // FR: B12.FR.04 - OnIdle considers firmware updates and reservations per OCPP 2.0.1 Errata 2.14
    await describe('RST-001 - Reset OnIdle Errata 2.14 Compliance', async () => {
      // Factory function for test station
      const createTestStation = (): MockChargingStation => {
        return ResetTestFixtures.createStandardStation()
      }

      await describe('Firmware Update Blocking', async () => {
        // FR: B12.FR.04.01 - Station NOT idle during firmware operations

        await it('should return Rejected/FwUpdateInProgress when firmware is Downloading', () => {
          const station = createTestStation()
          // Firmware check runs before OnIdle idle-state logic — always returns Rejected
          if (station.stationInfo == null) {
            throw new Error('Expected stationInfo to be defined')
          }
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Downloading,
          })

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = testableService.handleRequestReset(
            station,
            resetRequest
          )

          assert.notStrictEqual(response, undefined)
          assert.strictEqual(response.status, ResetStatusEnumType.Rejected)
          assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.FwUpdateInProgress)
        })

        await it('should return Rejected/FwUpdateInProgress when firmware is Downloaded', () => {
          const station = createTestStation()
          // Firmware check runs before OnIdle idle-state logic — always returns Rejected
          if (station.stationInfo == null) {
            throw new Error('Expected stationInfo to be defined')
          }
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Downloaded,
          })

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = testableService.handleRequestReset(
            station,
            resetRequest
          )

          assert.notStrictEqual(response, undefined)
          assert.strictEqual(response.status, ResetStatusEnumType.Rejected)
          assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.FwUpdateInProgress)
        })

        await it('should return Rejected/FwUpdateInProgress when firmware is Installing', () => {
          const station = createTestStation()
          // Firmware check runs before OnIdle idle-state logic — always returns Rejected
          if (station.stationInfo == null) {
            throw new Error('Expected stationInfo to be defined')
          }
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Installing,
          })

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = testableService.handleRequestReset(
            station,
            resetRequest
          )

          assert.notStrictEqual(response, undefined)
          assert.strictEqual(response.status, ResetStatusEnumType.Rejected)
          assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.FwUpdateInProgress)
        })

        await it('should return Accepted when firmware is Installed (complete)', () => {
          const station = createTestStation()
          // Firmware status: Installed (complete)
          if (station.stationInfo == null) {
            throw new Error('Expected stationInfo to be defined')
          }
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Installed,
          })

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = testableService.handleRequestReset(
            station,
            resetRequest
          )

          assert.notStrictEqual(response, undefined)
          assert.strictEqual(response.status, ResetStatusEnumType.Accepted)
        })

        await it('should return Accepted when firmware status is Idle', () => {
          const station = createTestStation()
          // Firmware status: Idle
          if (station.stationInfo == null) {
            throw new Error('Expected stationInfo to be defined')
          }
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Idle,
          })

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = testableService.handleRequestReset(
            station,
            resetRequest
          )

          assert.notStrictEqual(response, undefined)
          assert.strictEqual(response.status, ResetStatusEnumType.Accepted)
        })
      })

      await describe('Reservation Blocking', async () => {
        // FR: B12.FR.04.02 - Station NOT idle with non-expired reservations

        await it('should return Scheduled when connector has non-expired reservation', () => {
          const station = createTestStation()
          // Non-expired reservation (expires in 1 hour)
          const futureExpiryDate = new Date(Date.now() + TEST_ONE_HOUR_MS)
          const mockReservation: Partial<Reservation> = {
            expiryDate: futureExpiryDate,
            id: 1,
            idTag: 'test-tag',
          }

          // Assign reservation to first connector
          const connectorId = station.getConnectorIdByEvseId(1)
          const connectorStatus =
            connectorId != null ? station.getConnectorStatus(connectorId) : undefined
          if (connectorStatus != null) {
            connectorStatus.reservation = mockReservation as Reservation
          }

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = testableService.handleRequestReset(
            station,
            resetRequest
          )

          assert.notStrictEqual(response, undefined)
          assert.strictEqual(response.status, ResetStatusEnumType.Scheduled)
        })

        await it('should return Accepted when reservation is expired', () => {
          const station = createTestStation()
          // Expired reservation (1 hour ago)
          const pastExpiryDate = new Date(Date.now() - TEST_ONE_HOUR_MS)
          const mockReservation: Partial<Reservation> = {
            expiryDate: pastExpiryDate,
            id: 1,
            idTag: 'test-tag',
          }

          // Assign expired reservation to first connector
          const connectorId = station.getConnectorIdByEvseId(1)
          const connectorStatus =
            connectorId != null ? station.getConnectorStatus(connectorId) : undefined
          if (connectorStatus != null) {
            connectorStatus.reservation = mockReservation as Reservation
          }

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = testableService.handleRequestReset(
            station,
            resetRequest
          )

          assert.notStrictEqual(response, undefined)
          // Expired reservation does not block idle state
          assert.strictEqual(response.status, ResetStatusEnumType.Accepted)
        })

        await it('should return Accepted when no reservations exist', () => {
          const station = createTestStation()
          // No reservations (default)

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = testableService.handleRequestReset(
            station,
            resetRequest
          )

          assert.notStrictEqual(response, undefined)
          assert.strictEqual(response.status, ResetStatusEnumType.Accepted)
        })
      })

      await describe('Idle Condition', async () => {
        // FR: B12.FR.04.03 - True idle: no transactions, no firmware update, no reservations

        await it('should return Accepted when all conditions clear (true idle state)', () => {
          const station = createTestStation()
          // No transactions
          station.getNumberOfRunningTransactions = () => 0
          // No firmware update
          if (station.stationInfo == null) {
            throw new Error('Expected stationInfo to be defined')
          }
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Idle,
          })
          // No reservations (default)

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = testableService.handleRequestReset(
            station,
            resetRequest
          )

          assert.notStrictEqual(response, undefined)
          assert.strictEqual(response.status, ResetStatusEnumType.Accepted)
        })

        await it('should return Scheduled when multiple blocking conditions exist', () => {
          const station = createTestStation()
          // Transaction active
          station.getNumberOfRunningTransactions = () => 1
          // Non-expired reservation
          const futureExpiryDate = new Date(Date.now() + TEST_ONE_HOUR_MS)
          const mockReservation: Partial<Reservation> = {
            expiryDate: futureExpiryDate,
            id: 1,
            idTag: 'test-tag',
          }
          const connectorId = station.getConnectorIdByEvseId(1)
          const connectorStatus =
            connectorId != null ? station.getConnectorStatus(connectorId) : undefined
          if (connectorStatus != null) {
            connectorStatus.reservation = mockReservation as Reservation
          }

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = testableService.handleRequestReset(
            station,
            resetRequest
          )

          assert.notStrictEqual(response, undefined)
          assert.strictEqual(response.status, ResetStatusEnumType.Scheduled)
        })
      })
    })
  })

  await describe('AllowReset variable checks', async () => {
    const ALLOW_RESET_KEY = `${OCPP20ComponentName.EVSE as string}::AllowReset`
    let savedDefaultValue: string | undefined

    beforeEach(() => {
      savedDefaultValue = VARIABLE_REGISTRY[ALLOW_RESET_KEY].defaultValue
    })

    afterEach(() => {
      VARIABLE_REGISTRY[ALLOW_RESET_KEY].defaultValue = savedDefaultValue
    })

    await it('should reject with NotEnabled when AllowReset is false', () => {
      const station = ResetTestFixtures.createStandardStation()
      VARIABLE_REGISTRY[ALLOW_RESET_KEY].defaultValue = 'false'
      const request: OCPP20ResetRequest = { type: ResetEnumType.Immediate }
      const response = testableService.handleRequestReset(station, request)
      assert.strictEqual(response.status, ResetStatusEnumType.Rejected)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.NotEnabled)
    })

    await it('should proceed normally when AllowReset is true', () => {
      const station = ResetTestFixtures.createStandardStation()
      VARIABLE_REGISTRY[ALLOW_RESET_KEY].defaultValue = 'true'
      const request: OCPP20ResetRequest = { type: ResetEnumType.Immediate }
      const response = testableService.handleRequestReset(station, request)
      assert.strictEqual(response.status, ResetStatusEnumType.Accepted)
    })

    await it('should proceed normally when AllowReset defaultValue is undefined', () => {
      const station = ResetTestFixtures.createStandardStation()
      VARIABLE_REGISTRY[ALLOW_RESET_KEY].defaultValue = undefined
      const request: OCPP20ResetRequest = { type: ResetEnumType.Immediate }
      const response = testableService.handleRequestReset(station, request)
      assert.strictEqual(response.status, ResetStatusEnumType.Accepted)
    })
  })
})
