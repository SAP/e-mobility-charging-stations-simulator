import type { ChargingStation } from './internal';
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
      connectors: [...chargingStation.connectors.values()].map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ transactionSetInterval, ...connectorStatusRest }) => connectorStatusRest
      ),
      evses: [...chargingStation.evses.values()].map((evseStatus) => {
        return {
          ...evseStatus,
          connectors: [...evseStatus.connectors.values()].map(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ({ transactionSetInterval, ...connectorStatusRest }) => connectorStatusRest
          ),
        };
      }),
      ocppConfiguration: chargingStation.ocppConfiguration,
      wsState: chargingStation?.wsConnection?.readyState,
      bootNotificationResponse: chargingStation.bootNotificationResponse,
      ...(chargingStation.automaticTransactionGenerator && {
        automaticTransactionGenerator: {
          automaticTransactionGenerator:
            chargingStation.getAutomaticTransactionGeneratorConfiguration(),
          automaticTransactionGeneratorStatuses: [
            ...chargingStation.automaticTransactionGenerator.connectorsStatus.values(),
          ],
        },
      }),
    };
  }
}
