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
  OCPP20ComponentName,
  OCPP20ReadingContextEnumType,
  OCPP20RequiredVariableName,
  OCPP20TransactionEventEnumType,
  type QueuedTransactionEvent,
} from '../types/index.js'
import {
  clone,
  convertToDate,
  convertToInt,
  isJsonObject,
  isNotEmptyArray,
  logger,
} from '../utils/index.js'
import { buildConfigKey } from './ConfigurationKeyUtils.js'
import { getSingleChargingSchedule } from './HelpersChargingProfile.js'
import { getMaxNumberOfConnectors } from './HelpersConfig.js'
import { getRepresentedTransactionIntervalEnergyWh } from './meter-values/TransactionIntervalUtils.js'
import {
  boundTransactionEventQueue,
  queuedTransactionEventHasPublicKey,
} from './TransactionEventQueueUtils.js'

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
    delete connectorStatus.transactionEnding
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
 * physical `energyActiveImportRegisterValue` and
 * `energyActiveImportIntervalBaselines` are deliberately preserved across
 * transactions, and `availability` is untouched. Safe to call on a `null` /
 * `undefined` connector (no-op).
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
  delete connectorStatus.transactionEnding
  delete connectorStatus.transactionStarting
  delete connectorStatus.transactionRestored
  delete connectorStatus.transactionStart
  delete connectorStatus.transactionId
  delete connectorStatus.transactionIdTag
  delete connectorStatus.transactionGroupIdToken
  delete connectorStatus.transactionEnergyActiveImportIntervalBaselines
  delete connectorStatus.transactionEnergyActiveImportIntervalCarry
  delete connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt
  connectorStatus.transactionEnergyActiveImportRegisterValue = 0
  delete connectorStatus.transactionBeginMeterValue
  delete connectorStatus.transactionEndedMeterValues
  if (connectorStatus.transactionEndedMeterValuesSetInterval != null) {
    clearInterval(connectorStatus.transactionEndedMeterValuesSetInterval)
    delete connectorStatus.transactionEndedMeterValuesSetInterval
  }
  delete connectorStatus.transactionSeqNo
  delete connectorStatus.transactionStartedExhaustedTransactionId
  delete connectorStatus.publicKeySentInTransaction
  delete connectorStatus.transactionEvseSent
  delete connectorStatus.transactionIdTokenSent
  delete connectorStatus.transactionDeauthorized
  delete connectorStatus.transactionDeauthorizedEnergyWh
}

const STATION_INTERVAL_BASELINE_PREFIX = 'station:'

const sanitizeEnergyIntervalBaselines = (value: unknown): Record<string, number> =>
  isJsonObject(value)
    ? Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          entry[0].length > 0 &&
            typeof entry[1] === 'number' &&
            Number.isFinite(entry[1]) &&
            entry[1] >= 0
      )
    )
    : {}

const convertPersistedDate = (value: unknown): Date | undefined => {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
    return undefined
  }
  try {
    return convertToDate(value)
  } catch {
    return undefined
  }
}

