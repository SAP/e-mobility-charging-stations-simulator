import {
  addSeconds,
  areIntervalsOverlapping,
  differenceInSeconds,
  type Interval,
  isAfter,
  isBefore,
  isWithinInterval,
} from 'date-fns'

import {
  type ChargingStation,
  hasFeatureProfile,
  hasReservationExpired,
} from '../../../charging-station/index.js'
import { BaseError } from '../../../exception/index.js'
import {
  ChargePointErrorCode,
  type ChargingStationInfo,
  type ConfigurationKey,
  type GenericResponse,
  type MeterValuesRequest,
  type MeterValuesResponse,
  OCPP16AuthorizationStatus,
  type OCPP16AvailabilityType,
  type OCPP16BootNotificationRequest,
  type OCPP16ChangeAvailabilityResponse,
  OCPP16ChargePointStatus,
  type OCPP16ChargingProfile,
  type OCPP16ChargingSchedule,
  type OCPP16ClearChargingProfileRequest,
  type OCPP16IdTagInfo,
  OCPP16IncomingRequestCommand,
  type OCPP16MeterValue,
  OCPP16MeterValueContext,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValueUnit,
  OCPP16RequestCommand,
  type OCPP16SampledValue,
  OCPP16StandardParametersKey,
  type OCPP16StatusNotificationRequest,
  OCPP16StopTransactionReason,
  type OCPP16SupportedFeatureProfiles,
  OCPPVersion,
  RequestCommand,
  type StartTransactionRequest,
  type StartTransactionResponse,
  type StopTransactionReason,
  type StopTransactionRequest,
  type StopTransactionResponse,
} from '../../../types/index.js'
import {
  clampToSafeTimerValue,
  convertToDate,
  convertToInt,
  isNotEmptyArray,
  logger,
  roundTo,
  truncateId,
} from '../../../utils/index.js'
import {
  AuthenticationMethod,
  type AuthorizationResult,
  mapOCPP16Status,
  OCPPAuthServiceFactory,
} from '../auth/index.js'
import {
  buildEmptyMeterValue,
  buildMeterValue,
  buildSampledValue,
  createPayloadConfigs,
  getSampledValueTemplate,
  PayloadValidatorOptions,
  sendAndSetConnectorStatus,
} from '../OCPPServiceUtils.js'
import { OCPP16Constants } from './OCPP16Constants.js'

