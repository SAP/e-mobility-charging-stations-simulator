import {
  addSeconds,
  areIntervalsOverlapping,
  differenceInSeconds,
  type Interval,
  isAfter,
  isBefore,
  isWithinInterval,
} from 'date-fns'

import type { SigningMethodEnumType } from '../../../types/index.js'

import {
  captureTransactionIntervalState,
  type ChargingStation,
  completeTransactionIntervalState,
  getConfigurationKey,
  hasFeatureProfile,
  hasReservationExpired,
  isCoherentModeActive,
  restoreTransactionIntervalState,
} from '../../../charging-station/index.js'
import { BaseError, OCPPError } from '../../../exception/index.js'
import {
  type ConfigurationKey,
  type ConnectorStatus,
  ErrorType,
  type GenericResponse,
  type MeterValuesRequest,
  type MeterValuesResponse,
  OCPP16AuthorizationStatus,
  type OCPP16AvailabilityType,
  type OCPP16ChangeAvailabilityResponse,
  OCPP16ChargePointStatus,
  type OCPP16ChargingProfile,
  type OCPP16ChargingSchedule,
  type OCPP16ClearChargingProfileRequest,
  type OCPP16IdTagInfo,
  OCPP16IncomingRequestCommand,
  type OCPP16MeterValue,
  OCPP16MeterValueContext,
  OCPP16MeterValueFormat,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValueUnit,
  OCPP16RequestCommand,
  type OCPP16SampledValue,
  type OCPP16SignedMeterValue,
  OCPP16StandardParametersKey,
  type OCPP16StatusNotificationRequest,
  OCPP16StopTransactionReason,
  type OCPP16SupportedFeatureProfiles,
  OCPP16VendorParametersKey,
  OCPPVersion,
  PublicKeyWithSignedMeterValueEnumType,
  RequestCommand,
  type RequestParams,
  type StartTransactionRequest,
  type StartTransactionResponse,
  type StopTransactionReason,
  type StopTransactionRequest,
  type StopTransactionResponse,
} from '../../../types/index.js'
import {
  clampToSafeTimerValue,
  clone,
  Constants,
  convertToBoolean,
  convertToDate,
  convertToInt,
  ensureError,
  isNotEmptyArray,
  isNotEmptyString,
  logger,
  roundTo,
  truncateId,
} from '../../../utils/index.js'
import { TransactionMeterValueDeliveryBarrier } from '../../meter-values/TransactionMeterValueDeliveryBarrier.js'
import { mapOCPP16Status, OCPPAuthServiceFactory } from '../auth/index.js'
import { sendAndSetConnectorStatus } from '../OCPPConnectorStatusOperations.js'
import {
  buildEmptyMeterValue,
  buildMeterValue,
  createPayloadConfigs,
  getSampledValueTemplate,
  PayloadValidatorOptions,
} from '../OCPPServiceUtils.js'
import { generateSignedMeterData } from '../OCPPSignedMeterDataGenerator.js'
import {
  claimPublicKeyDelivery,
  parsePublicKeyWithSignedMeterValue,
  type PublicKeyDeliveryToken,
  releasePublicKeyDelivery,
  retainPublicKeyDelivery,
  shouldIncludePublicKey,
  type SignedSampledValueResult,
  type SigningConfig,
  transferPublicKeyDelivery,
  validateSigningPrerequisites,
} from '../OCPPSignedMeterValueUtils.js'
import { OCPP16Constants } from './OCPP16Constants.js'
import { buildOCPP16SampledValue, buildSignedOCPP16SampledValue } from './OCPP16RequestBuilders.js'

const moduleName = 'OCPP16ServiceUtils'
const RFC3339_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|([+-])(\d{2}):(\d{2}))$/
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const hasOcppTimestampYear = (timestamp: Date): boolean => {
  const year = timestamp.getUTCFullYear()
  return year >= 0 && year <= 9999 && /^\d{4}-/.test(timestamp.toISOString())
}

