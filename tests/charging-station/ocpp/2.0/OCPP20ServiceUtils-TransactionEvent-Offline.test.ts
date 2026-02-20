/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

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

await describe('E02 - OCPP 2.0.1 Offline TransactionEvent Queueing', async () => {
  let mockChargingStation: any
  let requestHandlerMock: ReturnType<typeof mock.fn>
  let sentRequests: any[]
  let isOnline: boolean

  beforeEach(() => {
    sentRequests = []
    isOnline = true
    requestHandlerMock = mock.fn(async (_station: any, command: string, payload: any) => {
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

    mockChargingStation.isWebSocketConnectionOpened = () => isOnline

    resetLimits(mockChargingStation)
  })

  afterEach(() => {
    for (let connectorId = 1; connectorId <= 3; connectorId++) {
      const connector = mockChargingStation.getConnectorStatus(connectorId)
      if (connector != null) {
        connector.transactionEventQueue = undefined
      }
    }
  })

  await describe('Queue formation when offline', async () => {
    await it('Should queue TransactionEvent when WebSocket is disconnected', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      isOnline = false

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

    await it('Should queue multiple TransactionEvents in order when offline', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      isOnline = false

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

    await it('Should preserve seqNo in queued events', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      isOnline = true
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

      isOnline = false

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

    await it('Should include timestamp in queued events', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      isOnline = false
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
    await it('Should send all queued events when sendQueuedTransactionEvents is called', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      isOnline = false
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

      isOnline = true

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, connectorId)

      expect(sentRequests.length).toBe(2)
      expect(sentRequests[0].payload.seqNo).toBe(0)
      expect(sentRequests[1].payload.seqNo).toBe(1)
    })

    await it('Should clear queue after sending', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      isOnline = false
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

      isOnline = true
      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, connectorId)

      expect(connector.transactionEventQueue.length).toBe(0)
    })

    await it('Should preserve FIFO order when draining queue', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      isOnline = false
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

      isOnline = true
      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, connectorId)

      expect(sentRequests[0].payload.eventType).toBe(OCPP20TransactionEventEnumType.Started)
      expect(sentRequests[1].payload.eventType).toBe(OCPP20TransactionEventEnumType.Updated)
      expect(sentRequests[2].payload.eventType).toBe(OCPP20TransactionEventEnumType.Ended)

      expect(sentRequests[0].payload.seqNo).toBe(0)
      expect(sentRequests[1].payload.seqNo).toBe(1)
      expect(sentRequests[2].payload.seqNo).toBe(2)
    })

    await it('Should handle empty queue gracefully', async () => {
      const connectorId = 1

      await expect(
        OCPP20ServiceUtils.sendQueuedTransactionEvents(mockChargingStation, connectorId)
      ).resolves.toBeUndefined()

      expect(sentRequests.length).toBe(0)
    })

    await it('Should handle null queue gracefully', async () => {
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
    await it('Should maintain seqNo continuity: online → offline → online', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      isOnline = true
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )
      expect(sentRequests[0].payload.seqNo).toBe(0)

      isOnline = false

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

      isOnline = true

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
    await it('Should maintain separate queues for each connector', async () => {
      const transactionId1 = generateUUID()
      const transactionId2 = generateUUID()

      isOnline = false
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

    await it('Should drain queues independently per connector', async () => {
      const transactionId1 = generateUUID()
      const transactionId2 = generateUUID()

      isOnline = false
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

      isOnline = true

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
    await it('Should continue sending remaining events if one fails', async () => {
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