const moduleName = 'OCPP16ServiceUtils'

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
      [OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION, 'RemoteStartTransaction'],
      [OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION, 'RemoteStopTransaction'],
      [OCPP16IncomingRequestCommand.RESERVE_NOW, 'ReserveNow'],
      [OCPP16IncomingRequestCommand.RESET, 'Reset'],
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

  /**
   * Builds an OCPP 1.6 BootNotification request payload from station info.
   * @param stationInfo - Charging station information
   * @returns Formatted OCPP 1.6 BootNotification request payload
   */
  public static buildBootNotificationRequest (
    stationInfo: ChargingStationInfo
  ): OCPP16BootNotificationRequest {
    return {
      chargePointModel: stationInfo.chargePointModel,
      chargePointVendor: stationInfo.chargePointVendor,
      ...(stationInfo.chargeBoxSerialNumber != null && {
        chargeBoxSerialNumber: stationInfo.chargeBoxSerialNumber,
      }),
      ...(stationInfo.chargePointSerialNumber != null && {
        chargePointSerialNumber: stationInfo.chargePointSerialNumber,
      }),
      ...(stationInfo.firmwareVersion != null && {
        firmwareVersion: stationInfo.firmwareVersion,
      }),
      ...(stationInfo.iccid != null && { iccid: stationInfo.iccid }),
      ...(stationInfo.imsi != null && { imsi: stationInfo.imsi }),
      ...(stationInfo.meterSerialNumber != null && {
        meterSerialNumber: stationInfo.meterSerialNumber,
      }),
      ...(stationInfo.meterType != null && {
        meterType: stationInfo.meterType,
      }),
    } satisfies OCPP16BootNotificationRequest
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
      errorCode: ChargePointErrorCode.NO_ERROR,
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
    const meterValue = buildEmptyMeterValue() as OCPP16MeterValue
    // Energy.Active.Import.Register measurand (default)
    const sampledValueTemplate = getSampledValueTemplate(chargingStation, connectorId)
    if (sampledValueTemplate != null) {
      const unitDivider =
        sampledValueTemplate.unit === OCPP16MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1
      meterValue.sampledValue.push(
        buildSampledValue(
          chargingStation.stationInfo?.ocppVersion,
          sampledValueTemplate,
          roundTo((meterStart ?? 0) / unitDivider, 4),
          OCPP16MeterValueContext.TRANSACTION_BEGIN
        ) as OCPP16SampledValue
      )
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
   * @returns MeterValue containing the transaction end energy reading
   */
  public static buildTransactionEndMeterValue (
    chargingStation: ChargingStation,
    connectorId: number,
    meterStop: number | undefined
  ): OCPP16MeterValue {
    const sampledValueTemplate = getSampledValueTemplate(chargingStation, connectorId)
    if (sampledValueTemplate == null) {
      throw new BaseError(
        `Missing MeterValues for default measurand '${OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}' in template on connector id ${connectorId.toString()}`
      )
    }
    const unitDivider = sampledValueTemplate.unit === OCPP16MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1
    const meterValue = buildEmptyMeterValue() as OCPP16MeterValue
    meterValue.sampledValue.push(
      buildSampledValue(
        OCPPVersion.VERSION_16,
        sampledValueTemplate,
        roundTo((meterStop ?? 0) / unitDivider, 4),
        OCPP16MeterValueContext.TRANSACTION_END
      ) as OCPP16SampledValue
    )
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
        } as OCPP16StatusNotificationRequest)
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
        `${chargingStation.logPrefix()} ${moduleName}.hasReservation: Connector id ${connectorId.toString()} has a valid reservation for idTag ${idTag}: %j`,
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
   * Stops a transaction remotely on the given connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier with the active transaction
   * @returns Accepted or rejected generic response
   */
  public static remoteStopTransaction = async (
    chargingStation: ChargingStation,
    connectorId: number
  ): Promise<GenericResponse> => {
    await sendAndSetConnectorStatus(chargingStation, {
      connectorId,
      status: OCPP16ChargePointStatus.Finishing,
    } as OCPP16StatusNotificationRequest)
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
   * Sends a StartTransaction request to the central system for the given connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier to start the transaction on
   * @param idTag - Optional RFID tag for the transaction
   * @returns Start transaction response from the central system
   */
  public static async startTransactionOnConnector (
    chargingStation: ChargingStation,
    connectorId: number,
    idTag?: string
  ): Promise<StartTransactionResponse> {
    return chargingStation.ocppRequestService.requestHandler<
      Partial<StartTransactionRequest>,
      StartTransactionResponse
    >(chargingStation, RequestCommand.START_TRANSACTION, {
      connectorId,
      ...(idTag != null && { idTag }),
    })
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
    connectorStatus.transactionUpdatedMeterValuesSetInterval = setInterval(() => {
      const transactionId = convertToInt(connectorStatus.transactionId)
      const meterValue = buildMeterValue(chargingStation, transactionId, interval)
      chargingStation.ocppRequestService
        .requestHandler<MeterValuesRequest, MeterValuesResponse>(
          chargingStation,
          RequestCommand.METER_VALUES,
          {
            connectorId,
            meterValue: [meterValue],
            transactionId,
          } as MeterValuesRequest
        )
        .catch((error: unknown) => {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: Error while sending '${RequestCommand.METER_VALUES}':`,
            error
          )
        })
    }, clampToSafeTimerValue(interval))
  }

  /**
   * Sends a StopTransaction request to the central system for the given connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier with the active transaction
   * @param reason - Optional stop transaction reason
   * @returns Stop transaction response from the central system
   */
  public static async stopTransactionOnConnector (
    chargingStation: ChargingStation,
    connectorId: number,
    reason?: StopTransactionReason
  ): Promise<StopTransactionResponse> {
    const rawTransactionId = chargingStation.getConnectorStatus(connectorId)?.transactionId
    const transactionId = rawTransactionId != null ? convertToInt(rawTransactionId) : undefined
    if (
      chargingStation.stationInfo?.beginEndMeterValues === true &&
      chargingStation.stationInfo.ocppStrictCompliance === true &&
      chargingStation.stationInfo.outOfOrderEndMeterValues === false
    ) {
      const transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(
        chargingStation,
        connectorId,
        chargingStation.getEnergyActiveImportRegisterByTransactionId(rawTransactionId)
      )
      await chargingStation.ocppRequestService.requestHandler<
        MeterValuesRequest,
        MeterValuesResponse
      >(chargingStation, RequestCommand.METER_VALUES, {
        connectorId,
        meterValue: [transactionEndMeterValue],
        transactionId,
      } as MeterValuesRequest)
    }
    return await chargingStation.ocppRequestService.requestHandler<
      Partial<StopTransactionRequest>,
      StopTransactionResponse
    >(chargingStation, RequestCommand.STOP_TRANSACTION, {
      meterStop: chargingStation.getEnergyActiveImportRegisterByTransactionId(
        rawTransactionId,
        true
      ),
      transactionId,
      ...(reason != null && { reason: reason as StopTransactionRequest['reason'] }),
    })
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
    }
  }

  public static updateAuthorizationCache (
    chargingStation: ChargingStation,
    idTag: string,
    idTagInfo: OCPP16IdTagInfo
  ): void {
    try {
      const authService = OCPPAuthServiceFactory.getInstance(chargingStation)
      const authCache = authService.getAuthCache()
      if (authCache == null) {
        return
      }
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
        status: mapOCPP16Status(idTagInfo.status),
        timestamp: new Date(),
      }
      let ttl: number | undefined
      if (idTagInfo.expiryDate != null) {
        const expiryDate = convertToDate(idTagInfo.expiryDate)
        if (expiryDate != null) {
          const ttlSeconds = Math.ceil((expiryDate.getTime() - Date.now()) / 1000)
          if (ttlSeconds <= 0) {
            logger.debug(
              `${chargingStation.logPrefix()} ${moduleName}.updateAuthorizationCache: Skipping expired entry for '${truncateId(idTag)}'`
            )
            return
          }
          ttl = ttlSeconds
        }
      }
      authCache.set(idTag, result, ttl)
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.updateAuthorizationCache: Updated cache for '${truncateId(idTag)}' status=${result.status}${ttl != null ? `, ttl=${ttl.toString()}s` : ''}`
      )
    } catch (error) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.updateAuthorizationCache: Cache update failed for '${truncateId(idTag)}':`,
        error
      )
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
          duration: differenceInSeconds(
            chargingScheduleInterval.end,
            compositeInterval.start as Date
          ),
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
          duration: differenceInSeconds(
            compositeInterval.end as Date,
            chargingScheduleInterval.start
          ),
        }
      }
      return chargingSchedule
    }
  }
}
