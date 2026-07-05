// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Connector-status helpers.
 * @description Connector-status lifecycle helpers: boot-time status
 *   resolution, connectors-map construction, connectors-map
 *   initialization, per-connector reset, authorize-state reset, and
 *   post-load rehydration. Re-exported from `./Helpers.js` so callers
 *   keep the barrel import path
 *   (`import { buildConnectorsMap, ... } from './Helpers.js'`).
 */

import type { ChargingStation } from './ChargingStation.js'

import {
  AvailabilityType,
  ChargingProfilePurposeType,
  type ConnectorStatus,
  ConnectorStatusEnum,
} from '../types/index.js'
import { clone, convertToDate, convertToInt, isNotEmptyArray, logger } from '../utils/index.js'
import { getMaxNumberOfConnectors } from './Helpers.js'
import { getSingleChargingSchedule } from './HelpersChargingProfile.js'

const moduleName = 'HelpersConnectorStatus'

export const getBootConnectorStatus = (
  chargingStation: ChargingStation,
  connectorId: number,
  connectorStatus: ConnectorStatus
): ConnectorStatusEnum => {
  if (
    !chargingStation.isChargingStationAvailable() ||
    !chargingStation.isConnectorAvailable(connectorId)
  ) {
    return ConnectorStatusEnum.Unavailable
  }
  if (connectorStatus.transactionStarted === true && connectorStatus.status != null) {
    return connectorStatus.status
  }
  if (connectorStatus.bootStatus != null) {
    return connectorStatus.bootStatus
  }
  return ConnectorStatusEnum.Available
}

export const checkStationInfoConnectorStatus = (
  connectorId: number,
  connectorStatus: ConnectorStatus,
  logPrefix: string,
  templateFile: string
): void => {
  if (connectorStatus.status != null) {
    logger.warn(
      `${logPrefix} ${moduleName}.checkStationInfoConnectorStatus: Charging station information from template ${templateFile} with connector id ${connectorId.toString()} status configuration defined, removing it`
    )
    delete connectorStatus.status
  }
}

export const buildConnectorsMap = (
  connectors: Record<string, ConnectorStatus>,
  logPrefix: string,
  templateFile: string
): Map<number, ConnectorStatus> => {
  const connectorsMap = new Map<number, ConnectorStatus>()
  if (getMaxNumberOfConnectors(connectors) > 0) {
    for (const [connectorKey, connectorStatus] of Object.entries(connectors)) {
      const connectorId = convertToInt(connectorKey)
      checkStationInfoConnectorStatus(connectorId, connectorStatus, logPrefix, templateFile)
      connectorsMap.set(connectorId, clone(connectorStatus))
    }
  } else {
    logger.warn(
      `${logPrefix} ${moduleName}.buildConnectorsMap: Charging station information from template ${templateFile} with no connectors, cannot build connectors map`
    )
  }
  return connectorsMap
}

export const initializeConnectorsMapStatus = (
  connectors: Map<number, ConnectorStatus>,
  logPrefix: string,
  defaultMaximumPower?: number
): void => {
  for (const [connectorId, connectorStatus] of connectors) {
    if (connectorId > 0 && connectorStatus.transactionStarted === true) {
      if (
        connectorStatus.transactionId == null ||
        connectorStatus.status === ConnectorStatusEnum.Finishing
      ) {
        resetConnectorStatus(connectorStatus)
        connectorStatus.locked = false
        logger.warn(
          `${logPrefix} ${moduleName}.initializeConnectorsMapStatus: Connector id ${connectorId.toString()} at initialization has stale transaction state, resetting`
        )
      } else {
        logger.warn(
          `${logPrefix} ${moduleName}.initializeConnectorsMapStatus: Connector id ${connectorId.toString()} at initialization has a transaction started with id ${connectorStatus.transactionId.toString()}`
        )
      }
    }
    if (connectorId === 0) {
      connectorStatus.availability = AvailabilityType.Operative
      connectorStatus.chargingProfiles ??= []
    } else if (connectorId > 0 && connectorStatus.transactionStarted == null) {
      initializeConnectorStatus(connectorStatus, defaultMaximumPower)
    }
  }
}

