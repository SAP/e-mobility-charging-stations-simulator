/**
 * @file Tests for OCPP20IncomingRequestService Reset
 * @description Unit tests for OCPP 2.0 Reset command handling (B11/B12)
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type {
  EvseStatus,
  OCPP20ResetRequest,
  OCPP20ResetResponse,
  Reservation,
} from '../../../../src/types/index.js'
import type { MockChargingStation } from '../../ChargingStationTestUtils.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  FirmwareStatus,
  ReasonCodeEnumType,
  ResetEnumType,
  ResetStatusEnumType,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
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

    // FR: B11.FR.01
    await it('should handle Reset request with Immediate type when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockStation,
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
        mockStation,
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
        mockStation,
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
        mockStation,
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
        mockStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect(typeof response.status).toBe('string')

      // B11.FR.02: Immediate reset without transactions returns Accepted
      if (mockStation.getNumberOfRunningTransactions() === 0) {
        expect(response.status).toBe(ResetStatusEnumType.Accepted)
      }
    })

    await it('should return proper response structure for OnIdle reset without transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted)
    })

    await it('should reject EVSE-specific reset when EVSEs not supported (non-EVSE mode)', async () => {
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

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedRequest)
      expect(response.statusInfo?.additionalInfo).toContain(
        'does not support resetting individual EVSE'
      )

      // Restore EVSE support
      Object.defineProperty(mockStation, 'hasEvses', {
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
        mockStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })
  })

  await describe('B12 - Reset - With Ongoing Transaction', async () => {
    let mockStation: MockChargingStation

    beforeEach(() => {
      // Station uses ResetTestFixtures.createStandardStation() with 0 transactions by default
      mockStation = ResetTestFixtures.createStandardStation()
    })

    // FR: B12.FR.02
    await it('should handle immediate reset with active transactions', async () => {
      // Set active transaction count to 1
      mockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted) // Should accept immediate reset
      expect(response.statusInfo).toBeUndefined()
    })
    // FR: B12.FR.01
    await it('should handle OnIdle reset with active transactions', async () => {
      // Set active transaction count to 1
      mockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Scheduled) // Should schedule OnIdle reset
      expect(response.statusInfo).toBeUndefined()
    })

    // FR: B12.FR.03
    await it('should handle EVSE-specific reset with active transactions', async () => {
      // Set active transaction count to 1
      mockStation.getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect([ResetStatusEnumType.Accepted, ResetStatusEnumType.Scheduled]).toContain(
        response.status
      )
    })

    await it('should reject EVSE reset when not supported with active transactions', async () => {
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

      const response: OCPP20ResetResponse = await testableService.handleRequestReset(
        mockStation,
        resetRequest
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedRequest)
      expect(response.statusInfo?.additionalInfo).toContain(
        'does not support resetting individual EVSE'
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

        await it('should return Scheduled when firmware is Downloading', async () => {
          const station = createTestStation()
          // Firmware status: Downloading
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
          // Firmware status: Downloaded
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
          // Firmware status: Installing
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
          // Firmware status: Installed (complete)
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
          // Firmware status: Idle
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
        // FR: B12.FR.04.02 - Station NOT idle with non-expired reservations

        await it('should return Scheduled when connector has non-expired reservation', async () => {
          const station = createTestStation()
          // Non-expired reservation (expires in 1 hour)
          const futureExpiryDate = new Date(Date.now() + TEST_ONE_HOUR_MS)
          const mockReservation: Partial<Reservation> = {
            expiryDate: futureExpiryDate,
            id: 1,
            idTag: 'test-tag',
          }

          // Assign reservation to first connector
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
          // Expired reservation (1 hour ago)
          const pastExpiryDate = new Date(Date.now() - TEST_ONE_HOUR_MS)
          const mockReservation: Partial<Reservation> = {
            expiryDate: pastExpiryDate,
            id: 1,
            idTag: 'test-tag',
          }

          // Assign expired reservation to first connector
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
          // Expired reservation does not block idle state
          expect(response.status).toBe(ResetStatusEnumType.Accepted)
        })

        await it('should return Accepted when no reservations exist', async () => {
          const station = createTestStation()
          // No reservations (default)

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
        // FR: B12.FR.04.03 - True idle: no transactions, no firmware update, no reservations

        await it('should return Accepted when all conditions clear (true idle state)', async () => {
          const station = createTestStation()
          // No transactions
          station.getNumberOfRunningTransactions = () => 0
          // No firmware update
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Idle,
          })
          // No reservations (default)

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
          // Transaction active
          station.getNumberOfRunningTransactions = () => 1
          // Firmware update in progress
          Object.assign(station.stationInfo, {
            firmwareStatus: FirmwareStatus.Downloading,
          })
          // Non-expired reservation
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
