// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { JSONSchemaType } from 'ajv';

import { OCPP20ServiceUtils } from './OCPP20ServiceUtils';
import OCPPError from '../../../exception/OCPPError';
import type { JsonObject, JsonType } from '../../../types/JsonType';
import {
  type OCPP20BootNotificationRequest,
  type OCPP20HeartbeatRequest,
  OCPP20RequestCommand,
  type OCPP20StatusNotificationRequest,
} from '../../../types/ocpp/2.0/Requests';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { OCPPVersion } from '../../../types/ocpp/OCPPVersion';
import type { RequestParams } from '../../../types/ocpp/Requests';
import Utils from '../../../utils/Utils';
import type ChargingStation from '../../ChargingStation';
import OCPPConstants from '../OCPPConstants';
import OCPPRequestService from '../OCPPRequestService';
import type OCPPResponseService from '../OCPPResponseService';

const moduleName = 'OCPP20RequestService';

export default class OCPP20RequestService extends OCPPRequestService {
  protected jsonSchemas: Map<OCPP20RequestCommand, JSONSchemaType<JsonObject>>;

  public constructor(ocppResponseService: OCPPResponseService) {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super(OCPPVersion.VERSION_20, ocppResponseService);
    this.jsonSchemas = new Map<OCPP20RequestCommand, JSONSchemaType<JsonObject>>([
      [
        OCPP20RequestCommand.BOOT_NOTIFICATION,
        this.parseJsonSchemaFile<OCPP20BootNotificationRequest>(
          '../../../assets/json-schemas/ocpp/2.0/BootNotificationRequest.json'
        ),
      ],
      [
        OCPP20RequestCommand.HEARTBEAT,
        this.parseJsonSchemaFile<OCPP20HeartbeatRequest>(
          '../../../assets/json-schemas/ocpp/2.0/HeartbeatRequest.json'
        ),
      ],
      [
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        this.parseJsonSchemaFile<OCPP20StatusNotificationRequest>(
          '../../../assets/json-schemas/ocpp/2.0/StatusNotificationRequest.json'
        ),
      ],
    ]);
    this.buildRequestPayload.bind(this);
  }

  public async requestHandler<RequestType extends JsonType, ResponseType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: JsonType,
    params?: RequestParams
  ): Promise<ResponseType> {
    if (OCPP20ServiceUtils.isRequestCommandSupported(chargingStation, commandName) === true) {
      return (await this.sendMessage(
        chargingStation,
        Utils.generateUUID(),
        this.buildRequestPayload<RequestType>(chargingStation, commandName, commandParams),
        commandName,
        params
      )) as unknown as ResponseType;
    }
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    throw new OCPPError(
      ErrorType.NOT_SUPPORTED,
      `Unsupported OCPP command '${commandName}'`,
      commandName,
      commandParams
    );
  }

  private buildRequestPayload<Request extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: JsonType
  ): Request {
    commandParams = commandParams as JsonObject;
    switch (commandName) {
      case OCPP20RequestCommand.BOOT_NOTIFICATION:
        return commandParams as unknown as Request;
      case OCPP20RequestCommand.HEARTBEAT:
        return OCPPConstants.OCPP_RESPONSE_EMPTY as unknown as Request;
      case OCPP20RequestCommand.STATUS_NOTIFICATION:
        return {
          timestamp: new Date(),
          ...commandParams,
        } as unknown as Request;
      default:
        // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
        throw new OCPPError(
          ErrorType.NOT_SUPPORTED,
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Unsupported OCPP command '${commandName}'`,
          commandName,
          commandParams
        );
    }
  }

  private parseJsonSchemaFile<T extends JsonType>(relativePath: string): JSONSchemaType<T> {
    return JSON.parse(
      fs.readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), relativePath),
        'utf8'
      )
    ) as JSONSchemaType<T>;
  }
}
