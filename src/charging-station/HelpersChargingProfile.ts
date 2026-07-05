// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Charging profile helpers.
 * @description Predicates and helpers for OCPP charging profiles: station
 *   and connector charging-profile limit resolution, single-schedule
 *   selection, recurring profile preparation, and validity checks.
 *   Re-exported from `./Helpers.js` so callers keep the barrel import path
 *   (`import { canProceedChargingProfile, ... } from './Helpers.js'`).
 */

import {
  addDays,
  addSeconds,
  addWeeks,
  differenceInDays,
  differenceInSeconds,
  differenceInWeeks,
  type Interval,
  isAfter,
  isBefore,
  isDate,
  isWithinInterval,
  toDate,
} from 'date-fns'
import { maxTime } from 'date-fns/constants'

import type { ChargingStation } from './ChargingStation.js'

import { BaseError } from '../exception/index.js'
import {
  type ChargingProfile,
  ChargingProfileKindType,
  ChargingProfilePurposeType,
  ChargingRateUnitType,
  type ChargingSchedule,
  type ChargingSchedulePeriod,
  type ConnectorStatus,
  CurrentType,
  RecurrencyKindType,
} from '../types/index.js'
import {
  ACElectricUtils,
  convertToDate,
  DCElectricUtils,
  isArraySorted,
  isNotEmptyArray,
  isValidDate,
  logger,
} from '../utils/index.js'

const moduleName = 'HelpersChargingProfile'

interface ChargingProfilesLimit {
  chargingProfile: ChargingProfile
  limit: number
}

const getChargingProfileId = (chargingProfile: ChargingProfile): string => {
  const id = chargingProfile.chargingProfileId ?? chargingProfile.id
  return typeof id === 'number' ? id.toString() : 'unknown'
}

/**
 * Extracts the single {@link ChargingSchedule} referenced by a charging
 * profile. OCPP 1.6 templates carry the schedule directly as a single
 * value and are returned unchanged. OCPP 2.0.x templates carry a
 * `chargingSchedule` array of 1 to 3 entries: a single-entry array is
 * unwrapped and returned; a 0 or 2-3 entry array is logged (debug) and
 * `undefined` is returned so the caller can skip cleanly, because the
 * coherent path does not currently pick between multiple concurrent
 * OCPP 2.0.x schedules.
 * @param chargingProfile - Source charging profile.
 * @param logPrefix - Optional log prefix for the multi-entry debug entry.
 * @param methodName - Optional caller name included in the debug entry.
 * @returns Single schedule for the OCPP 1.6 shape or a length-1 OCPP 2.0.x array, or `undefined` when the array carries 0 or 2-3 entries.
 */
export const getSingleChargingSchedule = (
  chargingProfile: ChargingProfile,
  logPrefix?: string,
  methodName?: string
): ChargingSchedule | undefined => {
  if (!Array.isArray(chargingProfile.chargingSchedule)) {
    return chargingProfile.chargingSchedule
  }
  if (chargingProfile.chargingSchedule.length === 1) {
    return chargingProfile.chargingSchedule[0]
  }
  if (logPrefix != null && methodName != null) {
    logger.debug(
      `${logPrefix} ${moduleName}.${methodName}: Charging profile id ${getChargingProfileId(chargingProfile)} has an OCPP 2.0 chargingSchedule array with ${chargingProfile.chargingSchedule.length.toString()} entries and is skipped`
    )
  }
}

const getChargingStationChargingProfiles = (
  chargingStation: ChargingStation
): ChargingProfile[] => {
  return (chargingStation.getConnectorStatus(0)?.chargingProfiles ?? [])
    .filter(
      chargingProfile =>
        chargingProfile.chargingProfilePurpose ===
          ChargingProfilePurposeType.CHARGE_POINT_MAX_PROFILE ||
        chargingProfile.chargingProfilePurpose ===
          ChargingProfilePurposeType.ChargingStationMaxProfile ||
        chargingProfile.chargingProfilePurpose ===
          ChargingProfilePurposeType.ChargingStationExternalConstraints
    )
    .sort((a, b) => b.stackLevel - a.stackLevel)
}

