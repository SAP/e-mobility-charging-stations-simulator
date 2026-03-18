import { CircularBuffer } from 'mnemonist'

import type { ChargingStation } from '../charging-station/index.js'

import {
  type ChargingStationData,
  type ChargingStationWorkerMessage,
  ChargingStationWorkerMessageEvents,
  type Statistics,
  type TimestampedData,
} from '../types/index.js'
import {
  buildATGEntries,
  buildConnectorEntries,
  buildEvseEntries,
} from './ChargingStationConfigurationUtils.js'

const buildChargingStationWorkerMessage = (
  chargingStation: ChargingStation,
  event: ChargingStationWorkerMessageEvents
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    data: buildChargingStationDataPayload(chargingStation),
    event,
  }
}

export const buildAddedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return buildChargingStationWorkerMessage(
    chargingStation,
    ChargingStationWorkerMessageEvents.added
  )
}

export const buildDeletedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return buildChargingStationWorkerMessage(
    chargingStation,
    ChargingStationWorkerMessageEvents.deleted
  )
}

export const buildStartedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return buildChargingStationWorkerMessage(
    chargingStation,
    ChargingStationWorkerMessageEvents.started
  )
}

export const buildStoppedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return buildChargingStationWorkerMessage(
    chargingStation,
    ChargingStationWorkerMessageEvents.stopped
  )
}

export const buildUpdatedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return buildChargingStationWorkerMessage(
    chargingStation,
    ChargingStationWorkerMessageEvents.updated
  )
}

export const buildPerformanceStatisticsMessage = (
  statistics: Statistics
): ChargingStationWorkerMessage<Statistics> => {
  const statisticsData = new Map(
    [...statistics.statisticsData].map(([key, value]) => {
      if (value.measurementTimeSeries instanceof CircularBuffer) {
        value.measurementTimeSeries = value.measurementTimeSeries.toArray() as TimestampedData[]
      }
      return [key, value]
    })
  )
  return {
    data: {
      createdAt: statistics.createdAt,
      id: statistics.id,
      name: statistics.name,
      statisticsData,
      updatedAt: statistics.updatedAt,
      uri: statistics.uri,
    },
    event: ChargingStationWorkerMessageEvents.performanceStatistics,
  }
}

const buildChargingStationDataPayload = (chargingStation: ChargingStation): ChargingStationData => {
  return {
    bootNotificationResponse: chargingStation.bootNotificationResponse,
    connectors: buildConnectorEntries(chargingStation),
    evses: buildEvseEntries(chargingStation),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ocppConfiguration: chargingStation.ocppConfiguration!,
    started: chargingStation.started,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    stationInfo: chargingStation.stationInfo!,
    supervisionUrl: chargingStation.wsConnectionUrl.href,
    timestamp: Date.now(),
    wsState: chargingStation.wsConnection?.readyState,
    ...(chargingStation.automaticTransactionGenerator != null && {
      automaticTransactionGenerator: {
        automaticTransactionGenerator:
          chargingStation.getAutomaticTransactionGeneratorConfiguration(),
        automaticTransactionGeneratorStatuses: buildATGEntries(chargingStation),
      },
    }),
  }
}
