/**
 * @file Tests for MessageChannelUtils
 * @description Unit tests for charging station worker message builders and performance statistics conversion
 */

import { CircularBuffer } from 'mnemonist'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'
import type { Statistics, TimestampedData } from '../../src/types/index.js'

import { AvailabilityType, ChargingStationWorkerMessageEvents } from '../../src/types/index.js'
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
          availability: AvailabilityType.Operative,
          MeterValues: [],
        },
      ],
      [
        1,
        {
          availability: AvailabilityType.Operative,
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

    assert.strictEqual(message.event, ChargingStationWorkerMessageEvents.added)
    assert.notStrictEqual(message.data, undefined)
    assert.strictEqual(message.data.started, true)
    assert.strictEqual(message.data.stationInfo.chargingStationId, 'CS-TEST-00001')
    assert.strictEqual(message.data.supervisionUrl, 'ws://localhost:8080/CS-TEST-00001')
    assert.strictEqual(typeof message.data.timestamp, 'number')
  })

  await it('should build deleted message with correct event', () => {
    const station = createMockStationForMessages()
    const message = buildDeletedMessage(station)

    assert.strictEqual(message.event, ChargingStationWorkerMessageEvents.deleted)
    assert.notStrictEqual(message.data, undefined)
    assert.strictEqual(message.data.stationInfo.chargingStationId, 'CS-TEST-00001')
  })

  await it('should build started message with correct event', () => {
    const station = createMockStationForMessages()
    const message = buildStartedMessage(station)

    assert.strictEqual(message.event, ChargingStationWorkerMessageEvents.started)
    assert.strictEqual(message.data.started, true)
  })

  await it('should build stopped message with correct event', () => {
    const station = createMockStationForMessages()
    const message = buildStoppedMessage(station)

    assert.strictEqual(message.event, ChargingStationWorkerMessageEvents.stopped)
    assert.notStrictEqual(message.data, undefined)
    assert.strictEqual(message.data.supervisionUrl, 'ws://localhost:8080/CS-TEST-00001')
  })

  await it('should build updated message with correct event', () => {
    const station = createMockStationForMessages()
    const message = buildUpdatedMessage(station)

    assert.strictEqual(message.event, ChargingStationWorkerMessageEvents.updated)
    assert.notStrictEqual(message.data, undefined)
    assert.strictEqual(message.data.stationInfo.chargingStationId, 'CS-TEST-00001')
  })

  await it('should include ws state in station messages', () => {
    const station = createMockStationForMessages()
    const message = buildAddedMessage(station)

    assert.strictEqual(message.data.wsState, 1)
  })

  await it('should include connectors status in station messages', () => {
    const station = createMockStationForMessages()
    const message = buildAddedMessage(station)

    assert.ok(Array.isArray(message.data.connectors))
    assert.strictEqual(message.data.connectors.length, 2)
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

    assert.strictEqual(message.event, ChargingStationWorkerMessageEvents.performanceStatistics)
    assert.strictEqual(message.data.id, 'test-station-id')
    assert.strictEqual(message.data.name, 'test-station')

    const heartbeatStatistics = message.data.statisticsData.get('Heartbeat')
    assert.notStrictEqual(heartbeatStatistics, undefined)
    assert.ok(Array.isArray(heartbeatStatistics?.measurementTimeSeries))
    const timeSeries = heartbeatStatistics.measurementTimeSeries
    assert.strictEqual(timeSeries.length, 2)
    assert.strictEqual(timeSeries[0].value, 42)
    assert.strictEqual(timeSeries[1].value, 84)
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
    assert.ok(Array.isArray(heartbeat?.measurementTimeSeries))
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

    assert.strictEqual(message.data.createdAt, createdAt)
    assert.strictEqual(message.data.updatedAt, updatedAt)
    assert.strictEqual(message.data.uri, 'ws://localhost:8080')
  })
})