/**
 * Highest-priority station-scope power limit currently in effect on the
 * station. Combines the charging profiles whose purpose matches any
 * station-scope value: `CHARGE_POINT_MAX_PROFILE` on OCPP 1.6, or
 * `ChargingStationMaxProfile` / `ChargingStationExternalConstraints` on
 * OCPP 2.0.1. Both OCPP 2.0.1 purposes cap station power at EVSE 0
 * (`ChargingStationMaxProfile` is the station-owned operational cap per
 * OCA K04 Internal Load Balancing; `ChargingStationExternalConstraints`
 * is a limit imposed by an external system that the station stores
 * internally per OCA K11-K14 External Charging Limit and reports upstream
 * to the CSMS via `NotifyChargingLimit` / `ReportChargingProfiles`, and
 * that participates in composite-schedule merging per OCA K08.FR.04 and
 * safety invariant SC.01); the coherent path treats both OCPP 2.0.1
 * purposes as equivalent inputs to the stack-level tie-break. Sorts by
 * stack level and evaluates the winning profile's schedule period.
 * @param chargingStation - Source charging station.
 * @returns Limit in watts, or `undefined` when no applicable profile is found.
 */
export const getChargingStationChargingProfilesLimit = (
  chargingStation: ChargingStation
): number | undefined => {
  const chargingProfiles = getChargingStationChargingProfiles(chargingStation)
  if (isNotEmptyArray(chargingProfiles)) {
    const chargingProfilesLimit = getChargingProfilesLimit(chargingStation, 0, chargingProfiles)
    if (chargingProfilesLimit != null) {
      const limit = buildChargingProfilesLimit(chargingStation, chargingProfilesLimit)
      const chargingStationMaximumPower = chargingStation.stationInfo?.maximumPower
      if (chargingStationMaximumPower == null) {
        return limit
      }
      if (limit > chargingStationMaximumPower) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.getChargingStationChargingProfilesLimit: Charging profile id ${getChargingProfileId(chargingProfilesLimit.chargingProfile)} limit ${limit.toString()} is greater than charging station maximum ${chargingStationMaximumPower.toString()}: %j`,
          chargingProfilesLimit
        )
        return chargingStationMaximumPower
      }
      return limit
    }
  }
}

/**
 * Gets the connector charging profiles relevant for power limitation shallow cloned
 * and sorted by priorities
 * @param chargingStation - Charging station
 * @param connectorId - Connector id
 * @returns Connector charging profiles array
 */
export const getConnectorChargingProfiles = (
  chargingStation: ChargingStation,
  connectorId: number
): ChargingProfile[] => {
  return (chargingStation.getConnectorStatus(connectorId)?.chargingProfiles ?? [])
    .slice()
    .sort((a, b) => {
      if (
        a.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE &&
        b.chargingProfilePurpose === ChargingProfilePurposeType.TX_DEFAULT_PROFILE
      ) {
        return -1
      } else if (
        a.chargingProfilePurpose === ChargingProfilePurposeType.TX_DEFAULT_PROFILE &&
        b.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE
      ) {
        return 1
      }
      return b.stackLevel - a.stackLevel
    })
    .concat(
      (chargingStation.getConnectorStatus(0)?.chargingProfiles ?? [])
        .filter(
          chargingProfile =>
            chargingProfile.chargingProfilePurpose === ChargingProfilePurposeType.TX_DEFAULT_PROFILE
        )
        .sort((a, b) => b.stackLevel - a.stackLevel)
    )
}

/**
 * Highest-priority per-connector power limit currently in effect on the
 * given connector. Combines that connector's charging profiles, filters
 * by priority, and evaluates the winning profile's schedule period.
 * @param chargingStation - Source charging station.
 * @param connectorId - Target connector id.
 * @returns Limit in watts, or `undefined` when no applicable profile is found.
 */
export const getConnectorChargingProfilesLimit = (
  chargingStation: ChargingStation,
  connectorId: number
): number | undefined => {
  const chargingProfiles = getConnectorChargingProfiles(chargingStation, connectorId)
  if (isNotEmptyArray(chargingProfiles)) {
    const chargingProfilesLimit = getChargingProfilesLimit(
      chargingStation,
      connectorId,
      chargingProfiles
    )
    if (chargingProfilesLimit != null) {
      const limit = buildChargingProfilesLimit(chargingStation, chargingProfilesLimit)
      const maximumPower = chargingStation.stationInfo?.maximumPower
      if (maximumPower == null) {
        return limit
      }
      const connectorMaximumPower =
        chargingStation.getConnectorStatus(connectorId)?.maximumPower ??
        maximumPower / (chargingStation.powerDivider ?? 1)
      if (limit > connectorMaximumPower) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.getConnectorChargingProfilesLimit: Charging profile id ${getChargingProfileId(chargingProfilesLimit.chargingProfile)} limit ${limit.toString()} is greater than connector ${connectorId.toString()} maximum ${connectorMaximumPower.toString()}: %j`,
          chargingProfilesLimit
        )
        return connectorMaximumPower
      }
      return limit
    }
  }
}

