import Ajv, { type JSONSchemaType } from 'ajv';
import ajvFormats from 'ajv-formats';

import { OCPPServiceUtils } from './internal';
import type { ChargingStation } from '../../charging-station';
import { OCPPError } from '../../exception';
import type {
  IncomingRequestCommand,
  JsonObject,
  JsonType,
  OCPPVersion,
  RequestCommand,
} from '../../types';
import { logger } from '../../utils';

const moduleName = 'OCPPResponseService';

export abstract class OCPPResponseService {
  private static instance: OCPPResponseService | null = null;
  private readonly version: OCPPVersion;
  private readonly ajv: Ajv;
  public abstract jsonIncomingRequestResponseSchemas: Map<
    IncomingRequestCommand,
    JSONSchemaType<JsonObject>
  >;

  protected constructor(version: OCPPVersion) {
    this.version = version;
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2,
    });
    ajvFormats(this.ajv);
    this.responseHandler = this.responseHandler.bind(this) as (
      chargingStation: ChargingStation,
      commandName: RequestCommand,
      payload: JsonType,
      requestPayload: JsonType
    ) => Promise<void>;
    this.validateResponsePayload = this.validateResponsePayload.bind(this) as <T extends JsonType>(
      chargingStation: ChargingStation,
      commandName: RequestCommand,
      schema: JSONSchemaType<T>,
      payload: T
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
      `${chargingStation.logPrefix()} ${moduleName}.validateResponsePayload: Command '${commandName}' response PDU is invalid: %j`,
      validate.errors
    );
    throw new OCPPError(
      OCPPServiceUtils.ajvErrorsToErrorType(validate.errors),
      'Response PDU is invalid',
      commandName,
      JSON.stringify(validate.errors, null, 2)
    );
  }

  protected emptyResponseHandler() {
    /* This is intentional */
  }

  public abstract responseHandler(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: JsonType,
    requestPayload: JsonType
  ): Promise<void>;
}
