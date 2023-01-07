import Ajv, { type JSONSchemaType } from 'ajv';
import ajvFormats from 'ajv-formats';

import OCPPError from '../../exception/OCPPError';
import type { JsonType } from '../../types/JsonType';
import type { OCPPVersion } from '../../types/ocpp/OCPPVersion';
import type { RequestCommand } from '../../types/ocpp/Requests';
import logger from '../../utils/Logger';
import type ChargingStation from '../ChargingStation';
import { OCPPServiceUtils } from './OCPPServiceUtils';

const moduleName = 'OCPPResponseService';

export default abstract class OCPPResponseService {
  private static instance: OCPPResponseService | null = null;
  private readonly version: OCPPVersion;
  private readonly ajv: Ajv;

  protected constructor(version: OCPPVersion) {
    this.version = version;
    this.ajv = new Ajv({
      keywords: ['javaType'],
      multipleOfPrecision: 2,
    });
    ajvFormats(this.ajv);
    this.responseHandler.bind(this);
    this.validateResponsePayload.bind(this);
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
