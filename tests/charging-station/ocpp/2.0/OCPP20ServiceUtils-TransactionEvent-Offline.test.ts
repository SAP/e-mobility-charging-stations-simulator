/**
 * @file Tests for OCPP20ServiceUtils TransactionEvent Offline
 * @description Unit tests for OCPP 2.0 offline TransactionEvent queueing (E02)
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { EmptyObject } from '../../../../src/types/index.js'

import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants, generateUUID } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../../tests/helpers/TestLifecycleHelpers.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import {
  type CapturedOCPPRequest,
  createMockStationWithRequestTracking,
  type MockStationWithTracking,
} from './OCPP20TestUtils.js'

await describe('E02 - OCPP 2.0.1 Offline TransactionEvent Queueing', async () => {
  let mockTracking: MockStationWithTracking
  let mockChargingStation: ChargingStation
  let sentRequests: CapturedOCPPRequest[]
  let setOnline: (online: boolean) => void

  beforeEach(() => {
    mockTracking = createMockStationWithRequestTracking()
    mockChargingStation = mockTracking.station
    sentRequests = mockTracking.sentRequests
    setOnline = mockTracking.setOnline
  })

  afterEach(() => {
    for (let connectorId = 1; connectorId <= 3; connectorId++) {
      const connector = mockChargingStation.getConnectorStatus(connectorId)
      if (connector != null) {
        connector.transactionEventQueue = undefined
      }
    }
    standardCleanup()
  })

  await describe('Queue formation when offline', async () => {
    await it('should queue TransactionEvent when WebSocket is disconnected', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      setOnline(false)

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      const response = await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )

      expect(sentRequests.length).toBe(0)

      expect(response.idTokenInfo).toBeUndefined()

      const connector = mockChargingStation.getConnectorStatus(connectorId)
      expect(connector?.transactionEventQueue).toBeDefined()
      expect(connector.transactionEventQueue.length).toBe(1)
      expect(connector.transactionEventQueue[0].seqNo).toBe(0)
    })

    await it('should queue multiple TransactionEvents in order when offline', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      setOnline(false)

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.StopAuthorized,
        connectorId,
        transactionId
      )

      const connector = mockChargingStation.getConnectorStatus(connectorId)
      expect(connector?.transactionEventQueue?.length).toBe(3)

      expect(connector.transactionEventQueue[0].seqNo).toBe(0)
      expect(connector.transactionEventQueue[1].seqNo).toBe(1)
      expect(connector.transactionEventQueue[2].seqNo).toBe(2)

      expect(connector.transactionEventQueue[0].request.eventType).toBe(
        OCPP20TransactionEventEnumType.Started
      )
      expect(connector.transactionEventQueue[1].request.eventType).toBe(
        OCPP20TransactionEventEnumType.Updated
      )
      expect(connector.transactionEventQueue[2].request.eventType).toBe(
        OCPP20TransactionEventEnumType.Ended
      )
    })

    await it('should preserve seqNo in queued events', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      setOnline(true)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )

      expect(sentRequests.length).toBe(1)
      expect(sentRequests[0].payload.seqNo).toBe(0)

      setOnline(false)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      const connector = mockChargingStation.getConnectorStatus(connectorId)
      expect(connector?.transactionEventQueue?.length).toBe(2)
      expect(connector.transactionEventQueue[0].seqNo).toBe(1)
      expect(connector.transactionEventQueue[1].seqNo).toBe(2)
    })

    await it('should include timestamp in queued events', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      setOnline(false)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      const beforeQueue = new Date()
      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )
      const afterQueue = new Date()

      const connector = mockChargingStation.getConnectorStatus(connectorId)
      expect(connector?.transactionEventQueue?.[0]?.timestamp).toBeInstanceOf(Date)
      expect(connector.transactionEventQueue[0].timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeQueue.getTime()
      )
      expect(connector.transactionEventQueue[0].timestamp.getTime()).toBeLessThanOrEqual(
        afterQueue.getTime()
      )
    })
  })

  await describe('Queue draining when coming online', async () => {
    await it('should send all queued events when sendQueuedTransactionEvents is called', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      setOnline(false)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      expect(sentRequests.length).toBe(0)

      setOnline(true)

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, connectorId)

      expect(sentRequests.length).toBe(2)
      expect(sentRequests[0].payload.seqNo).toBe(0)
      expect(sentRequests[1].payload.seqNo).toBe(1)
    })

    await it('should clear queue after sending', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      setOnline(false)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )

      const connector = mockChargingStation.getConnectorStatus(connectorId)
      expect(connector?.transactionEventQueue?.length).toBe(1)

      setOnline(true)
      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, connectorId)

      expect(connector.transactionEventQueue.length).toBe(0)
    })

    await it('should preserve FIFO order when draining queue', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      setOnline(false)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.ChargingStateChanged,
        connectorId,
        transactionId
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.StopAuthorized,
        connectorId,
        transactionId
      )

      setOnline(true)
      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, connectorId)

      expect(sentRequests[0].payload.eventType).toBe(OCPP20TransactionEventEnumType.Started)
      expect(sentRequests[1].payload.eventType).toBe(OCPP20TransactionEventEnumType.Updated)
      expect(sentRequests[2].payload.eventType).toBe(OCPP20TransactionEventEnumType.Ended)

      expect(sentRequests[0].payload.seqNo).toBe(0)
      expect(sentRequests[1].payload.seqNo).toBe(1)
      expect(sentRequests[2].payload.seqNo).toBe(2)
    })

    await it('should handle empty queue gracefully', async () => {
      const connectorId = 1

      await expect(
        OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, connectorId)
      ).resolves.toBeUndefined()

      expect(sentRequests.length).toBe(0)
    })

    await it('should handle null queue gracefully', async () => {
      const connectorId = 1
      const connector = mockChargingStation.getConnectorStatus(connectorId)
      connector.transactionEventQueue = undefined

      await expect(
        OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, connectorId)
      ).resolves.toBeUndefined()

      expect(sentRequests.length).toBe(0)
    })
  })

  await describe('Sequence number continuity across queue boundary', async () => {
    await it('should maintain seqNo continuity: online → offline → online', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      setOnline(true)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )
      expect(sentRequests[0].payload.seqNo).toBe(0)

      setOnline(false)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      setOnline(true)

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, connectorId)

      expect(sentRequests[1].payload.seqNo).toBe(1)
      expect(sentRequests[2].payload.seqNo).toBe(2)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.StopAuthorized,
        connectorId,
        transactionId
      )

      expect(sentRequests[3].payload.seqNo).toBe(3)

      for (let i = 0; i < sentRequests.length; i++) {
        expect(sentRequests[i].payload.seqNo).toBe(i)
      }
    })
  })

  await describe('Multiple connectors with independent queues', async () => {
    await it('should maintain separate queues for each connector', async () => {
      const transactionId1 = generateUUID()
      const transactionId2 = generateUUID()

      setOnline(false)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, 1)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, 2)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        1,
        transactionId1
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        2,
        transactionId2
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        1,
        transactionId1
      )

      const connector1 = mockChargingStation.getConnectorStatus(1)
      const connector2 = mockChargingStation.getConnectorStatus(2)

      expect(connector1?.transactionEventQueue?.length).toBe(2)
      expect(connector2?.transactionEventQueue?.length).toBe(1)

      expect(connector1.transactionEventQueue[0].request.transactionInfo.transactionId).toBe(
        transactionId1
      )
      expect(connector2.transactionEventQueue[0].request.transactionInfo.transactionId).toBe(
        transactionId2
      )
    })

    await it('should drain queues independently per connector', async () => {
      const transactionId1 = generateUUID()
      const transactionId2 = generateUUID()

      setOnline(false)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, 1)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, 2)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        1,
        transactionId1
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        2,
        transactionId2
      )

      setOnline(true)

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, 1)

      expect(sentRequests.length).toBe(1)
      expect(sentRequests[0].payload.transactionInfo.transactionId).toBe(transactionId1)

      const connector2 = mockChargingStation.getConnectorStatus(2)
      expect(connector2?.transactionEventQueue?.length).toBe(1)

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, 2)

      expect(sentRequests.length).toBe(2)
      expect(sentRequests[1].payload.transactionInfo.transactionId).toBe(transactionId2)
    })
  })

  await describe('Error handling during queue drain', async () => {
    await it('should continue sending remaining events if one fails', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      let callCount = 0

      const errorOnSecondMock = mock.fn(async () => {
        callCount++
        if (callCount === 2) {
          throw new Error('Network error on second event')
        }
        return Promise.resolve({} as EmptyObject)
      })

      const errorStation = createChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        ocppRequestService: {
          requestHandler: errorOnSecondMock,
        },
        stationInfo: {
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      errorStation.isWebSocketConnectionOpened = () => false

      OCPP20ServiceUtils.resetTransactionSequenceNumber(errorStation, connectorId)

      await OCPP20ServiceUtils.sendTransactionEvent(
        errorStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        errorStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      await OCPP20ServiceUtils.sendTransactionEvent(
        errorStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.StopAuthorized,
        connectorId,
        transactionId
      )

      errorStation.isWebSocketConnectionOpened = () => true

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(errorStation, connectorId)

      expect(callCount).toBe(3)
    })
  })
})
