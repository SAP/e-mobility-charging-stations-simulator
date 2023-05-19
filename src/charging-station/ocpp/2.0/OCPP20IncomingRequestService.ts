// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import type { JSONSchemaType } from 'ajv';

import { OCPP20ServiceUtils } from './OCPP20ServiceUtils';
import type { ChargingStation } from '../../../charging-station';
import { OCPPError } from '../../../exception';
import {
  ErrorType,
  type IncomingRequestHandler,
  type JsonObject,
  type JsonType,
  type OCPP20ClearCacheRequest,
  OCPP20IncomingRequestCommand,
  OCPPVersion,
} from '../../../types';
import { logger } from '../../../utils';
import { OCPPIncomingRequestService } from '../OCPPIncomingRequestService';

const moduleName = 'OCPP20IncomingRequestService';

export class OCPP20IncomingRequestService extends OCPPIncomingRequestService {
  protected jsonSchemas: Map<OCPP20IncomingRequestCommand, JSONSchemaType<JsonObject>>;
  private incomingRequestHandlers: Map<OCPP20IncomingRequestCommand, IncomingRequestHandler>;

  public constructor() {
    // if (new.target?.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    // }
    super(OCPPVersion.VERSION_20);
    this.incomingRequestHandlers = new Map<OCPP20IncomingRequestCommand, IncomingRequestHandler>([
      [OCPP20IncomingRequestCommand.CLEAR_CACHE, this.handleRequestClearCache.bind(this)],
    ]);
    this.jsonSchemas = new Map<OCPP20IncomingRequestCommand, JSONSchemaType<JsonObject>>([
      [
        OCPP20IncomingRequestCommand.CLEAR_CACHE,
        OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20ClearCacheRequest>(
          '../../../assets/json-schemas/ocpp/2.0/ClearCacheRequest.json',
          moduleName,
          'constructor'
        ),
      ],
    ]);
    this.validatePayload = this.validatePayload.bind(this) as (
      chargingStation: ChargingStation,
      commandName: OCPP20IncomingRequestCommand,
      commandPayload: JsonType
    ) => boolean;
  }

  public async incomingRequestHandler(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: OCPP20IncomingRequestCommand,
    commandPayload: JsonType
  ): Promise<void> {
    let response: JsonType;
    if (
      chargingStation.getOcppStrictCompliance() === true &&
      chargingStation.inPendingState() === true &&
      (commandName === OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION ||
        commandName === OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION)
    ) {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          null,
          2
        )} while the charging station is in pending state on the central server`,
        commandName,
        commandPayload
      );
    }
    if (
      chargingStation.isRegistered() === true ||
      (chargingStation.getOcppStrictCompliance() === false &&
        chargingStation.inUnknownState() === true)
    ) {
      if (
        this.incomingRequestHandlers.has(commandName) === true &&
        OCPP20ServiceUtils.isIncomingRequestCommandSupported(chargingStation, commandName) === true
      ) {
        try {
          this.validatePayload(chargingStation, commandName, commandPayload);
          // Call the method to build the response
          response = await this.incomingRequestHandlers.get(commandName)(
            chargingStation,
            commandPayload
          );
        } catch (error) {
          // Log
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.incomingRequestHandler: Handle incoming request error:`,
            error
          );
          throw error;
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle request PDU ${JSON.stringify(
            commandPayload,
            null,
            2
          )}`,
          commandName,
          commandPayload
        );
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          null,
          2
        )} while the charging station is not registered on the central server.`,
        commandName,
        commandPayload
      );
    }
    // Send the built response
    await chargingStation.ocppRequestService.sendResponse(
      chargingStation,
      messageId,
      response,
      commandName
    );
  }

  private validatePayload(
    chargingStation: ChargingStation,
    commandName: OCPP20IncomingRequestCommand,
    commandPayload: JsonType
  ): boolean {
    if (this.jsonSchemas.has(commandName) === true) {
      return this.validateIncomingRequestPayload(
        chargingStation,
        commandName,
        this.jsonSchemas.get(commandName),
        commandPayload
      );
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema found for command '${commandName}' PDU validation`
    );
    return false;
  }
}