export const resetAuthorizeConnectorStatus = (connectorStatus: ConnectorStatus): void => {
  connectorStatus.idTagLocalAuthorized = false
  connectorStatus.idTagAuthorized = false
  delete connectorStatus.localAuthorizeIdTag
  delete connectorStatus.authorizeIdTag
}

export const resetConnectorStatus = (connectorStatus: ConnectorStatus | undefined): void => {
  if (connectorStatus == null) {
    return
  }
  if (isNotEmptyArray(connectorStatus.chargingProfiles)) {
    connectorStatus.chargingProfiles = connectorStatus.chargingProfiles.filter(
      chargingProfile =>
        (chargingProfile.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE &&
          chargingProfile.transactionId != null &&
          connectorStatus.transactionId != null &&
          chargingProfile.transactionId !== connectorStatus.transactionId) ||
        chargingProfile.chargingProfilePurpose !== ChargingProfilePurposeType.TX_PROFILE
    )
  }
  resetAuthorizeConnectorStatus(connectorStatus)
  connectorStatus.transactionPending = false
  connectorStatus.transactionRemoteStarted = false
  connectorStatus.transactionStarted = false
  delete connectorStatus.transactionStart
  delete connectorStatus.transactionId
  delete connectorStatus.transactionIdTag
  delete connectorStatus.transactionGroupIdToken
  connectorStatus.transactionEnergyActiveImportRegisterValue = 0
  delete connectorStatus.transactionBeginMeterValue
  delete connectorStatus.transactionEndedMeterValues
  if (connectorStatus.transactionEndedMeterValuesSetInterval != null) {
    clearInterval(connectorStatus.transactionEndedMeterValuesSetInterval)
    delete connectorStatus.transactionEndedMeterValuesSetInterval
  }
  delete connectorStatus.transactionSeqNo
  delete connectorStatus.publicKeySentInTransaction
  delete connectorStatus.transactionEvseSent
  delete connectorStatus.transactionIdTokenSent
  delete connectorStatus.transactionDeauthorized
  delete connectorStatus.transactionDeauthorizedEnergyWh
}

export const prepareConnectorStatus = (connectorStatus: ConnectorStatus): ConnectorStatus => {
  if (connectorStatus.reservation != null) {
    const reservationExpiryDate = convertToDate(connectorStatus.reservation.expiryDate)
    if (reservationExpiryDate != null) {
      connectorStatus.reservation.expiryDate = reservationExpiryDate
    } else {
      delete connectorStatus.reservation
    }
  }
  if (isNotEmptyArray(connectorStatus.chargingProfiles)) {
    connectorStatus.chargingProfiles = connectorStatus.chargingProfiles
      .filter(
        chargingProfile =>
          chargingProfile.chargingProfilePurpose !== ChargingProfilePurposeType.TX_PROFILE
      )
      .map(chargingProfile => {
        const chargingSchedule = getSingleChargingSchedule(chargingProfile)
        if (chargingSchedule != null) {
          chargingSchedule.startSchedule =
            convertToDate(chargingSchedule.startSchedule) ?? new Date()
        }
        chargingProfile.validFrom = convertToDate(chargingProfile.validFrom)
        chargingProfile.validTo = convertToDate(chargingProfile.validTo)
        return chargingProfile
      })
  }
  return connectorStatus
}

const initializeConnectorStatus = (
  connectorStatus: ConnectorStatus,
  defaultMaximumPower?: number
): void => {
  connectorStatus.availability = AvailabilityType.Operative
  connectorStatus.idTagLocalAuthorized = false
  connectorStatus.idTagAuthorized = false
  connectorStatus.transactionRemoteStarted = false
  connectorStatus.transactionStarted = false
  connectorStatus.energyActiveImportRegisterValue = 0
  connectorStatus.transactionEnergyActiveImportRegisterValue = 0
  connectorStatus.chargingProfiles ??= []
  if (defaultMaximumPower != null) {
    connectorStatus.maximumPower ??= defaultMaximumPower
  }
}