const prepareQueuedTransactionEvent = (candidate: unknown): QueuedTransactionEvent | undefined => {
  if (
    !isJsonObject(candidate) ||
    !isJsonObject(candidate.request) ||
    !isJsonObject(candidate.request.transactionInfo) ||
    typeof candidate.seqNo !== 'number' ||
    !Number.isInteger(candidate.seqNo) ||
    typeof candidate.request.seqNo !== 'number' ||
    !Number.isInteger(candidate.request.seqNo) ||
    typeof candidate.request.eventType !== 'string' ||
    typeof candidate.request.triggerReason !== 'string' ||
    typeof candidate.request.transactionInfo.transactionId !== 'string' ||
    candidate.seqNo !== candidate.request.seqNo
  ) {
    return undefined
  }
  const queuedEvent = candidate as unknown as QueuedTransactionEvent
  if (queuedEvent.transactionEnergyActiveImportIntervalBaselines != null) {
    if (!isJsonObject(queuedEvent.transactionEnergyActiveImportIntervalBaselines)) {
      delete queuedEvent.transactionEnergyActiveImportIntervalBaselines
    } else {
      queuedEvent.transactionEnergyActiveImportIntervalBaselines = Object.fromEntries(
        Object.entries(queuedEvent.transactionEnergyActiveImportIntervalBaselines).filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0
        )
      )
    }
  }
  if (queuedEvent.transactionEnergyActiveImportIntervalConsumption != null) {
    if (!isJsonObject(queuedEvent.transactionEnergyActiveImportIntervalConsumption)) {
      delete queuedEvent.transactionEnergyActiveImportIntervalConsumption
    } else {
      queuedEvent.transactionEnergyActiveImportIntervalConsumption = Object.fromEntries(
        Object.entries(queuedEvent.transactionEnergyActiveImportIntervalConsumption).filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0
        )
      )
    }
  }
  if (
    queuedEvent.transactionEnergyActiveImportRegisterValue != null &&
    (typeof queuedEvent.transactionEnergyActiveImportRegisterValue !== 'number' ||
      !Number.isFinite(queuedEvent.transactionEnergyActiveImportRegisterValue) ||
      queuedEvent.transactionEnergyActiveImportRegisterValue < 0)
  ) {
    delete queuedEvent.transactionEnergyActiveImportRegisterValue
  }
  const queuedTimestamp = convertPersistedDate(queuedEvent.timestamp)
  const requestTimestamp = convertPersistedDate(queuedEvent.request.timestamp)
  if (queuedTimestamp == null || requestTimestamp == null) return undefined
  queuedEvent.timestamp = queuedTimestamp
  queuedEvent.request.timestamp = requestTimestamp
  if (queuedEvent.request.meterValue != null) {
    if (!isNotEmptyArray(queuedEvent.request.meterValue)) return undefined
    for (const meterValue of queuedEvent.request.meterValue) {
      if (!isJsonObject(meterValue) || !isNotEmptyArray(meterValue.sampledValue)) return undefined
      const meterValueTimestamp = convertPersistedDate(meterValue.timestamp)
      if (
        meterValueTimestamp == null ||
        !meterValue.sampledValue.every(sampledValue => isJsonObject(sampledValue))
      ) {
        return undefined
      }
      meterValue.timestamp = meterValueTimestamp
    }
  }
  return queuedEvent
}

/**
 * Rehydrates and sanitizes persisted connector state, migrates legacy
 * station interval baselines, reconstructs queued event dates and active
 * transaction ownership, and returns the same reference for chaining.
 * @param connectorStatus - Target connector status to rehydrate in place.
 * @param numberOfPhases - Physical phase count used to normalize legacy interval samples.
 * @param inletToOutputEfficiency - DC inlet-to-output efficiency used for legacy interval samples.
 * @returns The same `connectorStatus` reference, after rehydration.
 */