/**
 * Converts a charging-profiles limit expressed in the schedule's unit into
 * watts. When the schedule unit is already `WATT`, the limit is returned
 * unchanged; when it is `AMPERE`, the value is converted using the AC or
 * DC electrical helper matching the station's `currentOutType`.
 * @param chargingStation - Station carrying `stationInfo.currentOutType`.
 * @param chargingProfilesLimit - Selected charging profile and its raw limit.
 * @returns Limit in watts, or the raw limit when no schedule is available.
 * @throws {BaseError} When `stationInfo.currentOutType` is neither `AC` nor `DC`.
 */
const buildChargingProfilesLimit = (
  chargingStation: ChargingStation,
  chargingProfilesLimit: ChargingProfilesLimit
): number => {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  const errorMsg = `Unknown ${chargingStation.stationInfo?.currentOutType} currentOutType in charging station information, cannot build charging profiles limit`
  const { chargingProfile, limit } = chargingProfilesLimit
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    chargingStation.logPrefix(),
    'buildChargingProfilesLimit'
  )
  if (chargingSchedule == null) {
    return limit
  }
  switch (chargingStation.stationInfo?.currentOutType) {
    case CurrentType.AC:
      return chargingSchedule.chargingRateUnit === ChargingRateUnitType.WATT
        ? limit
        : ACElectricUtils.powerTotal(
          chargingStation.getNumberOfPhases(),
          chargingStation.getVoltageOut(),
          limit
        )
    case CurrentType.DC:
      return chargingSchedule.chargingRateUnit === ChargingRateUnitType.WATT
        ? limit
        : DCElectricUtils.power(chargingStation.getVoltageOut(), limit)
    default:
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.buildChargingProfilesLimit: ${errorMsg}`
      )
      throw new BaseError(errorMsg)
  }
}

/**
 * Get the charging profiles limit for a connector
 * Charging profiles shall already be sorted by priorities
 * @param chargingStation - The charging station instance
 * @param connectorId - The connector identifier
 * @param chargingProfiles - Array of charging profiles
 * @returns Charging profiles limit or undefined if no valid limit found
 */
const getChargingProfilesLimit = (
  chargingStation: ChargingStation,
  connectorId: number,
  chargingProfiles: ChargingProfile[]
): ChargingProfilesLimit | undefined => {
  const debugLogMsg = `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profiles limit found: %j`
  const currentDate = new Date()
  const connectorStatus = chargingStation.getConnectorStatus(connectorId)
  let previousActiveChargingProfile: ChargingProfile | undefined
  for (const chargingProfile of chargingProfiles) {
    const chargingProfileId = getChargingProfileId(chargingProfile)
    const chargingSchedule = getSingleChargingSchedule(
      chargingProfile,
      chargingStation.logPrefix(),
      'getChargingProfilesLimit'
    )
    if (chargingSchedule == null) {
      continue
    }
    if (chargingSchedule.startSchedule == null) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfileId} has no startSchedule defined. Trying to set it to the connector current transaction start date`
      )
      // OCPP specifies that if startSchedule is not defined, it should be relative to start of the connector transaction
      chargingSchedule.startSchedule = connectorStatus?.transactionStart
    }
    if (!isDate(chargingSchedule.startSchedule)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfileId} startSchedule property is not a Date instance. Trying to convert it to a Date instance`
      )
      chargingSchedule.startSchedule = convertToDate(chargingSchedule.startSchedule) ?? new Date()
    }
    if (chargingSchedule.duration == null) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfileId} has no duration defined and will be set to the maximum time allowed`
      )
      // OCPP specifies that if duration is not defined, it should be infinite

      chargingSchedule.duration = differenceInSeconds(maxTime, chargingSchedule.startSchedule)
    }
    if (
      !prepareChargingProfileKind(
        connectorStatus,
        chargingProfile,
        currentDate,
        chargingStation.logPrefix()
      )
    ) {
      continue
    }
    if (!canProceedChargingProfile(chargingProfile, currentDate, chargingStation.logPrefix())) {
      continue
    }
    // Check if the charging profile is active
    if (
      isWithinInterval(currentDate, {
        end: addSeconds(chargingSchedule.startSchedule, chargingSchedule.duration),

        start: chargingSchedule.startSchedule,
      })
    ) {
      if (isNotEmptyArray<ChargingSchedulePeriod>(chargingSchedule.chargingSchedulePeriod)) {
        const chargingSchedulePeriodCompareFn = (
          a: ChargingSchedulePeriod,
          b: ChargingSchedulePeriod
        ): number => a.startPeriod - b.startPeriod
        if (
          !isArraySorted<ChargingSchedulePeriod>(
            chargingSchedule.chargingSchedulePeriod,
            chargingSchedulePeriodCompareFn
          )
        ) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfileId} schedule periods are not sorted by start period`
          )

          chargingSchedule.chargingSchedulePeriod.sort(chargingSchedulePeriodCompareFn)
        }
        // Check if the first schedule period startPeriod property is equal to 0

        if (chargingSchedule.chargingSchedulePeriod[0].startPeriod !== 0) {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.getChargingProfilesLimit: Charging profile id ${chargingProfileId} first schedule period start period ${chargingSchedule.chargingSchedulePeriod[0].startPeriod.toString()} is not equal to 0`
          )
          continue
        }
        // Handle only one schedule period

        if (chargingSchedule.chargingSchedulePeriod.length === 1) {
          const chargingProfilesLimit: ChargingProfilesLimit = {
            chargingProfile,

            limit: chargingSchedule.chargingSchedulePeriod[0].limit,
          }
          logger.debug(debugLogMsg, chargingProfilesLimit)
          return chargingProfilesLimit
        }
        let previousChargingSchedulePeriod: ChargingSchedulePeriod | undefined
        // Search for the right schedule period
        for (const [
          index,
          chargingSchedulePeriod,
        ] of chargingSchedule.chargingSchedulePeriod.entries()) {
          // Find the right schedule period
          if (
            isAfter(
              addSeconds(chargingSchedule.startSchedule, chargingSchedulePeriod.startPeriod),
              currentDate
            )
          ) {
            // Found the schedule period: previous is the correct one
            const chargingProfilesLimit: ChargingProfilesLimit = {
              chargingProfile: previousActiveChargingProfile ?? chargingProfile,

              limit: previousChargingSchedulePeriod?.limit ?? chargingSchedulePeriod.limit,
            }
            logger.debug(debugLogMsg, chargingProfilesLimit)
            return chargingProfilesLimit
          }
          // Handle the last schedule period within the charging profile duration
          if (
            index === chargingSchedule.chargingSchedulePeriod.length - 1 ||
            (index < chargingSchedule.chargingSchedulePeriod.length - 1 &&
              differenceInSeconds(
                addSeconds(
                  chargingSchedule.startSchedule,

                  chargingSchedule.chargingSchedulePeriod[index + 1].startPeriod
                ),

                chargingSchedule.startSchedule
              ) > chargingSchedule.duration)
          ) {
            const chargingProfilesLimit: ChargingProfilesLimit = {
              chargingProfile,

              limit: chargingSchedulePeriod.limit,
            }
            logger.debug(debugLogMsg, chargingProfilesLimit)
            return chargingProfilesLimit
          }
          // Keep a reference to previous charging schedule period

          previousChargingSchedulePeriod = chargingSchedulePeriod
        }
      }
      // Keep a reference to previous active charging profile
      previousActiveChargingProfile = chargingProfile
    }
  }
}

