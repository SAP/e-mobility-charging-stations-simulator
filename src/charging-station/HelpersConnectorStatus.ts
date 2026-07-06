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
import { getSingleChargingSchedule } from './HelpersChargingProfile.js'
import { getMaxNumberOfConnectors } from './HelpersConfig.js'

const moduleName = 'HelpersConnectorStatus'

/**
 * Boot-time connector status derivation.
 * - When the station is unavailable OR the specific connector is unavailable, returns `ConnectorStatusEnum.Unavailable`.
 * - Otherwise, when a transaction was running with a persisted `status`, returns that status so mid-transaction state survives a restart.
 * - Otherwise, when a `bootStatus` is configured on the connector, returns it.
 * - Otherwise, returns `ConnectorStatusEnum.Available` so a fresh connector boots ready to accept a session.
 * @param chargingStation - Owning charging station.
 * @param connectorId - Target connector id.
 * @param connectorStatus - Persisted connector status.
 * @returns Boot-time {@link ConnectorStatusEnum}.
 */
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

/**
 * Warn-and-strip pass on template-supplied connector status: a `status`
 * field on a template connector is ambiguous (should the station boot
 * into that status or observe it live?), so the field is logged and
 * removed before the connector is materialized.
 * @param connectorId - Connector id (for the warning message).
 * @param connectorStatus - Template-derived connector status to normalize in place.
 * @param logPrefix - Log prefix.
 * @param templateFile - Template file path (for the warning message).
 */
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

/**
 * Materializes a `Record<string, ConnectorStatus>` template block into a
 * numeric-keyed `Map`. Each entry is cloned so runtime mutations do not
 * leak back into the template, and each connector is normalized via
 * {@link checkStationInfoConnectorStatus} before insertion.
 * @param connectors - Template `Connectors` record.
 * @param logPrefix - Log prefix.
 * @param templateFile - Template file path (for the warning message).
 * @returns Materialized connectors map keyed by numeric connector id.
 */
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

/**
 * Post-materialization pass over the connectors map.
 * - Connector 0 (station scope) is normalized: `availability` set to `Operative` and `chargingProfiles` defaulted to `[]` when unset.
 * - Connector id `> 0` with `transactionStarted === true` and no live `transactionId` (or in `Finishing`): the stale transaction is dropped via the module-private `resetConnectorStatus`, and `locked` is cleared. A warning is logged.
 * - Connector id `> 0` with `transactionStarted === true` and a live `transactionId`: state is preserved and only a warning is logged.
 * - Connector id `> 0` with `transactionStarted` unset: the connector is fully initialized via the module-private `initializeConnectorStatus`.
 * @param connectors - Materialized connectors map (mutated in place).
 * @param logPrefix - Log prefix for the stale-transaction and live-transaction warnings.
 * @param defaultMaximumPower - Optional default per-connector maximum power forwarded to the connector initializer.
 */
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

/**
 * Clears the connector's authorization state (both local and remote)
 * and drops any pending id-tag associations. Used after a transaction
 * completes or when authorization is revoked mid-session.
 * @param connectorStatus - Target connector status to reset in place.
 */
export const resetAuthorizeConnectorStatus = (connectorStatus: ConnectorStatus): void => {
  connectorStatus.idTagLocalAuthorized = false
  connectorStatus.idTagAuthorized = false
  delete connectorStatus.localAuthorizeIdTag
  delete connectorStatus.authorizeIdTag
}

/**
 * Full connector reset: drops the transaction bookkeeping and the
 * transaction-scoped energy counter, filters out non-station-scope
 * charging profiles, and clears authorization + reservation state. The
 * station-scoped `energyActiveImportRegisterValue` is deliberately
 * preserved (persistent energy register per OCPP), and `availability` is
 * untouched. Safe to call on a `null` / `undefined` connector (no-op).
 * @param connectorStatus - Target connector status to reset in place, or `null` / `undefined` for a no-op.
 */
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

/**
 * Post-load rehydration hook: coerces the persisted reservation
 * `expiryDate` back into a `Date` instance (or drops the reservation
 * when the value cannot be parsed), and returns the same reference so
 * callers can chain.
 * @param connectorStatus - Target connector status to rehydrate in place.
 * @returns The same `connectorStatus` reference, after rehydration.
 */
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