export const prepareConnectorStatus = (
  connectorStatus: ConnectorStatus,
  numberOfPhases = 3,
  inletToOutputEfficiency = 1
): ConnectorStatus => {
  delete connectorStatus.transactionStarting
  if (
    typeof connectorStatus.transactionStartedExhaustedTransactionId !== 'string' ||
    connectorStatus.transactionStartedExhaustedTransactionId.length === 0 ||
    connectorStatus.transactionStartedExhaustedTransactionId.length > 36
  ) {
    delete connectorStatus.transactionStartedExhaustedTransactionId
  }
  if (connectorStatus.reservation != null) {
    const reservationExpiryDate = convertToDate(connectorStatus.reservation.expiryDate)
    if (reservationExpiryDate != null) {
      connectorStatus.reservation.expiryDate = reservationExpiryDate
    } else {
      delete connectorStatus.reservation
    }
  }
  const transactionStart = convertPersistedDate(connectorStatus.transactionStart)
  if (transactionStart != null) {
    connectorStatus.transactionStart = transactionStart
  } else {
    delete connectorStatus.transactionStart
  }
  const restoredTransactionEnergy = connectorStatus.transactionEnergyActiveImportRegisterValue
  if (
    restoredTransactionEnergy != null &&
    (typeof restoredTransactionEnergy !== 'number' ||
      !Number.isFinite(restoredTransactionEnergy) ||
      restoredTransactionEnergy < 0)
  ) {
    connectorStatus.transactionEnergyActiveImportRegisterValue = 0
  }
  const intervalBaselines = sanitizeEnergyIntervalBaselines(
    connectorStatus.transactionEnergyActiveImportIntervalBaselines
  )
  const physicalIntervalBaselines = {
    ...Object.fromEntries(
      Object.entries(intervalBaselines).filter(
        ([key]) =>
          key.startsWith(STATION_INTERVAL_BASELINE_PREFIX) &&
          key.length > STATION_INTERVAL_BASELINE_PREFIX.length
      )
    ),
    ...sanitizeEnergyIntervalBaselines(connectorStatus.energyActiveImportIntervalBaselines),
  }
  if (Object.keys(physicalIntervalBaselines).length > 0) {
    connectorStatus.energyActiveImportIntervalBaselines = physicalIntervalBaselines
  } else {
    delete connectorStatus.energyActiveImportIntervalBaselines
  }
  const transactionIntervalBaselines = Object.fromEntries(
    Object.entries(intervalBaselines).filter(
      ([key]) => !key.startsWith(STATION_INTERVAL_BASELINE_PREFIX)
    )
  )
  if (Object.keys(transactionIntervalBaselines).length > 0) {
    connectorStatus.transactionEnergyActiveImportIntervalBaselines = transactionIntervalBaselines
  } else {
    delete connectorStatus.transactionEnergyActiveImportIntervalBaselines
  }
  const intervalCarry = connectorStatus.transactionEnergyActiveImportIntervalCarry
  if (intervalCarry != null) {
    if (!isJsonObject(intervalCarry)) {
      delete connectorStatus.transactionEnergyActiveImportIntervalCarry
    } else {
      connectorStatus.transactionEnergyActiveImportIntervalCarry = Object.fromEntries(
        Object.entries(intervalCarry).filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0
        )
      )
    }
  }
  const transactionEnergyLastUpdatedAt = convertPersistedDate(
    connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt
  )
  if (transactionEnergyLastUpdatedAt != null) {
    connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt =
      transactionEnergyLastUpdatedAt
  } else {
    delete connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt
  }
  if (
    connectorStatus.transactionEventQueue != null &&
    !Array.isArray(connectorStatus.transactionEventQueue)
  ) {
    delete connectorStatus.transactionEventQueue
    connectorStatus.publicKeySentInTransaction = false
  } else if (isNotEmptyArray(connectorStatus.transactionEventQueue)) {
    const transactionId = connectorStatus.transactionId?.toString()
    let removedActiveTransactionEvent = false
    const preparedQueue: QueuedTransactionEvent[] = []
    for (const candidate of connectorStatus.transactionEventQueue as unknown[]) {
      const candidateTransactionId =
        isJsonObject(candidate) &&
        isJsonObject(candidate.request) &&
        isJsonObject(candidate.request.transactionInfo) &&
        typeof candidate.request.transactionInfo.transactionId === 'string'
          ? candidate.request.transactionInfo.transactionId
          : undefined
      const queuedEvent = prepareQueuedTransactionEvent(candidate)
      if (queuedEvent != null) {
        if (
          queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated &&
          queuedEvent.transactionEnergyActiveImportIntervalConsumption == null &&
          queuedEvent.request.transactionInfo.transactionId === transactionId &&
          queuedEvent.request.meterValue != null
        ) {
          const intervalConsumption: Record<string, number> = {}
          for (const sampleClock of [true, false]) {
            const baselineKey = buildConfigKey(
              sampleClock
                ? OCPP20ComponentName.AlignedDataCtrlr
                : OCPP20ComponentName.SampledDataCtrlr,
              sampleClock
                ? OCPP20RequiredVariableName.Measurands
                : OCPP20RequiredVariableName.TxUpdatedMeasurands
            )
            for (const meterValue of queuedEvent.request.meterValue) {
              const cadenceMeterValue = {
                ...meterValue,
                sampledValue: meterValue.sampledValue.filter(
                  sampledValue =>
                    (sampledValue.context === OCPP20ReadingContextEnumType.SAMPLE_CLOCK) ===
                    sampleClock
                ),
              }
              if (cadenceMeterValue.sampledValue.length === 0) continue
              const representedEnergyWh = getRepresentedTransactionIntervalEnergyWh(
                cadenceMeterValue,
                numberOfPhases,
                inletToOutputEfficiency
              )
              if (representedEnergyWh > 0) {
                intervalConsumption[baselineKey] =
                  (intervalConsumption[baselineKey] ?? 0) + representedEnergyWh
              }
            }
          }
          if (Object.keys(intervalConsumption).length > 0) {
            queuedEvent.transactionEnergyActiveImportIntervalConsumption = intervalConsumption
          }
        }
        preparedQueue.push(queuedEvent)
      } else if (transactionId != null && candidateTransactionId === transactionId) {
        removedActiveTransactionEvent = true
      }
    }
    const activeTransactionMaxSeqNo =
      transactionId != null
        ? preparedQueue.reduce(
          (maximumSeqNo, queuedEvent) =>
            queuedEvent.request.transactionInfo.transactionId === transactionId
              ? Math.max(maximumSeqNo, queuedEvent.seqNo)
              : maximumSeqNo,
          connectorStatus.transactionSeqNo ?? -1
        )
        : -1
    connectorStatus.transactionEventQueue = preparedQueue
    const { removedEvents } = boundTransactionEventQueue(connectorStatus)
    if (
      transactionId != null &&
      removedEvents.some(
        queuedEvent => queuedEvent.request.transactionInfo.transactionId === transactionId
      )
    ) {
      removedActiveTransactionEvent = true
    }
    if (activeTransactionMaxSeqNo >= 0) {
      connectorStatus.transactionSeqNo = activeTransactionMaxSeqNo
    }
    if (
      removedActiveTransactionEvent &&
      connectorStatus.publicKeySentInTransaction === true &&
      transactionId != null &&
      preparedQueue.every(
        queuedEvent => !queuedTransactionEventHasPublicKey(queuedEvent, transactionId)
      )
    ) {
      connectorStatus.publicKeySentInTransaction = false
    }
  }
  let transactionId = connectorStatus.transactionId?.toString()
  const hasQueuedTransactionEvent =
    transactionId != null &&
    connectorStatus.transactionEventQueue?.some(
      queuedEvent => queuedEvent.request.transactionInfo.transactionId === transactionId
    ) === true
  if (
    transactionId != null &&
    connectorStatus.transactionStarted !== true &&
    connectorStatus.transactionStartedExhaustedTransactionId === transactionId &&
    !hasQueuedTransactionEvent
  ) {
    resetConnectorStatus(connectorStatus)
    transactionId = undefined
  }
  const ownsExhaustedStartedTransaction =
    transactionId != null &&
    connectorStatus.transactionStartedExhaustedTransactionId === transactionId
  if (
    connectorStatus.transactionStartedExhaustedTransactionId != null &&
    !ownsExhaustedStartedTransaction
  ) {
    delete connectorStatus.transactionStartedExhaustedTransactionId
  }
  const ownsQueuedStartedEvent =
    connectorStatus.transactionStarted !== true &&
    transactionId != null &&
    connectorStatus.transactionEventQueue?.some(
      queuedEvent =>
        queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Started &&
        queuedEvent.request.transactionInfo.transactionId === transactionId
    ) === true
  const ownsQueuedEndedEvent =
    transactionId != null &&
    connectorStatus.transactionEventQueue?.some(
      queuedEvent =>
        queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended &&
        queuedEvent.request.transactionInfo.transactionId === transactionId
    ) === true
  if (ownsQueuedEndedEvent) {
    delete connectorStatus.transactionStarting
    connectorStatus.transactionEnding = true
  } else if (
    connectorStatus.transactionStarted !== true &&
    (ownsQueuedStartedEvent || ownsExhaustedStartedTransaction)
  ) {
    connectorStatus.transactionStarted = false
    connectorStatus.transactionStarting = true
  }
  connectorStatus.transactionRestored =
    transactionId != null &&
    (connectorStatus.transactionStarted === true ||
      ownsQueuedStartedEvent ||
      ownsQueuedEndedEvent ||
      ownsExhaustedStartedTransaction)
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
