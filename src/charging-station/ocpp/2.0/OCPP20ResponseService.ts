// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import { addConfigurationKey, type ChargingStation } from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  ChargingStationEvents,
  ErrorType,
  type JsonType,
  type OCPP20BootNotificationResponse,
  type OCPP20ClearCacheResponse,
  type OCPP20GetBaseReportResponse,
  type OCPP20HeartbeatResponse,
  OCPP20IncomingRequestCommand,
  type OCPP20NotifyReportResponse,
  OCPP20OptionalVariableName,
  OCPP20RequestCommand,
  type OCPP20RequestStartTransactionResponse,
  type OCPP20RequestStopTransactionResponse,
  type OCPP20StatusNotificationResponse,
  OCPPVersion,
  RegistrationStatusEnumType,
  type ResponseHandler,
} from '../../../types/index.js'
import { isAsyncFunction, logger } from '../../../utils/index.js'
import { OCPPResponseService } from '../OCPPResponseService.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'

const moduleName = 'OCPP20ResponseService'

export class OCPP20ResponseService extends OCPPResponseService {
  public incomingRequestResponsePayloadValidateFunctions: Map<
    OCPP20IncomingRequestCommand,
    ValidateFunction<JsonType>
  >

  protected payloadValidateFunctions: Map<OCPP20RequestCommand, ValidateFunction<JsonType>>
  private readonly responseHandlers: Map<OCPP20RequestCommand, ResponseHandler>

