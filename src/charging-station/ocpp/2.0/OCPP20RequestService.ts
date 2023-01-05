// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { JSONSchemaType } from 'ajv';

import OCPPError from '../../../exception/OCPPError';
import type { JsonObject, JsonType } from '../../../types/JsonType';
import {
  BootReasonEnumType,
  OCPP20BootNotificationRequest,
  OCPP20RequestCommand,
} from '../../../types/ocpp/2.0/Requests';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { OCPPVersion } from '../../../types/ocpp/OCPPVersion';
import type { RequestParams } from '../../../types/ocpp/Requests';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';
import type ChargingStation from '../../ChargingStation';
import OCPPRequestService from '../OCPPRequestService';
import type OCPPResponseService from '../OCPPResponseService';
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils';

const moduleName = 'OCPP20RequestService';

export default class OCPP20RequestService extends OCPPRequestService {
  private jsonSchemas: Map<OCPP20RequestCommand, JSONSchemaType<JsonObject>>;

  public constructor(ocppResponseService: OCPPResponseService) {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super(OCPPVersion.VERSION_20, ocppResponseService);
    this.jsonSchemas = new Map<OCPP20RequestCommand, JSONSchemaType<JsonObject>>([
      [
        OCPP20RequestCommand.BOOT_NOTIFICATION,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/2.0/BootNotificationRequest.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP20BootNotificationRequest>,
      ],
    ]);
    this.buildRequestPayload.bind(this);
    this.validatePayload.bind(this);
  }

  public async requestHandler<RequestType extends JsonType, ResponseType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: JsonType,
    params?: RequestParams
  ): Promise<ResponseType> {
    if (OCPP20ServiceUtils.isRequestCommandSupported(chargingStation, commandName) === true) {
      const requestPayload = this.buildRequestPayload<RequestType>(
        chargingStation,
        commandName,
        commandParams
      );
      this.validatePayload(chargingStation, commandName, requestPayload);
      return (await this.sendMessage(
        chargingStation,
        Utils.generateUUID(),
        requestPayload,
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
        commandParams.modem = commandParams.modem as JsonObject;
        return {
          reason: commandParams?.reason,
          chargingStation: {
            model: commandParams?.model,
            vendorName: commandParams?.vendorName,
            ...(!Utils.isUndefined(commandParams?.firmwareVersion) && {
              firmwareVersion: commandParams.firmwareVersion,
            }),
            ...(!Utils.isUndefined(commandParams?.serialNumber) && {
              serialNumber: commandParams.serialNumber,
            }),
            modem: {
              ...(!Utils.isUndefined(commandParams?.modem?.iccid) && {
                iccid: commandParams.modem.iccid,
              }),
              ...(!Utils.isUndefined(commandParams?.modem?.imsi) && {
                imsi: commandParams.modem.imsi,
              }),
            },
          },
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

  private validatePayload<Request extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    requestPayload: Request
  ): boolean {
    if (this.jsonSchemas.has(commandName)) {
      return this.validateRequestPayload(
        chargingStation,
        commandName,
        this.jsonSchemas.get(commandName),
        requestPayload
      );
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema found for command ${commandName} PDU validation`
    );
    return false;
  }
}
