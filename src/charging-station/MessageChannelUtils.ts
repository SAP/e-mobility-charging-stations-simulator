import {
  ChargingStationData,
  ChargingStationWorkerMessage,
  ChargingStationWorkerMessageEvents,
} from '../types/ChargingStationWorker';
import Statistics from '../types/Statistics';
import type ChargingStation from './ChargingStation';

export class MessageChannelUtils {
  private constructor() {
    // This is intentional
  }

  public static buildStartedMessage(
    chargingStation: ChargingStation
  ): ChargingStationWorkerMessage<ChargingStationData> {
    return {
      id: ChargingStationWorkerMessageEvents.STARTED,
      data: MessageChannelUtils.buildChargingStationDataPayload(chargingStation),
    };
  }

  public static buildStoppedMessage(
    chargingStation: ChargingStation
  ): ChargingStationWorkerMessage<ChargingStationData> {
    return {
      id: ChargingStationWorkerMessageEvents.STOPPED,
      data: MessageChannelUtils.buildChargingStationDataPayload(chargingStation),
    };
  }

  public static buildUpdatedMessage(
    chargingStation: ChargingStation
  ): ChargingStationWorkerMessage<ChargingStationData> {
    return {
      id: ChargingStationWorkerMessageEvents.UPDATED,
      data: MessageChannelUtils.buildChargingStationDataPayload(chargingStation),
    };
  }

  public static buildPerformanceStatisticsMessage(
    statistics: Statistics
  ): ChargingStationWorkerMessage<Statistics> {
    return {
      id: ChargingStationWorkerMessageEvents.PERFORMANCE_STATISTICS,
      data: statistics,
    };
  }

  private static buildChargingStationDataPayload(
    chargingStation: ChargingStation
  ): ChargingStationData {
    return {
      hashId: chargingStation.hashId,
      stationInfo: chargingStation.stationInfo,
      stopped: chargingStation.stopped,
      connectors: Array.from(chargingStation.connectors.values()),
    };
  }
}
