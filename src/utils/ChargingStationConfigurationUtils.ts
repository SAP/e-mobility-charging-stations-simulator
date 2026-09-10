import type { ChargingStation } from '../charging-station/index.js'

import {
  type ATGEntry,
  AvailabilityType,
  type ChargingStationAutomaticTransactionGeneratorConfiguration,
  type ConnectorEntry,
  type ConnectorStatus,
  type EvseEntryData,
  type EvseStatusConfiguration,
  OCPP20ComponentName,
  OCPP20ConnectorStatusEnumType,
  OCPP20RequiredVariableName,
} from '../types/index.js'

const TRANSIENT_TX_ENDED_INTERVAL_BASELINE_KEY = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxEndedMeasurands}`

export const buildPersistentTransactionEnergyIntervalState = (
  baselines: ConnectorStatus['transactionEnergyActiveImportIntervalBaselines']
): Pick<ConnectorStatus, 'transactionEnergyActiveImportIntervalBaselines'> => {
  if (baselines == null) return {}
  const persistentBaselines = Object.fromEntries(
    Object.entries(baselines).filter(([key]) => key !== TRANSIENT_TX_ENDED_INTERVAL_BASELINE_KEY)
  )
  return Object.keys(persistentBaselines).length > 0
    ? { transactionEnergyActiveImportIntervalBaselines: persistentBaselines }
    : {}
}

const buildPersistentTransactionEnergyIntervalCarry = (
  carry: ConnectorStatus['transactionEnergyActiveImportIntervalCarry']
): Pick<ConnectorStatus, 'transactionEnergyActiveImportIntervalCarry'> => {
  if (carry == null) return {}
  const persistentCarry = Object.fromEntries(
    Object.entries(carry).filter(([key]) => key !== TRANSIENT_TX_ENDED_INTERVAL_BASELINE_KEY)
  )
  return Object.keys(persistentCarry).length > 0
    ? { transactionEnergyActiveImportIntervalCarry: persistentCarry }
    : {}
}

const hasOnlyTransientPostTransactionDelay = (
  connectorStatus: ConnectorStatus,
  postTransactionDelayTransactionId: number | string | undefined,
  transactionEnding: boolean | undefined,
  transactionStarting: boolean | undefined
): boolean =>
  postTransactionDelayTransactionId != null &&
  connectorStatus.transactionId == null &&
  connectorStatus.transactionPending !== true &&
  connectorStatus.transactionStarted !== true &&
  transactionEnding !== true &&
  transactionStarting !== true

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
          postTransactionDelayTransactionId,
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
          locked,
          postTransactionDelayTransactionId,
          transactionEndedMeterValues,
          transactionEndedMeterValuesSetInterval,
          transactionEnding,
          transactionEnergyActiveImportIntervalBaselines,
          transactionEnergyActiveImportIntervalCarry,
          transactionEventQueue,
          transactionRestored,
          transactionStarting,
          transactionUpdatedMeterValuesSetInterval,
          ...connectorStatus
        },
      }) =>
        [
          connectorId,
          {
            ...connectorStatus,
            ...buildPersistentTransactionEnergyIntervalState(
              transactionEnergyActiveImportIntervalBaselines
            ),
            ...buildPersistentTransactionEnergyIntervalCarry(
              transactionEnergyActiveImportIntervalCarry
            ),
            ...(Array.isArray(transactionEventQueue) &&
              transactionEventQueue.length > 0 && { transactionEventQueue }),
            locked: hasOnlyTransientPostTransactionDelay(
              connectorStatus,
              postTransactionDelayTransactionId,
              transactionEnding,
              transactionStarting
            )
              ? false
              : locked,
            status: hasOnlyTransientPostTransactionDelay(
              connectorStatus,
              postTransactionDelayTransactionId,
              transactionEnding,
              transactionStarting
            )
              ? chargingStation.isChargingStationAvailable() &&
                connectorStatus.availability === AvailabilityType.Operative
                ? OCPP20ConnectorStatusEnumType.Available
                : OCPP20ConnectorStatusEnumType.Unavailable
              : connectorStatus.status,
          },
        ] as [number, ConnectorStatus]
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
              postTransactionDelayTransactionId,
              transactionEndedMeterValues,
              transactionEndedMeterValuesSetInterval,
              transactionEnding,
              transactionEnergyActiveImportIntervalBaselines,
              transactionEnergyActiveImportIntervalCarry,
              transactionEventQueue,
              transactionRestored,
              transactionStarting,
              transactionUpdatedMeterValuesSetInterval,
              ...connectorStatus
            },
          ]) => ({
            connectorId,
            connectorStatus: {
              ...connectorStatus,
              ...buildPersistentTransactionEnergyIntervalState(
                transactionEnergyActiveImportIntervalBaselines
              ),
              ...buildPersistentTransactionEnergyIntervalCarry(
                transactionEnergyActiveImportIntervalCarry
              ),
            },
            evseId,
          })
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
            locked,
            postTransactionDelayTransactionId,
            transactionEndedMeterValues,
            transactionEndedMeterValuesSetInterval,
            transactionEnding,
            transactionEnergyActiveImportIntervalBaselines,
            transactionEnergyActiveImportIntervalCarry,
            transactionRestored,
            transactionStarting,
            transactionUpdatedMeterValuesSetInterval,
            ...connector
          },
        ]) => [
          connectorId,
          {
            ...connector,
            ...buildPersistentTransactionEnergyIntervalState(
              transactionEnergyActiveImportIntervalBaselines
            ),
            ...buildPersistentTransactionEnergyIntervalCarry(
              transactionEnergyActiveImportIntervalCarry
            ),
            locked: hasOnlyTransientPostTransactionDelay(
              connector,
              postTransactionDelayTransactionId,
              transactionEnding,
              transactionStarting
            )
              ? false
              : locked,
            status: hasOnlyTransientPostTransactionDelay(
              connector,
              postTransactionDelayTransactionId,
              transactionEnding,
              transactionStarting
            )
              ? chargingStation.isChargingStationAvailable() &&
                connector.availability === AvailabilityType.Operative
                ? OCPP20ConnectorStatusEnumType.Available
                : OCPP20ConnectorStatusEnumType.Unavailable
              : connector.status,
          },
        ]
      )
      const {
        connectors: _,
        energyActiveImportRegisterLastUpdatedAt: _energyActiveImportRegisterLastUpdatedAt,
        ...evseStatusRest
      } = evseStatus
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
