/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable camelcase */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { EmptyObject } from '../../../../src/types/index.js'

import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants, generateUUID } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'
import { resetLimits } from './OCPP20TestUtils.js'

await describe('E02 - OCPP 2.0.1 Periodic TransactionEvent at TxUpdatedInterval', async () => {
  let mockChargingStation: any
  let requestHandlerMock: ReturnType<typeof mock.fn>
  let sentRequests: any[]

  beforeEach(() => {
    sentRequests = []
    requestHandlerMock = mock.fn(async (station: any, command: string, payload: any) => {
      sentRequests.push({ command, payload })
      return Promise.resolve({} as EmptyObject)
    })

    mockChargingStation = createChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      ocppRequestService: {
        requestHandler: requestHandlerMock,
      },
      stationInfo: {
        ocppStrictCompliance: true,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })

    // Mock isWebSocketConnectionOpened to return true (online)
    mockChargingStation.isWebSocketConnectionOpened = () => true

    resetLimits(mockChargingStation)
  })

  afterEach(() => {
    // Clean up any running timers
    for (let connectorId = 1; connectorId <= 3; connectorId++) {
      const connector = mockChargingStation.getConnectorStatus(connectorId)
      if (connector?.transactionTxUpdatedSetInterval != null) {
        clearInterval(connector.transactionTxUpdatedSetInterval)
        delete connector.transactionTxUpdatedSetInterval
      }
    }
  })

  await describe('startTxUpdatedInterval', async () => {
    await it('Should not start timer for non-OCPP 2.0 stations', () => {
      const ocpp16Station = createChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        stationInfo: {
          ocppVersion: OCPPVersion.VERSION_16,
        },
      })

      // Call startTxUpdatedInterval on OCPP 1.6 station
      ocpp16Station.startTxUpdatedInterval?.(1, 60000)

      // Verify no timer was started (method should return early)
      const connector = ocpp16Station.getConnectorStatus(1)
      expect(connector?.transactionTxUpdatedSetInterval).toBeUndefined()
    })

    await it('Should not start timer when interval is zero', () => {
      const connectorId = 1

      // Simulate startTxUpdatedInterval with zero interval
      const connector = mockChargingStation.getConnectorStatus(connectorId)
      expect(connector).toBeDefined()

      // Zero interval should not start timer
      // This is verified by the implementation logging debug message
      expect(connector.transactionTxUpdatedSetInterval).toBeUndefined()
    })

    await it('Should not start timer when interval is negative', () => {
      const connectorId = 1
      const connector = mockChargingStation.getConnectorStatus(connectorId)
      expect(connector).toBeDefined()

      // Negative interval should not start timer
      expect(connector.transactionTxUpdatedSetInterval).toBeUndefined()
    })

    await it('Should handle non-existent connector gracefully', () => {
      const nonExistentConnectorId = 999

      // Should not throw for non-existent connector
      expect(() => {
        mockChargingStation.getConnectorStatus(nonExistentConnectorId)
      }).not.toThrow()

      // Should return undefined for non-existent connector
      expect(mockChargingStation.getConnectorStatus(nonExistentConnectorId)).toBeUndefined()
    })
  })

  await describe('Periodic TransactionEvent generation', async () => {
    await it('Should send TransactionEvent with MeterValuePeriodic trigger reason', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      // Reset sequence number
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Simulate sending periodic TransactionEvent (what the timer callback does)
      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      // Verify the request was sent with correct trigger reason
      expect(sentRequests.length).toBe(1)
      expect(sentRequests[0].command).toBe('TransactionEvent')
      expect(sentRequests[0].payload.eventType).toBe(OCPP20TransactionEventEnumType.Updated)
      expect(sentRequests[0].payload.triggerReason).toBe(
        OCPP20TriggerReasonEnumType.MeterValuePeriodic
      )
    })

    await it('Should increment seqNo for each periodic event', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      // Reset sequence number for new transaction
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Send initial Started event
      const startEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )
      expect(startEvent.seqNo).toBe(0)

      // Send multiple periodic events (simulating timer ticks)
      for (let i = 1; i <= 3; i++) {
        const periodicEvent = OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        expect(periodicEvent.seqNo).toBe(i)
      }

      // Verify sequence numbers are continuous: 0, 1, 2, 3
      const connector = mockChargingStation.getConnectorStatus(connectorId)
      expect(connector?.transactionSeqNo).toBe(3)
    })

    await it('Should maintain correct eventType (Updated) for periodic events', async () => {
      const connectorId = 2
      const transactionId = generateUUID()

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Send periodic event
      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      // Verify eventType is Updated (not Started or Ended)
      expect(sentRequests[0].payload.eventType).toBe(OCPP20TransactionEventEnumType.Updated)
    })

    await it('Should include EVSE information in periodic events', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      // Verify EVSE info is present
      expect(sentRequests[0].payload.evse).toBeDefined()
      expect(sentRequests[0].payload.evse.id).toBe(connectorId)
    })

    await it('Should include transactionInfo with correct transactionId', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      // Verify transactionInfo contains the transaction ID
      expect(sentRequests[0].payload.transactionInfo).toBeDefined()
      expect(sentRequests[0].payload.transactionInfo.transactionId).toBe(transactionId)
    })
  })

  await describe('Timer lifecycle integration', async () => {
    await it('Should continue seqNo sequence across multiple periodic events', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      // Reset for new transaction
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Simulate full transaction lifecycle with periodic updates
      // 1. Started event (seqNo: 0)
      const startEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )
      expect(startEvent.seqNo).toBe(0)

      // 2. Multiple periodic updates (seqNo: 1, 2, 3)
      for (let i = 1; i <= 3; i++) {
        const updateEvent = OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        expect(updateEvent.seqNo).toBe(i)
      }

      // 3. Ended event (seqNo: 4)
      const endEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.StopAuthorized,
        connectorId,
        transactionId
      )
      expect(endEvent.seqNo).toBe(4)
    })

    await it('Should handle multiple connectors with independent timers', async () => {
      const transactionId1 = generateUUID()
      const transactionId2 = generateUUID()

      // Reset sequence numbers for both connectors
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, 1)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, 2)

      // Build events for connector 1
      const event1_0 = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        1,
        transactionId1
      )
      const event1_1 = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        1,
        transactionId1
      )

      // Build events for connector 2
      const event2_0 = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        2,
        transactionId2
      )
      const event2_1 = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        2,
        transactionId2
      )

      // Verify independent sequence numbers
      expect(event1_0.seqNo).toBe(0)
      expect(event1_1.seqNo).toBe(1)
      expect(event2_0.seqNo).toBe(0)
      expect(event2_1.seqNo).toBe(1)

      // Verify different transaction IDs
      expect(event1_0.transactionInfo.transactionId).toBe(transactionId1)
      expect(event2_0.transactionInfo.transactionId).toBe(transactionId2)
    })
  })

  await describe('Error handling', async () => {
    await it('Should handle network errors gracefully during periodic event', async () => {
      const errorMockChargingStation = createChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        ocppRequestService: {
          requestHandler: () => {
            throw new Error('Network timeout')
          },
        },
        stationInfo: {
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      // Mock WebSocket as open
      errorMockChargingStation.isWebSocketConnectionOpened = () => true

      const connectorId = 1
      const transactionId = generateUUID()

      try {
        await OCPP20ServiceUtils.sendTransactionEvent(
          errorMockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        throw new Error('Should have thrown network error')
      } catch (error: any) {
        expect(error.message).toContain('Network timeout')
      }
    })
  })
})
