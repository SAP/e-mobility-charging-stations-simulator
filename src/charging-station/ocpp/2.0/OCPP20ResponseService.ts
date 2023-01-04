// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import type { JSONSchemaType } from 'ajv';

import OCPPError from '../../../exception/OCPPError';
import type { JsonObject, JsonType } from '../../../types/JsonType';
import type { OCPP20RequestCommand } from '../../../types/ocpp/2.0/Requests';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import type { ResponseHandler } from '../../../types/ocpp/Responses';
import logger from '../../../utils/Logger';
import type ChargingStation from '../../ChargingStation';
import OCPPResponseService from '../OCPPResponseService';
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils';

const moduleName = 'OCPP20ResponseService';

export default class OCPP20ResponseService extends OCPPResponseService {
  private responseHandlers: Map<OCPP20RequestCommand, ResponseHandler>;
  private jsonSchemas: Map<OCPP20RequestCommand, JSONSchemaType<JsonObject>>;

  public constructor() {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super();
    this.responseHandlers = new Map<OCPP20RequestCommand, ResponseHandler>();
    this.jsonSchemas = new Map<OCPP20RequestCommand, JSONSchemaType<JsonObject>>();
    this.validatePayload.bind(this);
  }

  public async responseHandler(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    payload: JsonType,
    requestPayload: JsonType
  ): Promise<void> {
    if (
      chargingStation.isRegistered() === true /* ||
      commandName === OCPP20RequestCommand.BOOT_NOTIFICATION */
    ) {
      if (
        this.responseHandlers.has(commandName) === true &&
        OCPP20ServiceUtils.isRequestCommandSupported(chargingStation, commandName) === true
      ) {
        try {
          this.validatePayload(chargingStation, commandName, payload);
          await this.responseHandlers.get(commandName)(chargingStation, payload, requestPayload);
        } catch (error) {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.responseHandler: Handle response error:`,
            error
          );
          throw error;
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle response PDU ${JSON.stringify(
            payload,
            null,
            2
          )}`,
          commandName,
          payload
        );
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle response PDU ${JSON.stringify(
          payload,
          null,
          2
        )} while the charging station is not registered on the central server.`,
        commandName,
        payload
      );
    }
  }

  private validatePayload(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    payload: JsonType
  ): boolean {
    if (this.jsonSchemas.has(commandName)) {
      return this.validateResponsePayload(
        chargingStation,
        commandName,
        this.jsonSchemas.get(commandName),
        payload
      );
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema found for command ${commandName} PDU validation`
    );
    return false;
  }
}
