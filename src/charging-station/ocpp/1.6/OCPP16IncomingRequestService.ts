// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { randomInt } from 'node:crypto'
import { createWriteStream, readdirSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { ValidateFunction } from 'ajv'
import { Client, type FTPResponse } from 'basic-ftp'
import {
  addSeconds,
  differenceInSeconds,
  type Interval,
  isDate,
  secondsToMilliseconds
} from 'date-fns'
import { maxTime } from 'date-fns/constants'
import { isEmpty } from 'rambda'
import { create } from 'tar'

import {
  canProceedChargingProfile,
  type ChargingStation,
  checkChargingStation,
  getConfigurationKey,
  getConnectorChargingProfiles,
  prepareChargingProfileKind,
  removeExpiredReservations,
  resetAuthorizeConnectorStatus,
  setConfigurationKeyValue
} from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  type ChangeConfigurationRequest,
  type ChangeConfigurationResponse,
  ConfigurationSection,
  ErrorType,
  type GenericResponse,
  GenericStatus,
  type GetConfigurationRequest,
  type GetConfigurationResponse,
  type GetDiagnosticsRequest,
  type GetDiagnosticsResponse,
  type IncomingRequestHandler,
  type JsonType,
  type LogConfiguration,
  OCPP16AuthorizationStatus,
  OCPP16AvailabilityType,
  type OCPP16BootNotificationRequest,
  type OCPP16BootNotificationResponse,
  type OCPP16CancelReservationRequest,
  type OCPP16ChangeAvailabilityRequest,
  type OCPP16ChangeAvailabilityResponse,
  OCPP16ChargePointErrorCode,
  OCPP16ChargePointStatus,
  type OCPP16ChargingProfile,
  OCPP16ChargingProfilePurposeType,
  type OCPP16ChargingSchedule,
  type OCPP16ClearCacheRequest,
  type OCPP16ClearChargingProfileRequest,
  type OCPP16ClearChargingProfileResponse,
  type OCPP16DataTransferRequest,
  type OCPP16DataTransferResponse,
  OCPP16DataTransferVendorId,
  OCPP16DiagnosticsStatus,
  type OCPP16DiagnosticsStatusNotificationRequest,
  type OCPP16DiagnosticsStatusNotificationResponse,
  OCPP16FirmwareStatus,
  type OCPP16FirmwareStatusNotificationRequest,
  type OCPP16FirmwareStatusNotificationResponse,
  type OCPP16GetCompositeScheduleRequest,
  type OCPP16GetCompositeScheduleResponse,
  type OCPP16HeartbeatRequest,
  type OCPP16HeartbeatResponse,
  OCPP16IncomingRequestCommand,
  OCPP16MessageTrigger,
  OCPP16RequestCommand,
  type OCPP16ReserveNowRequest,
  type OCPP16ReserveNowResponse,
  OCPP16StandardParametersKey,
  type OCPP16StartTransactionRequest,
  type OCPP16StartTransactionResponse,
  type OCPP16StatusNotificationRequest,
  type OCPP16StatusNotificationResponse,
  OCPP16StopTransactionReason,
  OCPP16SupportedFeatureProfiles,
  type OCPP16TriggerMessageRequest,
  type OCPP16TriggerMessageResponse,
  OCPP16TriggerMessageStatus,
  type OCPP16UpdateFirmwareRequest,
  type OCPP16UpdateFirmwareResponse,
  type OCPPConfigurationKey,
  OCPPVersion,
  type RemoteStartTransactionRequest,
  type RemoteStopTransactionRequest,
  ReservationTerminationReason,
  type ResetRequest,
  type SetChargingProfileRequest,
  type SetChargingProfileResponse,
  type UnlockConnectorRequest,
  type UnlockConnectorResponse
} from '../../../types/index.js'
import {
  Configuration,
  Constants,
  convertToDate,
  convertToInt,
  formatDurationMilliSeconds,
  handleIncomingRequestError,
  isAsyncFunction,
  isNotEmptyArray,
  isNotEmptyString,
  logger,
  sleep
} from '../../../utils/index.js'
import { OCPPIncomingRequestService } from '../OCPPIncomingRequestService.js'
import { OCPP16Constants } from './OCPP16Constants.js'
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils.js'

const moduleName = 'OCPP16IncomingRequestService'

export class OCPP16IncomingRequestService extends OCPPIncomingRequestService {
  protected payloadValidateFunctions: Map<OCPP16IncomingRequestCommand, ValidateFunction<JsonType>>

  private readonly incomingRequestHandlers: Map<
  OCPP16IncomingRequestCommand,
  IncomingRequestHandler
  >

