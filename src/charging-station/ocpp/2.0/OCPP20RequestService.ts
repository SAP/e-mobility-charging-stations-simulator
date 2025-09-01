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
  OCPP20RequestCommand,
  type OCPP20StatusNotificationRequest,
  OCPPVersion,
  type RequestParams,
} from '../../../types/index.js'
import { generateUUID } from '../../../utils/index.js'
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
    // FIXME?: add sanity checks on charging station availability, connector availability, connector status, etc.
    if (OCPP20ServiceUtils.isRequestCommandSupported(chargingStation, commandName)) {
      // TODO: pre request actions hook
      return (await this.sendMessage(
        chargingStation,
        generateUUID(),
        this.buildRequestPayload<RequestType>(chargingStation, commandName, commandParams),
        commandName,
        params
      )) as ResponseType
    }
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    throw new OCPPError(
      ErrorType.NOT_SUPPORTED,
      `Unsupported OCPP command ${commandName}`,
      commandName,
      commandParams
    )
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
        return commandParams as unknown as Request
      case OCPP20RequestCommand.HEARTBEAT:
        return OCPP20Constants.OCPP_RESPONSE_EMPTY as unknown as Request
      case OCPP20RequestCommand.STATUS_NOTIFICATION:
        return {
          timestamp: new Date(),
          ...commandParams,
        } as unknown as Request
      default:
        // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
        throw new OCPPError(
          ErrorType.NOT_SUPPORTED,
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Unsupported OCPP command ${commandName}`,
          commandName,
          commandParams
        )
    }
  }
}
