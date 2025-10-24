/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  type OCPP20ResetRequest,
  type OCPP20ResetResponse,
  ReasonCodeEnumType,
  ResetEnumType,
  ResetStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStationWithEvses } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_NAME } from './OCPP20TestConstants.js'

await describe('B11 & B12 - Reset', async () => {
  const mockChargingStation = createChargingStationWithEvses({
    baseName: TEST_CHARGING_STATION_NAME,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      ocppStrictCompliance: false,
      resetTime: 5000,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  // Add missing method to mock
  ;(mockChargingStation as any).getNumberOfRunningTransactions = () => 0
  ;(mockChargingStation as any).reset = () => Promise.resolve()

  const incomingRequestService = new OCPP20IncomingRequestService()

  await describe('B11 - Reset - Without Ongoing Transaction', async () => {
    await it('B11.FR.01 - Should handle Reset request with Immediate type when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

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

    await it('B11.FR.01 - Should handle Reset request with OnIdle type when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect([
        ResetStatusEnumType.Accepted,
        ResetStatusEnumType.Rejected,
        ResetStatusEnumType.Scheduled,
      ]).toContain(response.status)
    })

    await it('B11.FR.03+ - Should handle EVSE-specific reset request when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect([
        ResetStatusEnumType.Accepted,
        ResetStatusEnumType.Rejected,
        ResetStatusEnumType.Scheduled,
      ]).toContain(response.status)
    })

    await it('B11.FR.03+ - Should reject reset for non-existent EVSE when no transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 999, // Non-existent EVSE
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnknownEvse)
      expect(response.statusInfo?.additionalInfo).toContain('EVSE 999')
    })

    await it('B11.FR.01+ - Should return proper response structure for immediate reset without transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect(typeof response.status).toBe('string')

      // For immediate reset without active transactions, should be accepted
      if (mockChargingStation.getNumberOfRunningTransactions() === 0) {
        expect(response.status).toBe(ResetStatusEnumType.Accepted)
      }
    })

    await it('B11.FR.01+ - Should return proper response structure for OnIdle reset without transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted)
    })

    await it('B11.FR.03+ - Should reject EVSE reset when not supported and no transactions', async () => {
      // Mock charging station without EVSE support
      const originalHasEvses = mockChargingStation.hasEvses
      ;(mockChargingStation as any).hasEvses = false

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedRequest)
      expect(response.statusInfo?.additionalInfo).toContain(
        'does not support resetting individual EVSE'
      )

      // Restore original state
      ;(mockChargingStation as any).hasEvses = originalHasEvses
    })

    await it('B11.FR.03+ - Should handle EVSE-specific reset without transactions', async () => {
      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.NoError)
      expect(response.statusInfo?.additionalInfo).toContain('EVSE 1 reset initiated')
    })
  })

  await describe('B12 - Reset - With Ongoing Transaction', async () => {
    await it('B12.FR.02 - Should handle immediate reset with active transactions', async () => {
      // Mock active transactions
      ;(mockChargingStation as any).getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Accepted) // Should accept immediate reset
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.NoError)
      expect(response.statusInfo?.additionalInfo).toContain(
        'active transactions will be terminated'
      )

      // Reset mock
      ;(mockChargingStation as any).getNumberOfRunningTransactions = () => 0
    })

    await it('B12.FR.01 - Should handle OnIdle reset with active transactions', async () => {
      // Mock active transactions
      ;(mockChargingStation as any).getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        type: ResetEnumType.OnIdle,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Scheduled) // Should schedule OnIdle reset
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.NoError)
      expect(response.statusInfo?.additionalInfo).toContain(
        'scheduled after all transactions complete'
      )

      // Reset mock
      ;(mockChargingStation as any).getNumberOfRunningTransactions = () => 0
    })

    await it('B12.FR.03+ - Should handle EVSE-specific reset with active transactions', async () => {
      // Mock active transactions
      ;(mockChargingStation as any).getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

      expect(response).toBeDefined()
      expect(response.status).toBeDefined()
      expect([ResetStatusEnumType.Accepted, ResetStatusEnumType.Scheduled]).toContain(
        response.status
      )

      // Reset mock
      ;(mockChargingStation as any).getNumberOfRunningTransactions = () => 0
    })

    await it('B12.FR.03+ - Should reject EVSE reset when not supported with active transactions', async () => {
      // Mock charging station without EVSE support and active transactions
      const originalHasEvses = mockChargingStation.hasEvses
      ;(mockChargingStation as any).hasEvses = false
      ;(mockChargingStation as any).getNumberOfRunningTransactions = () => 1

      const resetRequest: OCPP20ResetRequest = {
        evseId: 1,
        type: ResetEnumType.Immediate,
      }

      const response: OCPP20ResetResponse = await (
        incomingRequestService as any
      ).handleRequestReset(mockChargingStation, resetRequest)

      expect(response).toBeDefined()
      expect(response.status).toBe(ResetStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedRequest)
      expect(response.statusInfo?.additionalInfo).toContain(
        'does not support resetting individual EVSE'
      )

      // Restore original state
      ;(mockChargingStation as any).hasEvses = originalHasEvses
      ;(mockChargingStation as any).getNumberOfRunningTransactions = () => 0
    })
  })
})
