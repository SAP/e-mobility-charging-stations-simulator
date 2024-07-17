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
  buildChargingStationAutomaticTransactionGeneratorConfiguration,
  buildConnectorsStatus,
  buildEvsesStatus,
  OutputFormat,
} from './ChargingStationConfigurationUtils.js'

export const buildAddedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    event: ChargingStationWorkerMessageEvents.added,
    data: buildChargingStationDataPayload(chargingStation),
  }
}

export const buildDeletedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    event: ChargingStationWorkerMessageEvents.deleted,
    data: buildChargingStationDataPayload(chargingStation),
  }
}

export const buildStartedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    event: ChargingStationWorkerMessageEvents.started,
    data: buildChargingStationDataPayload(chargingStation),
  }
}

export const buildStoppedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    event: ChargingStationWorkerMessageEvents.stopped,
    data: buildChargingStationDataPayload(chargingStation),
  }
}

export const buildUpdatedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    event: ChargingStationWorkerMessageEvents.updated,
    data: buildChargingStationDataPayload(chargingStation),
  }
}

export const buildPerformanceStatisticsMessage = (
  statistics: Statistics
): ChargingStationWorkerMessage<Statistics> => {
  const statisticsData = [...statistics.statisticsData].map(([key, value]) => {
    if (value.measurementTimeSeries instanceof CircularBuffer) {
      value.measurementTimeSeries = value.measurementTimeSeries.toArray() as TimestampedData[]
    }
    return [key, value]
  })
  return {
    event: ChargingStationWorkerMessageEvents.performanceStatistics,
    data: {
      id: statistics.id,
      name: statistics.name,
      uri: statistics.uri,
      createdAt: statistics.createdAt,
      updatedAt: statistics.updatedAt,
      statisticsData,
    },
  }
}

const buildChargingStationDataPayload = (chargingStation: ChargingStation): ChargingStationData => {
  return {
    started: chargingStation.started,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    stationInfo: chargingStation.stationInfo!,
    connectors: buildConnectorsStatus(chargingStation),
    evses: buildEvsesStatus(chargingStation, OutputFormat.worker),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ocppConfiguration: chargingStation.ocppConfiguration!,
    supervisionUrl: chargingStation.wsConnectionUrl.href,
    wsState: chargingStation.wsConnection?.readyState,
    bootNotificationResponse: chargingStation.bootNotificationResponse,
    ...(chargingStation.automaticTransactionGenerator != null && {
      automaticTransactionGenerator:
        buildChargingStationAutomaticTransactionGeneratorConfiguration(chargingStation),
    }),
  }
}