/**
 * Materializes a charging profile's `chargingProfileKind` for the given
 * connector when the kind is `Recurring` or `Relative`, promoting the
 * profile's `startSchedule` to an absolute date derived from the current
 * moment (relative) or the recurrence period (recurring).
 * @param connectorStatus - Target connector status; unused for absolute-kind profiles.
 * @param chargingProfile - Profile to prepare (mutated when kind is `Recurring` or `Relative`).
 * @param currentDate - Reference clock reading.
 * @param logPrefix - Log prefix for the warn/error paths.
 * @returns `true` when the profile is usable after preparation, `false` otherwise.
 */
export const prepareChargingProfileKind = (
  connectorStatus: ConnectorStatus | undefined,
  chargingProfile: ChargingProfile,
  currentDate: Date | number | string,
  logPrefix: string
): boolean => {
  const chargingProfileId = getChargingProfileId(chargingProfile)
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    logPrefix,
    'prepareChargingProfileKind'
  )
  if (chargingSchedule == null) {
    return false
  }
  switch (chargingProfile.chargingProfileKind) {
    case ChargingProfileKindType.RECURRING:
      if (!canProceedRecurringChargingProfile(chargingProfile, logPrefix)) {
        return false
      }
      prepareRecurringChargingProfile(chargingProfile, currentDate, logPrefix)
      break
    case ChargingProfileKindType.RELATIVE:
      if (chargingSchedule.startSchedule != null) {
        logger.warn(
          `${logPrefix} ${moduleName}.prepareChargingProfileKind: Relative charging profile id ${chargingProfileId} has a startSchedule property defined. It will be ignored or used if the connector has a transaction started`
        )
        delete chargingSchedule.startSchedule
      }
      if (connectorStatus?.transactionStarted !== true) {
        logger.debug(
          `${logPrefix} ${moduleName}.prepareChargingProfileKind: Relative charging profile id ${chargingProfileId} has no active transaction, cannot be evaluated`
        )
        return false
      }
      chargingSchedule.startSchedule = connectorStatus.transactionStart
      if (chargingSchedule.startSchedule == null) {
        logger.warn(
          `${logPrefix} ${moduleName}.prepareChargingProfileKind: Relative charging profile id ${chargingProfileId} has active transaction without start date`
        )
        return false
      }
      if (chargingSchedule.duration != null) {
        const elapsedSeconds = differenceInSeconds(currentDate, chargingSchedule.startSchedule)
        if (elapsedSeconds > chargingSchedule.duration) {
          logger.debug(
            `${logPrefix} ${moduleName}.prepareChargingProfileKind: Relative charging profile id ${chargingProfileId} duration ${chargingSchedule.duration.toString()}s exceeded (elapsed: ${elapsedSeconds.toString()}s)`
          )
          return false
        }
      }
      break
  }
  return true
}

