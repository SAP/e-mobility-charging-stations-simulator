/**
 * @file Tests for MessageChannelUtils
 * @description Unit tests for charging station worker message builders and performance statistics conversion
 */
import { expect } from '@std/expect'
import { CircularBuffer } from 'mnemonist'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import type { Statistics, TimestampedData } from '../../src/types/index.js'

import { ChargingStationWorkerMessageEvents } from '../../src/types/index.js'
import {
  buildAddedMessage,
  buildDeletedMessage,
  buildPerformanceStatisticsMessage,
  buildStartedMessage,
  buildStoppedMessage,
  buildUpdatedMessage,
} from '../../src/utils/MessageChannelUtils.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

/**
 * Creates a minimal mock station with properties needed by MessageChannelUtils builders.
 * @returns Mock charging station instance
 */
function createMockStationForMessages (): ChargingStation {
  return {
    automaticTransactionGenerator: undefined,
    bootNotificationResponse: {
      currentTime: new Date('2024-01-01T00:00:00Z'),
      interval: 300,
      status: 'Accepted',
    },
    connectors: new Map([
      [
        0,
        {
          availability: 'Operative',
          MeterValues: [],
        },
      ],
      [
        1,
        {
          availability: 'Operative',
          MeterValues: [],
        },
      ],
    ]),
    evses: new Map(),
    getAutomaticTransactionGeneratorConfiguration: () => undefined,
    ocppConfiguration: { configurationKey: [] },
    started: true,
    stationInfo: {
      baseName: 'CS-TEST',
      chargingStationId: 'CS-TEST-00001',
      hashId: 'test-hash',
      templateIndex: 1,
      templateName: 'test-template.json',
    },
    wsConnection: { readyState: 1 },
    wsConnectionUrl: new URL('ws://localhost:8080/CS-TEST-00001'),
  } as unknown as ChargingStation
}

await describe('MessageChannelUtils', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should build added message with correct event and data', () => {
    const station = createMockStationForMessages()
    const message = buildAddedMessage(station)

    expect(message.event).toBe(ChargingStationWorkerMessageEvents.added)
    expect(message.data).toBeDefined()
    expect(message.data.started).toBe(true)
    expect(message.data.stationInfo.chargingStationId).toBe('CS-TEST-00001')
    expect(message.data.supervisionUrl).toBe('ws://localhost:8080/CS-TEST-00001')
    expect(typeof message.data.timestamp).toBe('number')
  })

  await it('should build deleted message with correct event', () => {
    const station = createMockStationForMessages()
    const message = buildDeletedMessage(station)

    expect(message.event).toBe(ChargingStationWorkerMessageEvents.deleted)
    expect(message.data).toBeDefined()
    expect(message.data.stationInfo.chargingStationId).toBe('CS-TEST-00001')
  })

  await it('should build started message with correct event', () => {
    const station = createMockStationForMessages()
    const message = buildStartedMessage(station)

    expect(message.event).toBe(ChargingStationWorkerMessageEvents.started)
    expect(message.data.started).toBe(true)
  })

  await it('should build stopped message with correct event', () => {
    const station = createMockStationForMessages()
    const message = buildStoppedMessage(station)

    expect(message.event).toBe(ChargingStationWorkerMessageEvents.stopped)
    expect(message.data).toBeDefined()
    expect(message.data.supervisionUrl).toBe('ws://localhost:8080/CS-TEST-00001')
  })

  await it('should build updated message with correct event', () => {
    const station = createMockStationForMessages()
    const message = buildUpdatedMessage(station)

    expect(message.event).toBe(ChargingStationWorkerMessageEvents.updated)
    expect(message.data).toBeDefined()
    expect(message.data.stationInfo.chargingStationId).toBe('CS-TEST-00001')
  })

  await it('should include ws state in station messages', () => {
    const station = createMockStationForMessages()
    const message = buildAddedMessage(station)

    expect(message.data.wsState).toBe(1)
  })

  await it('should include connectors status in station messages', () => {
    const station = createMockStationForMessages()
    const message = buildAddedMessage(station)

    expect(Array.isArray(message.data.connectors)).toBe(true)
    expect(message.data.connectors.length).toBe(2)
  })

  await it('should convert CircularBuffer to array in statistics data', () => {
    const buffer = new CircularBuffer<TimestampedData>(Array, 10)
    buffer.push({ timestamp: 1000, value: 42 })
    buffer.push({ timestamp: 2000, value: 84 })

    const statistics: Statistics = {
      createdAt: new Date('2024-01-01T00:00:00Z'),
      id: 'test-station-id',
      name: 'test-station',
      statisticsData: new Map([
        [
          'Heartbeat',
          {
            measurementTimeSeries: buffer,
            requestCount: 5,
            responseCount: 5,
          },
        ],
      ]),
      uri: 'ws://localhost:8080',
    }

    const message = buildPerformanceStatisticsMessage(statistics)

    expect(message.event).toBe(ChargingStationWorkerMessageEvents.performanceStatistics)
    expect(message.data.id).toBe('test-station-id')
    expect(message.data.name).toBe('test-station')

    const heartbeatStats = message.data.statisticsData.get('Heartbeat')
    expect(heartbeatStats).toBeDefined()
    expect(Array.isArray(heartbeatStats?.measurementTimeSeries)).toBe(true)
    const timeSeries = heartbeatStats?.measurementTimeSeries as TimestampedData[]
    expect(timeSeries.length).toBe(2)
    expect(timeSeries[0].value).toBe(42)
    expect(timeSeries[1].value).toBe(84)
  })

  await it('should preserve non-CircularBuffer measurement time series', () => {
    const statistics: Statistics = {
      createdAt: new Date('2024-01-01T00:00:00Z'),
      id: 'test-id',
      name: 'test-station',
      statisticsData: new Map([
        [
          'Heartbeat',
          {
            measurementTimeSeries: [{ timestamp: 1000, value: 10 }],
            requestCount: 3,
          },
        ],
      ]),
      uri: 'ws://localhost:8080',
    }

    const message = buildPerformanceStatisticsMessage(statistics)
    const heartbeat = message.data.statisticsData.get('Heartbeat')
    expect(Array.isArray(heartbeat?.measurementTimeSeries)).toBe(true)
  })

  await it('should preserve statistics metadata in performance message', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z')
    const updatedAt = new Date('2024-01-02T00:00:00Z')

    const statistics: Statistics = {
      createdAt,
      id: 'station-001',
      name: 'station-name',
      statisticsData: new Map(),
      updatedAt,
      uri: 'ws://localhost:8080',
    }

    const message = buildPerformanceStatisticsMessage(statistics)

    expect(message.data.createdAt).toBe(createdAt)
    expect(message.data.updatedAt).toBe(updatedAt)
    expect(message.data.uri).toBe('ws://localhost:8080')
  })
})
