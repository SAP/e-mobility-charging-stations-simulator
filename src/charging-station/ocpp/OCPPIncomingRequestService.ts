import { AsyncResource } from 'async_hooks';

import type { JSONSchemaType } from 'ajv';
import Ajv from 'ajv-draft-04';
import ajvFormats from 'ajv-formats';

import OCPPError from '../../exception/OCPPError';
import type { HandleErrorParams } from '../../types/Error';
import type { JsonType } from '../../types/JsonType';
import type { IncomingRequestCommand } from '../../types/ocpp/Requests';
import logger from '../../utils/Logger';
import type ChargingStation from '../ChargingStation';
import { OCPPServiceUtils } from './OCPPServiceUtils';

const moduleName = 'OCPPIncomingRequestService';

export default abstract class OCPPIncomingRequestService {
  private static instance: OCPPIncomingRequestService | null = null;
  protected asyncResource: AsyncResource;
  private readonly ajv: Ajv;

  protected constructor() {
    this.asyncResource = new AsyncResource(moduleName);
    this.ajv = new Ajv();
    ajvFormats(this.ajv);
    this.incomingRequestHandler.bind(this);
    this.validateIncomingRequestPayload.bind(this);
  }

  public static getInstance<T extends OCPPIncomingRequestService>(this: new () => T): T {
    if (OCPPIncomingRequestService.instance === null) {
      OCPPIncomingRequestService.instance = new this();
    }
    return OCPPIncomingRequestService.instance as T;
  }

  protected handleIncomingRequestError<T>(
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand,
    error: Error,
    params: HandleErrorParams<T> = { throwError: true }
  ): T | undefined {
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.handleIncomingRequestError: Incoming request command '${commandName}' error:`,
      error
    );
    if (!params?.throwError && params?.errorResponse) {
      return params?.errorResponse;
    }
    if (params?.throwError && !params?.errorResponse) {
      throw error;
    }
    if (params?.throwError && params?.errorResponse) {
      return params?.errorResponse;
    }
  }

  protected validateIncomingRequestPayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand,
    schema: JSONSchemaType<T>,
    payload: T
  ): boolean {
    if (chargingStation.getPayloadSchemaValidation() === false) {
      return true;
    }
    const validate = this.ajv.compile(schema);
    if (validate(payload)) {
      return true;
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateIncomingRequestPayload: Incoming request PDU is invalid: %j`,
      validate.errors
    );
    throw new OCPPError(
      OCPPServiceUtils.ajvErrorsToErrorType(validate.errors),
      'Incoming request PDU is invalid',
      commandName,
      JSON.stringify(validate.errors, null, 2)
    );
  }

  public abstract incomingRequestHandler(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: IncomingRequestCommand,
    commandPayload: JsonType
  ): Promise<void>;
}
