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

export class MessageChannelUtils {
  private constructor() {
    // This is intentional
  }

  public static buildStartedMessage(
    chargingStation: ChargingStation
  ): ChargingStationWorkerMessage<ChargingStationData> {
    return {
      id: ChargingStationWorkerMessageEvents.started,
      data: MessageChannelUtils.buildChargingStationDataPayload(chargingStation),
    };
  }

  public static buildStoppedMessage(
    chargingStation: ChargingStation
  ): ChargingStationWorkerMessage<ChargingStationData> {
    return {
      id: ChargingStationWorkerMessageEvents.stopped,
      data: MessageChannelUtils.buildChargingStationDataPayload(chargingStation),
    };
  }

  public static buildUpdatedMessage(
    chargingStation: ChargingStation
  ): ChargingStationWorkerMessage<ChargingStationData> {
    return {
      id: ChargingStationWorkerMessageEvents.updated,
      data: MessageChannelUtils.buildChargingStationDataPayload(chargingStation),
    };
  }

  public static buildPerformanceStatisticsMessage(
    statistics: Statistics
  ): ChargingStationWorkerMessage<Statistics> {
    return {
      id: ChargingStationWorkerMessageEvents.performanceStatistics,
      data: statistics,
    };
  }

  private static buildChargingStationDataPayload(
    chargingStation: ChargingStation
  ): ChargingStationData {
    return {
      started: chargingStation.started,
      stationInfo: chargingStation.stationInfo,
      connectors: buildConnectorsStatus(chargingStation),
      evses: buildEvsesStatus(chargingStation, OutputFormat.worker),
      ocppConfiguration: chargingStation.ocppConfiguration,
      wsState: chargingStation?.wsConnection?.readyState,
      bootNotificationResponse: chargingStation.bootNotificationResponse,
      ...(chargingStation.automaticTransactionGenerator && {
        automaticTransactionGenerator:
          buildChargingStationAutomaticTransactionGeneratorConfiguration(chargingStation),
      }),
    };
  }
}
