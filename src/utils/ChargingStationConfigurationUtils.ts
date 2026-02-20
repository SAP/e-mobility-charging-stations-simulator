import type { ChargingStation } from '../charging-station/index.js'
import type {
  ChargingStationAutomaticTransactionGeneratorConfiguration,
  ConnectorStatus,
  EvseStatusConfiguration,
  EvseStatusWorkerType,
} from '../types/index.js'

export const buildChargingStationAutomaticTransactionGeneratorConfiguration = (
  chargingStation: ChargingStation
): ChargingStationAutomaticTransactionGeneratorConfiguration => {
  return {
    automaticTransactionGenerator: chargingStation.getAutomaticTransactionGeneratorConfiguration(),
    ...(chargingStation.automaticTransactionGenerator?.connectorsStatus != null && {
      automaticTransactionGeneratorStatuses: [
        ...chargingStation.automaticTransactionGenerator.connectorsStatus.values(),
      ],
    }),
  }
}

export const buildConnectorsStatus = (chargingStation: ChargingStation): ConnectorStatus[] => {
  return [...chargingStation.connectors.values()].map(
    ({
      transactionEventQueue,
      transactionSetInterval,
      transactionTxUpdatedSetInterval,
      ...connectorStatus
    }) => connectorStatus
  )
}

export enum OutputFormat {
  configuration = 'configuration',
  worker = 'worker',
}

export const buildEvsesStatus = (
  chargingStation: ChargingStation,
  outputFormat: OutputFormat = OutputFormat.configuration
): (EvseStatusConfiguration | EvseStatusWorkerType)[] => {
  // eslint-disable-next-line array-callback-return
  return [...chargingStation.evses.values()].map(evseStatus => {
    const connectorsStatus = [...evseStatus.connectors.values()].map(
      ({
        transactionEventQueue,
        transactionSetInterval,
        transactionTxUpdatedSetInterval,
        ...connectorStatus
      }) => connectorStatus
    )
    let status: EvseStatusConfiguration
    switch (outputFormat) {
      case OutputFormat.configuration:
        status = {
          ...evseStatus,
          connectorsStatus,
        }
        delete (status as EvseStatusWorkerType).connectors
        return status
      case OutputFormat.worker:
        return {
          ...evseStatus,
          connectors: connectorsStatus,
        }
    }
  })
}
