/**
 * @file Tests for OCPP20IncomingRequestService Reset
 * @description Unit tests for OCPP 2.0 Reset command handling (B11/B12)
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  EvseStatus,
  OCPP20ResetRequest,
  OCPP20ResetResponse,
  Reservation,
} from '../../../../src/types/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  FirmwareStatus,
  OCPPVersion,
  ReasonCodeEnumType,
  ResetEnumType,
  ResetStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_ONE_HOUR_MS,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('B11 & B12 - Reset', async () => {
  let mockChargingStation: ChargingStation
  let mockStation: ChargingStation & {
    getNumberOfRunningTransactions: () => number
    reset: () => Promise<void>
  }
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'setImmediate'] })

    const { station } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
        resetTime: 5000,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    mockChargingStation = station

    // Add missing method to mock using interface extension pattern
    interface MockChargingStation extends ChargingStation {
      getNumberOfRunningTransactions: () => number
      reset: () => Promise<void>
    }
    mockStation = mockChargingStation as MockChargingStation
    mockStation.getNumberOfRunningTransactions = () => 0
    mockStation.reset = () => Promise.resolve()

    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  afterEach(() => {
    mock.timers.reset()
    standardCleanup()
  })

  await describe('B11 - Reset - Without Ongoing Transaction', async () => {
    let b11MockChargingStation: ChargingStation
    let b11MockStation: ChargingStation & {
      getNumberOfRunningTransactions: () => number
      reset: () => Promise<void>
    }

    beforeEach(() => {
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 3,
        evseConfiguration: { evsesCount: 3 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
          resetTime: 5000,
        },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })
      b11MockChargingStation = station

      interface MockChargingStation extends ChargingStation {
        getNumberOfRunningTransactions: () => number
        reset: () => Promise<void>
      }
      b11MockStation = b11MockChargingStation as MockChargingStation
      b11MockStation.getNumberOfRunningTransactions = () => 0
      b11MockStation.reset = () => Promise.resolve()
    })

    // FR: B11.FR.01
    await it('should handle Reset request with Immediate type when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b11MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')
      expect(response.status).toBeDefined()
      expect(typeof response.status).toBe('string')
      expect([
        ResetStatusEnumType.Accepted,
        ResetStatusEnumType.Rejected,
        ResetStatusEnumType.Scheduled,
      ]).toContain(response.status)
    })

    await it('should handle Reset request with OnIdle type when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b11MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect([
        ResetStatusEnumType.Accepted,
        ResetStatusEnumType.Rejected,
        ResetStatusEnumType.Scheduled,
      ]).toContain(response.status)
    })

    // FR: B11.FR.03
    await it('should handle EVSE-specific reset request when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b11MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect([
        ResetStatusEnumType.Accepted,
        ResetStatusEnumType.Rejected,
        ResetStatusEnumType.Scheduled,
      ]).toContain(response.status)
    })

    await it('should reject reset for non-existent EVSE when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 999, // Non-existent EVSE
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b11MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnknownEvse)
      expect(response.statusInfo?.additionalInfo).toContain('EVSE 999')
    })

    await it('should return proper response structure for immediate reset without transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b11MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect(typeof response.status).toBe('string')

      // For immediate reset without active transactions, should be accepted
      if (b11MockStation.getNumberOfRunningTransactions() === 0) {
        expect(response.status).toBe(ResetStatusEnumType.Accepted)
      }
    })

    await it('should return proper response structure for OnIdle reset without transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b11MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted)
    })

    await it('should reject EVSE-specific reset when EVSEs not supported (non-EVSE mode)', async () => {
      // Mock charging station without EVSE support
      Object.defineProperty(b11MockChargingStation, 'hasEvses', {
        configurable: true,
        value: false,
        writable: true,
      })

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b11MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedRequest)
      expect(response.statusInfo?.additionalInfo).toContain(
        'does not support resetting individual EVSE'
      )

      // Restore original state
      Object.defineProperty(b11MockChargingStation, 'hasEvses', {
        configurable: true,
        value: true,
        writable: true,
      })
    })

    await it('should handle EVSE-specific reset without transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b11MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })
  })

  await describe('B12 - Reset - With Ongoing Transaction', async () => {
    let b12MockChargingStation: ChargingStation
    let b12MockStation: ChargingStation & {
      getNumberOfRunningTransactions: () => number
      reset: () => Promise<void>
    }

    beforeEach(() => {
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 3,
        evseConfiguration: { evsesCount: 3 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
          resetTime: 5000,
        },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })
      b12MockChargingStation = station

      interface MockChargingStation extends ChargingStation {
        getNumberOfRunningTransactions: () => number
        reset: () => Promise<void>
      }
      b12MockStation = b12MockChargingStation as MockChargingStation
      b12MockStation.getNumberOfRunningTransactions = () => 0
      b12MockStation.reset = () => Promise.resolve()
    })

    // FR: B12.FR.02
    await it('should handle immediate reset with active transactions', async () => {
      // Mock active transactions
      b12MockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b12MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted) // Should accept immediate reset
      expect(response.statusInfo).toBeUndefined()
    })
    // FR: B12.FR.01
    await it('should handle OnIdle reset with active transactions', async () => {
      // Mock active transactions
      b12MockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b12MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Scheduled) // Should schedule OnIdle reset
      expect(response.statusInfo).toBeUndefined()
    })

    // FR: B12.FR.03
    await it('should handle EVSE-specific reset with active transactions', async () => {
      // Mock active transactions
      b12MockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b12MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect([ResetStatusEnumType.Accepted, ResetStatusEnumType.Scheduled]).toContain(
        response.status
      )
    })

    await it('should reject EVSE reset when not supported with active transactions', async () => {
      // Mock charging station without EVSE support and active transactions
      Object.defineProperty(b12MockChargingStation, 'hasEvses', {
        configurable: true,
        value: false,
        writable: true,
      })
      b12MockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        b12MockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedRequest)
      expect(response.statusInfo?.additionalInfo).toContain(
        'does not support resetting individual EVSE'
      )

      // Restore original state
      Object.defineProperty(b12MockChargingStation, 'hasEvses', {
        configurable: false,
        value: true,
        writable: false,
      })
    })

    // RST-001: Reset OnIdle Errata 2.14 Compliance Tests
    // These tests verify that OnIdle correctly considers firmware updates and reservations
    // in addition to active transactions, per OCPP 2.0.1 Errata 2.14.
    await describe('RST-001 - Reset OnIdle Errata 2.14 Compliance', async () => {
      // Create a separate charging station for RST-001 tests with clean state
      interface TestStation extends ChargingStation {
        getNumberOfRunningTransactions: () => number
        reset: () => Promise<void>
      }

      const createTestStation = (): TestStation => {
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 3,
          evseConfiguration: { evsesCount: 3 },
          heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
          stationInfo: {
            ocppStrictCompliance: false,
            ocppVersion: OCPPVersion.VERSION_201,
            resetTime: 5000,
          },
          websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
        })
        // Add required methods
        const testStation = station as TestStation
        testStation.getNumberOfRunningTransactions = () => 0
        testStation.reset = () => Promise.resolve()
        return testStation
      }

      await describe('Firmware Update Blocking', async () => {
        // Errata 2.14: OnIdle definition includes firmware updates
        // Charging station is NOT idle when firmware is Downloading, Downloaded, or Installing

        await it('should return Scheduled when firmware is Downloading', async () => {
          const station = createTestStation()
          // Mock firmware status as Downloading
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Downloading,
          })

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = await testableService.handleRequestReset(
            station,
            resetRequest
          )

          expect(response).toBeDefined()
          expect(response.status).toBe(ResetStatusEnumType.Scheduled)
        })

        await it('should return Scheduled when firmware is Downloaded', async () => {
          const station = createTestStation()
          // Mock firmware status as Downloaded (waiting to install)
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Downloaded,
          })

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = await testableService.handleRequestReset(
            station,
            resetRequest
          )

          expect(response).toBeDefined()
          expect(response.status).toBe(ResetStatusEnumType.Scheduled)
        })

        await it('should return Scheduled when firmware is Installing', async () => {
          const station = createTestStation()
          // Mock firmware status as Installing
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Installing,
          })

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = await testableService.handleRequestReset(
            station,
            resetRequest
          )

          expect(response).toBeDefined()
          expect(response.status).toBe(ResetStatusEnumType.Scheduled)
        })

        await it('should return Accepted when firmware is Installed (complete)', async () => {
          const station = createTestStation()
          // Mock firmware status as Installed (update complete)
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Installed,
          })

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = await testableService.handleRequestReset(
            station,
            resetRequest
          )

          expect(response).toBeDefined()
          expect(response.status).toBe(ResetStatusEnumType.Accepted)
        })

        await it('should return Accepted when firmware status is Idle', async () => {
          const station = createTestStation()
          // Mock firmware status as Idle (no update in progress)
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Idle,
          })

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = await testableService.handleRequestReset(
            station,
            resetRequest
          )

          expect(response).toBeDefined()
          expect(response.status).toBe(ResetStatusEnumType.Accepted)
        })
      })

      await describe('Reservation Blocking', async () => {
        // Errata 2.14: OnIdle definition includes pending reservations
        // Charging station is NOT idle when a connector has a non-expired reservation

        await it('should return Scheduled when connector has non-expired reservation', async () => {
          const station = createTestStation()
          // Create a reservation that expires in 1 hour (future)
          const futureExpiryDate = new Date(Date.now() + TEST_ONE_HOUR_MS)
          const mockReservation: Partial<Reservation> = {
            expiryDate: futureExpiryDate,
            id: 1,
            idTag: 'test-tag',
          }

          // Set reservation on first connector of first EVSE
          const evse: EvseStatus | undefined = station.evses.get(1)
          if (evse) {
            const connectorId = [...evse.connectors.keys()][0]
            const connector = evse.connectors.get(connectorId)
            if (connector) {
              connector.reservation = mockReservation as Reservation
            }
          }

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = await testableService.handleRequestReset(
            station,
            resetRequest
          )

          expect(response).toBeDefined()
          expect(response.status).toBe(ResetStatusEnumType.Scheduled)
        })

        await it('should return Accepted when reservation is expired', async () => {
          const station = createTestStation()
          // Create a reservation that expired 1 hour ago (past)
          const pastExpiryDate = new Date(Date.now() - TEST_ONE_HOUR_MS)
          const mockReservation: Partial<Reservation> = {
            expiryDate: pastExpiryDate,
            id: 1,
            idTag: 'test-tag',
          }

          // Set expired reservation on first connector of first EVSE
          const evse: EvseStatus | undefined = station.evses.get(1)
          if (evse) {
            const connectorId = [...evse.connectors.keys()][0]
            const connector = evse.connectors.get(connectorId)
            if (connector) {
              connector.reservation = mockReservation as Reservation
            }
          }

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = await testableService.handleRequestReset(
            station,
            resetRequest
          )

          expect(response).toBeDefined()
          // Station is idle because the reservation is expired
          expect(response.status).toBe(ResetStatusEnumType.Accepted)
        })

        await it('should return Accepted when no reservations exist', async () => {
          const station = createTestStation()
          // No reservations set (default state)

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = await testableService.handleRequestReset(
            station,
            resetRequest
          )

          expect(response).toBeDefined()
          expect(response.status).toBe(ResetStatusEnumType.Accepted)
        })
      })

      await describe('Idle Condition', async () => {
        // Errata 2.14: Station is idle when NO transactions, NO firmware update, NO reservations

        await it('should return Accepted when all conditions clear (true idle state)', async () => {
          const station = createTestStation()
          // Ensure no transactions
          station.getNumberOfRunningTransactions = () => 0
          // Ensure no firmware update in progress
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Idle,
          })
          // No reservations (default state)

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = await testableService.handleRequestReset(
            station,
            resetRequest
          )

          expect(response).toBeDefined()
          expect(response.status).toBe(ResetStatusEnumType.Accepted)
        })

        await it('should return Scheduled when multiple blocking conditions exist', async () => {
          const station = createTestStation()
          // Active transaction
          station.getNumberOfRunningTransactions = () => 1
          // Firmware downloading
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Downloading,
          })
          // Active reservation
          const futureExpiryDate = new Date(Date.now() + TEST_ONE_HOUR_MS)
          const mockReservation: Partial<Reservation> = {
            expiryDate: futureExpiryDate,
            id: 1,
            idTag: 'test-tag',
          }
          const evse: EvseStatus | undefined = station.evses.get(1)
          if (evse) {
            const connectorId = [...evse.connectors.keys()][0]
            const connector = evse.connectors.get(connectorId)
            if (connector) {
              connector.reservation = mockReservation as Reservation
            }
          }

          const resetRequest: OCPP20ResetRequest = {
            type: ResetEnumType.OnIdle,
          }

          const response: OCPP20ResetResponse = await testableService.handleRequestReset(
            station,
            resetRequest
          )

          expect(response).toBeDefined()
          expect(response.status).toBe(ResetStatusEnumType.Scheduled)
        })
      })
    })
  })
})
