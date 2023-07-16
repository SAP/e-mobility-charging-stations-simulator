import {
  OutputFormat,
  buildChargingStationAutomaticTransactionGeneratorConfiguration,
  buildConnectorsStatus,
  buildEvsesStatus,
} from './ChargingStationConfigurationUtils';
import type { ChargingStation } from '../charging-station';
import {
  type ChargingStationData,
  type ChargingStationWorkerMessage,
  ChargingStationWorkerMessageEvents,
  type Statistics,
} from '../types';

export const buildStartedMessage = (
  chargingStation: ChargingStation,
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    id: ChargingStationWorkerMessageEvents.started,
    data: buildChargingStationDataPayload(chargingStation),
  };
};

export const buildStoppedMessage = (
  chargingStation: ChargingStation,
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    id: ChargingStationWorkerMessageEvents.stopped,
    data: buildChargingStationDataPayload(chargingStation),
  };
};

export const buildUpdatedMessage = (
  chargingStation: ChargingStation,
): ChargingStationWorkerMessage<ChargingStationData> => {
  return {
    id: ChargingStationWorkerMessageEvents.updated,
    data: buildChargingStationDataPayload(chargingStation),
  };
};

export const buildPerformanceStatisticsMessage = (
  statistics: Statistics,
): ChargingStationWorkerMessage<Statistics> => {
  return {
    id: ChargingStationWorkerMessageEvents.performanceStatistics,
    data: statistics,
  };
};

const buildChargingStationDataPayload = (chargingStation: ChargingStation): ChargingStationData => {
  return {
    started: chargingStation.started,
    stationInfo: chargingStation.stationInfo,
    connectors: buildConnectorsStatus(chargingStation),
    evses: buildEvsesStatus(chargingStation, OutputFormat.worker),
    ocppConfiguration: chargingStation.ocppConfiguration!,
    wsState: chargingStation?.wsConnection?.readyState,
    bootNotificationResponse: chargingStation.bootNotificationResponse,
    ...(chargingStation.automaticTransactionGenerator && {
      automaticTransactionGenerator:
        buildChargingStationAutomaticTransactionGeneratorConfiguration(chargingStation),
    }),
  };
};
