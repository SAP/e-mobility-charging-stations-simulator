// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { JSONSchemaType } from 'ajv'

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
import {
  type ConfigurationKey,
  type GenericResponse,
  type JsonType,
  OCPP16AuthorizationStatus,
  type OCPP16AvailabilityType,
  type OCPP16ChangeAvailabilityResponse,
  OCPP16ChargePointStatus,
  type OCPP16ChargingProfile,
  type OCPP16ChargingSchedule,
  type OCPP16ClearChargingProfileRequest,
  OCPP16IncomingRequestCommand,
  type OCPP16MeterValue,
  OCPP16MeterValueContext,
  OCPP16MeterValueUnit,
  OCPP16RequestCommand,
  OCPP16StandardParametersKey,
  OCPP16StopTransactionReason,
  type OCPP16SupportedFeatureProfiles,
  OCPPVersion,
} from '../../../types/index.js'
import { convertToDate, isNotEmptyArray, logger, roundTo } from '../../../utils/index.js'
import { OCPPServiceUtils } from '../OCPPServiceUtils.js'
import { OCPP16Constants } from './OCPP16Constants.js'

const moduleName = 'OCPP16ServiceUtils'

export class OCPP16ServiceUtils extends OCPPServiceUtils {
  public static buildTransactionBeginMeterValue (
    chargingStation: ChargingStation,
    connectorId: number,
    meterStart: number | undefined
  ): OCPP16MeterValue {
    const meterValue: OCPP16MeterValue = {
      sampledValue: [],
      timestamp: new Date(),
    }
    // Energy.Active.Import.Register measurand (default)
    const sampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId
    )
    const unitDivider =
      sampledValueTemplate?.unit === OCPP16MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1
    meterValue.sampledValue.push(
      OCPP16ServiceUtils.buildSampledValue(
        chargingStation.stationInfo?.ocppVersion,
        sampledValueTemplate,
        roundTo((meterStart ?? 0) / unitDivider, 4),
        OCPP16MeterValueContext.TRANSACTION_BEGIN
      )
    )
    return meterValue
  }

  public static buildTransactionDataMeterValues (
    transactionBeginMeterValue: OCPP16MeterValue,
    transactionEndMeterValue: OCPP16MeterValue
  ): OCPP16MeterValue[] {
    const meterValues: OCPP16MeterValue[] = []
    meterValues.push(transactionBeginMeterValue)
    meterValues.push(transactionEndMeterValue)
    return meterValues
  }

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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)!
      if (connectorStatus.transactionStarted === true) {
        response = OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED
      }
      connectorStatus.availability = availabilityType
      if (response === OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED) {
        await OCPP16ServiceUtils.sendAndSetConnectorStatus(
          chargingStation,
          connectorId,
          chargePointStatus
        )
      }
      responses.push(response)
    }
    if (responses.includes(OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED)) {
      return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED
    }
    return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED
  }

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

  public static clearChargingProfiles = (
    chargingStation: ChargingStation,
    commandPayload: OCPP16ClearChargingProfileRequest,
    chargingProfiles: OCPP16ChargingProfile[] | undefined
  ): boolean => {
    const { chargingProfilePurpose, id, stackLevel } = commandPayload
    let clearedCP = false
    if (isNotEmptyArray(chargingProfiles)) {
      chargingProfiles.forEach((chargingProfile: OCPP16ChargingProfile, index: number) => {
        let clearCurrentCP = false
        if (chargingProfile.chargingProfileId === id) {
          clearCurrentCP = true
        }
        if (chargingProfilePurpose == null && chargingProfile.stackLevel === stackLevel) {
          clearCurrentCP = true
        }
        if (
          stackLevel == null &&
          chargingProfile.chargingProfilePurpose === chargingProfilePurpose
        ) {
          clearCurrentCP = true
        }
        if (
          chargingProfile.stackLevel === stackLevel &&
          chargingProfile.chargingProfilePurpose === chargingProfilePurpose
        ) {
          clearCurrentCP = true
        }
        if (clearCurrentCP) {
          chargingProfiles.splice(index, 1)
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.clearChargingProfiles: Matching charging profile(s) cleared: %j`,
            chargingProfile
          )
          clearedCP = true
        }
      })
    }
    return clearedCP
  }

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
    const compositeChargingScheduleHigher: OCPP16ChargingSchedule | undefined =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      OCPP16ServiceUtils.composeChargingSchedule(chargingScheduleHigher!, compositeInterval)
    const compositeChargingScheduleLower: OCPP16ChargingSchedule | undefined =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      OCPP16ServiceUtils.composeChargingSchedule(chargingScheduleLower!, compositeInterval)
    const compositeChargingScheduleHigherInterval: Interval = {
      end: addSeconds(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        compositeChargingScheduleHigher!.startSchedule!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        compositeChargingScheduleHigher!.duration!
      ),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      start: compositeChargingScheduleHigher!.startSchedule!,
    }
    const compositeChargingScheduleLowerInterval: Interval = {
      end: addSeconds(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        compositeChargingScheduleLower!.startSchedule!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        compositeChargingScheduleLower!.duration!
      ),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      start: compositeChargingScheduleLower!.startSchedule!,
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ...compositeChargingScheduleHigher!,
        chargingSchedulePeriod: [
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...compositeChargingScheduleHigher!.chargingSchedulePeriod.map(schedulePeriod => {
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
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...compositeChargingScheduleLower!.chargingSchedulePeriod.map(schedulePeriod => {
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      ...compositeChargingScheduleHigher!,
      chargingSchedulePeriod: [
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ...compositeChargingScheduleHigher!.chargingSchedulePeriod.map(schedulePeriod => {
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ...compositeChargingScheduleLower!.chargingSchedulePeriod
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
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              index < compositeChargingScheduleLower!.chargingSchedulePeriod.length - 1 &&
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
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  compositeChargingScheduleLower!.chargingSchedulePeriod[index + 1].startPeriod
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
   * Factory options for OCPP 1.6 Incoming Request Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 1.6 incoming request validators
   */
  public static createIncomingRequestFactoryOptions = (moduleName: string, methodName: string) =>
    OCPP16ServiceUtils.PayloadValidatorOptions(
      OCPPVersion.VERSION_16,
      'assets/json-schemas/ocpp/1.6',
      moduleName,
      methodName
    )

  /**
   * OCPP 1.6 Incoming Request Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestPayloadConfigs = (): [
    OCPP16IncomingRequestCommand,
    { schemaPath: string }
  ][] => [
    [
      OCPP16IncomingRequestCommand.CANCEL_RESERVATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('CancelReservation.json'),
    ],
    [
      OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY,
      OCPP16ServiceUtils.PayloadValidatorConfig('ChangeAvailability.json'),
    ],
    [
      OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('ChangeConfiguration.json'),
    ],
    [
      OCPP16IncomingRequestCommand.CLEAR_CACHE,
      OCPP16ServiceUtils.PayloadValidatorConfig('ClearCache.json'),
    ],
    [
      OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE,
      OCPP16ServiceUtils.PayloadValidatorConfig('ClearChargingProfile.json'),
    ],
    [
      OCPP16IncomingRequestCommand.DATA_TRANSFER,
      OCPP16ServiceUtils.PayloadValidatorConfig('DataTransfer.json'),
    ],
    [
      OCPP16IncomingRequestCommand.GET_COMPOSITE_SCHEDULE,
      OCPP16ServiceUtils.PayloadValidatorConfig('GetCompositeSchedule.json'),
    ],
    [
      OCPP16IncomingRequestCommand.GET_CONFIGURATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('GetConfiguration.json'),
    ],
    [
      OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
      OCPP16ServiceUtils.PayloadValidatorConfig('GetDiagnostics.json'),
    ],
    [
      OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
      OCPP16ServiceUtils.PayloadValidatorConfig('RemoteStartTransaction.json'),
    ],
    [
      OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
      OCPP16ServiceUtils.PayloadValidatorConfig('RemoteStopTransaction.json'),
    ],
    [
      OCPP16IncomingRequestCommand.RESERVE_NOW,
      OCPP16ServiceUtils.PayloadValidatorConfig('ReserveNow.json'),
    ],
    [OCPP16IncomingRequestCommand.RESET, OCPP16ServiceUtils.PayloadValidatorConfig('Reset.json')],
    [
      OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE,
      OCPP16ServiceUtils.PayloadValidatorConfig('SetChargingProfile.json'),
    ],
    [
      OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
      OCPP16ServiceUtils.PayloadValidatorConfig('TriggerMessage.json'),
    ],
    [
      OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR,
      OCPP16ServiceUtils.PayloadValidatorConfig('UnlockConnector.json'),
    ],
    [
      OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
      OCPP16ServiceUtils.PayloadValidatorConfig('UpdateFirmware.json'),
    ],
  ]

  /**
   * Factory options for OCPP 1.6 Incoming Request Response Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 1.6 incoming request response validators
   */
  public static createIncomingRequestResponseFactoryOptions = (
    moduleName: string,
    methodName: string
  ) =>
    OCPP16ServiceUtils.PayloadValidatorOptions(
      OCPPVersion.VERSION_16,
      'assets/json-schemas/ocpp/1.6',
      moduleName,
      methodName
    )

  /**
   * OCPP 1.6 Incoming Request Response Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestResponsePayloadConfigs = (): [
    OCPP16IncomingRequestCommand,
    { schemaPath: string }
  ][] => [
    [
      OCPP16IncomingRequestCommand.CANCEL_RESERVATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('CancelReservationResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY,
      OCPP16ServiceUtils.PayloadValidatorConfig('ChangeAvailabilityResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('ChangeConfigurationResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.CLEAR_CACHE,
      OCPP16ServiceUtils.PayloadValidatorConfig('ClearCacheResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE,
      OCPP16ServiceUtils.PayloadValidatorConfig('ClearChargingProfileResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.DATA_TRANSFER,
      OCPP16ServiceUtils.PayloadValidatorConfig('DataTransferResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.GET_COMPOSITE_SCHEDULE,
      OCPP16ServiceUtils.PayloadValidatorConfig('GetCompositeScheduleResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.GET_CONFIGURATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('GetConfigurationResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
      OCPP16ServiceUtils.PayloadValidatorConfig('GetDiagnosticsResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
      OCPP16ServiceUtils.PayloadValidatorConfig('RemoteStartTransactionResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
      OCPP16ServiceUtils.PayloadValidatorConfig('RemoteStopTransactionResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.RESERVE_NOW,
      OCPP16ServiceUtils.PayloadValidatorConfig('ReserveNowResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.RESET,
      OCPP16ServiceUtils.PayloadValidatorConfig('ResetResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE,
      OCPP16ServiceUtils.PayloadValidatorConfig('SetChargingProfileResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
      OCPP16ServiceUtils.PayloadValidatorConfig('TriggerMessageResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR,
      OCPP16ServiceUtils.PayloadValidatorConfig('UnlockConnectorResponse.json'),
    ],
    [
      OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
      OCPP16ServiceUtils.PayloadValidatorConfig('UpdateFirmwareResponse.json'),
    ],
  ]

  /**
   * Factory options for OCPP 1.6 Request Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 1.6 validators
   */
  public static createRequestFactoryOptions = (moduleName: string, methodName: string) =>
    OCPP16ServiceUtils.PayloadValidatorOptions(
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
  ][] => [
    [OCPP16RequestCommand.AUTHORIZE, OCPP16ServiceUtils.PayloadValidatorConfig('Authorize.json')],
    [
      OCPP16RequestCommand.BOOT_NOTIFICATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('BootNotification.json'),
    ],
    [
      OCPP16RequestCommand.DATA_TRANSFER,
      OCPP16ServiceUtils.PayloadValidatorConfig('DataTransfer.json'),
    ],
    [
      OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('DiagnosticsStatusNotification.json'),
    ],
    [
      OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('FirmwareStatusNotification.json'),
    ],
    [OCPP16RequestCommand.HEARTBEAT, OCPP16ServiceUtils.PayloadValidatorConfig('Heartbeat.json')],
    [
      OCPP16RequestCommand.METER_VALUES,
      OCPP16ServiceUtils.PayloadValidatorConfig('MeterValues.json'),
    ],
    [
      OCPP16RequestCommand.START_TRANSACTION,
      OCPP16ServiceUtils.PayloadValidatorConfig('StartTransaction.json'),
    ],
    [
      OCPP16RequestCommand.STATUS_NOTIFICATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('StatusNotification.json'),
    ],
    [
      OCPP16RequestCommand.STOP_TRANSACTION,
      OCPP16ServiceUtils.PayloadValidatorConfig('StopTransaction.json'),
    ],
  ]

  /**
   * Factory options for OCPP 1.6 Response Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 1.6 response validators
   */
  public static createResponseFactoryOptions = (moduleName: string, methodName: string) =>
    OCPP16ServiceUtils.PayloadValidatorOptions(
      OCPPVersion.VERSION_16,
      'assets/json-schemas/ocpp/1.6',
      moduleName,
      methodName
    )

  /**
   * OCPP 1.6 Response Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createResponsePayloadConfigs = (): [
    OCPP16RequestCommand,
    { schemaPath: string }
  ][] => [
    [
      OCPP16RequestCommand.AUTHORIZE,
      OCPP16ServiceUtils.PayloadValidatorConfig('AuthorizeResponse.json'),
    ],
    [
      OCPP16RequestCommand.BOOT_NOTIFICATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('BootNotificationResponse.json'),
    ],
    [
      OCPP16RequestCommand.DATA_TRANSFER,
      OCPP16ServiceUtils.PayloadValidatorConfig('DataTransferResponse.json'),
    ],
    [
      OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('DiagnosticsStatusNotificationResponse.json'),
    ],
    [
      OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('FirmwareStatusNotificationResponse.json'),
    ],
    [
      OCPP16RequestCommand.HEARTBEAT,
      OCPP16ServiceUtils.PayloadValidatorConfig('HeartbeatResponse.json'),
    ],
    [
      OCPP16RequestCommand.METER_VALUES,
      OCPP16ServiceUtils.PayloadValidatorConfig('MeterValuesResponse.json'),
    ],
    [
      OCPP16RequestCommand.START_TRANSACTION,
      OCPP16ServiceUtils.PayloadValidatorConfig('StartTransactionResponse.json'),
    ],
    [
      OCPP16RequestCommand.STATUS_NOTIFICATION,
      OCPP16ServiceUtils.PayloadValidatorConfig('StatusNotificationResponse.json'),
    ],
    [
      OCPP16RequestCommand.STOP_TRANSACTION,
      OCPP16ServiceUtils.PayloadValidatorConfig('StopTransactionResponse.json'),
    ],
  ]

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

  public static isConfigurationKeyVisible (key: ConfigurationKey): boolean {
    if (key.visible == null) {
      return true
    }
    return key.visible
  }

  public static override parseJsonSchemaFile<T extends JsonType>(
    relativePath: string,
    moduleName?: string,
    methodName?: string
  ): JSONSchemaType<T> {
    return OCPP16ServiceUtils.parseJsonSchemaFile<T>(
      relativePath,
      OCPPVersion.VERSION_16,
      moduleName,
      methodName
    )
  }

  public static remoteStopTransaction = async (
    chargingStation: ChargingStation,
    connectorId: number
  ): Promise<GenericResponse> => {
    await OCPP16ServiceUtils.sendAndSetConnectorStatus(
      chargingStation,
      connectorId,
      OCPP16ChargePointStatus.Finishing
    )
    const stopResponse = await chargingStation.stopTransactionOnConnector(
      connectorId,
      OCPP16StopTransactionReason.REMOTE
    )
    if (stopResponse.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
      return OCPP16Constants.OCPP_RESPONSE_ACCEPTED
    }
    return OCPP16Constants.OCPP_RESPONSE_REJECTED
  }

  public static setChargingProfile (
    chargingStation: ChargingStation,
    connectorId: number,
    cp: OCPP16ChargingProfile
  ): void {
    if (chargingStation.getConnectorStatus(connectorId)?.chargingProfiles == null) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.setChargingProfile: Trying to set a charging profile on connector id ${connectorId.toString()} with an uninitialized charging profiles array attribute, applying deferred initialization`
      )
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chargingStation.getConnectorStatus(connectorId)!.chargingProfiles = []
    }
    if (!Array.isArray(chargingStation.getConnectorStatus(connectorId)?.chargingProfiles)) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.setChargingProfile: Trying to set a charging profile on connector id ${connectorId.toString()} with an improper attribute type for the charging profiles array, applying proper type deferred initialization`
      )
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chargingStation.getConnectorStatus(connectorId)!.chargingProfiles = []
    }
    cp.chargingSchedule.startSchedule = convertToDate(cp.chargingSchedule.startSchedule)
    cp.validFrom = convertToDate(cp.validFrom)
    cp.validTo = convertToDate(cp.validTo)
    let cpReplaced = false
    if (isNotEmptyArray(chargingStation.getConnectorStatus(connectorId)?.chargingProfiles)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      for (const [index, chargingProfile] of chargingStation
        .getConnectorStatus(connectorId)!
        .chargingProfiles!.entries()) {
        if (
          chargingProfile.chargingProfileId === cp.chargingProfileId ||
          (chargingProfile.stackLevel === cp.stackLevel &&
            chargingProfile.chargingProfilePurpose === cp.chargingProfilePurpose)
        ) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          chargingStation.getConnectorStatus(connectorId)!.chargingProfiles![index] = cp
          cpReplaced = true
        }
      }
    }
    !cpReplaced && chargingStation.getConnectorStatus(connectorId)?.chargingProfiles?.push(cp)
  }

  private static readonly composeChargingSchedule = (
    chargingSchedule: OCPP16ChargingSchedule,
    compositeInterval: Interval
  ): OCPP16ChargingSchedule | undefined => {
    const chargingScheduleInterval: Interval = {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      end: addSeconds(chargingSchedule.startSchedule!, chargingSchedule.duration!),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      start: chargingSchedule.startSchedule!,
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
