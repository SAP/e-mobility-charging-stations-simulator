import Ajv, { type JSONSchemaType, type ValidateFunction } from 'ajv';
import ajvFormats from 'ajv-formats';

import { OCPPServiceUtils } from './OCPPServiceUtils';
import type { ChargingStation } from '../../charging-station';
import { OCPPError } from '../../exception';
import type { IncomingRequestCommand, JsonType, OCPPVersion, RequestCommand } from '../../types';
import { logger } from '../../utils';

const moduleName = 'OCPPResponseService';

export abstract class OCPPResponseService {
  private static instance: OCPPResponseService | null = null;

  public jsonIncomingRequestResponseValidateFunctions: Map<
    IncomingRequestCommand,
    ValidateFunction<JsonType>
  >;

  private readonly version: OCPPVersion;
  private readonly ajv: Ajv;
  private jsonRequestValidateFunctions: Map<RequestCommand, ValidateFunction<JsonType>>;

  public abstract jsonIncomingRequestResponseSchemas: Map<
    IncomingRequestCommand,
    JSONSchemaType<JsonType>
  >;

  protected constructor(version: OCPPVersion) {
    this.version = version;
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2,
    });
    ajvFormats(this.ajv);
    this.jsonRequestValidateFunctions = new Map<RequestCommand, ValidateFunction<JsonType>>();
    this.jsonIncomingRequestResponseValidateFunctions = new Map<
      IncomingRequestCommand,
      ValidateFunction<JsonType>
    >();
    this.responseHandler = this.responseHandler.bind(this) as <
      ReqType extends JsonType,
      ResType extends JsonType,
    >(
      chargingStation: ChargingStation,
      commandName: RequestCommand,
      payload: ResType,
      requestPayload: ReqType,
    ) => Promise<void>;
    this.validateResponsePayload = this.validateResponsePayload.bind(this) as <T extends JsonType>(
      chargingStation: ChargingStation,
      commandName: RequestCommand,
      schema: JSONSchemaType<T>,
      payload: T,
    ) => boolean;
  }

  public static getInstance<T extends OCPPResponseService>(this: new () => T): T {
    if (OCPPResponseService.instance === null) {
      OCPPResponseService.instance = new this();
    }
    return OCPPResponseService.instance as T;
  }

  protected validateResponsePayload<T extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    schema: JSONSchemaType<T>,
    payload: T,
  ): boolean {
    if (chargingStation.getOcppStrictCompliance() === false) {
      return true;
    }
    if (this.jsonRequestValidateFunctions.has(commandName) === false) {
      this.jsonRequestValidateFunctions.set(commandName, this.ajv.compile<T>(schema).bind(this));
    }
    const validate = this.jsonRequestValidateFunctions.get(commandName)!;
    if (validate(payload)) {
      return true;
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateResponsePayload: Command '${commandName}' response PDU is invalid: %j`,
      validate.errors,
    );
    throw new OCPPError(
      OCPPServiceUtils.ajvErrorsToErrorType(validate.errors!),
      'Response PDU is invalid',
      commandName,
      JSON.stringify(validate.errors, undefined, 2),
    );
  }

  protected emptyResponseHandler() {
    /* This is intentional */
  }

  public abstract responseHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: ResType,
    requestPayload: ReqType,
  ): Promise<void>;
}
