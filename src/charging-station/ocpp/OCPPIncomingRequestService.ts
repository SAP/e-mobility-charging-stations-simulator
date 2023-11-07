import { AsyncResource } from 'node:async_hooks';

import Ajv, { type JSONSchemaType, type ValidateFunction } from 'ajv';
import ajvFormats from 'ajv-formats';

import { OCPPConstants } from './OCPPConstants';
import { OCPPServiceUtils } from './OCPPServiceUtils';
import { type ChargingStation, getIdTagsFile } from '../../charging-station';
import { OCPPError } from '../../exception';
import type {
  ClearCacheResponse,
  HandleErrorParams,
  IncomingRequestCommand,
  JsonType,
  OCPPVersion,
} from '../../types';
import { logger, setDefaultErrorParams } from '../../utils';

const moduleName = 'OCPPIncomingRequestService';

export abstract class OCPPIncomingRequestService extends AsyncResource {
  private static instance: OCPPIncomingRequestService | null = null;
  private readonly version: OCPPVersion;
  private readonly ajv: Ajv;
  private jsonValidateFunctions: Map<IncomingRequestCommand, ValidateFunction<JsonType>>;
  protected abstract jsonSchemas: Map<IncomingRequestCommand, JSONSchemaType<JsonType>>;

  protected constructor(version: OCPPVersion) {
    super(moduleName);
    this.version = version;
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2,
    });
    ajvFormats(this.ajv);
    this.jsonValidateFunctions = new Map<IncomingRequestCommand, ValidateFunction<JsonType>>();
    this.incomingRequestHandler = this.incomingRequestHandler.bind(this) as <
      ReqType extends JsonType,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ResType extends JsonType,
    >(
      chargingStation: ChargingStation,
      messageId: string,
      commandName: IncomingRequestCommand,
      commandPayload: ReqType,
    ) => Promise<void>;
    this.validateIncomingRequestPayload = this.validateIncomingRequestPayload.bind(this) as <
      T extends JsonType,
    >(
      chargingStation: ChargingStation,
      commandName: IncomingRequestCommand,
      schema: JSONSchemaType<T>,
      payload: T,
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
    params: HandleErrorParams<T> = { throwError: true, consoleOut: false },
  ): T | undefined {
    setDefaultErrorParams(params);
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.handleIncomingRequestError: Incoming request command '${commandName}' error:`,
      error,
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
    payload: T,
  ): boolean {
    if (chargingStation.getOcppStrictCompliance() === false) {
      return true;
    }
    if (this.jsonValidateFunctions.has(commandName) === false) {
      this.jsonValidateFunctions.set(commandName, this.ajv.compile<T>(schema).bind(this));
    }
    const validate = this.jsonValidateFunctions.get(commandName)!;
    if (validate(payload)) {
      return true;
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateIncomingRequestPayload: Command '${commandName}' incoming request PDU is invalid: %j`,
      validate.errors,
    );
    throw new OCPPError(
      OCPPServiceUtils.ajvErrorsToErrorType(validate.errors!),
      'Incoming request PDU is invalid',
      commandName,
      JSON.stringify(validate.errors, undefined, 2),
    );
  }

  protected handleRequestClearCache(chargingStation: ChargingStation): ClearCacheResponse {
    if (chargingStation.idTagsCache.deleteIdTags(getIdTagsFile(chargingStation.stationInfo)!)) {
      return OCPPConstants.OCPP_RESPONSE_ACCEPTED;
    }
    return OCPPConstants.OCPP_RESPONSE_REJECTED;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public abstract incomingRequestHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: IncomingRequestCommand,
    commandPayload: ReqType,
  ): Promise<void>;
}
