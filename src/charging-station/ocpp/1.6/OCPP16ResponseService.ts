// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import type { ValidateFunction } from 'ajv'
import { secondsToMilliseconds } from 'date-fns'

import {
  addConfigurationKey,
  type ChargingStation,
  getConfigurationKey,
  hasReservationExpired,
  resetConnectorStatus
} from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  type ChangeConfigurationResponse,
  ErrorType,
  type GenericResponse,
  type GetConfigurationResponse,
  type GetDiagnosticsResponse,
  type JsonType,
  OCPP16AuthorizationStatus,
  type OCPP16AuthorizeRequest,
  type OCPP16AuthorizeResponse,
  type OCPP16BootNotificationResponse,
  type OCPP16ChangeAvailabilityResponse,
  OCPP16ChargePointStatus,
  type OCPP16ClearChargingProfileResponse,
  type OCPP16DataTransferResponse,
  type OCPP16DiagnosticsStatusNotificationResponse,
  type OCPP16FirmwareStatusNotificationResponse,
  type OCPP16GetCompositeScheduleResponse,
  type OCPP16HeartbeatResponse,
  OCPP16IncomingRequestCommand,
  type OCPP16MeterValuesRequest,
  type OCPP16MeterValuesResponse,
  OCPP16RequestCommand,
  type OCPP16ReserveNowResponse,
  OCPP16StandardParametersKey,
  type OCPP16StartTransactionRequest,
  type OCPP16StartTransactionResponse,
  type OCPP16StatusNotificationResponse,
  type OCPP16StopTransactionRequest,
  type OCPP16StopTransactionResponse,
  type OCPP16TriggerMessageResponse,
  type OCPP16UpdateFirmwareResponse,
  OCPPVersion,
  RegistrationStatusEnumType,
  ReservationTerminationReason,
  type ResponseHandler,
  type SetChargingProfileResponse,
  type UnlockConnectorResponse
} from '../../../types/index.js'
import { Constants, convertToInt, isAsyncFunction, logger } from '../../../utils/index.js'
import { OCPPResponseService } from '../OCPPResponseService.js'
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils.js'

const moduleName = 'OCPP16ResponseService'

export class OCPP16ResponseService extends OCPPResponseService {
  public incomingRequestResponsePayloadValidateFunctions: Map<
  OCPP16IncomingRequestCommand,
  ValidateFunction<JsonType>
  >

  protected payloadValidateFunctions: Map<OCPP16RequestCommand, ValidateFunction<JsonType>>
  private readonly responseHandlers: Map<OCPP16RequestCommand, ResponseHandler>

