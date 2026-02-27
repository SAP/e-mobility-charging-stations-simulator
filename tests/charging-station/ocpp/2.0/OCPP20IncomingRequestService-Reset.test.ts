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
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'

await describe('B11 & B12 - Reset', async () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'setImmediate'] })
  })

  afterEach(() => {
    mock.timers.reset()
  })

  const mockChargingStation = createChargingStation({
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

  // Add missing method to mock using interface extension pattern
  interface MockChargingStation extends ChargingStation {
    getNumberOfRunningTransactions: () => number
    reset: () => Promise<void>
  }
  const mockStation = mockChargingStation as MockChargingStation
  mockStation.getNumberOfRunningTransactions = () => 0
  mockStation.reset = () => Promise.resolve()

  const incomingRequestService = new OCPP20IncomingRequestService()
  const testableService = createTestableIncomingRequestService(incomingRequestService)

  await describe('B11 - Reset - Without Ongoing Transaction', async () => {
    // FR: B11.FR.01
    await it('Should handle Reset request with Immediate type when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
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

    await it('Should handle Reset request with OnIdle type when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
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
    await it('Should handle EVSE-specific reset request when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
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

    await it('Should reject reset for non-existent EVSE when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 999, // Non-existent EVSE
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnknownEvse)
      expect(response.statusInfo?.additionalInfo).toContain('EVSE 999')
    })

    await it('Should return proper response structure for immediate reset without transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect(typeof response.status).toBe('string')

      // For immediate reset without active transactions, should be accepted
      if (mockStation.getNumberOfRunningTransactions() === 0) {
        expect(response.status).toBe(ResetStatusEnumType.Accepted)
      }
    })

    await it('Should return proper response structure for OnIdle reset without transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted)
    })

    await it('Should reject EVSE reset when not supported and no transactions', async () => {
      // Mock charging station without EVSE support
      const originalHasEvses = mockChargingStation.hasEvses
      ;(mockChargingStation as { hasEvses: boolean }).hasEvses = false

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
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
      ;(mockChargingStation as { hasEvses: boolean }).hasEvses = originalHasEvses
    })

    await it('Should handle EVSE-specific reset without transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })
  })

  await describe('B12 - Reset - With Ongoing Transaction', async () => {
    // FR: B12.FR.02
    await it('Should handle immediate reset with active transactions', async () => {
      // Mock active transactions
      mockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted) // Should accept immediate reset
      expect(response.statusInfo).toBeUndefined()

      // Reset mock
      mockStation.getNumberOfRunningTransactions = () => 0
    })

    // FR: B12.FR.01
    await it('Should handle OnIdle reset with active transactions', async () => {
      // Mock active transactions
      mockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Scheduled) // Should schedule OnIdle reset
      expect(response.statusInfo).toBeUndefined()

      // Reset mock
      mockStation.getNumberOfRunningTransactions = () => 0
    })

    // FR: B12.FR.03
    await it('Should handle EVSE-specific reset with active transactions', async () => {
      // Mock active transactions
      mockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect([ResetStatusEnumType.Accepted, ResetStatusEnumType.Scheduled]).toContain(
        response.status
      )

      // Reset mock
      mockStation.getNumberOfRunningTransactions = () => 0
    })

    await it('Should reject EVSE reset when not supported with active transactions', async () => {
      // Mock charging station without EVSE support and active transactions
      const originalHasEvses = mockChargingStation.hasEvses
      ;(mockChargingStation as { hasEvses: boolean }).hasEvses = false
      mockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockChargingStation,
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
      ;(mockChargingStation as { hasEvses: boolean }).hasEvses = originalHasEvses
      mockStation.getNumberOfRunningTransactions = () => 0
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
        const station = createChargingStation({
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

        await it('Should return Scheduled when firmware is Downloading', async () => {
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

        await it('Should return Scheduled when firmware is Downloaded', async () => {
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

        await it('Should return Scheduled when firmware is Installing', async () => {
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

        await it('Should return Accepted when firmware is Installed (complete)', async () => {
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

        await it('Should return Accepted when firmware status is Idle', async () => {
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

        await it('Should return Scheduled when connector has non-expired reservation', async () => {
          const station = createTestStation()
          // Create a reservation that expires in 1 hour (future)
          const futureExpiryDate = new Date(Date.now() + 3600000)
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

        await it('Should return Accepted when reservation is expired', async () => {
          const station = createTestStation()
          // Create a reservation that expired 1 hour ago (past)
          const pastExpiryDate = new Date(Date.now() - 3600000)
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

        await it('Should return Accepted when no reservations exist', async () => {
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

        await it('Should return Accepted when all conditions clear (true idle state)', async () => {
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

        await it('Should return Scheduled when multiple blocking conditions exist', async () => {
          const station = createTestStation()
          // Active transaction
          station.getNumberOfRunningTransactions = () => 1
          // Firmware downloading
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Downloading,
          })
          // Active reservation
          const futureExpiryDate = new Date(Date.now() + 3600000)
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
