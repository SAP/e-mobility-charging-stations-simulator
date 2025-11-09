// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import type { ChargingStation } from '../../../charging-station/index.js'
import type { OCPPResponseService } from '../OCPPResponseService.js'

import { OCPPError } from '../../../exception/index.js'
import {
  ErrorType,
  type JsonObject,
  type JsonType,
  type OCPP20BootNotificationRequest,
  type OCPP20HeartbeatRequest,
  type OCPP20NotifyReportRequest,
  OCPP20RequestCommand,
  type OCPP20StatusNotificationRequest,
  OCPPVersion,
  type RequestParams,
} from '../../../types/index.js'
import { generateUUID, logger } from '../../../utils/index.js'
import { OCPPRequestService } from '../OCPPRequestService.js'
import { OCPP20Constants } from './OCPP20Constants.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'

const moduleName = 'OCPP20RequestService'

export class OCPP20RequestService extends OCPPRequestService {
  protected payloadValidateFunctions: Map<OCPP20RequestCommand, ValidateFunction<JsonType>>

  public constructor (ocppResponseService: OCPPResponseService) {
    // if (new.target.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target.name} instances directly`)
    // }
    super(OCPPVersion.VERSION_201, ocppResponseService)
    this.payloadValidateFunctions = new Map<OCPP20RequestCommand, ValidateFunction<JsonType>>([
      [
        OCPP20RequestCommand.BOOT_NOTIFICATION,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20BootNotificationRequest>(
            'assets/json-schemas/ocpp/2.0/BootNotificationRequest.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20RequestCommand.HEARTBEAT,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20HeartbeatRequest>(
            'assets/json-schemas/ocpp/2.0/HeartbeatRequest.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20RequestCommand.NOTIFY_REPORT,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20NotifyReportRequest>(
            'assets/json-schemas/ocpp/2.0/NotifyReportRequest.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20StatusNotificationRequest>(
            'assets/json-schemas/ocpp/2.0/StatusNotificationRequest.json',
            moduleName,
            'constructor'
          )
        ),
      ],
    ])
    this.buildRequestPayload = this.buildRequestPayload.bind(this)
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async requestHandler<RequestType extends JsonType, ResponseType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: RequestType,
    params?: RequestParams
  ): Promise<ResponseType> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Processing '${commandName}' request`
    )
    // FIXME?: add sanity checks on charging station availability, connector availability, connector status, etc.
    if (OCPP20ServiceUtils.isRequestCommandSupported(chargingStation, commandName)) {
      try {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Building request payload for '${commandName}'`
        )
        const requestPayload = this.buildRequestPayload<RequestType>(
          chargingStation,
          commandName,
          commandParams
        )
        const messageId = generateUUID()
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Sending '${commandName}' request with message ID '${messageId}'`
        )
        // TODO: pre request actions hook
        const response = (await this.sendMessage(
          chargingStation,
          messageId,
          requestPayload,
          commandName,
          params
        )) as ResponseType
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: '${commandName}' request completed successfully`
        )
        return response
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Error processing '${commandName}' request:`,
          error
        )
        throw error
      }
    }
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    const errorMsg = `Unsupported OCPP command ${commandName}`
    logger.error(`${chargingStation.logPrefix()} ${moduleName}.requestHandler: ${errorMsg}`)
    throw new OCPPError(ErrorType.NOT_SUPPORTED, errorMsg, commandName, commandParams)
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  private buildRequestPayload<Request extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: JsonType
  ): Request {
    commandParams = commandParams as JsonObject
    switch (commandName) {
      case OCPP20RequestCommand.BOOT_NOTIFICATION:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP20RequestCommand.BOOT_NOTIFICATION} payload`
        )
        return commandParams as unknown as Request
      case OCPP20RequestCommand.HEARTBEAT:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP20RequestCommand.HEARTBEAT} payload (empty)`
        )
        return OCPP20Constants.OCPP_RESPONSE_EMPTY as unknown as Request
      case OCPP20RequestCommand.NOTIFY_REPORT:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP20RequestCommand.NOTIFY_REPORT} payload`
        )
        return {
          ...commandParams,
        } as unknown as Request
      case OCPP20RequestCommand.STATUS_NOTIFICATION:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP20RequestCommand.STATUS_NOTIFICATION} payload with timestamp`
        )
        return {
          timestamp: new Date(),
          ...commandParams,
        } as unknown as Request
      default: {
        // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
        const errorMsg = `Unsupported OCPP command ${commandName} for payload building`
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: ${errorMsg}`
        )
        throw new OCPPError(ErrorType.NOT_SUPPORTED, errorMsg, commandName, commandParams)
      }
    }
  }
}
