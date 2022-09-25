import {
  ChargingStationData,
  ChargingStationWorkerMessage,
  ChargingStationWorkerMessageEvents,
} from '../types/ChargingStationWorker';
import type { Statistics } from '../types/Statistics';
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
      stationInfo: chargingStation.stationInfo,
      started: chargingStation.started,
      wsState: chargingStation?.wsConnection?.readyState,
      bootNotificationResponse: chargingStation.bootNotificationResponse,
      connectors: [...chargingStation.connectors.values()].map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ transactionSetInterval, ...connectorStatusRest }) => connectorStatusRest
      ),
      ...(chargingStation.automaticTransactionGenerator && {
        automaticTransactionGenerator: {
          automaticTransactionGenerator:
            chargingStation.automaticTransactionGenerator.configuration,
          automaticTransactionGeneratorStatuses: [
            ...chargingStation.automaticTransactionGenerator.connectorsStatus.values(),
          ],
        },
      }),
    };
  }
}
