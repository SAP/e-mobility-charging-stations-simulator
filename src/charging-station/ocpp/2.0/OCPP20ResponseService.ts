// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import { addConfigurationKey, type ChargingStation } from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  ChargingStationEvents,
  ErrorType,
  type JsonType,
  type OCPP20BootNotificationResponse,
  type OCPP20ClearCacheResponse,
  type OCPP20HeartbeatResponse,
  OCPP20IncomingRequestCommand,
  OCPP20OptionalVariableName,
  OCPP20RequestCommand,
  type OCPP20StatusNotificationResponse,
  OCPPVersion,
  RegistrationStatusEnumType,
  type ResponseHandler
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
        this.handleResponseBootNotification.bind(this) as ResponseHandler
      ],
      [OCPP20RequestCommand.HEARTBEAT, this.emptyResponseHandler],
      [OCPP20RequestCommand.STATUS_NOTIFICATION, this.emptyResponseHandler]
    ])
    this.payloadValidateFunctions = new Map<OCPP20RequestCommand, ValidateFunction<JsonType>>([
      [
        OCPP20RequestCommand.BOOT_NOTIFICATION,
        this.ajv
          .compile(
            OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20BootNotificationResponse>(
              'assets/json-schemas/ocpp/2.0/BootNotificationResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP20RequestCommand.HEARTBEAT,
        this.ajv
          .compile(
            OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20HeartbeatResponse>(
              'assets/json-schemas/ocpp/2.0/HeartbeatResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ],
      [
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        this.ajv
          .compile(
            OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20StatusNotificationResponse>(
              'assets/json-schemas/ocpp/2.0/StatusNotificationResponse.json',
              moduleName,
              'constructor'
            )
          )
          .bind(this)
      ]
    ])
    this.incomingRequestResponsePayloadValidateFunctions = new Map<
    OCPP20IncomingRequestCommand,
    ValidateFunction<JsonType>
    >([
      [
        OCPP20IncomingRequestCommand.CLEAR_CACHE,
        this.ajvIncomingRequest
          .compile(
            OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20ClearCacheResponse>(
              'assets/json-schemas/ocpp/2.0/ClearCacheResponse.json',
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
    commandName: OCPP20RequestCommand,
    payload: ResType,
    requestPayload: ReqType
  ): Promise<void> {
    if (chargingStation.isRegistered() || commandName === OCPP20RequestCommand.BOOT_NOTIFICATION) {
      if (
        this.responseHandlers.has(commandName) &&
        OCPP20ServiceUtils.isRequestCommandSupported(chargingStation, commandName)
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
    commandName: OCPP20RequestCommand,
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
    payload: OCPP20BootNotificationResponse
  ): void {
    if (Object.values(RegistrationStatusEnumType).includes(payload.status)) {
      chargingStation.bootNotificationResponse = payload
      if (chargingStation.isRegistered()) {
        chargingStation.emit(ChargingStationEvents.registered)
        if (chargingStation.inAcceptedState()) {
          chargingStation.emit(ChargingStationEvents.accepted)
          addConfigurationKey(
            chargingStation,
            OCPP20OptionalVariableName.HeartbeatInterval,
            payload.interval.toString(),
            {},
            { overwrite: true, save: true }
          )
        }
      } else if (chargingStation.inRejectedState()) {
        chargingStation.emit(ChargingStationEvents.rejected)
      }
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
}