const parseStopTransactionTimestamp = (timestamp: string): Date | undefined => {
  const match = RFC3339_TIMESTAMP_PATTERN.exec(timestamp)
  if (match == null) return undefined

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const fraction = match.at(7)
  const offsetHourMatch = match.at(10)
  const offsetMinuteMatch = match.at(11)
  const offsetHour = offsetHourMatch == null ? 0 : Number(offsetHourMatch)
  const offsetMinute = offsetMinuteMatch == null ? 0 : Number(offsetMinuteMatch)

  if (
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 60 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return undefined
  }
  const daysInMonth = month === 2 && isLeapYear(year) ? 29 : DAYS_PER_MONTH[month - 1]
  if (day < 1 || day > daysInMonth) return undefined

  const millisecond = fraction == null ? 0 : Number(fraction.slice(0, 3).padEnd(3, '0'))
  const localTimestamp = new Date(0)
  localTimestamp.setUTCFullYear(year, month - 1, day)
  localTimestamp.setUTCHours(hour, minute, Math.min(second, 59), millisecond)
  const signedOffsetMinutes =
    match[8].toUpperCase() === 'Z'
      ? 0
      : (match[9] === '+' ? 1 : -1) * (offsetHour * 60 + offsetMinute)
  const precedingInstant = localTimestamp.getTime() - signedOffsetMinutes * 60_000
  if (!Number.isFinite(precedingInstant)) return undefined

  if (second === 60) {
    const precedingSecond = new Date(precedingInstant)
    const isLeapSecondBoundary =
      precedingSecond.getUTCHours() === 23 &&
      precedingSecond.getUTCMinutes() === 59 &&
      precedingSecond.getUTCSeconds() === 59 &&
      ((precedingSecond.getUTCMonth() === 5 && precedingSecond.getUTCDate() === 30) ||
        (precedingSecond.getUTCMonth() === 11 && precedingSecond.getUTCDate() === 31))
    if (!isLeapSecondBoundary) return undefined
  }

  const normalizedTimestamp = new Date(precedingInstant + (second === 60 ? 1000 : 0))
  return hasOcppTimestampYear(normalizedTimestamp) ? normalizedTimestamp : undefined
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class OCPP16ServiceUtils {
  private static readonly incomingRequestSchemaNames: readonly [
    OCPP16IncomingRequestCommand,
    string
  ][] = [
      [OCPP16IncomingRequestCommand.CANCEL_RESERVATION, 'CancelReservation'],
      [OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY, 'ChangeAvailability'],
      [OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION, 'ChangeConfiguration'],
      [OCPP16IncomingRequestCommand.CLEAR_CACHE, 'ClearCache'],
      [OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE, 'ClearChargingProfile'],
      [OCPP16IncomingRequestCommand.DATA_TRANSFER, 'DataTransfer'],
      [OCPP16IncomingRequestCommand.GET_COMPOSITE_SCHEDULE, 'GetCompositeSchedule'],
      [OCPP16IncomingRequestCommand.GET_CONFIGURATION, 'GetConfiguration'],
      [OCPP16IncomingRequestCommand.GET_DIAGNOSTICS, 'GetDiagnostics'],
      [OCPP16IncomingRequestCommand.GET_LOCAL_LIST_VERSION, 'GetLocalListVersion'],
      [OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION, 'RemoteStartTransaction'],
      [OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION, 'RemoteStopTransaction'],
      [OCPP16IncomingRequestCommand.RESERVE_NOW, 'ReserveNow'],
      [OCPP16IncomingRequestCommand.RESET, 'Reset'],
      [OCPP16IncomingRequestCommand.SEND_LOCAL_LIST, 'SendLocalList'],
      [OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE, 'SetChargingProfile'],
      [OCPP16IncomingRequestCommand.TRIGGER_MESSAGE, 'TriggerMessage'],
      [OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR, 'UnlockConnector'],
      [OCPP16IncomingRequestCommand.UPDATE_FIRMWARE, 'UpdateFirmware'],
    ]

  private static readonly outgoingRequestSchemaNames: readonly [OCPP16RequestCommand, string][] = [
    [OCPP16RequestCommand.AUTHORIZE, 'Authorize'],
    [OCPP16RequestCommand.BOOT_NOTIFICATION, 'BootNotification'],
    [OCPP16RequestCommand.DATA_TRANSFER, 'DataTransfer'],
    [OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, 'DiagnosticsStatusNotification'],
    [OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, 'FirmwareStatusNotification'],
    [OCPP16RequestCommand.HEARTBEAT, 'Heartbeat'],
    [OCPP16RequestCommand.METER_VALUES, 'MeterValues'],
    [OCPP16RequestCommand.START_TRANSACTION, 'StartTransaction'],
    [OCPP16RequestCommand.STATUS_NOTIFICATION, 'StatusNotification'],
    [OCPP16RequestCommand.STOP_TRANSACTION, 'StopTransaction'],
  ]

  private static readonly periodicMeterValuesIntervals = new WeakMap<ConnectorStatus, number>()

  private static readonly startTransactionOperations = new WeakMap<
    ConnectorStatus,
    Promise<StartTransactionResponse>
  >()

  private static readonly stopTransactionOperations = new WeakMap<
    ConnectorStatus,
    { promise: Promise<StopTransactionResponse>; transactionId: number | string }
  >()

  /**
   * Post-hoc signing wrapper for OCPP 1.6 Signed Meter Values whitepaper
   * §3.3.6 (`SampledDataSignUpdatedReadings`). When
   * `SampledDataSignReadings` and `SampledDataSignUpdatedReadings` are
   * both enabled and a signing key is configured for the connector,
   * appends a paired `SignedData` `SampledValue` to the supplied
   * `MeterValue`. Idempotent no-op when signing is disabled or the
   * signing prerequisites are absent.
   *
   * Mutates `meterValue.sampledValue` in place. By default, records an included
   * public key for the active transaction; callers building a delivery may
   * defer that state transition until the request owns delivery.
   * @param chargingStation - Target charging station.
   * @param connectorId - Connector identifier owning the transaction.
   * @param transactionId - Active transaction identifier.
   * @param meterValue - MeterValue to mutate (in place).
   * @param context - Reading context for the emitted `SignedData` sampled value (defaults to `Sample.Periodic`); pass `Trigger` for TriggerMessage-originated emissions per OCPP 1.6 Core Table 30.
   * @param commitState - Whether inclusion immediately commits the transaction public-key flag.
   * @returns Whether the appended signed value carries the transaction public key.
   */
  public static appendSignedUpdatedReadings (
    chargingStation: ChargingStation,
    connectorId: number,
    transactionId: number,
    meterValue: OCPP16MeterValue,
    context: OCPP16MeterValueContext = OCPP16MeterValueContext.SAMPLE_PERIODIC,
    commitState = true
  ): boolean {
    if (
      !OCPP16ServiceUtils.isSigningEnabled(chargingStation) ||
      !OCPP16ServiceUtils.isSigningUpdatedReadingsEnabled(chargingStation)
    ) {
      return false
    }
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus?.transactionStarted !== true) {
      return false
    }
    const signingCfg = OCPP16ServiceUtils.readSigningConfigForConnector(
      chargingStation,
      connectorId
    )
    if (signingCfg == null) {
      return false
    }
    const energyWh = chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId)
    const publicKeySentInTransaction = connectorStatus.publicKeySentInTransaction ?? false
    const signedResult = OCPP16ServiceUtils.buildSignedSampledValue(
      signingCfg,
      energyWh,
      context,
      transactionId,
      publicKeySentInTransaction,
      meterValue.timestamp
    )
    meterValue.sampledValue.push(signedResult.sampledValue)
    if (signedResult.publicKeyIncluded && commitState) {
      connectorStatus.publicKeySentInTransaction = true
    }
    return signedResult.publicKeyIncluded
  }

  /**
   * @param commandParams - Status notification parameters
   * @returns Formatted OCPP 1.6 StatusNotification request payload
   */
  public static buildStatusNotificationRequest (
    commandParams: OCPP16StatusNotificationRequest
  ): OCPP16StatusNotificationRequest {
    return {
      connectorId: commandParams.connectorId,
      errorCode: commandParams.errorCode,
      status: commandParams.status,
    } satisfies OCPP16StatusNotificationRequest
  }

  /**
   * Builds a meter value for the beginning of a transaction.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   * @param meterStart - Initial meter reading in Wh
   * @returns Meter value with the transaction begin context
   */
  public static buildTransactionBeginMeterValue (
    chargingStation: ChargingStation,
    connectorId: number,
    meterStart: number | undefined
  ): OCPP16MeterValue {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    const transactionId = connectorStatus?.transactionId
    const coherentSession =
      transactionId != null ? chargingStation.getCoherentSession(transactionId) : undefined
    if (transactionId != null && isCoherentModeActive(coherentSession)) {
      return OCPP16ServiceUtils.buildCoherentTransactionBeginMeterValue(
        chargingStation,
        transactionId
      )
    }
    const meterValue = buildEmptyMeterValue() as OCPP16MeterValue
    // Energy.Active.Import.Register measurand (default)
    const sampledValueTemplate = getSampledValueTemplate(chargingStation, connectorId)
    if (sampledValueTemplate != null) {
      const unitDivider =
        sampledValueTemplate.unit === OCPP16MeterValueUnit.KILO_WATT_HOUR
          ? Constants.UNIT_DIVIDER_KILO
          : 1
      meterValue.sampledValue.push(
        buildOCPP16SampledValue(
          sampledValueTemplate,
          roundTo((meterStart ?? 0) / unitDivider, 4),
          OCPP16MeterValueContext.TRANSACTION_BEGIN
        )
      )
    }
    if (
      OCPP16ServiceUtils.isSigningEnabled(chargingStation) &&
      OCPP16ServiceUtils.isSigningStartedReadingsEnabled(chargingStation)
    ) {
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      const transactionId = connectorStatus?.transactionId ?? 0
      const publicKeySentInTransaction = connectorStatus?.publicKeySentInTransaction ?? false
      const signingCfg = OCPP16ServiceUtils.readSigningConfigForConnector(
        chargingStation,
        connectorId
      )
      if (signingCfg != null) {
        const signedResult = OCPP16ServiceUtils.buildSignedSampledValue(
          signingCfg,
          meterStart ?? 0,
          OCPP16MeterValueContext.TRANSACTION_BEGIN,
          transactionId,
          publicKeySentInTransaction,
          meterValue.timestamp
        )
        meterValue.sampledValue.push(signedResult.sampledValue)
        if (signedResult.publicKeyIncluded && connectorStatus != null) {
          connectorStatus.publicKeySentInTransaction = true
        }
      }
    }
    return meterValue
  }

  /**
   * Builds an array of transaction data meter values from begin and end values.
   * @param transactionBeginMeterValue - Meter value at transaction start
   * @param transactionEndMeterValue - Meter value at transaction end
   * @returns Array containing the begin and end meter values
   */
  public static buildTransactionDataMeterValues (
    transactionBeginMeterValue: OCPP16MeterValue,
    transactionEndMeterValue: OCPP16MeterValue
  ): OCPP16MeterValue[] {
    const meterValues: OCPP16MeterValue[] = []
    meterValues.push(transactionBeginMeterValue)
    meterValues.push(transactionEndMeterValue)
    return meterValues
  }

  /**
   * @param chargingStation - Target charging station
   * @param connectorId - Connector ID associated with the transaction
   * @param meterStop - Final meter reading in Wh at transaction end
   * @param timestamp - Timestamp shared with the StopTransaction snapshot
   * @returns MeterValue containing the transaction end energy reading
   */
  public static buildTransactionEndMeterValue (
    chargingStation: ChargingStation,
    connectorId: number,
    meterStop: number | undefined,
    timestamp = new Date()
  ): OCPP16MeterValue {
    const sampledValueTemplate = getSampledValueTemplate(chargingStation, connectorId)
    if (sampledValueTemplate == null) {
      throw new BaseError(
        `Missing MeterValues for default measurand '${OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}' in template on connector id ${connectorId.toString()}`
      )
    }
    const unitDivider =
      sampledValueTemplate.unit === OCPP16MeterValueUnit.KILO_WATT_HOUR
        ? Constants.UNIT_DIVIDER_KILO
        : 1
    const meterValue = { sampledValue: [], timestamp } as OCPP16MeterValue
    meterValue.sampledValue.push(
      buildOCPP16SampledValue(
        sampledValueTemplate,
        roundTo((meterStop ?? 0) / unitDivider, 4),
        OCPP16MeterValueContext.TRANSACTION_END
      )
    )
    if (OCPP16ServiceUtils.isSigningEnabled(chargingStation)) {
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      const transactionId = connectorStatus?.transactionId ?? 0
      const publicKeySentInTransaction = connectorStatus?.publicKeySentInTransaction ?? false
      const signingCfg = OCPP16ServiceUtils.readSigningConfigForConnector(
        chargingStation,
        connectorId
      )
      if (signingCfg != null) {
        const signedResult = OCPP16ServiceUtils.buildSignedSampledValue(
          signingCfg,
          meterStop ?? 0,
          OCPP16MeterValueContext.TRANSACTION_END,
          transactionId,
          publicKeySentInTransaction,
          meterValue.timestamp
        )
        meterValue.sampledValue.push(signedResult.sampledValue)
      }
    }
    return meterValue
  }

  /**
   * Changes the availability of connectors and updates their status.
   * @param chargingStation - Target charging station
   * @param connectorIds - Array of connector identifiers to update
   * @param chargePointStatus - New charge point status to set
   * @param availabilityType - Operative or inoperative availability type
   * @returns Accepted or scheduled availability change response
   */
  public static changeAvailability = async (
    chargingStation: ChargingStation,
    connectorIds: number[],
    chargePointStatus: OCPP16ChargePointStatus,
    availabilityType: OCPP16AvailabilityType
  ): Promise<OCPP16ChangeAvailabilityResponse> => {
    const responses: OCPP16ChangeAvailabilityResponse[] = []
    for (const connectorId of connectorIds) {
      let response: OCPP16ChangeAvailabilityResponse =
        OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      if (connectorStatus == null) {
        continue
      }
      if (connectorStatus.transactionStarted === true) {
        response = OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED
      }
      connectorStatus.availability = availabilityType
      if (response === OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED) {
        await sendAndSetConnectorStatus(chargingStation, {
          connectorId,
          status: chargePointStatus,
        })
      }
      responses.push(response)
    }
    if (responses.includes(OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED)) {
      return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED
    }
    return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED
  }

  /**
   * Checks whether a feature profile is enabled on the charging station.
   * @param chargingStation - Target charging station
   * @param featureProfile - Feature profile to check
   * @param command - OCPP command requiring the feature profile
   * @returns Whether the feature profile is enabled
   */
  public static checkFeatureProfile (
    chargingStation: ChargingStation,
    featureProfile: OCPP16SupportedFeatureProfiles,
    command: OCPP16IncomingRequestCommand | OCPP16RequestCommand
  ): boolean {
    if (!hasFeatureProfile(chargingStation, featureProfile)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.checkFeatureProfile: Trying to '${command}' without '${featureProfile}' feature enabled in ${
          OCPP16StandardParametersKey.SupportedFeatureProfiles
        } in configuration`
      )
      return false
    }
    return true
  }

  /**
   * Clears charging profiles matching the given criteria from the profiles array.
   * @param chargingStation - Target charging station
   * @param commandPayload - Clear charging profile request with filter criteria
   * @param chargingProfiles - Array of charging profiles to filter
   * @returns Whether any charging profiles were cleared
   */
  public static clearChargingProfiles = (
    chargingStation: ChargingStation,
    commandPayload: OCPP16ClearChargingProfileRequest,
    chargingProfiles: OCPP16ChargingProfile[] | undefined
  ): boolean => {
    const { chargingProfilePurpose, id, stackLevel } = commandPayload
    let profileCleared = false
    if (isNotEmptyArray(chargingProfiles)) {
      // Errata 3.25: ALL specified fields must match (AND logic).
      // null/undefined fields are wildcards (match any).
      const unmatchedProfiles = chargingProfiles.filter(
        (chargingProfile: OCPP16ChargingProfile) => {
          const matchesId = id == null || chargingProfile.chargingProfileId === id
          const matchesPurpose =
            chargingProfilePurpose == null ||
            chargingProfile.chargingProfilePurpose === chargingProfilePurpose
          const matchesStackLevel = stackLevel == null || chargingProfile.stackLevel === stackLevel
          if (matchesId && matchesPurpose && matchesStackLevel) {
            logger.debug(
              `${chargingStation.logPrefix()} ${moduleName}.clearChargingProfiles: Matching charging profile(s) cleared: %j`,
              chargingProfile
            )
            profileCleared = true
            return false
          }
          return true
        }
      )
      chargingProfiles.length = 0
      chargingProfiles.push(...unmatchedProfiles)
    }
    return profileCleared
  }

  /**
   * Composes a composite charging schedule from higher and lower priority schedules.
   * @param chargingScheduleHigher - Higher priority charging schedule
   * @param chargingScheduleLower - Lower priority charging schedule
   * @param compositeInterval - Time interval for the composite schedule
   * @returns Composed charging schedule or undefined if both inputs are null
   */
  public static composeChargingSchedules = (
    chargingScheduleHigher: OCPP16ChargingSchedule | undefined,
    chargingScheduleLower: OCPP16ChargingSchedule | undefined,
    compositeInterval: Interval
  ): OCPP16ChargingSchedule | undefined => {
    if (chargingScheduleHigher == null && chargingScheduleLower == null) {
      return undefined
    }
    if (chargingScheduleHigher != null && chargingScheduleLower == null) {
      return OCPP16ServiceUtils.composeChargingSchedule(chargingScheduleHigher, compositeInterval)
    }
    if (chargingScheduleHigher == null && chargingScheduleLower != null) {
      return OCPP16ServiceUtils.composeChargingSchedule(chargingScheduleLower, compositeInterval)
    }
    if (chargingScheduleHigher == null || chargingScheduleLower == null) {
      return undefined
    }
    const compositeChargingScheduleHigher = OCPP16ServiceUtils.composeChargingSchedule(
      chargingScheduleHigher,
      compositeInterval
    )
    const compositeChargingScheduleLower = OCPP16ServiceUtils.composeChargingSchedule(
      chargingScheduleLower,
      compositeInterval
    )
    if (compositeChargingScheduleHigher == null || compositeChargingScheduleLower == null) {
      return compositeChargingScheduleHigher ?? compositeChargingScheduleLower
    }
    const compositeChargingScheduleHigherInterval: Interval = {
      end: addSeconds(
        compositeChargingScheduleHigher.startSchedule ?? new Date(),
        compositeChargingScheduleHigher.duration ?? 0
      ),
      start: compositeChargingScheduleHigher.startSchedule ?? new Date(),
    }
    const compositeChargingScheduleLowerInterval: Interval = {
      end: addSeconds(
        compositeChargingScheduleLower.startSchedule ?? new Date(),
        compositeChargingScheduleLower.duration ?? 0
      ),
      start: compositeChargingScheduleLower.startSchedule ?? new Date(),
    }
    const higherFirst = isBefore(
      compositeChargingScheduleHigherInterval.start,
      compositeChargingScheduleLowerInterval.start
    )
    if (
      !areIntervalsOverlapping(
        compositeChargingScheduleHigherInterval,
        compositeChargingScheduleLowerInterval
      )
    ) {
      return {
        ...compositeChargingScheduleLower,
        ...compositeChargingScheduleHigher,
        chargingSchedulePeriod: [
          ...compositeChargingScheduleHigher.chargingSchedulePeriod.map(schedulePeriod => {
            return {
              ...schedulePeriod,
              startPeriod: higherFirst
                ? 0
                : schedulePeriod.startPeriod +
                  differenceInSeconds(
                    compositeChargingScheduleHigherInterval.start,
                    compositeChargingScheduleLowerInterval.start
                  ),
            }
          }),
          ...compositeChargingScheduleLower.chargingSchedulePeriod.map(schedulePeriod => {
            return {
              ...schedulePeriod,
              startPeriod: higherFirst
                ? schedulePeriod.startPeriod +
                  differenceInSeconds(
                    compositeChargingScheduleLowerInterval.start,
                    compositeChargingScheduleHigherInterval.start
                  )
                : 0,
            }
          }),
        ].sort((a, b) => a.startPeriod - b.startPeriod),
        duration: higherFirst
          ? differenceInSeconds(
            compositeChargingScheduleLowerInterval.end,
            compositeChargingScheduleHigherInterval.start
          )
          : differenceInSeconds(
            compositeChargingScheduleHigherInterval.end,
            compositeChargingScheduleLowerInterval.start
          ),
        startSchedule: higherFirst
          ? (compositeChargingScheduleHigherInterval.start as Date)
          : (compositeChargingScheduleLowerInterval.start as Date),
      }
    }
    return {
      ...compositeChargingScheduleLower,
      ...compositeChargingScheduleHigher,
      chargingSchedulePeriod: [
        ...compositeChargingScheduleHigher.chargingSchedulePeriod.map(schedulePeriod => {
          return {
            ...schedulePeriod,
            startPeriod: higherFirst
              ? 0
              : schedulePeriod.startPeriod +
                differenceInSeconds(
                  compositeChargingScheduleHigherInterval.start,
                  compositeChargingScheduleLowerInterval.start
                ),
          }
        }),
        ...compositeChargingScheduleLower.chargingSchedulePeriod
          .filter((schedulePeriod, index) => {
            if (
              higherFirst &&
              isWithinInterval(
                addSeconds(
                  compositeChargingScheduleLowerInterval.start,
                  schedulePeriod.startPeriod
                ),
                {
                  end: compositeChargingScheduleHigherInterval.end,
                  start: compositeChargingScheduleLowerInterval.start,
                }
              )
            ) {
              return false
            }
            if (
              higherFirst &&
              index < compositeChargingScheduleLower.chargingSchedulePeriod.length - 1 &&
              !isWithinInterval(
                addSeconds(
                  compositeChargingScheduleLowerInterval.start,
                  schedulePeriod.startPeriod
                ),
                {
                  end: compositeChargingScheduleHigherInterval.end,
                  start: compositeChargingScheduleLowerInterval.start,
                }
              ) &&
              isWithinInterval(
                addSeconds(
                  compositeChargingScheduleLowerInterval.start,
                  compositeChargingScheduleLower.chargingSchedulePeriod[index + 1].startPeriod
                ),
                {
                  end: compositeChargingScheduleHigherInterval.end,
                  start: compositeChargingScheduleLowerInterval.start,
                }
              )
            ) {
              return false
            }
            if (
              !higherFirst &&
              isWithinInterval(
                addSeconds(
                  compositeChargingScheduleLowerInterval.start,
                  schedulePeriod.startPeriod
                ),
                {
                  end: compositeChargingScheduleLowerInterval.end,
                  start: compositeChargingScheduleHigherInterval.start,
                }
              )
            ) {
              return false
            }
            return true
          })
          .map((schedulePeriod, index) => {
            if (index === 0 && schedulePeriod.startPeriod !== 0) {
              schedulePeriod.startPeriod = 0
            }
            return {
              ...schedulePeriod,
              startPeriod: higherFirst
                ? schedulePeriod.startPeriod +
                  differenceInSeconds(
                    compositeChargingScheduleLowerInterval.start,
                    compositeChargingScheduleHigherInterval.start
                  )
                : 0,
            }
          }),
      ].sort((a, b) => a.startPeriod - b.startPeriod),
      duration: higherFirst
        ? differenceInSeconds(
          compositeChargingScheduleLowerInterval.end,
          compositeChargingScheduleHigherInterval.start
        )
        : differenceInSeconds(
          compositeChargingScheduleHigherInterval.end,
          compositeChargingScheduleLowerInterval.start
        ),
      startSchedule: higherFirst
        ? (compositeChargingScheduleHigherInterval.start as Date)
        : (compositeChargingScheduleLowerInterval.start as Date),
    }
  }

  /**
   * OCPP 1.6 Incoming Request Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestPayloadConfigs = (): [
    OCPP16IncomingRequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP16ServiceUtils.incomingRequestSchemaNames, '.json')

  /**
   * OCPP 1.6 Incoming Request Response Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestResponsePayloadConfigs = (): [
    OCPP16IncomingRequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP16ServiceUtils.incomingRequestSchemaNames, 'Response.json')

  /**
   * Factory options for OCPP 1.6 payload validators
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 1.6 validators
   */
  public static createPayloadOptions = (moduleName: string, methodName: string) =>
    PayloadValidatorOptions(
      OCPPVersion.VERSION_16,
      'assets/json-schemas/ocpp/1.6',
      moduleName,
      methodName
    )

  /**
   * OCPP 1.6 Request Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createRequestPayloadConfigs = (): [
    OCPP16RequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP16ServiceUtils.outgoingRequestSchemaNames, '.json')

  /**
   * OCPP 1.6 Response Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createResponsePayloadConfigs = (): [
    OCPP16RequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP16ServiceUtils.outgoingRequestSchemaNames, 'Response.json')

  /**
   * Gets the OCPP 1.6 StartTransaction currently in flight on a connector.
   * Shutdown awaits it before deciding whether the accepted transaction needs a StopTransaction.
   * @param connectorStatus - Connector whose pending start is queried
   * @returns The pending start operation, or undefined when no start is in flight
   */
  public static getPendingStartTransaction (
    connectorStatus: ConnectorStatus
  ): Promise<StartTransactionResponse> | undefined {
    return OCPP16ServiceUtils.startTransactionOperations.get(connectorStatus)
  }

  /**
   * Checks whether a connector or the charging station has a valid reservation for the given idTag.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier to check
   * @param idTag - RFID tag to match against the reservation
   * @returns Whether a valid reservation exists for the idTag
   */
  public static hasReservation = (
    chargingStation: ChargingStation,
    connectorId: number,
    idTag: string
  ): boolean => {
    const connectorReservation = chargingStation.getReservationBy('connectorId', connectorId)
    const chargingStationReservation = chargingStation.getReservationBy('connectorId', 0)
    if (
      (chargingStation.getConnectorStatus(connectorId)?.status ===
        OCPP16ChargePointStatus.Reserved &&
        connectorReservation != null &&
        !hasReservationExpired(connectorReservation) &&
        connectorReservation.idTag === idTag) ||
      (chargingStation.getConnectorStatus(0)?.status === OCPP16ChargePointStatus.Reserved &&
        chargingStationReservation != null &&
        !hasReservationExpired(chargingStationReservation) &&
        chargingStationReservation.idTag === idTag)
    ) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.hasReservation: Connector id ${connectorId.toString()} has a valid reservation for idTag '${truncateId(idTag)}': %j`,
        connectorReservation ?? chargingStationReservation
      )
      return true
    }
    return false
  }

  /**
   * Determines whether a configuration key should be visible in GetConfiguration responses.
   * @param key - Configuration key to check
   * @returns Whether the key is visible
   */
  public static isConfigurationKeyVisible (key: ConfigurationKey): boolean {
    if (key.visible == null) {
      return true
    }
    return key.visible
  }

  /**
   * @param chargingStation - Target charging station
   * @returns Whether signed meter value generation is enabled (SampledDataSignReadings=true)
   */
  public static isSigningEnabled (chargingStation: ChargingStation): boolean {
    return convertToBoolean(
      getConfigurationKey(chargingStation, OCPP16VendorParametersKey.SampledDataSignReadings)?.value
    )
  }

  /**
   * @param chargingStation - Target charging station
   * @returns Whether signing of meter values at transaction start is enabled
   *   (SampledDataSignStartedReadings=true)
   */
  public static isSigningStartedReadingsEnabled (chargingStation: ChargingStation): boolean {
    return convertToBoolean(
      getConfigurationKey(chargingStation, OCPP16VendorParametersKey.SampledDataSignStartedReadings)
        ?.value
    )
  }

  /**
   * @param chargingStation - Target charging station
   * @returns Whether signing of meter values during transaction updates is enabled
   *   (SampledDataSignUpdatedReadings=true)
   */
  public static isSigningUpdatedReadingsEnabled (chargingStation: ChargingStation): boolean {
    return convertToBoolean(
      getConfigurationKey(chargingStation, OCPP16VendorParametersKey.SampledDataSignUpdatedReadings)
        ?.value
    )
  }

  /**
   * Stops a transaction remotely on the given connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier with the active transaction
   * @returns Accepted or rejected generic response
   */
  public static remoteStopTransaction = async (
    chargingStation: ChargingStation,
    connectorId: number
  ): Promise<GenericResponse> => {
    const stopResponse = await OCPP16ServiceUtils.stopTransactionOnConnector(
      chargingStation,
      connectorId,
      OCPP16StopTransactionReason.REMOTE
    )
    if (stopResponse.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
      return OCPP16Constants.OCPP_RESPONSE_ACCEPTED
    }
    return OCPP16Constants.OCPP_RESPONSE_REJECTED
  }

  /**
   * Sets or replaces a charging profile on a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier to set the profile on
   * @param cp - Charging profile to set
   */
  public static setChargingProfile (
    chargingStation: ChargingStation,
    connectorId: number,
    cp: OCPP16ChargingProfile
  ): void {
    if (chargingStation.getConnectorStatus(connectorId)?.chargingProfiles == null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.setChargingProfile: Trying to set a charging profile on connector id ${connectorId.toString()} with an uninitialized charging profiles array attribute, applying deferred initialization`
      )
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      if (connectorStatus != null) {
        connectorStatus.chargingProfiles = []
      }
    }
    if (!Array.isArray(chargingStation.getConnectorStatus(connectorId)?.chargingProfiles)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.setChargingProfile: Trying to set a charging profile on connector id ${connectorId.toString()} with an improper attribute type for the charging profiles array, applying proper type deferred initialization`
      )
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      if (connectorStatus != null) {
        connectorStatus.chargingProfiles = []
      }
    }
    cp.chargingSchedule.startSchedule = convertToDate(cp.chargingSchedule.startSchedule)
    cp.validFrom = convertToDate(cp.validFrom)
    cp.validTo = convertToDate(cp.validTo)
    let cpReplaced = false
    if (isNotEmptyArray(chargingStation.getConnectorStatus(connectorId)?.chargingProfiles)) {
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      for (const [index, chargingProfile] of (connectorStatus?.chargingProfiles ?? []).entries()) {
        if (
          chargingProfile.chargingProfileId === cp.chargingProfileId ||
          (chargingProfile.stackLevel === cp.stackLevel &&
            chargingProfile.chargingProfilePurpose === cp.chargingProfilePurpose)
        ) {
          if (connectorStatus?.chargingProfiles != null) {
            connectorStatus.chargingProfiles[index] = cp
          }
          cpReplaced = true
        }
      }
    }
    !cpReplaced && chargingStation.getConnectorStatus(connectorId)?.chargingProfiles?.push(cp)
  }

  /**
   * Sends a StartTransaction request to the Central System for the given connector.
   * A graceful station stop waits for this request to settle before deciding whether
   * the newly accepted transaction needs an immediate StopTransaction.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier to start the transaction on
   * @param idTag - Optional RFID tag for the transaction
   * @param requestParams - Optional request transport behavior
   * @param requestOverrides - Optional protocol fields supplied by an external caller
   * @returns Start transaction response from the Central System
   */
  public static async startTransactionOnConnector (
    chargingStation: ChargingStation,
    connectorId: number,
    idTag?: string,
    requestParams?: RequestParams,
    requestOverrides: Omit<Partial<StartTransactionRequest>, 'connectorId' | 'idTag'> = {}
  ): Promise<StartTransactionResponse> {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus != null) connectorStatus.transactionStarting = true
    const operation = chargingStation.ocppRequestService.requestHandler<
      Partial<StartTransactionRequest>,
      StartTransactionResponse
    >(
      chargingStation,
      RequestCommand.START_TRANSACTION,
      {
        ...requestOverrides,
        connectorId,
        ...(idTag != null && { idTag }),
      },
      { ...requestParams, waitForResponseOnStationStop: true }
    )
    if (connectorStatus != null) {
      OCPP16ServiceUtils.startTransactionOperations.set(connectorStatus, operation)
    }
    try {
      return await operation
    } finally {
      if (
        connectorStatus != null &&
        OCPP16ServiceUtils.startTransactionOperations.get(connectorStatus) === operation
      ) {
        OCPP16ServiceUtils.startTransactionOperations.delete(connectorStatus)
        delete connectorStatus.transactionStarting
      }
    }
  }

  /**
   * Starts periodic meter value updates for an active transaction on a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier with the active transaction
   * @param interval - Meter value sample interval in milliseconds
   */
  public static startUpdatedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    interval: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus == null) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: Connector ${connectorId.toString()} not found`
      )
      return
    }
    if (connectorStatus.transactionStarted !== true || connectorStatus.transactionId == null) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: No active transaction on connector ${connectorId.toString()}`
      )
      return
    }
    if (interval <= 0) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: MeterValueSampleInterval set to ${interval.toString()}, not sending MeterValues`
      )
      return
    }
    const rawTransactionId = connectorStatus.transactionId
    OCPP16ServiceUtils.periodicMeterValuesIntervals.set(connectorStatus, interval)
    connectorStatus.transactionUpdatedMeterValuesSetInterval = setInterval(() => {
      if (
        connectorStatus.transactionStarted !== true ||
        connectorStatus.transactionEnding === true ||
        connectorStatus.transactionId !== rawTransactionId ||
        OCPP16ServiceUtils.stopTransactionOperations.get(connectorStatus)?.transactionId ===
          rawTransactionId
      ) {
        return
      }
      const transactionId = convertToInt(rawTransactionId)
      const intervalState = captureTransactionIntervalState(connectorStatus)
      const meterValue = buildMeterValue(
        chargingStation,
        transactionId,
        interval
      ) as OCPP16MeterValue
      completeTransactionIntervalState(intervalState, 'default', [meterValue])
      const publicKeyIncluded = OCPP16ServiceUtils.appendSignedUpdatedReadings(
        chargingStation,
        connectorId,
        transactionId,
        meterValue
      )
      const request: MeterValuesRequest = {
        connectorId,
        meterValue: [meterValue],
        transactionId,
      }
      const publicKeyDeliveryToken = claimPublicKeyDelivery(
        connectorStatus,
        transactionId,
        request,
        publicKeyIncluded
      )
      const delivery = TransactionMeterValueDeliveryBarrier.begin(connectorStatus, rawTransactionId)
      let deliverySettled = false
      const markDeliverySettled = (definitivelyRejected = false): void => {
        if (deliverySettled) return
        deliverySettled = true
        delivery?.settle(definitivelyRejected)
      }

      const deliveryState = {
        buffered: false,
        callError: false,
        responseReceived: false,
        sent: false,
        transportErrorAmbiguous: false,
      }
      const handleDeliveryFailure = (error: unknown): void => {
        if (
          !deliveryState.buffered &&
          !deliveryState.callError &&
          !deliveryState.responseReceived &&
          !deliveryState.sent &&
          !deliveryState.transportErrorAmbiguous
        ) {
          restoreTransactionIntervalState(intervalState, connectorStatus, 'default')
          releasePublicKeyDelivery(publicKeyDeliveryToken)
        } else if (
          !deliveryState.buffered &&
          !deliveryState.callError &&
          (deliveryState.sent || deliveryState.transportErrorAmbiguous)
        ) {
          retainPublicKeyDelivery(publicKeyDeliveryToken)
        }
        if (!deliveryState.buffered) {
          markDeliverySettled(
            deliveryState.callError ||
              (!deliveryState.sent && !deliveryState.transportErrorAmbiguous)
          )
        }
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: Error while sending '${RequestCommand.METER_VALUES}':`,
          error
        )
      }
      try {
        chargingStation.ocppRequestService
          .requestHandler<MeterValuesRequest, MeterValuesResponse>(
            chargingStation,
            RequestCommand.METER_VALUES,
            request,
            {
              onError: (_error, isCallError) => {
                deliveryState.callError ||= isCallError
                if (isCallError || deliveryState.buffered) {
                  const definitivelyRejected = isCallError || !deliveryState.transportErrorAmbiguous
                  if (definitivelyRejected) {
                    restoreTransactionIntervalState(intervalState, connectorStatus, 'default')
                    releasePublicKeyDelivery(publicKeyDeliveryToken)
                  }
                  markDeliverySettled(definitivelyRejected)
                }
              },
              onMessageSent: () => {
                deliveryState.sent = true
              },
              onRequestBuffered: () => {
                deliveryState.buffered = true
                delivery?.markBuffered()
              },
              onResponseReceived: () => {
                deliveryState.responseReceived = true
                retainPublicKeyDelivery(publicKeyDeliveryToken)
                markDeliverySettled()
              },
              onTransportError: (_error, deliveryAmbiguous) => {
                deliveryState.transportErrorAmbiguous ||= deliveryAmbiguous
              },
              throwError: true,
            }
          )
          .then(() => {
            retainPublicKeyDelivery(publicKeyDeliveryToken)
            markDeliverySettled()
            return undefined
          })
          .catch(handleDeliveryFailure)
      } catch (error: unknown) {
        handleDeliveryFailure(error)
      }
    }, clampToSafeTimerValue(interval))
  }

  /**
   * Sends a StopTransaction request to the Central System for the given connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier with the active transaction
   * @param reason - Optional stop transaction reason
   * @param requestOverrides - Optional StopTransaction payload overrides
   * @param requestParams - Optional transport behavior overrides
   * @returns Stop transaction response from the Central System
   */
  public static stopTransactionOnConnector (
    chargingStation: ChargingStation,
    connectorId: number,
    reason?: StopTransactionReason,
    requestOverrides: Partial<StopTransactionRequest> = {},
    requestParams?: RequestParams
  ): Promise<StopTransactionResponse> {
    let connectorStatus: ConnectorStatus | undefined
    try {
      connectorStatus = chargingStation.getConnectorStatus(connectorId)
    } catch (error) {
      return Promise.reject(ensureError(error))
    }
    const rawTransactionId = connectorStatus?.transactionId
    const lifecycleAbortSignal = chargingStation.lifecycleAbortSignal

    let normalizedTimestamp: Date | undefined
    if (Object.hasOwn(requestOverrides, 'timestamp')) {
      try {
        normalizedTimestamp = OCPP16ServiceUtils.normalizeStopTransactionTimestamp(
          requestOverrides.timestamp
        )
      } catch (error) {
        return Promise.reject(ensureError(error))
      }
    }

    const activeStopTransaction =
      connectorStatus != null
        ? OCPP16ServiceUtils.stopTransactionOperations.get(connectorStatus)
        : undefined
    if (activeStopTransaction != null) {
      if (
        activeStopTransaction.transactionId === rawTransactionId ||
        (connectorStatus?.transactionEnding === true && rawTransactionId == null)
      ) {
        return activeStopTransaction.promise
      }
      return Promise.reject(
        new OCPPError(
          ErrorType.GENERIC_ERROR,
          `${chargingStation.logPrefix()} ${moduleName}.stopTransactionOnConnector: Stop transaction ${activeStopTransaction.transactionId.toString()} is still in progress on connector ${connectorId.toString()}; cannot stop replacement transaction ${rawTransactionId?.toString() ?? 'unknown'}`,
          RequestCommand.STOP_TRANSACTION
        )
      )
    }
    if (connectorStatus?.transactionEnding === true) {
      return Promise.reject(
        new OCPPError(
          ErrorType.GENERIC_ERROR,
          `${chargingStation.logPrefix()} ${moduleName}.stopTransactionOnConnector: Transaction is pending terminal response processing on connector ${connectorId.toString()}`,
          RequestCommand.STOP_TRANSACTION
        )
      )
    }
    if (connectorStatus?.transactionStarted !== true || rawTransactionId == null) {
      return Promise.reject(
        new BaseError(
          `${chargingStation.logPrefix()} ${moduleName}.stopTransactionOnConnector: No active transaction on connector ${connectorId.toString()}`
        )
      )
    }

    let transactionEndingOwned = true
    const periodicMeterValuesWasRunning =
      connectorStatus.transactionUpdatedMeterValuesSetInterval != null
    const periodicMeterValuesInterval =
      OCPP16ServiceUtils.periodicMeterValuesIntervals.get(connectorStatus)
    connectorStatus.transactionEnding = true
    OCPP16ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId)

    let publicKeyDeliveryToken: PublicKeyDeliveryToken | undefined
    let terminalMeterValuesHasPublicKey = false
    let terminalMeterValuesRequest: MeterValuesRequest | undefined
    let terminalMeterValuesDeliveryStarted = false
    let stopTransactionHasPublicKey = false
    let stopTransactionSnapshot: Readonly<StopTransactionRequest> | undefined
    let stopTransactionFallbackSnapshot: Readonly<StopTransactionRequest> | undefined
    let bufferStopTransactionWithoutSending = false
    const stopDeliveryState = {
      buffered: false,
      callError: false,
      responseReceived: false,
      sent: false,
      transportErrorAmbiguous: false,
    }
    let stopTransactionRequestSettled = false
    const clearTransactionEnding = (restorePeriodicMeterValues = false): void => {
      if (!transactionEndingOwned) return
      if (connectorStatus.transactionId === rawTransactionId) {
        delete connectorStatus.transactionEnding
        if (
          restorePeriodicMeterValues &&
          periodicMeterValuesWasRunning &&
          periodicMeterValuesInterval != null &&
          connectorStatus.transactionStarted === true &&
          connectorStatus.transactionUpdatedMeterValuesSetInterval == null
        ) {
          OCPP16ServiceUtils.startUpdatedMeterValues(
            chargingStation,
            connectorId,
            periodicMeterValuesInterval
          )
        }
      }
      transactionEndingOwned = false
    }

    const stopTransactionPromise = (async (): Promise<StopTransactionResponse> => {
      try {
        const meterValueDependencies = await TransactionMeterValueDeliveryBarrier.wait(
          connectorStatus,
          rawTransactionId
        )
        bufferStopTransactionWithoutSending = meterValueDependencies.length > 0
        const timestamp = new Date((normalizedTimestamp ?? new Date()).getTime())
        const transactionId = convertToInt(rawTransactionId)
        let strictEndMeterValueIsSolePublicKeyCarrier = false
        const materializeStopTransaction = (): void => {
          const finalEnergy =
            chargingStation.getEnergyActiveImportRegisterByTransactionId(rawTransactionId)
          const meterStop = Math.round(finalEnergy)
          const idTag = requestOverrides.idTag ?? connectorStatus.transactionIdTag
          const transactionDataEnabled =
            chargingStation.stationInfo?.transactionDataMeterValues === true
          const signingForcesTransactionData = OCPP16ServiceUtils.isSigningEnabled(chargingStation)
          const strictEndMeterValueEnabled =
            chargingStation.stationInfo?.beginEndMeterValues === true &&
            chargingStation.stationInfo.ocppStrictCompliance === true &&
            chargingStation.stationInfo.outOfOrderEndMeterValues === false
          const hasTransactionDataOverride = Object.hasOwn(requestOverrides, 'transactionData')
          const snapshotOverrides = clone(requestOverrides)
          let transactionData = snapshotOverrides.transactionData
          let transactionEndMeterValue: OCPP16MeterValue | undefined

          if (
            strictEndMeterValueEnabled ||
            (!hasTransactionDataOverride &&
              (transactionDataEnabled || signingForcesTransactionData))
          ) {
            if (strictEndMeterValueEnabled || transactionDataEnabled) {
              transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(
                chargingStation,
                connectorId,
                meterStop,
                timestamp
              )
            } else {
              try {
                transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(
                  chargingStation,
                  connectorId,
                  meterStop,
                  timestamp
                )
              } catch (error) {
                logger.warn(
                  `${chargingStation.logPrefix()} ${moduleName}.stopTransactionOnConnector: Failed to build signed transaction data meter values for StopTransaction:`,
                  error
                )
              }
            }
          }
          if (
            !hasTransactionDataOverride &&
            transactionEndMeterValue != null &&
            (transactionDataEnabled || signingForcesTransactionData)
          ) {
            transactionData = OCPP16ServiceUtils.buildTransactionDataMeterValues(
              connectorStatus.transactionBeginMeterValue as OCPP16MeterValue,
              transactionEndMeterValue
            )
          }

          const oncePerTransactionPublicKey =
            parsePublicKeyWithSignedMeterValue(
              getConfigurationKey(
                chargingStation,
                OCPP16VendorParametersKey.PublicKeyWithSignedMeterValue
              )?.value
            ) === PublicKeyWithSignedMeterValueEnumType.OncePerTransaction
          terminalMeterValuesHasPublicKey =
            transactionEndMeterValue != null &&
            OCPP16ServiceUtils.meterValueHasPublicKey(transactionEndMeterValue)
          stopTransactionHasPublicKey =
            Array.isArray(transactionData) &&
            transactionData.some(meterValue =>
              OCPP16ServiceUtils.meterValueHasPublicKey(meterValue)
            )
          const transactionDataWithPublicKey = transactionData
          if (
            !hasTransactionDataOverride &&
            oncePerTransactionPublicKey &&
            strictEndMeterValueEnabled &&
            terminalMeterValuesHasPublicKey &&
            stopTransactionHasPublicKey
          ) {
            transactionData = OCPP16ServiceUtils.removePublicKeys(transactionData)
            stopTransactionHasPublicKey = false
          }

          strictEndMeterValueIsSolePublicKeyCarrier =
            oncePerTransactionPublicKey &&
            strictEndMeterValueEnabled &&
            terminalMeterValuesHasPublicKey &&
            !stopTransactionHasPublicKey

          stopTransactionSnapshot = Object.freeze({
            ...snapshotOverrides,
            idTag,
            meterStop,
            timestamp,
            transactionData,
            transactionId,
            ...(reason != null && { reason: reason as StopTransactionRequest['reason'] }),
          })
          if (
            strictEndMeterValueIsSolePublicKeyCarrier &&
            Array.isArray(transactionDataWithPublicKey) &&
            transactionDataWithPublicKey.some(meterValue =>
              OCPP16ServiceUtils.meterValueHasPublicKey(meterValue)
            )
          ) {
            stopTransactionFallbackSnapshot = Object.freeze({
              ...stopTransactionSnapshot,
              transactionData: transactionDataWithPublicKey,
            })
          }
          if (!strictEndMeterValueIsSolePublicKeyCarrier) {
            publicKeyDeliveryToken = claimPublicKeyDelivery(
              connectorStatus,
              rawTransactionId,
              stopTransactionSnapshot,
              oncePerTransactionPublicKey && stopTransactionHasPublicKey
            )
          }
          if (strictEndMeterValueEnabled && transactionEndMeterValue != null) {
            terminalMeterValuesRequest = {
              connectorId,
              meterValue: [transactionEndMeterValue],
              transactionId,
            }
            if (oncePerTransactionPublicKey && terminalMeterValuesHasPublicKey) {
              publicKeyDeliveryToken = claimPublicKeyDelivery(
                connectorStatus,
                rawTransactionId,
                terminalMeterValuesRequest,
                true
              )
            }
          }
          if (chargingStation.stationInfo?.ocppStrictCompliance !== false) {
            chargingStation.ocppRequestService.validateRequestPayload(
              chargingStation,
              RequestCommand.STOP_TRANSACTION,
              stopTransactionSnapshot
            )
          }
        }
        materializeStopTransaction()
        let stopRequestStarted = false
        let deferredPredecessorRejection = false
        const reconcileStopTransaction = (): boolean => {
          const previousSnapshot = stopTransactionSnapshot
          const previousPublicKeyDeliveryToken = publicKeyDeliveryToken
          const previousPublicKeySentInTransaction =
            connectorStatus.publicKeySentInTransaction === true
          const previousTerminalMeterValuesRequest = terminalMeterValuesRequest
          const previousFallbackSnapshot = stopTransactionFallbackSnapshot
          const previousStopTransactionHasPublicKey = stopTransactionHasPublicKey
          const previousTerminalMeterValuesHasPublicKey = terminalMeterValuesHasPublicKey
          const previousStrictEndMeterValueIsSolePublicKeyCarrier =
            strictEndMeterValueIsSolePublicKeyCarrier
          releasePublicKeyDelivery(publicKeyDeliveryToken)
          publicKeyDeliveryToken = undefined
          terminalMeterValuesRequest = undefined
          stopTransactionFallbackSnapshot = undefined
          materializeStopTransaction()
          if (
            stopDeliveryState.buffered &&
            previousSnapshot != null &&
            stopTransactionSnapshot != null &&
            !chargingStation.replaceBufferedRequestPayload(
              RequestCommand.STOP_TRANSACTION,
              previousSnapshot,
              stopTransactionSnapshot
            )
          ) {
            // Replay already owns the previous frame; keep local delivery state aligned with it.
            releasePublicKeyDelivery(publicKeyDeliveryToken)
            publicKeyDeliveryToken = previousPublicKeyDeliveryToken
            connectorStatus.publicKeySentInTransaction = previousPublicKeySentInTransaction
            terminalMeterValuesRequest = previousTerminalMeterValuesRequest
            stopTransactionFallbackSnapshot = previousFallbackSnapshot
            stopTransactionHasPublicKey = previousStopTransactionHasPublicKey
            terminalMeterValuesHasPublicKey = previousTerminalMeterValuesHasPublicKey
            strictEndMeterValueIsSolePublicKeyCarrier =
              previousStrictEndMeterValueIsSolePublicKeyCarrier
            stopTransactionSnapshot = previousSnapshot
            return false
          }
          deferredPredecessorRejection = false
          return true
        }
        for (const dependency of meterValueDependencies) {
          dependency.onDefinitiveRejection(() => {
            if (!stopRequestStarted || stopDeliveryState.buffered) {
              reconcileStopTransaction()
            } else {
              deferredPredecessorRejection = true
            }
          })
        }

        if (connectorStatus.status !== OCPP16ChargePointStatus.Finishing) {
          await sendAndSetConnectorStatus(
            chargingStation,
            {
              connectorId,
              status: OCPP16ChargePointStatus.Finishing,
            },
            { expectedTransactionId: rawTransactionId, send: true }
          )
        }
        if (terminalMeterValuesRequest != null) {
          terminalMeterValuesDeliveryStarted = true
          const meterValuesDeliveryState = {
            buffered: false,
            callError: false,
            responseReceived: false,
            sent: false,
            transportErrorAmbiguous: false,
          }
          const meterValuesReplay = Promise.withResolvers<undefined>()
          let meterValuesReplayError: OCPPError | undefined
          let meterValuesReplaySettled = false
          const markMeterValuesSettled = (): void => {
            if (meterValuesReplaySettled) return
            meterValuesReplaySettled = true
            meterValuesReplay.resolve(undefined)
          }
          const lifecycleAbort = Promise.withResolvers<'aborted'>()
          const onLifecycleAbort = (): void => {
            lifecycleAbort.resolve('aborted')
          }
          if (lifecycleAbortSignal.aborted) {
            onLifecycleAbort()
          } else {
            lifecycleAbortSignal.addEventListener('abort', onLifecycleAbort, { once: true })
          }
          try {
            const meterValuesRequest = Promise.resolve(
              chargingStation.ocppRequestService.requestHandler<
                MeterValuesRequest,
                MeterValuesResponse
              >(chargingStation, RequestCommand.METER_VALUES, terminalMeterValuesRequest, {
                bufferOnErrorDuringStationStop: true,
                materializeOnCancellationBeforeSend: true,
                onError: (error, isCallError) => {
                  meterValuesDeliveryState.callError ||= isCallError
                  if (isCallError) {
                    markMeterValuesSettled()
                  } else if (!meterValuesReplaySettled) {
                    meterValuesReplayError = error
                    markMeterValuesSettled()
                  }
                },
                onMessageSent: () => {
                  meterValuesDeliveryState.sent = true
                  markMeterValuesSettled()
                },
                onRequestBuffered: () => {
                  meterValuesDeliveryState.buffered = true
                  retainPublicKeyDelivery(publicKeyDeliveryToken)
                },
                onResponseReceived: () => {
                  meterValuesDeliveryState.responseReceived = true
                  retainPublicKeyDelivery(publicKeyDeliveryToken)
                  markMeterValuesSettled()
                },
                onTransportError: (_error, deliveryAmbiguous) => {
                  meterValuesDeliveryState.transportErrorAmbiguous ||= deliveryAmbiguous
                  if (deliveryAmbiguous) retainPublicKeyDelivery(publicKeyDeliveryToken)
                },
                skipBufferingOnError: false,
                throwError: strictEndMeterValueIsSolePublicKeyCarrier,
              })
            )
            try {
              const requestOutcome = await Promise.race([
                meterValuesRequest.then(() => 'settled' as const),
                lifecycleAbort.promise,
              ])
              if (requestOutcome === 'aborted') {
                bufferStopTransactionWithoutSending = OCPP16ServiceUtils.bufferCachedRequestPayload(
                  chargingStation,
                  RequestCommand.METER_VALUES,
                  terminalMeterValuesRequest,
                  new OCPPError(
                    ErrorType.GENERIC_ERROR,
                    'Charging station stopped while awaiting terminal MeterValues response',
                    RequestCommand.METER_VALUES
                  )
                )
                if (bufferStopTransactionWithoutSending) {
                  meterValuesDeliveryState.buffered = true
                  retainPublicKeyDelivery(publicKeyDeliveryToken)
                } else {
                  await meterValuesRequest
                  retainPublicKeyDelivery(publicKeyDeliveryToken)
                }
              } else {
                retainPublicKeyDelivery(publicKeyDeliveryToken)
              }
            } catch (error) {
              const terminalMeterValuesCached = OCPP16ServiceUtils.hasCachedRequestPayload(
                chargingStation,
                RequestCommand.METER_VALUES,
                terminalMeterValuesRequest
              )
              if (terminalMeterValuesCached) {
                meterValuesDeliveryState.buffered = true
                retainPublicKeyDelivery(publicKeyDeliveryToken)
                await Promise.race([meterValuesReplay.promise, lifecycleAbort.promise])
                bufferStopTransactionWithoutSending =
                  (lifecycleAbortSignal.aborted || chargingStation.isStopping()) &&
                  OCPP16ServiceUtils.hasCachedRequestPayload(
                    chargingStation,
                    RequestCommand.METER_VALUES,
                    terminalMeterValuesRequest
                  )
                if (!bufferStopTransactionWithoutSending && meterValuesReplayError != null) {
                  throw meterValuesReplayError
                }
              } else {
                const definitelyRejected =
                  meterValuesDeliveryState.callError ||
                  (!meterValuesDeliveryState.responseReceived &&
                    !meterValuesDeliveryState.sent &&
                    !meterValuesDeliveryState.transportErrorAmbiguous)
                if (
                  definitelyRejected &&
                  stopTransactionFallbackSnapshot != null &&
                  connectorStatus.transactionId === rawTransactionId
                ) {
                  const replacementToken = transferPublicKeyDelivery(
                    publicKeyDeliveryToken,
                    stopTransactionFallbackSnapshot
                  )
                  if (replacementToken != null) {
                    publicKeyDeliveryToken = replacementToken
                    stopTransactionSnapshot = stopTransactionFallbackSnapshot
                    stopTransactionHasPublicKey = true
                  }
                } else if (definitelyRejected) {
                  releasePublicKeyDelivery(publicKeyDeliveryToken)
                  throw error
                } else {
                  retainPublicKeyDelivery(publicKeyDeliveryToken)
                }
              }
            }
          } finally {
            lifecycleAbortSignal.removeEventListener('abort', onLifecycleAbort)
          }
        }
        stopRequestStarted = true
        const stopTransactionResponse = await chargingStation.ocppRequestService.requestHandler<
          StopTransactionRequest,
          StopTransactionResponse
        >(chargingStation, RequestCommand.STOP_TRANSACTION, stopTransactionSnapshot, {
          ...requestParams,
          bufferOnErrorDuringStationStop: true,
          materializeOnCancellationBeforeSend: true,
          ...(bufferStopTransactionWithoutSending && { bufferWithoutSending: true }),
          onError: (error, isCallError) => {
            stopDeliveryState.callError ||= isCallError
            if (isCallError && stopTransactionHasPublicKey) {
              releasePublicKeyDelivery(publicKeyDeliveryToken)
            }
            if (stopTransactionRequestSettled && isCallError) {
              clearTransactionEnding(true)
            }
            requestParams?.onError?.(error, isCallError)
          },
          onMessageSent: () => {
            stopDeliveryState.sent = true
            requestParams?.onMessageSent?.()
          },
          onRequestBuffered: () => {
            stopDeliveryState.buffered = true
            if (deferredPredecessorRejection) reconcileStopTransaction()
            if (stopTransactionHasPublicKey) retainPublicKeyDelivery(publicKeyDeliveryToken)
            requestParams?.onRequestBuffered?.()
          },
          onResponseReceived: () => {
            stopDeliveryState.responseReceived = true
            if (stopTransactionHasPublicKey) retainPublicKeyDelivery(publicKeyDeliveryToken)
            requestParams?.onResponseReceived?.()
          },
          onTransportError: (error, deliveryAmbiguous) => {
            stopDeliveryState.transportErrorAmbiguous ||= deliveryAmbiguous
            if (deliveryAmbiguous && stopTransactionHasPublicKey) {
              retainPublicKeyDelivery(publicKeyDeliveryToken)
            }
            requestParams?.onTransportError?.(error, deliveryAmbiguous)
          },
          rawPayload: true,
          skipBufferingOnError: false,
          throwError: true,
        })
        stopTransactionRequestSettled = true
        if (stopTransactionHasPublicKey) retainPublicKeyDelivery(publicKeyDeliveryToken)
        clearTransactionEnding()
        return stopTransactionResponse
      } catch (error) {
        stopTransactionRequestSettled = true
        if (
          terminalMeterValuesRequest != null &&
          !terminalMeterValuesDeliveryStarted &&
          !stopTransactionHasPublicKey
        ) {
          releasePublicKeyDelivery(publicKeyDeliveryToken)
        }
        const terminalMeterValuesCached =
          terminalMeterValuesRequest != null &&
          OCPP16ServiceUtils.hasCachedRequestPayload(
            chargingStation,
            RequestCommand.METER_VALUES,
            terminalMeterValuesRequest
          )
        const stopTransactionCached =
          stopTransactionSnapshot != null &&
          OCPP16ServiceUtils.hasCachedRequestPayload(
            chargingStation,
            RequestCommand.STOP_TRANSACTION,
            stopTransactionSnapshot
          )
        if (stopTransactionHasPublicKey) {
          const definitelyRejected =
            stopDeliveryState.callError ||
            (!stopDeliveryState.buffered &&
              !stopDeliveryState.responseReceived &&
              !stopDeliveryState.sent &&
              !stopDeliveryState.transportErrorAmbiguous)
          if (stopTransactionCached || !definitelyRejected) {
            retainPublicKeyDelivery(publicKeyDeliveryToken)
          } else {
            releasePublicKeyDelivery(publicKeyDeliveryToken)
          }
        }
        if (
          connectorStatus.transactionId !== rawTransactionId ||
          (!terminalMeterValuesCached && !stopTransactionCached)
        ) {
          clearTransactionEnding(true)
        }
        throw error
      }
    })()

    const operation = { promise: stopTransactionPromise, transactionId: rawTransactionId }
    OCPP16ServiceUtils.stopTransactionOperations.set(connectorStatus, operation)
    stopTransactionPromise
      .finally(() => {
        if (OCPP16ServiceUtils.stopTransactionOperations.get(connectorStatus) === operation) {
          OCPP16ServiceUtils.stopTransactionOperations.delete(connectorStatus)
        }
      })
      .catch(() => undefined)
    return stopTransactionPromise
  }

  /**
   * Stops periodic meter value updates for a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier to stop updates for
   */
  public static stopUpdatedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus?.transactionUpdatedMeterValuesSetInterval != null) {
      clearInterval(connectorStatus.transactionUpdatedMeterValuesSetInterval)
      delete connectorStatus.transactionUpdatedMeterValuesSetInterval
      OCPP16ServiceUtils.periodicMeterValuesIntervals.delete(connectorStatus)
    }
  }

  public static updateAuthorizationCache (
    chargingStation: ChargingStation,
    idTag: string,
    idTagInfo: OCPP16IdTagInfo
  ): void {
    try {
      const authService = OCPPAuthServiceFactory.getInstance(chargingStation)
      authService.updateCacheEntry(idTag, mapOCPP16Status(idTagInfo.status), idTagInfo.expiryDate)
    } catch (error) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.updateAuthorizationCache: Cache update failed for '${truncateId(idTag)}':`,
        error
      )
    }
  }

  private static bufferCachedRequestPayload (
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: unknown,
    error: OCPPError
  ): boolean {
    for (const cachedRequest of chargingStation.requests.values()) {
      const [, , cachedCommandName, cachedPayload, bufferRequest] = cachedRequest
      if (cachedCommandName === commandName && cachedPayload === payload) {
        return bufferRequest?.(error) === true
      }
    }
    return false
  }

  /**
   * Coherent-path builder for the OCPP 1.6 transaction-begin MeterValue.
   * Routes through `buildMeterValue` so the begin MeterValue is drawn
   * from the same physics chain as subsequent samples (SoC in the
   * profile's initial band, energy=0, V=nominal, P=I=0). Vendor
   * parameter `StartTxnSampledData` (per the OCPP 1.6 Signed Meter
   * Values whitepaper) overrides `MeterValuesSampledData` for this
   * MeterValue when configured; `resolveEnabledMeasurands` falls back to
   * `MeterValuesSampledData` when the vendor key is absent.
   * @param chargingStation - Target charging station.
   * @param transactionId - Active transaction identifier.
   * @returns OCPP 1.6 MeterValue produced by the coherent physics chain.
   */
  private static buildCoherentTransactionBeginMeterValue (
    chargingStation: ChargingStation,
    transactionId: number | string
  ): OCPP16MeterValue {
    const startTxnSampledDataKey = OCPP16VendorParametersKey.StartTxnSampledData
    const measurandsKey =
      getConfigurationKey(chargingStation, startTxnSampledDataKey)?.value != null
        ? startTxnSampledDataKey
        : undefined
    return buildMeterValue(
      chargingStation,
      transactionId,
      0,
      measurandsKey,
      OCPP16MeterValueContext.TRANSACTION_BEGIN
    ) as OCPP16MeterValue
  }

  private static buildSignedSampledValue (
    signingConfig: SigningConfig,
    meterValue: number,
    context: OCPP16MeterValueContext,
    transactionId: number | string,
    publicKeySentInTransaction: boolean,
    timestamp: Date
  ): SignedSampledValueResult<OCPP16SampledValue> {
    const includePublicKey = shouldIncludePublicKey(
      signingConfig.publicKeyWithSignedMeterValue,
      publicKeySentInTransaction
    )

    const signedData = generateSignedMeterData(
      {
        context,
        meterSerialNumber: signingConfig.meterSerialNumber,
        meterValue,
        timestamp,
        transactionId,
      },
      includePublicKey ? signingConfig.publicKeyHex : undefined,
      signingConfig.signingMethod
    )
    return {
      publicKeyIncluded: includePublicKey && signingConfig.publicKeyHex != null,
      sampledValue: buildSignedOCPP16SampledValue(context, signedData),
    }
  }

  private static readonly composeChargingSchedule = (
    chargingSchedule: OCPP16ChargingSchedule,
    compositeInterval: Interval
  ): OCPP16ChargingSchedule | undefined => {
    if (chargingSchedule.startSchedule == null || chargingSchedule.duration == null) {
      return undefined
    }
    const chargingScheduleInterval: Interval = {
      end: addSeconds(chargingSchedule.startSchedule, chargingSchedule.duration),
      start: chargingSchedule.startSchedule,
    }
    if (areIntervalsOverlapping(chargingScheduleInterval, compositeInterval)) {
      chargingSchedule.chargingSchedulePeriod.sort((a, b) => a.startPeriod - b.startPeriod)
      if (isBefore(chargingScheduleInterval.start, compositeInterval.start)) {
        return {
          ...chargingSchedule,
          chargingSchedulePeriod: chargingSchedule.chargingSchedulePeriod
            .filter((schedulePeriod, index) => {
              if (
                isWithinInterval(
                  addSeconds(chargingScheduleInterval.start, schedulePeriod.startPeriod),
                  compositeInterval
                )
              ) {
                return true
              }
              if (
                index < chargingSchedule.chargingSchedulePeriod.length - 1 &&
                !isWithinInterval(
                  addSeconds(chargingScheduleInterval.start, schedulePeriod.startPeriod),
                  compositeInterval
                ) &&
                isWithinInterval(
                  addSeconds(
                    chargingScheduleInterval.start,
                    chargingSchedule.chargingSchedulePeriod[index + 1].startPeriod
                  ),
                  compositeInterval
                )
              ) {
                return true
              }
              return false
            })
            .map((schedulePeriod, index) => {
              if (index === 0 && schedulePeriod.startPeriod !== 0) {
                schedulePeriod.startPeriod = 0
              }
              return schedulePeriod
            }),
          duration: differenceInSeconds(chargingScheduleInterval.end, compositeInterval.start),
          startSchedule: compositeInterval.start as Date,
        }
      }
      if (isAfter(chargingScheduleInterval.end, compositeInterval.end)) {
        return {
          ...chargingSchedule,
          chargingSchedulePeriod: chargingSchedule.chargingSchedulePeriod.filter(schedulePeriod =>
            isWithinInterval(
              addSeconds(chargingScheduleInterval.start, schedulePeriod.startPeriod),
              compositeInterval
            )
          ),
          duration: differenceInSeconds(compositeInterval.end, chargingScheduleInterval.start),
        }
      }
      return chargingSchedule
    }
  }

  private static hasCachedRequestPayload (
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: unknown
  ): boolean {
    for (const [, , cachedCommandName, cachedPayload] of chargingStation.requests.values()) {
      if (cachedCommandName === commandName && cachedPayload === payload) return true
    }
    return false
  }

  private static meterValueHasPublicKey (meterValue: unknown): boolean {
    if (
      typeof meterValue !== 'object' ||
      meterValue == null ||
      !('sampledValue' in meterValue) ||
      !Array.isArray(meterValue.sampledValue)
    ) {
      return false
    }
    return meterValue.sampledValue.some((sampledValue: unknown) => {
      if (typeof sampledValue !== 'object' || sampledValue == null) return false
      const { format, value } = sampledValue as Partial<OCPP16SampledValue>
      if (format !== OCPP16MeterValueFormat.SIGNED_DATA || typeof value !== 'string') return false
      try {
        const signedMeterValue = JSON.parse(value) as unknown
        return (
          typeof signedMeterValue === 'object' &&
          signedMeterValue != null &&
          'publicKey' in signedMeterValue &&
          isNotEmptyString(signedMeterValue.publicKey)
        )
      } catch {
        return false
      }
    })
  }

  private static normalizeStopTransactionTimestamp (timestamp: unknown): Date {
    if (
      timestamp instanceof Date &&
      Number.isFinite(timestamp.getTime()) &&
      hasOcppTimestampYear(timestamp)
    ) {
      return timestamp
    }
    if (typeof timestamp === 'string') {
      const normalizedTimestamp = parseStopTransactionTimestamp(timestamp)
      if (normalizedTimestamp != null) return normalizedTimestamp
    }
    throw new OCPPError(
      ErrorType.FORMAT_VIOLATION,
      `${moduleName}.stopTransactionOnConnector: Invalid StopTransaction timestamp`,
      RequestCommand.STOP_TRANSACTION
    )
  }

  private static readSigningConfigForConnector (
    chargingStation: ChargingStation,
    connectorId: number
  ): SigningConfig | undefined {
    const publicKeyHex = getConfigurationKey(
      chargingStation,
      `${OCPP16VendorParametersKey.MeterPublicKey}${connectorId.toString()}`
    )?.value
    const configuredSigningMethod = getConfigurationKey(
      chargingStation,
      OCPP16VendorParametersKey.SigningMethod
    )?.value as SigningMethodEnumType | undefined

    const prerequisiteResult = validateSigningPrerequisites(publicKeyHex, configuredSigningMethod)
    if (!prerequisiteResult.enabled) {
      logger.debug(
        `${chargingStation.logPrefix()} OCPP16ServiceUtils.readSigningConfigForConnector: Signed meter values disabled for connector ${connectorId.toString()}: ${prerequisiteResult.reason}`
      )
      return undefined
    }

    return {
      meterSerialNumber: chargingStation.stationInfo?.meterSerialNumber ?? 'SIMULATOR',
      publicKeyHex,
      publicKeyWithSignedMeterValue: parsePublicKeyWithSignedMeterValue(
        getConfigurationKey(
          chargingStation,
          OCPP16VendorParametersKey.PublicKeyWithSignedMeterValue
        )?.value
      ),
      signingMethod: prerequisiteResult.signingMethod,
    }
  }

  private static removePublicKeys (
    meterValues: OCPP16MeterValue[] | undefined
  ): OCPP16MeterValue[] | undefined {
    return meterValues?.map(meterValue => ({
      ...meterValue,
      sampledValue: meterValue.sampledValue.map(sampledValue => {
        if (sampledValue.format !== OCPP16MeterValueFormat.SIGNED_DATA) return sampledValue
        try {
          const signedMeterValue = JSON.parse(sampledValue.value) as OCPP16SignedMeterValue
          if (!isNotEmptyString(signedMeterValue.publicKey)) return sampledValue
          return {
            ...sampledValue,
            value: JSON.stringify({ ...signedMeterValue, publicKey: '' }),
          }
        } catch {
          return sampledValue
        }
      }),
    }))
  }
}
