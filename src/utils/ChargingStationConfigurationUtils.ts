import type { ChargingStation } from '../charging-station/index.js'
import type {
  ChargingStationAutomaticTransactionGeneratorConfiguration,
  ConnectorStatus,
  EvseStatusConfiguration,
  EvseStatusWorkerType
} from '../types/index.js'

export const buildChargingStationAutomaticTransactionGeneratorConfiguration = (
  chargingStation: ChargingStation
): ChargingStationAutomaticTransactionGeneratorConfiguration => {
  return {
    automaticTransactionGenerator: chargingStation.getAutomaticTransactionGeneratorConfiguration(),
    ...(chargingStation.automaticTransactionGenerator?.connectorsStatus != null && {
      automaticTransactionGeneratorStatuses: [
        ...chargingStation.automaticTransactionGenerator.connectorsStatus.values()
      ]
    })
  }
}

export const buildConnectorsStatus = (chargingStation: ChargingStation): ConnectorStatus[] => {
  return [...chargingStation.connectors.values()].map(
    ({ transactionSetInterval, ...connectorStatus }) => connectorStatus
  )
}

export const enum OutputFormat {
  configuration = 'configuration',
  worker = 'worker'
}

export const buildEvsesStatus = (
  chargingStation: ChargingStation,
  outputFormat: OutputFormat = OutputFormat.configuration
): Array<EvseStatusWorkerType | EvseStatusConfiguration> => {
  // eslint-disable-next-line array-callback-return
  return [...chargingStation.evses.values()].map(evseStatus => {
    const connectorsStatus = [...evseStatus.connectors.values()].map(
      ({ transactionSetInterval, ...connectorStatus }) => connectorStatus
    )
    let status: EvseStatusConfiguration
    switch (outputFormat) {
      case OutputFormat.worker:
        return {
          ...evseStatus,
          connectors: connectorsStatus
        }
      case OutputFormat.configuration:
        status = {
          ...evseStatus,
          connectorsStatus
        }
        delete (status as EvseStatusWorkerType).connectors
        return status
    }
  })
}
