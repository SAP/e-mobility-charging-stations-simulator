import {
  OutputFormat,
  buildChargingStationAutomaticTransactionGeneratorConfiguration,
  buildConnectorsStatus,
  buildEvsesStatus
} from './ChargingStationConfigurationUtils.js'
import type { ChargingStation } from '../charging-station/index.js'
import {
  type ChargingStationData,
  type ChargingStationWorkerMessage,
  ChargingStationWorkerMessageEvents,
  type Statistics
} from '../types/index.js'

export const buildStartedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    event: ChargingStationWorkerMessageEvents.started,
    data: buildChargingStationDataPayload(chargingStation)
  }
}

export const buildStoppedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    event: ChargingStationWorkerMessageEvents.stopped,
    data: buildChargingStationDataPayload(chargingStation)
  }
}

export const buildUpdatedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    event: ChargingStationWorkerMessageEvents.updated,
    data: buildChargingStationDataPayload(chargingStation)
  }
}

export const buildPerformanceStatisticsMessage = (
  statistics: Statistics
): ChargingStationWorkerMessage<Statistics> => {
  return {
    event: ChargingStationWorkerMessageEvents.performanceStatistics,
    data: statistics
  }
}

const buildChargingStationDataPayload = (chargingStation: ChargingStation): ChargingStationData => {
  return {
    started: chargingStation.started,
    stationInfo: chargingStation.stationInfo,
    connectors: buildConnectorsStatus(chargingStation),
    evses: buildEvsesStatus(chargingStation, OutputFormat.worker),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ocppConfiguration: chargingStation.ocppConfiguration!,
    wsState: chargingStation?.wsConnection?.readyState,
    bootNotificationResponse: chargingStation.bootNotificationResponse,
    ...(chargingStation.automaticTransactionGenerator != null && {
      automaticTransactionGenerator:
        buildChargingStationAutomaticTransactionGeneratorConfiguration(chargingStation)
    })
  }
}
