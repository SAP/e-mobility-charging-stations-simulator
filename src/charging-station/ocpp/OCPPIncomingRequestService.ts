import { AsyncResource } from 'node:async_hooks';

import Ajv, { type JSONSchemaType } from 'ajv';
import ajvFormats from 'ajv-formats';

import { OCPPConstants } from './OCPPConstants';
import { OCPPServiceUtils } from './OCPPServiceUtils';
import { type ChargingStation, ChargingStationUtils } from '../../charging-station';
import { OCPPError } from '../../exception';
import type {
  ClearCacheResponse,
  HandleErrorParams,
  IncomingRequestCommand,
  JsonObject,
  JsonType,
  OCPPVersion,
} from '../../types';
import { ErrorUtils, logger } from '../../utils';

const moduleName = 'OCPPIncomingRequestService';

export abstract class OCPPIncomingRequestService extends AsyncResource {
  private static instance: OCPPIncomingRequestService | null = null;
  private readonly version: OCPPVersion;
  private readonly ajv: Ajv;
  protected abstract jsonSchemas: Map<IncomingRequestCommand, JSONSchemaType<JsonObject>>;

  protected constructor(version: OCPPVersion) {
    super(moduleName);
    this.version = version;
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2,
    });
    ajvFormats(this.ajv);
    this.incomingRequestHandler = this.incomingRequestHandler.bind(this) as (
      chargingStation: ChargingStation,
      messageId: string,
      commandName: IncomingRequestCommand,
      commandPayload: JsonType
    ) => Promise<void>;
    this.validateIncomingRequestPayload = this.validateIncomingRequestPayload.bind(this) as <
      T extends JsonType
    >(
      chargingStation: ChargingStation,
      commandName: IncomingRequestCommand,
      schema: JSONSchemaType<T>,
      payload: T
    ) => boolean;
  }

  public static getInstance<T extends OCPPIncomingRequestService>(this: new () => T): T {
    if (OCPPIncomingRequestService.instance === null) {
      OCPPIncomingRequestService.instance = new this();
    }
    return OCPPIncomingRequestService.instance as T;
  }

  protected handleIncomingRequestError<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand,
    error: Error,
    params: HandleErrorParams<T> = { throwError: true, consoleOut: false }
  ): T | undefined {
    ErrorUtils.handleErrorParams(params);
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
      `${chargingStation.logPrefix()} ${moduleName}.validateIncomingRequestPayload: Command '${commandName}' incoming request PDU is invalid: %j`,
      validate.errors
    );
    throw new OCPPError(
      OCPPServiceUtils.ajvErrorsToErrorType(validate.errors),
      'Incoming request PDU is invalid',
      commandName,
      JSON.stringify(validate.errors, null, 2)
    );
  }

  protected handleRequestClearCache(chargingStation: ChargingStation): ClearCacheResponse {
    chargingStation.idTagsCache.deleteIdTags(
      ChargingStationUtils.getIdTagsFile(chargingStation.stationInfo)
    );
    return OCPPConstants.OCPP_RESPONSE_ACCEPTED;
  }

  public abstract incomingRequestHandler(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: IncomingRequestCommand,
    commandPayload: JsonType
  ): Promise<void>;
}
