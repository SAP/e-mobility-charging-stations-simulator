import type { ChargingStation } from '../charging-station/index.js'
import type {
  ATGEntry,
  ChargingStationAutomaticTransactionGeneratorConfiguration,
  ConnectorEntry,
  ConnectorStatus,
  EvseEntry,
  EvseStatusConfiguration,
} from '../types/index.js'

export const buildATGEntries = (chargingStation: ChargingStation): ATGEntry[] => {
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

export const buildConnectorsStatus = (
  chargingStation: ChargingStation
): [number, ConnectorStatus][] => {
  return [...chargingStation.connectors.entries()].map(
    ([
      connectorId,
      {
        transactionEventQueue,
        transactionSetInterval,
        transactionTxUpdatedSetInterval,
        ...connectorStatus
      },
    ]) => [connectorId, connectorStatus]
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

export const buildEvsesStatus = (
  chargingStation: ChargingStation
): [number, EvseStatusConfiguration][] => {
  return [...chargingStation.evses.entries()].map(([evseId, evseStatus]) => {
    const connectorsStatus: [number, ConnectorStatus][] = [...evseStatus.connectors.entries()].map(
      ([
        connectorId,
        {
          transactionEventQueue,
          transactionSetInterval,
          transactionTxUpdatedSetInterval,
          ...connector
        },
      ]) => [connectorId, connector]
    )
    const { connectors: _, ...evseStatusRest } = evseStatus
    return [
      evseId,
      {
        ...evseStatusRest,
        connectorsStatus,
      } as EvseStatusConfiguration,
    ]
  })
}
