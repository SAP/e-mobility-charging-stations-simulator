import type { ChargingStation } from '../charging-station/index.js'
import type {
  ATGEntry,
  ChargingStationAutomaticTransactionGeneratorConfiguration,
  ConnectorEntry,
  ConnectorStatus,
  EvseEntryData,
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
  if (chargingStation.hasEvses) {
    return []
  }
  return chargingStation
    .iterateConnectors()
    .map(
      ({
        connectorId,
        connectorStatus: {
          transactionEndedMeterValues,
          transactionEndedMeterValuesSetInterval,
          transactionEnding,
          transactionEventQueue,
          transactionUpdatedMeterValuesSetInterval,
          ...connectorStatus
        },
      }) => ({
        connectorId,
        connectorStatus,
        evseId: undefined,
      })
    )
    .toArray()
}

export const buildConnectorsStatus = (
  chargingStation: ChargingStation
): [number, ConnectorStatus][] => {
  if (chargingStation.hasEvses) {
    return []
  }
  return chargingStation
    .iterateConnectors()
    .map(
      ({
        connectorId,
        connectorStatus: {
          transactionEndedMeterValues,
          transactionEndedMeterValuesSetInterval,
          transactionEnding,
          transactionEventQueue,
          transactionUpdatedMeterValuesSetInterval,
          ...connectorStatus
        },
      }) => [connectorId, connectorStatus] as [number, ConnectorStatus]
    )
    .toArray()
}

export const buildEvseEntries = (chargingStation: ChargingStation): EvseEntryData[] => {
  return chargingStation
    .iterateEvses()
    .map(({ evseId, evseStatus }) => ({
      evseId,
      evseStatus: {
        availability: evseStatus.availability,
        connectors: [...evseStatus.connectors.entries()].map(
          ([
            connectorId,
            {
              transactionEndedMeterValues,
              transactionEndedMeterValuesSetInterval,
              transactionEnding,
              transactionEventQueue,
              transactionUpdatedMeterValuesSetInterval,
              ...connectorStatus
            },
          ]) => ({ connectorId, connectorStatus, evseId })
        ),
      },
    }))
    .toArray()
}

export const buildEvsesStatus = (
  chargingStation: ChargingStation
): [number, EvseStatusConfiguration][] => {
  return chargingStation
    .iterateEvses()
    .map(({ evseId, evseStatus }) => {
      const connectorsStatus: [number, ConnectorStatus][] = [
        ...evseStatus.connectors.entries(),
      ].map(
        ([
          connectorId,
          {
            transactionEndedMeterValues,
            transactionEndedMeterValuesSetInterval,
            transactionEnding,
            transactionEventQueue,
            transactionUpdatedMeterValuesSetInterval,
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
        },
      ] as [number, EvseStatusConfiguration]
    })
    .toArray()
}
