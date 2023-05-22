import { Utils } from './Utils';
import type { ChargingStation } from '../charging-station';
import type {
  ChargingStationAutomaticTransactionGeneratorConfiguration,
  ConnectorStatus,
  EvseStatusConfiguration,
} from '../types';

export const buildChargingStationAutomaticTransactionGeneratorConfiguration = (
  chargingStation: ChargingStation
): ChargingStationAutomaticTransactionGeneratorConfiguration => {
  return {
    automaticTransactionGenerator: chargingStation.getAutomaticTransactionGeneratorConfiguration(),
    ...(!Utils.isNullOrUndefined(
      chargingStation.automaticTransactionGenerator?.connectorsStatus
    ) && {
      automaticTransactionGeneratorStatuses: [
        ...chargingStation.automaticTransactionGenerator.connectorsStatus.values(),
      ],
    }),
  };
};

export const buildConnectorsStatus = (chargingStation: ChargingStation): ConnectorStatus[] => {
  return [...chargingStation.connectors.values()].map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ transactionSetInterval, ...connectorStatusRest }) => connectorStatusRest
  );
};

export const enum OutputFormat {
  configuration = 'configuration',
  ipc = 'ipc',
}

export const buildEvsesStatus = (
  chargingStation: ChargingStation,
  outputFormat: OutputFormat = OutputFormat.configuration
): EvseStatusConfiguration[] => {
  return [...chargingStation.evses.values()].map((evseStatus) => {
    const connectorsStatus = [...evseStatus.connectors.values()].map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ transactionSetInterval, ...connectorStatusRest }) => connectorStatusRest
    );
    if (outputFormat === OutputFormat.ipc) {
      return {
        ...evseStatus,
        connectors: connectorsStatus,
      };
    } else if (outputFormat === OutputFormat.configuration) {
      const status = {
        ...evseStatus,
        connectorsStatus,
      };
      delete status.connectors;
      return status;
    }
  });
};
