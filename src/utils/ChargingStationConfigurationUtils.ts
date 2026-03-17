import type { ChargingStation } from '../charging-station/index.js'
import type {
  ATGStatusEntry,
  ChargingStationAutomaticTransactionGeneratorConfiguration,
  ConnectorEntry,
  ConnectorStatus,
  EvseEntry,
  EvseStatusConfiguration,
} from '../types/index.js'

export const buildATGStatusEntries = (chargingStation: ChargingStation): ATGStatusEntry[] => {
  if (chargingStation.automaticTransactionGenerator?.connectorsStatus == null) {
    return []
  }
  return [...chargingStation.automaticTransactionGenerator.connectorsStatus.entries()].map(
    ([connectorId, status]) => ({ connectorId, status })
  )
}

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

export const buildConnectorEntries = (chargingStation: ChargingStation): ConnectorEntry[] => {
  return [...chargingStation.connectors.entries()].map(
    ([
      connectorId,
      {
        transactionEventQueue,
        transactionSetInterval,
        transactionTxUpdatedSetInterval,
        ...connector
      },
    ]) => ({
      connector,
      connectorId,
    })
  )
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

export const buildEvseEntries = (chargingStation: ChargingStation): EvseEntry[] => {
  return [...chargingStation.evses.entries()].map(([evseId, evseStatus]) => ({
    availability: evseStatus.availability,
    connectors: [...evseStatus.connectors.entries()].map(
      ([
        connectorId,
        {
          transactionEventQueue,
          transactionSetInterval,
          transactionTxUpdatedSetInterval,
          ...connector
        },
      ]) => ({
        connector,
        connectorId,
      })
    ),
    evseId,
  }))
}

export const buildEvsesStatus = (chargingStation: ChargingStation): EvseStatusConfiguration[] => {
  return [...chargingStation.evses.values()].map(evseStatus => {
    const connectorsStatus = [...evseStatus.connectors.values()].map(
      ({
        transactionEventQueue,
        transactionSetInterval,
        transactionTxUpdatedSetInterval,
        ...connectorStatus
      }) => connectorStatus
    )
    const status: EvseStatusConfiguration = {
      ...evseStatus,
      connectorsStatus,
    }
    delete (status as { connectors?: unknown }).connectors
    return status
  })
}