  public constructor () {
    // if (new.target.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target.name} instances directly`)
    // }
    super(OCPPVersion.VERSION_16)
    this.incomingRequestHandlers = new Map<OCPP16IncomingRequestCommand, IncomingRequestHandler>([
      [
        OCPP16IncomingRequestCommand.RESET,
        this.handleRequestReset.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CACHE,
        this.handleRequestClearCache.bind(this) as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR,
        this.handleRequestUnlockConnector.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.GET_CONFIGURATION,
        this.handleRequestGetConfiguration.bind(this) as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION,
        this.handleRequestChangeConfiguration.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.GET_COMPOSITE_SCHEDULE,
        this.handleRequestGetCompositeSchedule.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE,
        this.handleRequestSetChargingProfile.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE,
        this.handleRequestClearChargingProfile.bind(this) as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY,
        this.handleRequestChangeAvailability.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        this.handleRequestRemoteStartTransaction.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
        this.handleRequestRemoteStopTransaction.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
        this.handleRequestGetDiagnostics.bind(this) as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        this.handleRequestTriggerMessage.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.DATA_TRANSFER,
        this.handleRequestDataTransfer.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
        this.handleRequestUpdateFirmware.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.RESERVE_NOW,
        this.handleRequestReserveNow.bind(this) as unknown as IncomingRequestHandler
      ],
      [
        OCPP16IncomingRequestCommand.CANCEL_RESERVATION,
        this.handleRequestCancelReservation.bind(this) as unknown as IncomingRequestHandler
      ]
    ])
    this.payloadValidateFunctions = new Map<
    OCPP16IncomingRequestCommand,
    ValidateFunction<JsonType>
    >([
      [
        OCPP16IncomingRequestCommand.RESET,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<ResetRequest>(
              'assets/json-schemas/ocpp/1.6/Reset.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CACHE,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16ClearCacheRequest>(
              'assets/json-schemas/ocpp/1.6/ClearCache.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<UnlockConnectorRequest>(
              'assets/json-schemas/ocpp/1.6/UnlockConnector.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.GET_CONFIGURATION,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<GetConfigurationRequest>(
              'assets/json-schemas/ocpp/1.6/GetConfiguration.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<ChangeConfigurationRequest>(
              'assets/json-schemas/ocpp/1.6/ChangeConfiguration.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<GetDiagnosticsRequest>(
              'assets/json-schemas/ocpp/1.6/GetDiagnostics.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.GET_COMPOSITE_SCHEDULE,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16GetCompositeScheduleRequest>(
              'assets/json-schemas/ocpp/1.6/GetCompositeSchedule.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<SetChargingProfileRequest>(
              'assets/json-schemas/ocpp/1.6/SetChargingProfile.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16ClearChargingProfileRequest>(
              'assets/json-schemas/ocpp/1.6/ClearChargingProfile.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16ChangeAvailabilityRequest>(
              'assets/json-schemas/ocpp/1.6/ChangeAvailability.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<RemoteStartTransactionRequest>(
              'assets/json-schemas/ocpp/1.6/RemoteStartTransaction.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<RemoteStopTransactionRequest>(
              'assets/json-schemas/ocpp/1.6/RemoteStopTransaction.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16TriggerMessageRequest>(
              'assets/json-schemas/ocpp/1.6/TriggerMessage.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.DATA_TRANSFER,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DataTransferRequest>(
              'assets/json-schemas/ocpp/1.6/DataTransfer.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16UpdateFirmwareRequest>(
              'assets/json-schemas/ocpp/1.6/UpdateFirmware.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.RESERVE_NOW,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16ReserveNowRequest>(
              'assets/json-schemas/ocpp/1.6/ReserveNow.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.CANCEL_RESERVATION,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16CancelReservationRequest>(
              'assets/json-schemas/ocpp/1.6/CancelReservation.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ]
    ])
    // Handle incoming request events
    this.on(
      OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
      (
        chargingStation: ChargingStation,
        request: RemoteStartTransactionRequest,
        response: GenericResponse
      ) => {
        if (response.status === GenericStatus.Accepted) {
          const { connectorId, idTag } = request
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          chargingStation.getConnectorStatus(connectorId!)!.transactionRemoteStarted = true
          chargingStation.ocppRequestService
            .requestHandler<Partial<OCPP16StartTransactionRequest>, OCPP16StartTransactionResponse>(
            chargingStation,
            OCPP16RequestCommand.START_TRANSACTION,
            {
              connectorId,
              idTag
            }
          )
            .then(response => {
              if (response.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
                logger.debug(
                  `${chargingStation.logPrefix()} Remote start transaction ACCEPTED on ${
                    chargingStation.stationInfo?.chargingStationId
                  }#${connectorId} for idTag '${idTag}'`
                )
              } else {
                logger.debug(
                  `${chargingStation.logPrefix()} Remote start transaction REJECTED on ${
                    chargingStation.stationInfo?.chargingStationId
                  }#${connectorId} for idTag '${idTag}'`
                )
              }
            })
            .catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.constructor: Remote start transaction error:`,
                error
              )
            })
        }
      }
    )
    this.on(
      OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
      (
        chargingStation: ChargingStation,
        request: RemoteStopTransactionRequest,
        response: GenericResponse
      ) => {
        if (response.status === GenericStatus.Accepted) {
          const { transactionId } = request
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const connectorId = chargingStation.getConnectorIdByTransactionId(transactionId)!
          OCPP16ServiceUtils.remoteStopTransaction(chargingStation, connectorId)
            .then(response => {
              if (response.status === GenericStatus.Accepted) {
                logger.debug(
                  `${chargingStation.logPrefix()} Remote stop transaction ACCEPTED on ${
                    chargingStation.stationInfo?.chargingStationId
                  }#${connectorId} for transaction '${transactionId}'`
                )
              } else {
                logger.debug(
                  `${chargingStation.logPrefix()} Remote stop transaction REJECTED on ${
                    chargingStation.stationInfo?.chargingStationId
                  }#${connectorId} for transaction '${transactionId}'`
                )
              }
            })
            .catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.constructor: Remote stop transaction error:`,
                error
              )
            })
        }
      }
    )
    this.on(
      OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
      (
        chargingStation: ChargingStation,
        request: OCPP16TriggerMessageRequest,
        response: OCPP16TriggerMessageResponse
      ) => {
        if (response.status !== OCPP16TriggerMessageStatus.ACCEPTED) {
          return
        }
        const { requestedMessage, connectorId } = request
        const errorHandler = (error: unknown): void => {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.constructor: Trigger ${requestedMessage} error:`,
            error
          )
        }
        switch (requestedMessage) {
          case OCPP16MessageTrigger.BootNotification:
            chargingStation.ocppRequestService
              .requestHandler<
            OCPP16BootNotificationRequest,
            OCPP16BootNotificationResponse
            >(chargingStation, OCPP16RequestCommand.BOOT_NOTIFICATION, chargingStation.bootNotificationRequest as OCPP16BootNotificationRequest, { skipBufferingOnError: true, triggerMessage: true })
              .catch(errorHandler)
            break
          case OCPP16MessageTrigger.Heartbeat:
            chargingStation.ocppRequestService
              .requestHandler<OCPP16HeartbeatRequest, OCPP16HeartbeatResponse>(
              chargingStation,
              OCPP16RequestCommand.HEARTBEAT,
              undefined,
              {
                triggerMessage: true
              }
            )
              .catch(errorHandler)
            break
          case OCPP16MessageTrigger.StatusNotification:
            if (connectorId != null) {
              chargingStation.ocppRequestService
                .requestHandler<OCPP16StatusNotificationRequest, OCPP16StatusNotificationResponse>(
                chargingStation,
                OCPP16RequestCommand.STATUS_NOTIFICATION,
                {
                  connectorId,
                  errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
                  status: chargingStation.getConnectorStatus(connectorId)
                    ?.status as OCPP16ChargePointStatus
                },
                {
                  triggerMessage: true
                }
              )
                .catch(errorHandler)
            } else if (chargingStation.hasEvses) {
              for (const evseStatus of chargingStation.evses.values()) {
                for (const [id, connectorStatus] of evseStatus.connectors) {
                  chargingStation.ocppRequestService
                    .requestHandler<
                  OCPP16StatusNotificationRequest,
                  OCPP16StatusNotificationResponse
                  >(
                    chargingStation,
                    OCPP16RequestCommand.STATUS_NOTIFICATION,
                    {
                      connectorId: id,
                      errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
                      status: connectorStatus.status as OCPP16ChargePointStatus
                    },
                    {
                      triggerMessage: true
                    }
                  )
                    .catch(errorHandler)
                }
              }
            } else {
              for (const [id, connectorStatus] of chargingStation.connectors) {
                chargingStation.ocppRequestService
                  .requestHandler<
                OCPP16StatusNotificationRequest,
                OCPP16StatusNotificationResponse
                >(
                  chargingStation,
                  OCPP16RequestCommand.STATUS_NOTIFICATION,
                  {
                    connectorId: id,
                    errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
                    status: connectorStatus.status as OCPP16ChargePointStatus
                  },
                  {
                    triggerMessage: true
                  }
                )
                  .catch(errorHandler)
              }
            }
            break
        }
      }
    )
    this.validatePayload = this.validatePayload.bind(this)
  }

  public async incomingRequestHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: OCPP16IncomingRequestCommand,
    commandPayload: ReqType
  ): Promise<void> {
    let response: ResType
    if (
      chargingStation.stationInfo?.ocppStrictCompliance === true &&
      chargingStation.inPendingState() &&
      (commandName === OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION ||
        commandName === OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION)
    ) {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          undefined,
          2
        )} while the charging station is in pending state on the central server`,
        commandName,
        commandPayload
      )
    }
    if (
      chargingStation.isRegistered() ||
      (chargingStation.stationInfo?.ocppStrictCompliance === false &&
        chargingStation.inUnknownState())
    ) {
      if (
        this.incomingRequestHandlers.has(commandName) &&
        OCPP16ServiceUtils.isIncomingRequestCommandSupported(chargingStation, commandName)
      ) {
        try {
          this.validatePayload(chargingStation, commandName, commandPayload)
          // Call the method to build the response
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const incomingRequestHandler = this.incomingRequestHandlers.get(commandName)!
          if (isAsyncFunction(incomingRequestHandler)) {
            response = (await incomingRequestHandler(chargingStation, commandPayload)) as ResType
          } else {
            response = incomingRequestHandler(chargingStation, commandPayload) as ResType
          }
        } catch (error) {
          // Log
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.incomingRequestHandler: Handle incoming request error:`,
            error
          )
          throw error
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle request PDU ${JSON.stringify(
            commandPayload,
            undefined,
            2
          )}`,
          commandName,
          commandPayload
        )
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          undefined,
          2
        )} while the charging station is not registered on the central server`,
        commandName,
        commandPayload
      )
    }
    // Send the built response
    await chargingStation.ocppRequestService.sendResponse(
      chargingStation,
      messageId,
      response,
      commandName
    )
    // Emit command name event to allow delayed handling
    this.emit(commandName, chargingStation, commandPayload, response)
  }

  private validatePayload (
    chargingStation: ChargingStation,
    commandName: OCPP16IncomingRequestCommand,
    commandPayload: JsonType
  ): boolean {
    if (this.payloadValidateFunctions.has(commandName)) {
      return this.validateIncomingRequestPayload(chargingStation, commandName, commandPayload)
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema validation function found for command '${commandName}' PDU validation`
    )
    return false
  }

  // Simulate charging station restart
  private handleRequestReset (
    chargingStation: ChargingStation,
    commandPayload: ResetRequest
  ): GenericResponse {
    const { type } = commandPayload
    chargingStation
      .reset(`${type}Reset` as OCPP16StopTransactionReason)
      .catch(Constants.EMPTY_FUNCTION)
    logger.info(
      `${chargingStation.logPrefix()} ${type} reset command received, simulating it. The station will be back online in ${formatDurationMilliSeconds(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chargingStation.stationInfo!.resetTime!
      )}`
    )
    return OCPP16Constants.OCPP_RESPONSE_ACCEPTED
  }

  private async handleRequestUnlockConnector (
    chargingStation: ChargingStation,
    commandPayload: UnlockConnectorRequest
  ): Promise<UnlockConnectorResponse> {
    const { connectorId } = commandPayload
    if (!chargingStation.hasConnector(connectorId)) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to unlock a non existing connector id ${connectorId}`
      )
      return OCPP16Constants.OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED
    }
    if (connectorId === 0) {
      logger.error(`${chargingStation.logPrefix()} Trying to unlock connector id ${connectorId}`)
      return OCPP16Constants.OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED
    }
    if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true) {
      const stopResponse = await chargingStation.stopTransactionOnConnector(
        connectorId,
        OCPP16StopTransactionReason.UNLOCK_COMMAND
      )
      if (stopResponse.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
        return OCPP16Constants.OCPP_RESPONSE_UNLOCKED
      }
      return OCPP16Constants.OCPP_RESPONSE_UNLOCK_FAILED
    }
    await OCPP16ServiceUtils.sendAndSetConnectorStatus(
      chargingStation,
      connectorId,
      OCPP16ChargePointStatus.Available
    )
    return OCPP16Constants.OCPP_RESPONSE_UNLOCKED
  }

  private handleRequestGetConfiguration (
    chargingStation: ChargingStation,
    commandPayload: GetConfigurationRequest
  ): GetConfigurationResponse {
    const { key } = commandPayload
    const configurationKey: OCPPConfigurationKey[] = []
    const unknownKey: string[] = []
    if (key == null) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      for (const configKey of chargingStation.ocppConfiguration!.configurationKey!) {
        if (!OCPP16ServiceUtils.isConfigurationKeyVisible(configKey)) {
          continue
        }
        configurationKey.push({
          key: configKey.key,
          readonly: configKey.readonly,
          value: configKey.value
        })
      }
    } else if (isNotEmptyArray(key)) {
      for (const k of key) {
        const keyFound = getConfigurationKey(chargingStation, k, true)
        if (keyFound != null) {
          if (!OCPP16ServiceUtils.isConfigurationKeyVisible(keyFound)) {
            continue
          }
          configurationKey.push({
            key: keyFound.key,
            readonly: keyFound.readonly,
            value: keyFound.value
          })
        } else {
          unknownKey.push(k)
        }
      }
    }
    return {
      configurationKey,
      unknownKey
    }
  }

  private handleRequestChangeConfiguration (
    chargingStation: ChargingStation,
    commandPayload: ChangeConfigurationRequest
  ): ChangeConfigurationResponse {
    const { key, value } = commandPayload
    const keyToChange = getConfigurationKey(chargingStation, key, true)
    if (keyToChange?.readonly === true) {
      return OCPP16Constants.OCPP_CONFIGURATION_RESPONSE_REJECTED
    } else if (keyToChange?.readonly === false) {
      let valueChanged = false
      if (keyToChange.value !== value) {
        setConfigurationKeyValue(chargingStation, key, value, true)
        valueChanged = true
      }
      let triggerHeartbeatRestart = false
      if (
        (keyToChange.key as OCPP16StandardParametersKey) ===
          OCPP16StandardParametersKey.HeartBeatInterval &&
        valueChanged
      ) {
        setConfigurationKeyValue(
          chargingStation,
          OCPP16StandardParametersKey.HeartbeatInterval,
          value
        )
        triggerHeartbeatRestart = true
      }
      if (
        (keyToChange.key as OCPP16StandardParametersKey) ===
          OCPP16StandardParametersKey.HeartbeatInterval &&
        valueChanged
      ) {
        setConfigurationKeyValue(
          chargingStation,
          OCPP16StandardParametersKey.HeartBeatInterval,
          value
        )
        triggerHeartbeatRestart = true
      }
      if (triggerHeartbeatRestart) {
        chargingStation.restartHeartbeat()
      }
      if (
        (keyToChange.key as OCPP16StandardParametersKey) ===
          OCPP16StandardParametersKey.WebSocketPingInterval &&
        valueChanged
      ) {
        chargingStation.restartWebSocketPing()
      }
      if (
        (keyToChange.key as OCPP16StandardParametersKey) ===
          OCPP16StandardParametersKey.MeterValueSampleInterval &&
        chargingStation.getNumberOfRunningTransactions() > 0 &&
        valueChanged
      ) {
        for (
          let connectorId = 1;
          connectorId <= chargingStation.getNumberOfConnectors();
          connectorId++
        ) {
          if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true) {
            chargingStation.restartMeterValues(
              connectorId,
              secondsToMilliseconds(convertToInt(value))
            )
          }
        }
      }
      if (keyToChange.reboot === true) {
        return OCPP16Constants.OCPP_CONFIGURATION_RESPONSE_REBOOT_REQUIRED
      }
      return OCPP16Constants.OCPP_CONFIGURATION_RESPONSE_ACCEPTED
    }
    return OCPP16Constants.OCPP_CONFIGURATION_RESPONSE_NOT_SUPPORTED
  }

  private handleRequestSetChargingProfile (
    chargingStation: ChargingStation,
    commandPayload: SetChargingProfileRequest
  ): SetChargingProfileResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE
      )
    ) {
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_NOT_SUPPORTED
    }
    const { connectorId, csChargingProfiles } = commandPayload
    if (!chargingStation.hasConnector(connectorId)) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set charging profile(s) to a non existing connector id ${connectorId}`
      )
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED
    }
    if (
      csChargingProfiles.chargingProfilePurpose ===
        OCPP16ChargingProfilePurposeType.CHARGE_POINT_MAX_PROFILE &&
      connectorId !== 0
    ) {
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED
    }
    if (
      csChargingProfiles.chargingProfilePurpose === OCPP16ChargingProfilePurposeType.TX_PROFILE &&
      connectorId === 0
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set transaction charging profile(s) on connector ${connectorId}`
      )
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED
    }
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (
      csChargingProfiles.chargingProfilePurpose === OCPP16ChargingProfilePurposeType.TX_PROFILE &&
      connectorId > 0 &&
      connectorStatus?.transactionStarted === false
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set transaction charging profile(s) on connector ${connectorId} without a started transaction`
      )
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED
    }
    if (
      csChargingProfiles.chargingProfilePurpose === OCPP16ChargingProfilePurposeType.TX_PROFILE &&
      connectorId > 0 &&
      connectorStatus?.transactionStarted === true &&
      csChargingProfiles.transactionId != null &&
      csChargingProfiles.transactionId !== connectorStatus.transactionId
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set transaction charging profile(s) on connector ${connectorId} with a different transaction id ${
          csChargingProfiles.transactionId
        } than the started transaction id ${connectorStatus.transactionId}`
      )
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED
    }
    OCPP16ServiceUtils.setChargingProfile(chargingStation, connectorId, csChargingProfiles)
    logger.debug(
      `${chargingStation.logPrefix()} Charging profile(s) set on connector id ${connectorId}: %j`,
      csChargingProfiles
    )
    return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_ACCEPTED
  }

  private handleRequestGetCompositeSchedule (
    chargingStation: ChargingStation,
    commandPayload: OCPP16GetCompositeScheduleRequest
  ): OCPP16GetCompositeScheduleResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16IncomingRequestCommand.GET_COMPOSITE_SCHEDULE
      )
    ) {
      return OCPP16Constants.OCPP_RESPONSE_REJECTED
    }
    const { connectorId, duration, chargingRateUnit } = commandPayload
    if (!chargingStation.hasConnector(connectorId)) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to get composite schedule to a non existing connector id ${connectorId}`
      )
      return OCPP16Constants.OCPP_RESPONSE_REJECTED
    }
    if (connectorId === 0) {
      logger.error(
        `${chargingStation.logPrefix()} Get composite schedule on connector id ${connectorId} is not yet supported`
      )
      return OCPP16Constants.OCPP_RESPONSE_REJECTED
    }
    if (chargingRateUnit != null) {
      logger.warn(
        `${chargingStation.logPrefix()} Get composite schedule with a specified rate unit is not yet supported, no conversion will be done`
      )
    }
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (
      isEmpty(connectorStatus?.chargingProfiles) &&
      isEmpty(chargingStation.getConnectorStatus(0)?.chargingProfiles)
    ) {
      return OCPP16Constants.OCPP_RESPONSE_REJECTED
    }
    const currentDate = new Date()
    const compositeScheduleInterval: Interval = {
      start: currentDate,
      end: addSeconds(currentDate, duration)
    }
    const chargingProfiles: OCPP16ChargingProfile[] = getConnectorChargingProfiles(
      chargingStation,
      connectorId
    )
    let previousCompositeSchedule: OCPP16ChargingSchedule | undefined
    let compositeSchedule: OCPP16ChargingSchedule | undefined
    for (const chargingProfile of chargingProfiles) {
      if (chargingProfile.chargingSchedule.startSchedule == null) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetCompositeSchedule: Charging profile id ${
            chargingProfile.chargingProfileId
          } has no startSchedule defined. Trying to set it to the connector current transaction start date`
        )
        // OCPP specifies that if startSchedule is not defined, it should be relative to start of the connector transaction
        chargingProfile.chargingSchedule.startSchedule = connectorStatus?.transactionStart
      }
      if (!isDate(chargingProfile.chargingSchedule.startSchedule)) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetCompositeSchedule: Charging profile id ${
            chargingProfile.chargingProfileId
          } startSchedule property is not a Date instance. Trying to convert it to a Date instance`
        )
        chargingProfile.chargingSchedule.startSchedule = convertToDate(
          chargingProfile.chargingSchedule.startSchedule
        )
      }
      if (chargingProfile.chargingSchedule.duration == null) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetCompositeSchedule: Charging profile id ${
            chargingProfile.chargingProfileId
          } has no duration defined and will be set to the maximum time allowed`
        )
        // OCPP specifies that if duration is not defined, it should be infinite
        chargingProfile.chargingSchedule.duration = differenceInSeconds(
          maxTime,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          chargingProfile.chargingSchedule.startSchedule!
        )
      }
      if (
        !prepareChargingProfileKind(
          connectorStatus,
          chargingProfile,
          compositeScheduleInterval.start,
          chargingStation.logPrefix()
        )
      ) {
        continue
      }
      if (
        !canProceedChargingProfile(
          chargingProfile,
          compositeScheduleInterval.start,
          chargingStation.logPrefix()
        )
      ) {
        continue
      }
      compositeSchedule = OCPP16ServiceUtils.composeChargingSchedules(
        previousCompositeSchedule,
        chargingProfile.chargingSchedule,
        compositeScheduleInterval
      )
      previousCompositeSchedule = compositeSchedule
    }
    if (compositeSchedule != null) {
      return {
        status: GenericStatus.Accepted,
        scheduleStart: compositeSchedule.startSchedule,
        connectorId,
        chargingSchedule: compositeSchedule
      }
    }
    return OCPP16Constants.OCPP_RESPONSE_REJECTED
  }

  private handleRequestClearChargingProfile (
    chargingStation: ChargingStation,
    commandPayload: OCPP16ClearChargingProfileRequest
  ): OCPP16ClearChargingProfileResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE
      )
    ) {
      return OCPP16Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN
    }
    const { connectorId } = commandPayload
    if (connectorId != null) {
      if (!chargingStation.hasConnector(connectorId)) {
        logger.error(
          `${chargingStation.logPrefix()} Trying to clear a charging profile(s) to a non existing connector id ${connectorId}`
        )
        return OCPP16Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN
      }
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      if (isNotEmptyArray(connectorStatus?.chargingProfiles)) {
        connectorStatus.chargingProfiles = []
        logger.debug(
          `${chargingStation.logPrefix()} Charging profile(s) cleared on connector id ${connectorId}`
        )
        return OCPP16Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED
      }
    } else {
      let clearedCP = false
      if (chargingStation.hasEvses) {
        for (const evseStatus of chargingStation.evses.values()) {
          for (const status of evseStatus.connectors.values()) {
            const clearedConnectorCP = OCPP16ServiceUtils.clearChargingProfiles(
              chargingStation,
              commandPayload,
              status.chargingProfiles
            )
            if (clearedConnectorCP && !clearedCP) {
              clearedCP = true
            }
          }
        }
      } else {
        for (const id of chargingStation.connectors.keys()) {
          const clearedConnectorCP = OCPP16ServiceUtils.clearChargingProfiles(
            chargingStation,
            commandPayload,
            chargingStation.getConnectorStatus(id)?.chargingProfiles
          )
          if (clearedConnectorCP && !clearedCP) {
            clearedCP = true
          }
        }
      }
      if (clearedCP) {
        return OCPP16Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED
      }
    }
    return OCPP16Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN
  }

  private async handleRequestChangeAvailability (
    chargingStation: ChargingStation,
    commandPayload: OCPP16ChangeAvailabilityRequest
  ): Promise<OCPP16ChangeAvailabilityResponse> {
    const { connectorId, type } = commandPayload
    if (!chargingStation.hasConnector(connectorId)) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to change the availability of a non existing connector id ${connectorId}`
      )
      return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_REJECTED
    }
    const chargePointStatus: OCPP16ChargePointStatus =
      type === OCPP16AvailabilityType.Operative
        ? OCPP16ChargePointStatus.Available
        : OCPP16ChargePointStatus.Unavailable
    if (connectorId === 0) {
      let response: OCPP16ChangeAvailabilityResponse | undefined
      if (chargingStation.hasEvses) {
        for (const evseStatus of chargingStation.evses.values()) {
          response = await OCPP16ServiceUtils.changeAvailability(
            chargingStation,
            [...evseStatus.connectors.keys()],
            chargePointStatus,
            type
          )
        }
      } else {
        response = await OCPP16ServiceUtils.changeAvailability(
          chargingStation,
          [...chargingStation.connectors.keys()],
          chargePointStatus,
          type
        )
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return response!
    } else if (
      connectorId > 0 &&
      (chargingStation.isChargingStationAvailable() ||
        (!chargingStation.isChargingStationAvailable() &&
          type === OCPP16AvailabilityType.Inoperative))
    ) {
      if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chargingStation.getConnectorStatus(connectorId)!.availability = type
        return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chargingStation.getConnectorStatus(connectorId)!.availability = type
      await OCPP16ServiceUtils.sendAndSetConnectorStatus(
        chargingStation,
        connectorId,
        chargePointStatus
      )
      return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED
    }
    return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_REJECTED
  }

  private async handleRequestRemoteStartTransaction (
    chargingStation: ChargingStation,
    commandPayload: RemoteStartTransactionRequest
  ): Promise<GenericResponse> {
    if (commandPayload.connectorId == null) {
      for (
        let connectorId = 1;
        connectorId <= chargingStation.getNumberOfConnectors();
        connectorId++
      ) {
        if (
          chargingStation.getConnectorStatus(connectorId)?.transactionStarted === false &&
          !OCPP16ServiceUtils.hasReservation(chargingStation, connectorId, commandPayload.idTag)
        ) {
          commandPayload.connectorId = connectorId
          break
        }
      }
      if (commandPayload.connectorId == null) {
        logger.debug(
          `${chargingStation.logPrefix()} Remote start transaction REJECTED on ${
            chargingStation.stationInfo?.chargingStationId
          }, idTag '${commandPayload.idTag}': no available connector found`
        )
        return OCPP16Constants.OCPP_RESPONSE_REJECTED
      }
    }
    const { connectorId: transactionConnectorId, idTag, chargingProfile } = commandPayload
    if (!chargingStation.hasConnector(transactionConnectorId)) {
      return this.notifyRemoteStartTransactionRejected(
        chargingStation,
        transactionConnectorId,
        idTag
      )
    }
    if (
      !chargingStation.isChargingStationAvailable() ||
      !chargingStation.isConnectorAvailable(transactionConnectorId)
    ) {
      return this.notifyRemoteStartTransactionRejected(
        chargingStation,
        transactionConnectorId,
        idTag
      )
    }
    // idTag authorization check required
    if (
      chargingStation.getAuthorizeRemoteTxRequests() &&
      !(await OCPP16ServiceUtils.isIdTagAuthorized(chargingStation, transactionConnectorId, idTag))
    ) {
      return this.notifyRemoteStartTransactionRejected(
        chargingStation,
        transactionConnectorId,
        idTag
      )
    }
    if (
      chargingProfile != null &&
      !this.setRemoteStartTransactionChargingProfile(
        chargingStation,
        transactionConnectorId,
        chargingProfile
      )
    ) {
      return this.notifyRemoteStartTransactionRejected(
        chargingStation,
        transactionConnectorId,
        idTag
      )
    }
    logger.debug(
      `${chargingStation.logPrefix()} Remote start transaction ACCEPTED on ${
        chargingStation.stationInfo?.chargingStationId
      }#${transactionConnectorId}}, idTag '${idTag}'`
    )
    return OCPP16Constants.OCPP_RESPONSE_ACCEPTED
  }

  private notifyRemoteStartTransactionRejected (
    chargingStation: ChargingStation,
    connectorId: number,
    idTag: string
  ): GenericResponse {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    logger.debug(
      `${chargingStation.logPrefix()} Remote start transaction REJECTED on ${
        chargingStation.stationInfo?.chargingStationId
      }#${connectorId}, idTag '${idTag}', availability '${
        connectorStatus?.availability
      }', status '${connectorStatus?.status}'`
    )
    return OCPP16Constants.OCPP_RESPONSE_REJECTED
  }

  private setRemoteStartTransactionChargingProfile (
    chargingStation: ChargingStation,
    connectorId: number,
    chargingProfile: OCPP16ChargingProfile
  ): boolean {
    if (
      chargingProfile.chargingProfilePurpose === OCPP16ChargingProfilePurposeType.TX_PROFILE &&
      chargingProfile.transactionId == null
    ) {
      OCPP16ServiceUtils.setChargingProfile(chargingStation, connectorId, chargingProfile)
      logger.debug(
        `${chargingStation.logPrefix()} Charging profile(s) set at remote start transaction on ${
          chargingStation.stationInfo?.chargingStationId
        }#${connectorId}`,
        chargingProfile
      )
      return true
    }
    logger.debug(
      `${chargingStation.logPrefix()} Not allowed to set ${
        chargingProfile.chargingProfilePurpose
      } charging profile(s)${chargingProfile.transactionId != null ? ' with transactionId set' : ''} at remote start transaction`
    )
    return false
  }

  private handleRequestRemoteStopTransaction (
    chargingStation: ChargingStation,
    commandPayload: RemoteStopTransactionRequest
  ): GenericResponse {
    const { transactionId } = commandPayload
    if (chargingStation.getConnectorIdByTransactionId(transactionId) != null) {
      logger.debug(
        `${chargingStation.logPrefix()} Remote stop transaction ACCEPTED for transactionId '${transactionId}'`
      )
      return OCPP16Constants.OCPP_RESPONSE_ACCEPTED
    }
    logger.debug(
      `${chargingStation.logPrefix()} Remote stop transaction REJECTED for transactionId '${transactionId}'`
    )
    return OCPP16Constants.OCPP_RESPONSE_REJECTED
  }

  private handleRequestUpdateFirmware (
    chargingStation: ChargingStation,
    commandPayload: OCPP16UpdateFirmwareRequest
  ): OCPP16UpdateFirmwareResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.FirmwareManagement,
        OCPP16IncomingRequestCommand.UPDATE_FIRMWARE
      )
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUpdateFirmware: Cannot simulate firmware update: feature profile not supported`
      )
      return OCPP16Constants.OCPP_RESPONSE_EMPTY
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    commandPayload.retrieveDate = convertToDate(commandPayload.retrieveDate)!
    const { retrieveDate } = commandPayload
    if (
      chargingStation.stationInfo?.firmwareStatus != null &&
      chargingStation.stationInfo.firmwareStatus !== OCPP16FirmwareStatus.Installed
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUpdateFirmware: Cannot simulate firmware update: firmware update is already in progress`
      )
      return OCPP16Constants.OCPP_RESPONSE_EMPTY
    }
    const now = Date.now()
    if (retrieveDate.getTime() <= now) {
      this.updateFirmwareSimulation(chargingStation).catch(Constants.EMPTY_FUNCTION)
    } else {
      setTimeout(() => {
        this.updateFirmwareSimulation(chargingStation).catch(Constants.EMPTY_FUNCTION)
      }, retrieveDate.getTime() - now)
    }
    return OCPP16Constants.OCPP_RESPONSE_EMPTY
  }

  private async updateFirmwareSimulation (
    chargingStation: ChargingStation,
    maxDelay = 30,
    minDelay = 15
  ): Promise<void> {
    if (!checkChargingStation(chargingStation, chargingStation.logPrefix())) {
      return
    }
    if (chargingStation.hasEvses) {
      for (const [evseId, evseStatus] of chargingStation.evses) {
        if (evseId > 0) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            if (connectorStatus.transactionStarted === false) {
              await OCPP16ServiceUtils.sendAndSetConnectorStatus(
                chargingStation,
                connectorId,
                OCPP16ChargePointStatus.Unavailable
              )
            }
          }
        }
      }
    } else {
      for (const connectorId of chargingStation.connectors.keys()) {
        if (
          connectorId > 0 &&
          chargingStation.getConnectorStatus(connectorId)?.transactionStarted === false
        ) {
          await OCPP16ServiceUtils.sendAndSetConnectorStatus(
            chargingStation,
            connectorId,
            OCPP16ChargePointStatus.Unavailable
          )
        }
      }
    }
    await chargingStation.ocppRequestService.requestHandler<
    OCPP16FirmwareStatusNotificationRequest,
    OCPP16FirmwareStatusNotificationResponse
    >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      status: OCPP16FirmwareStatus.Downloading
    })
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    chargingStation.stationInfo!.firmwareStatus = OCPP16FirmwareStatus.Downloading
    if (
      chargingStation.stationInfo?.firmwareUpgrade?.failureStatus ===
      OCPP16FirmwareStatus.DownloadFailed
    ) {
      await sleep(secondsToMilliseconds(randomInt(minDelay, maxDelay)))
      await chargingStation.ocppRequestService.requestHandler<
      OCPP16FirmwareStatusNotificationRequest,
      OCPP16FirmwareStatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
        status: chargingStation.stationInfo.firmwareUpgrade.failureStatus
      })
      chargingStation.stationInfo.firmwareStatus =
        chargingStation.stationInfo.firmwareUpgrade.failureStatus
      return
    }
    await sleep(secondsToMilliseconds(randomInt(minDelay, maxDelay)))
    await chargingStation.ocppRequestService.requestHandler<
    OCPP16FirmwareStatusNotificationRequest,
    OCPP16FirmwareStatusNotificationResponse
    >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      status: OCPP16FirmwareStatus.Downloaded
    })
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    chargingStation.stationInfo!.firmwareStatus = OCPP16FirmwareStatus.Downloaded
    let wasTransactionsStarted = false
    let transactionsStarted: boolean
    do {
      const runningTransactions = chargingStation.getNumberOfRunningTransactions()
      if (runningTransactions > 0) {
        const waitTime = secondsToMilliseconds(15)
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.updateFirmwareSimulation: ${runningTransactions} transaction(s) in progress, waiting ${formatDurationMilliSeconds(
            waitTime
          )} before continuing firmware update simulation`
        )
        await sleep(waitTime)
        transactionsStarted = true
        wasTransactionsStarted = true
      } else {
        if (chargingStation.hasEvses) {
          for (const [evseId, evseStatus] of chargingStation.evses) {
            if (evseId > 0) {
              for (const [connectorId, connectorStatus] of evseStatus.connectors) {
                if (connectorStatus.status !== OCPP16ChargePointStatus.Unavailable) {
                  await OCPP16ServiceUtils.sendAndSetConnectorStatus(
                    chargingStation,
                    connectorId,
                    OCPP16ChargePointStatus.Unavailable
                  )
                }
              }
            }
          }
        } else {
          for (const connectorId of chargingStation.connectors.keys()) {
            if (
              connectorId > 0 &&
              chargingStation.getConnectorStatus(connectorId)?.status !==
                OCPP16ChargePointStatus.Unavailable
            ) {
              await OCPP16ServiceUtils.sendAndSetConnectorStatus(
                chargingStation,
                connectorId,
                OCPP16ChargePointStatus.Unavailable
              )
            }
          }
        }
        transactionsStarted = false
      }
    } while (transactionsStarted)
    !wasTransactionsStarted && (await sleep(secondsToMilliseconds(randomInt(minDelay, maxDelay))))
    if (!checkChargingStation(chargingStation, chargingStation.logPrefix())) {
      return
    }
    await chargingStation.ocppRequestService.requestHandler<
    OCPP16FirmwareStatusNotificationRequest,
    OCPP16FirmwareStatusNotificationResponse
    >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      status: OCPP16FirmwareStatus.Installing
    })
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    chargingStation.stationInfo!.firmwareStatus = OCPP16FirmwareStatus.Installing
    if (
      chargingStation.stationInfo?.firmwareUpgrade?.failureStatus ===
      OCPP16FirmwareStatus.InstallationFailed
    ) {
      await sleep(secondsToMilliseconds(randomInt(minDelay, maxDelay)))
      await chargingStation.ocppRequestService.requestHandler<
      OCPP16FirmwareStatusNotificationRequest,
      OCPP16FirmwareStatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
        status: chargingStation.stationInfo.firmwareUpgrade.failureStatus
      })
      chargingStation.stationInfo.firmwareStatus =
        chargingStation.stationInfo.firmwareUpgrade.failureStatus
      return
    }
    if (chargingStation.stationInfo?.firmwareUpgrade?.reset === true) {
      await sleep(secondsToMilliseconds(randomInt(minDelay, maxDelay)))
      await chargingStation.reset(OCPP16StopTransactionReason.REBOOT)
    }
  }

  private async handleRequestGetDiagnostics (
    chargingStation: ChargingStation,
    commandPayload: GetDiagnosticsRequest
  ): Promise<GetDiagnosticsResponse> {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.FirmwareManagement,
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
      )
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetDiagnostics: Cannot get diagnostics: feature profile not supported`
      )
      return OCPP16Constants.OCPP_RESPONSE_EMPTY
    }
    const { location } = commandPayload
    const uri = new URL(location)
    if (uri.protocol.startsWith('ftp:')) {
      let ftpClient: Client | undefined
      try {
        const logConfiguration = Configuration.getConfigurationSection<LogConfiguration>(
          ConfigurationSection.log
        )
        const logFiles = readdirSync(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          resolve((fileURLToPath(import.meta.url), '../', dirname(logConfiguration.file!)))
        )
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          .filter(file => file.endsWith(extname(logConfiguration.file!)))
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          .map(file => join(dirname(logConfiguration.file!), file))
        const diagnosticsArchive = `${chargingStation.stationInfo?.chargingStationId}_logs.tar.gz`
        create({ gzip: true }, logFiles).pipe(createWriteStream(diagnosticsArchive))
        ftpClient = new Client()
        const accessResponse = await ftpClient.access({
          host: uri.hostname,
          ...(isNotEmptyString(uri.port) && { port: convertToInt(uri.port) }),
          ...(isNotEmptyString(uri.username) && { user: uri.username }),
          ...(isNotEmptyString(uri.password) && { password: uri.password })
        })
        let uploadResponse: FTPResponse | undefined
        if (accessResponse.code === 220) {
          ftpClient.trackProgress(info => {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetDiagnostics: ${
                info.bytes / 1024
              } bytes transferred from diagnostics archive ${info.name}`
            )
            chargingStation.ocppRequestService
              .requestHandler<
            OCPP16DiagnosticsStatusNotificationRequest,
            OCPP16DiagnosticsStatusNotificationResponse
            >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
              status: OCPP16DiagnosticsStatus.Uploading
            })
              .catch((error: unknown) => {
                logger.error(
                  `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetDiagnostics: Error while sending '${
                    OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION
                  }'`,
                  error
                )
              })
          })
          uploadResponse = await ftpClient.uploadFrom(
            join(resolve(dirname(fileURLToPath(import.meta.url)), '../'), diagnosticsArchive),
            `${uri.pathname}${diagnosticsArchive}`
          )
          if (uploadResponse.code === 226) {
            await chargingStation.ocppRequestService.requestHandler<
            OCPP16DiagnosticsStatusNotificationRequest,
            OCPP16DiagnosticsStatusNotificationResponse
            >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
              status: OCPP16DiagnosticsStatus.Uploaded
            })
            ftpClient.close()
            return { fileName: diagnosticsArchive }
          }
          throw new OCPPError(
            ErrorType.GENERIC_ERROR,
            `Diagnostics transfer failed with error code ${accessResponse.code}|${uploadResponse.code}`,
            OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
          )
        }
        throw new OCPPError(
          ErrorType.GENERIC_ERROR,
          `Diagnostics transfer failed with error code ${accessResponse.code}|${uploadResponse?.code}`,
          OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
        )
      } catch (error) {
        await chargingStation.ocppRequestService.requestHandler<
        OCPP16DiagnosticsStatusNotificationRequest,
        OCPP16DiagnosticsStatusNotificationResponse
        >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
          status: OCPP16DiagnosticsStatus.UploadFailed
        })
        ftpClient?.close()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return handleIncomingRequestError<GetDiagnosticsResponse>(
          chargingStation,
          OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
          error as Error,
          { errorResponse: OCPP16Constants.OCPP_RESPONSE_EMPTY }
        )!
      }
    } else {
      logger.error(
        `${chargingStation.logPrefix()} Unsupported protocol ${
          uri.protocol
        } to transfer the diagnostic logs archive`
      )
      await chargingStation.ocppRequestService.requestHandler<
      OCPP16DiagnosticsStatusNotificationRequest,
      OCPP16DiagnosticsStatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
        status: OCPP16DiagnosticsStatus.UploadFailed
      })
      return OCPP16Constants.OCPP_RESPONSE_EMPTY
    }
  }

  private handleRequestTriggerMessage (
    chargingStation: ChargingStation,
    commandPayload: OCPP16TriggerMessageRequest
  ): OCPP16TriggerMessageResponse {
    const { requestedMessage, connectorId } = commandPayload
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.RemoteTrigger,
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE
      ) ||
      !OCPP16ServiceUtils.isMessageTriggerSupported(chargingStation, requestedMessage)
    ) {
      return OCPP16Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED
    }
    if (
      !OCPP16ServiceUtils.isConnectorIdValid(
        chargingStation,
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        connectorId!
      )
    ) {
      return OCPP16Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_REJECTED
    }
    switch (requestedMessage) {
      case OCPP16MessageTrigger.BootNotification:
      case OCPP16MessageTrigger.Heartbeat:
      case OCPP16MessageTrigger.StatusNotification:
        return OCPP16Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED
      default:
        return OCPP16Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED
    }
  }

  private handleRequestDataTransfer (
    chargingStation: ChargingStation,
    commandPayload: OCPP16DataTransferRequest
  ): OCPP16DataTransferResponse {
    const { vendorId } = commandPayload
    try {
      if (Object.values(OCPP16DataTransferVendorId).includes(vendorId)) {
        return OCPP16Constants.OCPP_DATA_TRANSFER_RESPONSE_ACCEPTED
      }
      return OCPP16Constants.OCPP_DATA_TRANSFER_RESPONSE_UNKNOWN_VENDOR_ID
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return handleIncomingRequestError<OCPP16DataTransferResponse>(
        chargingStation,
        OCPP16IncomingRequestCommand.DATA_TRANSFER,
        error as Error,
        { errorResponse: OCPP16Constants.OCPP_DATA_TRANSFER_RESPONSE_REJECTED }
      )!
    }
  }

  private async handleRequestReserveNow (
    chargingStation: ChargingStation,
    commandPayload: OCPP16ReserveNowRequest
  ): Promise<OCPP16ReserveNowResponse> {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.Reservation,
        OCPP16IncomingRequestCommand.RESERVE_NOW
      )
    ) {
      return OCPP16Constants.OCPP_RESERVATION_RESPONSE_REJECTED
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    commandPayload.expiryDate = convertToDate(commandPayload.expiryDate)!
    const { reservationId, idTag, connectorId } = commandPayload
    if (!chargingStation.hasConnector(connectorId)) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to reserve a non existing connector id ${connectorId}`
      )
      return OCPP16Constants.OCPP_RESERVATION_RESPONSE_REJECTED
    }
    if (connectorId > 0 && !chargingStation.isConnectorAvailable(connectorId)) {
      return OCPP16Constants.OCPP_RESERVATION_RESPONSE_REJECTED
    }
    if (connectorId === 0 && !chargingStation.getReserveConnectorZeroSupported()) {
      return OCPP16Constants.OCPP_RESERVATION_RESPONSE_REJECTED
    }
    if (!(await OCPP16ServiceUtils.isIdTagAuthorized(chargingStation, connectorId, idTag))) {
      return OCPP16Constants.OCPP_RESERVATION_RESPONSE_REJECTED
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)!
    resetAuthorizeConnectorStatus(connectorStatus)
    let response: OCPP16ReserveNowResponse
    try {
      await removeExpiredReservations(chargingStation)
      switch (connectorStatus.status) {
        case OCPP16ChargePointStatus.Faulted:
          response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_FAULTED
          break
        case OCPP16ChargePointStatus.Preparing:
        case OCPP16ChargePointStatus.Charging:
        case OCPP16ChargePointStatus.SuspendedEV:
        case OCPP16ChargePointStatus.SuspendedEVSE:
        case OCPP16ChargePointStatus.Finishing:
          response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_OCCUPIED
          break
        case OCPP16ChargePointStatus.Unavailable:
          response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_UNAVAILABLE
          break
        case OCPP16ChargePointStatus.Reserved:
          if (!chargingStation.isConnectorReservable(reservationId, idTag, connectorId)) {
            response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_OCCUPIED
            break
          }
        // eslint-disable-next-line no-fallthrough
        default:
          if (!chargingStation.isConnectorReservable(reservationId, idTag)) {
            response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_OCCUPIED
            break
          }
          await chargingStation.addReservation({
            id: commandPayload.reservationId,
            ...commandPayload
          })
          response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_ACCEPTED
          break
      }
      return response
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chargingStation.getConnectorStatus(connectorId)!.status = OCPP16ChargePointStatus.Available
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return handleIncomingRequestError<OCPP16ReserveNowResponse>(
        chargingStation,
        OCPP16IncomingRequestCommand.RESERVE_NOW,
        error as Error,
        { errorResponse: OCPP16Constants.OCPP_RESERVATION_RESPONSE_FAULTED }
      )!
    }
  }

  private async handleRequestCancelReservation (
    chargingStation: ChargingStation,
    commandPayload: OCPP16CancelReservationRequest
  ): Promise<GenericResponse> {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.Reservation,
        OCPP16IncomingRequestCommand.CANCEL_RESERVATION
      )
    ) {
      return OCPP16Constants.OCPP_CANCEL_RESERVATION_RESPONSE_REJECTED
    }
    try {
      const { reservationId } = commandPayload
      const reservation = chargingStation.getReservationBy('reservationId', reservationId)
      if (reservation == null) {
        logger.debug(
          `${chargingStation.logPrefix()} Reservation with id ${reservationId} does not exist on charging station`
        )
        return OCPP16Constants.OCPP_CANCEL_RESERVATION_RESPONSE_REJECTED
      }
      await chargingStation.removeReservation(
        reservation,
        ReservationTerminationReason.RESERVATION_CANCELED
      )
      return OCPP16Constants.OCPP_CANCEL_RESERVATION_RESPONSE_ACCEPTED
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return handleIncomingRequestError<GenericResponse>(
        chargingStation,
        OCPP16IncomingRequestCommand.CANCEL_RESERVATION,
        error as Error,
        {
          errorResponse: OCPP16Constants.OCPP_CANCEL_RESERVATION_RESPONSE_REJECTED
        }
      )!
    }
  }
}
