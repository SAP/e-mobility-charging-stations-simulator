import type { Statistics } from '../../../src/types/index.js'

/**
 * @param id - Performance record identifier
 * @param name - Charging station name
 * @returns Statistics object with sample measurement data
 */
export function buildTestStatistics (id: string, name?: string): Statistics {
  const statsData = new Map<string, Record<string, unknown>>()
  statsData.set('Heartbeat', {
    avgTimeMeasurement: 10.5,
    currentTimeMeasurement: 12,
    maxTimeMeasurement: 20,
    measurementTimeSeries: [
      { timestamp: 1000, value: 10 },
      { timestamp: 2000, value: 12 },
    ],
    minTimeMeasurement: 5,
    requestCount: 100,
    responseCount: 99,
    timeMeasurementCount: 100,
    totalTimeMeasurement: 1050,
  })
  return {
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    id,
    name: name ?? `cs-${id}`,
    statisticsData: statsData,
    uri: 'ws://localhost:8080',
  } as unknown as Statistics
}