  public constructor () {
    // if (new.target.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target.name} instances directly`)
    // }
    super(OCPPVersion.VERSION_201)
    this.responseHandlers = new Map<OCPP20RequestCommand, ResponseHandler>([
      [
        OCPP20RequestCommand.BOOT_NOTIFICATION,
        this.handleResponseBootNotification.bind(this) as ResponseHandler,
      ],
      [OCPP20RequestCommand.HEARTBEAT, this.handleResponseHeartbeat.bind(this) as ResponseHandler],
      [
        OCPP20RequestCommand.NOTIFY_REPORT,
        this.handleResponseNotifyReport.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        this.handleResponseStatusNotification.bind(this) as ResponseHandler,
      ],
    ])
    this.payloadValidateFunctions = new Map<OCPP20RequestCommand, ValidateFunction<JsonType>>([
      [
        OCPP20RequestCommand.BOOT_NOTIFICATION,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20BootNotificationResponse>(
            'assets/json-schemas/ocpp/2.0/BootNotificationResponse.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20RequestCommand.HEARTBEAT,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20HeartbeatResponse>(
            'assets/json-schemas/ocpp/2.0/HeartbeatResponse.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20RequestCommand.NOTIFY_REPORT,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20NotifyReportResponse>(
            'assets/json-schemas/ocpp/2.0/NotifyReportResponse.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20StatusNotificationResponse>(
            'assets/json-schemas/ocpp/2.0/StatusNotificationResponse.json',
            moduleName,
            'constructor'
          )
        ),
      ],
    ])
    this.incomingRequestResponsePayloadValidateFunctions = new Map<
      OCPP20IncomingRequestCommand,
      ValidateFunction<JsonType>
    >([
      [
        OCPP20IncomingRequestCommand.CLEAR_CACHE,
        this.ajvIncomingRequest.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20ClearCacheResponse>(
            'assets/json-schemas/ocpp/2.0/ClearCacheResponse.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20IncomingRequestCommand.GET_BASE_REPORT,
        this.ajvIncomingRequest.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20GetBaseReportResponse>(
            'assets/json-schemas/ocpp/2.0/GetBaseReportResponse.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
        this.ajvIncomingRequest.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20RequestStartTransactionResponse>(
            'assets/json-schemas/ocpp/2.0/RequestStartTransactionResponse.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
        this.ajvIncomingRequest.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20RequestStopTransactionResponse>(
            'assets/json-schemas/ocpp/2.0/RequestStopTransactionResponse.json',
            moduleName,
            'constructor'
          )
        ),
      ],
    ])
    this.validatePayload = this.validatePayload.bind(this)
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async responseHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    payload: ResType,
    requestPayload: ReqType
  ): Promise<void> {
    if (
      chargingStation.inAcceptedState() ||
      ((chargingStation.inUnknownState() || chargingStation.inPendingState()) &&
        commandName === OCPP20RequestCommand.BOOT_NOTIFICATION) ||
      (chargingStation.stationInfo?.ocppStrictCompliance === false &&
        (chargingStation.inUnknownState() || chargingStation.inPendingState()))
    ) {
      if (
        this.responseHandlers.has(commandName) &&
        OCPP20ServiceUtils.isRequestCommandSupported(chargingStation, commandName)
      ) {
        try {
          this.validatePayload(chargingStation, commandName, payload)
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.responseHandler: Handling '${commandName}' response`
          )
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const responseHandler = this.responseHandlers.get(commandName)!
          if (isAsyncFunction(responseHandler)) {
            await responseHandler(chargingStation, payload, requestPayload)
          } else {
            ;(
              responseHandler as (
                chargingStation: ChargingStation,
                payload: JsonType,
                requestPayload?: JsonType
              ) => void
            )(chargingStation, payload, requestPayload)
          }
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.responseHandler: '${commandName}' response processed successfully`
          )
        } catch (error) {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.responseHandler: Handle '${commandName}' response error:`,
            error
          )
          throw error
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle response PDU ${JSON.stringify(
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

  private handleResponseBootNotification (
    chargingStation: ChargingStation,
    payload: OCPP20BootNotificationResponse
  ): void {
    if (Object.values(RegistrationStatusEnumType).includes(payload.status)) {
      chargingStation.bootNotificationResponse = payload
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (payload.interval != null) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Setting HeartbeatInterval to ${payload.interval.toString()}s`
        )
        addConfigurationKey(
          chargingStation,
          OCPP20OptionalVariableName.HeartbeatInterval,
          payload.interval.toString(),
          {},
          { overwrite: true, save: true }
        )
      }
      if (chargingStation.inAcceptedState()) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Emitting '${RegistrationStatusEnumType.ACCEPTED}' event`
        )
        chargingStation.emitChargingStationEvent(ChargingStationEvents.accepted)
      } else if (chargingStation.inPendingState()) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Emitting '${RegistrationStatusEnumType.PENDING}' event`
        )
        chargingStation.emitChargingStationEvent(ChargingStationEvents.pending)
      } else if (chargingStation.inRejectedState()) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Emitting '${RegistrationStatusEnumType.REJECTED}' event`
        )
        chargingStation.emitChargingStationEvent(ChargingStationEvents.rejected)
      }
      const logMsg = `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Charging station in '${
        payload.status
      }' state on the central server`
      payload.status === RegistrationStatusEnumType.REJECTED
        ? logger.warn(logMsg)
        : logger.info(logMsg)
    } else {
      delete chargingStation.bootNotificationResponse
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Charging station boot notification response received: %j with undefined registration status`,
        payload
      )
    }
  }

  private handleResponseHeartbeat (
    chargingStation: ChargingStation,
    payload: OCPP20HeartbeatResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseHeartbeat: Heartbeat response received at ${payload.currentTime.toISOString()}`
    )
  }

  private handleResponseNotifyReport (
    chargingStation: ChargingStation,
    payload: OCPP20NotifyReportResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseNotifyReport: NotifyReport response received successfully`
    )
  }

  private handleResponseStatusNotification (
    chargingStation: ChargingStation,
    payload: OCPP20StatusNotificationResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseStatusNotification: StatusNotification response received successfully`
    )
  }

  private validatePayload (
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    payload: JsonType
  ): boolean {
    if (this.payloadValidateFunctions.has(commandName)) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.validatePayload: Validating '${commandName}' response payload`
      )
      const isValid = this.validateResponsePayload(chargingStation, commandName, payload)
      if (!isValid) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.validatePayload: '${commandName}' response payload validation failed`
        )
      } else {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.validatePayload: '${commandName}' response payload validation successful`
        )
      }
      return isValid
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema validation function found for command '${commandName}' PDU validation`
    )
    return false
  }
}
