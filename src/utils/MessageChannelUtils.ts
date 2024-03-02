import {
  OutputFormat,
  buildChargingStationAutomaticTransactionGeneratorConfiguration,
  buildConnectorsStatus,
  buildEvsesStatus
} from './ChargingStationConfigurationUtils.js'
import { clone } from './Utils.js'
import type { ChargingStation } from '../charging-station/index.js'
import {
  type ChargingStationData,
  type ChargingStationWorkerMessage,
  ChargingStationWorkerMessageEvents,
  type InternalTemplateStatistics,
  type Statistics,
  type TemplateStatistics
} from '../types/index.js'

export const buildAddedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    event: ChargingStationWorkerMessageEvents.added,
    data: buildChargingStationDataPayload(chargingStation)
  }
}

export const buildDeletedMessage = (
  chargingStation: ChargingStation
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    event: ChargingStationWorkerMessageEvents.deleted,
    data: buildChargingStationDataPayload(chargingStation)
  }
}

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

export const buildChargingStationDataPayload = (
  chargingStation: ChargingStation
): ChargingStationData => {
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
        buildChargingStationAutomaticTransactionGeneratorConfiguration(chargingStation)
    })
  }
}

export const buildTemplateStatisticsPayload = (
  map: Map<string, InternalTemplateStatistics>
): Record<string, TemplateStatistics> => {
  map = clone(map)
  for (const value of map.values()) {
    (value as unknown as TemplateStatistics).indexes = [...value.indexes]
  }
  return Object.fromEntries(map.entries() as unknown as Array<[string, TemplateStatistics]>)
}