  public constructor () {
    // if (new.target.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target.name} instances directly`)
    // }
    super(OCPPVersion.VERSION_16)
    this.responseHandlers = new Map<OCPP16RequestCommand, ResponseHandler>([
      [
        OCPP16RequestCommand.BOOT_NOTIFICATION,
        this.handleResponseBootNotification.bind(this) as ResponseHandler
      ],
      [OCPP16RequestCommand.HEARTBEAT, this.emptyResponseHandler],
      [OCPP16RequestCommand.AUTHORIZE, this.handleResponseAuthorize.bind(this) as ResponseHandler],
      [
        OCPP16RequestCommand.START_TRANSACTION,
        this.handleResponseStartTransaction.bind(this) as ResponseHandler
      ],
      [
        OCPP16RequestCommand.STOP_TRANSACTION,
        this.handleResponseStopTransaction.bind(this) as ResponseHandler
      ],
      [
        OCPP16RequestCommand.STATUS_NOTIFICATION,
        this.emptyResponseHandler.bind(this) as ResponseHandler
      ],
      [OCPP16RequestCommand.METER_VALUES, this.emptyResponseHandler],
      [
        OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        this.emptyResponseHandler.bind(this) as ResponseHandler
      ],
      [OCPP16RequestCommand.DATA_TRANSFER, this.emptyResponseHandler],
      [OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, this.emptyResponseHandler]
    ])
    this.payloadValidateFunctions = new Map<OCPP16RequestCommand, ValidateFunction<JsonType>>([
      [
        OCPP16RequestCommand.BOOT_NOTIFICATION,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16BootNotificationResponse>(
              'assets/json-schemas/ocpp/1.6/BootNotificationResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16RequestCommand.HEARTBEAT,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16HeartbeatResponse>(
              'assets/json-schemas/ocpp/1.6/HeartbeatResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16RequestCommand.AUTHORIZE,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16AuthorizeResponse>(
              'assets/json-schemas/ocpp/1.6/AuthorizeResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16RequestCommand.START_TRANSACTION,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StartTransactionResponse>(
              'assets/json-schemas/ocpp/1.6/StartTransactionResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16RequestCommand.STOP_TRANSACTION,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StopTransactionResponse>(
              'assets/json-schemas/ocpp/1.6/StopTransactionResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16RequestCommand.STATUS_NOTIFICATION,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StatusNotificationResponse>(
              'assets/json-schemas/ocpp/1.6/StatusNotificationResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16RequestCommand.METER_VALUES,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16MeterValuesResponse>(
              'assets/json-schemas/ocpp/1.6/MeterValuesResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DiagnosticsStatusNotificationResponse>(
              'assets/json-schemas/ocpp/1.6/DiagnosticsStatusNotificationResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16RequestCommand.DATA_TRANSFER,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DataTransferResponse>(
              'assets/json-schemas/ocpp/1.6/DataTransferResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
        this.ajv
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16FirmwareStatusNotificationResponse>(
              'assets/json-schemas/ocpp/1.6/FirmwareStatusNotificationResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ]
    ])
    this.incomingRequestResponsePayloadValidateFunctions = new Map<
    OCPP16IncomingRequestCommand,
    ValidateFunction<JsonType>
    >([
      [
        OCPP16IncomingRequestCommand.RESET,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<GenericResponse>(
              'assets/json-schemas/ocpp/1.6/ResetResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CACHE,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<GenericResponse>(
              'assets/json-schemas/ocpp/1.6/ClearCacheResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16ChangeAvailabilityResponse>(
              'assets/json-schemas/ocpp/1.6/ChangeAvailabilityResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<UnlockConnectorResponse>(
              'assets/json-schemas/ocpp/1.6/UnlockConnectorResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.GET_CONFIGURATION,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<GetConfigurationResponse>(
              'assets/json-schemas/ocpp/1.6/GetConfigurationResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<ChangeConfigurationResponse>(
              'assets/json-schemas/ocpp/1.6/ChangeConfigurationResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.GET_COMPOSITE_SCHEDULE,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16GetCompositeScheduleResponse>(
              'assets/json-schemas/ocpp/1.6/GetCompositeScheduleResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<SetChargingProfileResponse>(
              'assets/json-schemas/ocpp/1.6/SetChargingProfileResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16ClearChargingProfileResponse>(
              'assets/json-schemas/ocpp/1.6/ClearChargingProfileResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<GenericResponse>(
              'assets/json-schemas/ocpp/1.6/RemoteStartTransactionResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<GenericResponse>(
              'assets/json-schemas/ocpp/1.6/RemoteStopTransactionResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<GetDiagnosticsResponse>(
              'assets/json-schemas/ocpp/1.6/GetDiagnosticsResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16TriggerMessageResponse>(
              'assets/json-schemas/ocpp/1.6/TriggerMessageResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.DATA_TRANSFER,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DataTransferResponse>(
              'assets/json-schemas/ocpp/1.6/DataTransferResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16UpdateFirmwareResponse>(
              'assets/json-schemas/ocpp/1.6/UpdateFirmwareResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.RESERVE_NOW,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16ReserveNowResponse>(
              'assets/json-schemas/ocpp/1.6/ReserveNowResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP16IncomingRequestCommand.CANCEL_RESERVATION,
        this.ajvIncomingRequest
          .compile(
            OCPP16ServiceUtils.parseJsonSchemaFile<GenericResponse>(
              'assets/json-schemas/ocpp/1.6/CancelReservationResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ]
    ])
    this.validatePayload = this.validatePayload.bind(this)
  }

  public async responseHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    payload: ResType,
    requestPayload: ReqType
  ): Promise<void> {
    if (chargingStation.isRegistered() || commandName === OCPP16RequestCommand.BOOT_NOTIFICATION) {
      if (
        this.responseHandlers.has(commandName) &&
        OCPP16ServiceUtils.isRequestCommandSupported(chargingStation, commandName)
      ) {
        try {
          this.validatePayload(chargingStation, commandName, payload)
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const responseHandler = this.responseHandlers.get(commandName)!
          if (isAsyncFunction(responseHandler)) {
            await responseHandler(chargingStation, payload, requestPayload)
          } else {
            (
              responseHandler as (
                chargingStation: ChargingStation,
                payload: JsonType,
                requestPayload?: JsonType
              ) => void
            )(chargingStation, payload, requestPayload)
          }
        } catch (error) {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.responseHandler: Handle response error:`,
            error
          )
          throw error
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `'${commandName}' is not implemented to handle response PDU ${JSON.stringify(
            payload,
            undefined,
            2
          )}`,
          commandName,
          payload
        )
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle response PDU ${JSON.stringify(
          payload,
          undefined,
          2
        )} while the charging station is not registered on the central server`,
        commandName,
        payload
      )
    }
  }

  private validatePayload (
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    payload: JsonType
  ): boolean {
    if (this.payloadValidateFunctions.has(commandName)) {
      return this.validateResponsePayload(chargingStation, commandName, payload)
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema validation function found for command '${commandName}' PDU validation`
    )
    return false
  }

  private handleResponseBootNotification (
    chargingStation: ChargingStation,
    payload: OCPP16BootNotificationResponse
  ): void {
    if (payload.status === RegistrationStatusEnumType.ACCEPTED) {
      addConfigurationKey(
        chargingStation,
        OCPP16StandardParametersKey.HeartbeatInterval,
        payload.interval.toString(),
        {},
        { overwrite: true, save: true }
      )
      addConfigurationKey(
        chargingStation,
        OCPP16StandardParametersKey.HeartBeatInterval,
        payload.interval.toString(),
        { visible: false },
        { overwrite: true, save: true }
      )
      OCPP16ServiceUtils.startHeartbeatInterval(chargingStation, payload.interval)
    }
    if (Object.values(RegistrationStatusEnumType).includes(payload.status)) {
      const logMsg = `${chargingStation.logPrefix()} Charging station in '${
        payload.status
      }' state on the central server`
      payload.status === RegistrationStatusEnumType.REJECTED
        ? logger.warn(logMsg)
        : logger.info(logMsg)
    } else {
      logger.error(
        `${chargingStation.logPrefix()} Charging station boot notification response received: %j with undefined registration status`,
        payload
      )
    }
  }

  private handleResponseAuthorize (
    chargingStation: ChargingStation,
    payload: OCPP16AuthorizeResponse,
    requestPayload: OCPP16AuthorizeRequest
  ): void {
    let authorizeConnectorId: number | undefined
    if (chargingStation.hasEvses) {
      for (const [evseId, evseStatus] of chargingStation.evses) {
        if (evseId > 0) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            if (connectorStatus.authorizeIdTag === requestPayload.idTag) {
              authorizeConnectorId = connectorId
              break
            }
          }
        }
      }
    } else {
      for (const connectorId of chargingStation.connectors.keys()) {
        if (
          connectorId > 0 &&
          chargingStation.getConnectorStatus(connectorId)?.authorizeIdTag === requestPayload.idTag
        ) {
          authorizeConnectorId = connectorId
          break
        }
      }
    }
    if (authorizeConnectorId != null) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const authorizeConnectorStatus = chargingStation.getConnectorStatus(authorizeConnectorId)!
      if (payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
        authorizeConnectorStatus.idTagAuthorized = true
        logger.debug(
          `${chargingStation.logPrefix()} idTag '${
            requestPayload.idTag
          }' accepted on connector id ${authorizeConnectorId}`
        )
      } else {
        authorizeConnectorStatus.idTagAuthorized = false
        delete authorizeConnectorStatus.authorizeIdTag
        logger.debug(
          `${chargingStation.logPrefix()} idTag '${
            requestPayload.idTag
          }' rejected with status '${payload.idTagInfo.status}'`
        )
      }
    } else {
      logger.error(
        `${chargingStation.logPrefix()} idTag '${
          requestPayload.idTag
        }' has no authorize request pending`
      )
    }
  }

  private async handleResponseStartTransaction (
    chargingStation: ChargingStation,
    payload: OCPP16StartTransactionResponse,
    requestPayload: OCPP16StartTransactionRequest
  ): Promise<void> {
    const { connectorId } = requestPayload
    if (connectorId === 0 || !chargingStation.hasConnector(connectorId)) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction on a non existing connector id ${connectorId}`
      )
      return
    }
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (
      connectorStatus?.transactionRemoteStarted === true &&
      chargingStation.getAuthorizeRemoteTxRequests() &&
      chargingStation.getLocalAuthListEnabled() &&
      chargingStation.hasIdTags() &&
      connectorStatus.idTagLocalAuthorized === false
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction with a not local authorized idTag ${
          connectorStatus.localAuthorizeIdTag
        } on connector id ${connectorId}`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
      return
    }
    if (
      connectorStatus?.transactionRemoteStarted === true &&
      chargingStation.getAuthorizeRemoteTxRequests() &&
      chargingStation.stationInfo?.remoteAuthorization === true &&
      connectorStatus.idTagLocalAuthorized === false &&
      connectorStatus.idTagAuthorized === false
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction with a not authorized idTag ${
          connectorStatus.authorizeIdTag
        } on connector id ${connectorId}`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
      return
    }
    if (
      connectorStatus?.idTagAuthorized === true &&
      connectorStatus.authorizeIdTag !== requestPayload.idTag
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction with an idTag ${
          requestPayload.idTag
        } different from the authorize request one ${
          connectorStatus.authorizeIdTag
        } on connector id ${connectorId}`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
      return
    }
    if (
      connectorStatus?.idTagLocalAuthorized === true &&
      connectorStatus.localAuthorizeIdTag !== requestPayload.idTag
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction with an idTag ${
          requestPayload.idTag
        } different from the local authorized one ${
          connectorStatus.localAuthorizeIdTag
        } on connector id ${connectorId}`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
      return
    }
    if (connectorStatus?.transactionStarted === true) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction on an already used connector id ${connectorId} by idTag ${
          connectorStatus.transactionIdTag
        }`
      )
      return
    }
    if (chargingStation.hasEvses) {
      for (const [evseId, evseStatus] of chargingStation.evses) {
        if (evseStatus.connectors.size > 1) {
          for (const [id, status] of evseStatus.connectors) {
            if (id !== connectorId && status.transactionStarted === true) {
              logger.error(
                `${chargingStation.logPrefix()} Trying to start a transaction on an already used evse id ${evseId} by connector id ${id} with idTag ${
                  status.transactionIdTag
                }`
              )
              await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
              return
            }
          }
        }
      }
    }
    if (
      connectorStatus?.status !== OCPP16ChargePointStatus.Available &&
      connectorStatus?.status !== OCPP16ChargePointStatus.Preparing
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction on connector id ${connectorId} with status ${
          connectorStatus?.status
        }`
      )
      return
    }
    if (!Number.isSafeInteger(payload.transactionId)) {
      logger.warn(
        `${chargingStation.logPrefix()} Trying to start a transaction on connector id ${connectorId} with a non integer transaction id ${
          payload.transactionId
        }, converting to integer`
      )
      payload.transactionId = convertToInt(payload.transactionId)
    }

    if (payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
      connectorStatus.transactionStarted = true
      connectorStatus.transactionStart = requestPayload.timestamp
      connectorStatus.transactionId = payload.transactionId
      connectorStatus.transactionIdTag = requestPayload.idTag
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.transactionBeginMeterValue =
        OCPP16ServiceUtils.buildTransactionBeginMeterValue(
          chargingStation,
          connectorId,
          requestPayload.meterStart
        )
      if (requestPayload.reservationId != null) {
        const reservation = chargingStation.getReservationBy(
          'reservationId',
          requestPayload.reservationId
        )
        if (reservation != null) {
          if (reservation.idTag !== requestPayload.idTag) {
            logger.warn(
              `${chargingStation.logPrefix()} Reserved transaction ${
                payload.transactionId
              } started with a different idTag ${
                requestPayload.idTag
              } than the reservation one ${reservation.idTag}`
            )
          }
          if (hasReservationExpired(reservation)) {
            logger.warn(
              `${chargingStation.logPrefix()} Reserved transaction ${
                payload.transactionId
              } started with expired reservation ${
                requestPayload.reservationId
              } (expiry date: ${reservation.expiryDate.toISOString()}))`
            )
          }
          await chargingStation.removeReservation(
            reservation,
            ReservationTerminationReason.TRANSACTION_STARTED
          )
        } else {
          logger.warn(
            `${chargingStation.logPrefix()} Reserved transaction ${
              payload.transactionId
            } started with unknown reservation ${requestPayload.reservationId}`
          )
        }
      }
      chargingStation.stationInfo?.beginEndMeterValues === true &&
        (await chargingStation.ocppRequestService.requestHandler<
        OCPP16MeterValuesRequest,
        OCPP16MeterValuesResponse
        >(chargingStation, OCPP16RequestCommand.METER_VALUES, {
          connectorId,
          transactionId: payload.transactionId,
          meterValue: [connectorStatus.transactionBeginMeterValue]
        } satisfies OCPP16MeterValuesRequest))
      await OCPP16ServiceUtils.sendAndSetConnectorStatus(
        chargingStation,
        connectorId,
        OCPP16ChargePointStatus.Charging
      )
      logger.info(
        `${chargingStation.logPrefix()} Transaction with id ${payload.transactionId} STARTED on ${
          chargingStation.stationInfo?.chargingStationId
        }#${connectorId} for idTag '${requestPayload.idTag}'`
      )
      if (chargingStation.stationInfo?.powerSharedByConnectors === true) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ++chargingStation.powerDivider!
      }
      const configuredMeterValueSampleInterval = getConfigurationKey(
        chargingStation,
        OCPP16StandardParametersKey.MeterValueSampleInterval
      )
      chargingStation.startMeterValues(
        connectorId,
        configuredMeterValueSampleInterval != null
          ? secondsToMilliseconds(convertToInt(configuredMeterValueSampleInterval.value))
          : Constants.DEFAULT_METER_VALUES_INTERVAL
      )
    } else {
      logger.warn(
        `${chargingStation.logPrefix()} Starting transaction with id ${
          payload.transactionId
        } REJECTED on ${
          chargingStation.stationInfo?.chargingStationId
        }#${connectorId} with status '${payload.idTagInfo.status}', idTag '${
          requestPayload.idTag
        }'${
          OCPP16ServiceUtils.hasReservation(chargingStation, connectorId, requestPayload.idTag)
            ? `, reservationId '${requestPayload.reservationId}'`
            : ''
        }`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
    }
  }

  private async resetConnectorOnStartTransactionError (
    chargingStation: ChargingStation,
    connectorId: number
  ): Promise<void> {
    chargingStation.stopMeterValues(connectorId)
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    resetConnectorStatus(connectorStatus)
    await OCPP16ServiceUtils.restoreConnectorStatus(chargingStation, connectorId, connectorStatus)
  }

  private async handleResponseStopTransaction (
    chargingStation: ChargingStation,
    payload: OCPP16StopTransactionResponse,
    requestPayload: OCPP16StopTransactionRequest
  ): Promise<void> {
    const transactionConnectorId = chargingStation.getConnectorIdByTransactionId(
      requestPayload.transactionId
    )
    if (transactionConnectorId == null) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to stop a non existing transaction with id ${
          requestPayload.transactionId
        }`
      )
      return
    }
    chargingStation.stationInfo?.beginEndMeterValues === true &&
      chargingStation.stationInfo.ocppStrictCompliance === false &&
      chargingStation.stationInfo.outOfOrderEndMeterValues === true &&
      (await chargingStation.ocppRequestService.requestHandler<
      OCPP16MeterValuesRequest,
      OCPP16MeterValuesResponse
      >(chargingStation, OCPP16RequestCommand.METER_VALUES, {
        connectorId: transactionConnectorId,
        transactionId: requestPayload.transactionId,
        meterValue: [
          OCPP16ServiceUtils.buildTransactionEndMeterValue(
            chargingStation,
            transactionConnectorId,
            requestPayload.meterStop
          )
        ]
      }))
    if (
      !chargingStation.isChargingStationAvailable() ||
      !chargingStation.isConnectorAvailable(transactionConnectorId)
    ) {
      await OCPP16ServiceUtils.sendAndSetConnectorStatus(
        chargingStation,
        transactionConnectorId,
        OCPP16ChargePointStatus.Unavailable
      )
    } else {
      await OCPP16ServiceUtils.sendAndSetConnectorStatus(
        chargingStation,
        transactionConnectorId,
        OCPP16ChargePointStatus.Available
      )
    }
    if (chargingStation.stationInfo?.powerSharedByConnectors === true) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chargingStation.powerDivider!--
    }
    resetConnectorStatus(chargingStation.getConnectorStatus(transactionConnectorId))
    chargingStation.stopMeterValues(transactionConnectorId)
    const logMsg = `${chargingStation.logPrefix()} Transaction with id ${
      requestPayload.transactionId
    } STOPPED on ${
      chargingStation.stationInfo?.chargingStationId
    }#${transactionConnectorId} with status '${payload.idTagInfo?.status}'`
    if (
      payload.idTagInfo == null ||
      payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED
    ) {
      logger.info(logMsg)
    } else {
      logger.warn(logMsg)
    }
  }
}
