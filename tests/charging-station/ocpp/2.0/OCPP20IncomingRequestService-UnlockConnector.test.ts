/**
 * @file Tests for OCPP20IncomingRequestService UnlockConnector
 * @description Unit tests for OCPP 2.0 UnlockConnector command handling (F05)
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type {
  OCPP20UnlockConnectorRequest,
  OCPP20UnlockConnectorResponse,
} from '../../../../src/types/index.js'
import type { MockChargingStation } from '../../ChargingStationTestUtils.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  OCPPVersion,
  ReasonCodeEnumType,
  UnlockStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

/**
 * Create a mock station suitable for UnlockConnector tests.
 * Provides 3 EVSEs each with 1 connector.
 * Mocks requestHandler to allow sendAndSetConnectorStatus to succeed
 * (sendAndSetConnectorStatus calls requestHandler internally for StatusNotification).
 * @returns The mock station and its request handler spy
 */
function createUnlockConnectorStation (): {
  mockStation: MockChargingStation
  requestHandlerMock: ReturnType<typeof mock.fn>
} {
  const requestHandlerMock = mock.fn(async () => Promise.resolve({}))
  const { station } = createMockChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    ocppRequestService: {
      requestHandler: requestHandlerMock,
    },
    stationInfo: {
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })
  return { mockStation: station as MockChargingStation, requestHandlerMock }
}

await describe('F05 - UnlockConnector', async () => {
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

  await describe('F05 - No-EVSE station errors', async () => {
    await it('should return UnknownConnector + UnsupportedRequest when station has no EVSEs', async () => {
      const { mockStation } = createUnlockConnectorStation()
      Object.defineProperty(mockStation, 'hasEvses', {
        configurable: true,
        value: false,
        writable: true,
      })

      const request: OCPP20UnlockConnectorRequest = { connectorId: 1, evseId: 1 }
      const response: OCPP20UnlockConnectorResponse =
        await testableService.handleRequestUnlockConnector(mockStation, request)

      expect(response.status).toBe(UnlockStatusEnumType.UnknownConnector)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnsupportedRequest)
      expect(response.statusInfo?.additionalInfo).toContain('does not support EVSEs')
    })
  })

  await describe('F05 - Unknown EVSE errors', async () => {
    await it('should return UnknownConnector + UnknownEvse for non-existent EVSE id', async () => {
      const { mockStation } = createUnlockConnectorStation()

      const request: OCPP20UnlockConnectorRequest = { connectorId: 1, evseId: 999 }
      const response: OCPP20UnlockConnectorResponse =
        await testableService.handleRequestUnlockConnector(mockStation, request)

      expect(response.status).toBe(UnlockStatusEnumType.UnknownConnector)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnknownEvse)
      expect(response.statusInfo?.additionalInfo).toContain('999')
    })
  })

  await describe('F05 - Unknown connector errors', async () => {
    await it('should return UnknownConnector + UnknownConnectorId for non-existent connector on EVSE', async () => {
      // With evsesCount:3 connectorsCount:3, EVSE 1 has connector 1 only
      const { mockStation } = createUnlockConnectorStation()

      const request: OCPP20UnlockConnectorRequest = { connectorId: 99, evseId: 1 }
      const response: OCPP20UnlockConnectorResponse =
        await testableService.handleRequestUnlockConnector(mockStation, request)

      expect(response.status).toBe(UnlockStatusEnumType.UnknownConnector)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.UnknownConnectorId)
      expect(response.statusInfo?.additionalInfo).toContain('99')
      expect(response.statusInfo?.additionalInfo).toContain('1')
    })
  })

  await describe('F05 - Ongoing transaction errors (F05.FR.02)', async () => {
    await it('should return OngoingAuthorizedTransaction when specified connector has active transaction', async () => {
      const { mockStation } = createUnlockConnectorStation()

      const evseStatus = mockStation.evses.get(1)
      const connector = evseStatus?.connectors.get(1)
      if (connector != null) {
        connector.transactionId = 'tx-001'
      }

      const request: OCPP20UnlockConnectorRequest = { connectorId: 1, evseId: 1 }
      const response: OCPP20UnlockConnectorResponse =
        await testableService.handleRequestUnlockConnector(mockStation, request)

      expect(response.status).toBe(UnlockStatusEnumType.OngoingAuthorizedTransaction)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.TxInProgress)
      expect(response.statusInfo?.additionalInfo).toContain('1')
    })

    await it('should return Unlocked when a different connector on the same EVSE has a transaction (F05.FR.02)', async () => {
      const requestHandlerMock = mock.fn(async () => Promise.resolve({}))
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 1 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        ocppRequestService: {
          requestHandler: requestHandlerMock,
        },
        stationInfo: {
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })
      const multiConnectorStation = station as MockChargingStation

      const evseStatus = multiConnectorStation.evses.get(1)
      const connector2 = evseStatus?.connectors.get(2)
      if (connector2 != null) {
        connector2.transactionId = 'tx-other'
      }

      const request: OCPP20UnlockConnectorRequest = { connectorId: 1, evseId: 1 }
      const response: OCPP20UnlockConnectorResponse =
        await testableService.handleRequestUnlockConnector(multiConnectorStation, request)

      expect(response.status).toBe(UnlockStatusEnumType.Unlocked)
    })
  })

  await describe('F05 - Happy path (unlock succeeds)', async () => {
    await it('should return Unlocked when EVSE and connector exist and no active transaction', async () => {
      const { mockStation } = createUnlockConnectorStation()

      const request: OCPP20UnlockConnectorRequest = { connectorId: 1, evseId: 1 }
      const response: OCPP20UnlockConnectorResponse =
        await testableService.handleRequestUnlockConnector(mockStation, request)

      expect(response.status).toBe(UnlockStatusEnumType.Unlocked)
      expect(response.statusInfo).toBeUndefined()
    })

    await it('should call requestHandler (StatusNotification) to set connector status Available after unlock', async () => {
      const { mockStation, requestHandlerMock } = createUnlockConnectorStation()

      const request: OCPP20UnlockConnectorRequest = { connectorId: 1, evseId: 1 }
      await testableService.handleRequestUnlockConnector(mockStation, request)

      // sendAndSetConnectorStatus calls requestHandler internally for StatusNotification
      expect(requestHandlerMock.mock.calls.length).toBeGreaterThan(0)
    })

    await it('should return a Promise from async handler', async () => {
      const { mockStation } = createUnlockConnectorStation()

      const request: OCPP20UnlockConnectorRequest = { connectorId: 1, evseId: 1 }

      const result = testableService.handleRequestUnlockConnector(mockStation, request)

      expect(typeof (result as unknown as Promise<unknown>).then).toBe('function')
      await result
    })
  })

  await describe('F05 - Response structure', async () => {
    await it('should return a plain object with a string status field', async () => {
      const { mockStation } = createUnlockConnectorStation()

      const request: OCPP20UnlockConnectorRequest = { connectorId: 1, evseId: 1 }
      const response = await testableService.handleRequestUnlockConnector(mockStation, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')
      expect(typeof response.status).toBe('string')
    })

    await it('should not include statusInfo on successful unlock', async () => {
      const { mockStation } = createUnlockConnectorStation()

      const request: OCPP20UnlockConnectorRequest = { connectorId: 1, evseId: 1 }
      const response = await testableService.handleRequestUnlockConnector(mockStation, request)

      expect(response.status).toBe(UnlockStatusEnumType.Unlocked)
      expect(response.statusInfo).toBeUndefined()
    })
  })
})