/**
 * Predicate deciding whether a charging profile is currently active
 * (within its validity window and recurrence rules).
 * @param chargingProfile - Profile to evaluate.
 * @param currentDate - Reference clock reading.
 * @param logPrefix - Log prefix for the warn paths.
 * @returns `true` when the profile is currently applicable, `false` otherwise.
 */
export const canProceedChargingProfile = (
  chargingProfile: ChargingProfile,
  currentDate: Date | number | string,
  logPrefix: string
): boolean => {
  const chargingProfileId = getChargingProfileId(chargingProfile)
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    logPrefix,
    'canProceedChargingProfile'
  )
  if (chargingSchedule == null) {
    return false
  }
  if (
    (isValidDate(chargingProfile.validFrom) && isBefore(currentDate, chargingProfile.validFrom)) ||
    (isValidDate(chargingProfile.validTo) && isAfter(currentDate, chargingProfile.validTo))
  ) {
    logger.debug(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${chargingProfileId} is not valid for the current date ${
        isDate(currentDate) ? currentDate.toISOString() : currentDate.toString()
      }`
    )
    return false
  }
  if (chargingSchedule.startSchedule == null || chargingSchedule.duration == null) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${chargingProfileId} has no startSchedule or duration defined`
    )
    return false
  }

  if (!isValidDate(chargingSchedule.startSchedule)) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${chargingProfileId} has an invalid startSchedule date defined`
    )
    return false
  }
  if (!Number.isSafeInteger(chargingSchedule.duration)) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedChargingProfile: Charging profile id ${chargingProfileId} has non integer duration defined`
    )
    return false
  }
  return true
}

const canProceedRecurringChargingProfile = (
  chargingProfile: ChargingProfile,
  logPrefix: string
): boolean => {
  const chargingProfileId = getChargingProfileId(chargingProfile)
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    logPrefix,
    'canProceedRecurringChargingProfile'
  )
  if (chargingSchedule == null) {
    return false
  }
  if (
    chargingProfile.chargingProfileKind === ChargingProfileKindType.RECURRING &&
    chargingProfile.recurrencyKind == null
  ) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedRecurringChargingProfile: Recurring charging profile id ${chargingProfileId} has no recurrencyKind defined`
    )
    return false
  }
  if (
    chargingProfile.chargingProfileKind === ChargingProfileKindType.RECURRING &&
    chargingSchedule.startSchedule == null
  ) {
    logger.error(
      `${logPrefix} ${moduleName}.canProceedRecurringChargingProfile: Recurring charging profile id ${chargingProfileId} has no startSchedule defined`
    )
    return false
  }
  return true
}

/**
 * Adjust recurring charging profile startSchedule to the current recurrency time interval if needed
 * @param chargingProfile - The charging profile to adjust
 * @param currentDate - The current date/time
 * @param logPrefix - Prefix for logging messages
 * @returns Whether the charging profile is active at the given date
 */
const prepareRecurringChargingProfile = (
  chargingProfile: ChargingProfile,
  currentDate: Date | number | string,
  logPrefix: string
): boolean => {
  const chargingProfileId = getChargingProfileId(chargingProfile)
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    logPrefix,
    'prepareRecurringChargingProfile'
  )
  if (chargingSchedule == null) {
    return false
  }
  let recurringIntervalTranslated = false
  let recurringInterval: Interval | undefined
  switch (chargingProfile.recurrencyKind) {
    case RecurrencyKindType.DAILY: {
      const startSchedule = chargingSchedule.startSchedule ?? new Date()
      recurringInterval = {
        end: addDays(startSchedule, 1),
        start: startSchedule,
      }
      checkRecurringChargingProfileDuration(chargingProfile, recurringInterval, logPrefix)
      if (
        !isWithinInterval(currentDate, recurringInterval) &&
        isBefore(recurringInterval.end, currentDate)
      ) {
        chargingSchedule.startSchedule = addDays(
          recurringInterval.start,
          differenceInDays(currentDate, recurringInterval.start)
        )
        recurringInterval = {
          end: addDays(chargingSchedule.startSchedule, 1),

          start: chargingSchedule.startSchedule,
        }
        recurringIntervalTranslated = true
      }
      break
    }
    case RecurrencyKindType.WEEKLY: {
      const startSchedule = chargingSchedule.startSchedule ?? new Date()
      recurringInterval = {
        end: addWeeks(startSchedule, 1),
        start: startSchedule,
      }
      checkRecurringChargingProfileDuration(chargingProfile, recurringInterval, logPrefix)
      if (
        !isWithinInterval(currentDate, recurringInterval) &&
        isBefore(recurringInterval.end, currentDate)
      ) {
        chargingSchedule.startSchedule = addWeeks(
          recurringInterval.start,
          differenceInWeeks(currentDate, recurringInterval.start)
        )
        recurringInterval = {
          end: addWeeks(chargingSchedule.startSchedule, 1),

          start: chargingSchedule.startSchedule,
        }
        recurringIntervalTranslated = true
      }
      break
    }
    default:
      logger.error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${logPrefix} ${moduleName}.prepareRecurringChargingProfile: Recurring ${chargingProfile.recurrencyKind} charging profile id ${chargingProfileId} is not supported`
      )
  }
  if (
    recurringIntervalTranslated &&
    recurringInterval != null &&
    !isWithinInterval(currentDate, recurringInterval)
  ) {
    logger.error(
      `${logPrefix} ${moduleName}.prepareRecurringChargingProfile: Recurring ${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        chargingProfile.recurrencyKind
      } charging profile id ${chargingProfileId} recurrency time interval [${toDate(
        recurringInterval.start as Date
      ).toISOString()}, ${toDate(
        recurringInterval.end as Date
      ).toISOString()}] has not been properly translated to current date ${
        isDate(currentDate) ? currentDate.toISOString() : currentDate.toString()
      } `
    )
  }
  return recurringIntervalTranslated
}

const checkRecurringChargingProfileDuration = (
  chargingProfile: ChargingProfile,
  interval: Interval,
  logPrefix: string
): void => {
  const chargingProfileId = getChargingProfileId(chargingProfile)
  const chargingSchedule = getSingleChargingSchedule(
    chargingProfile,
    logPrefix,
    'checkRecurringChargingProfileDuration'
  )
  if (chargingSchedule == null) {
    return
  }
  if (chargingSchedule.duration == null) {
    logger.warn(
      `${logPrefix} ${moduleName}.checkRecurringChargingProfileDuration: Recurring ${
        chargingProfile.chargingProfileKind
      } charging profile id ${chargingProfileId} duration is not defined, set it to the recurrency time interval duration ${differenceInSeconds(
        interval.end,
        interval.start
      ).toString()}`
    )
    chargingSchedule.duration = differenceInSeconds(interval.end, interval.start)
  } else if (chargingSchedule.duration > differenceInSeconds(interval.end, interval.start)) {
    logger.warn(
      `${logPrefix} ${moduleName}.checkRecurringChargingProfileDuration: Recurring ${
        chargingProfile.chargingProfileKind
      } charging profile id ${chargingProfileId} duration ${chargingSchedule.duration.toString()} is greater than the recurrency time interval duration ${differenceInSeconds(
        interval.end,
        interval.start
      ).toString()}`
    )
    chargingSchedule.duration = differenceInSeconds(interval.end, interval.start)
  }
}
