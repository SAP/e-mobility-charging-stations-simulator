import { JSONSchemaType } from 'ajv';
import Ajv from 'ajv-draft-04';
import ajvFormats from 'ajv-formats';

import OCPPError from '../../exception/OCPPError';
import { JsonType } from '../../types/JsonType';
import { RequestCommand } from '../../types/ocpp/Requests';
import logger from '../../utils/Logger';
import type ChargingStation from '../ChargingStation';
import { OCPPServiceUtils } from './OCPPServiceUtils';

const moduleName = 'OCPPResponseService';

export default abstract class OCPPResponseService {
  private static instance: OCPPResponseService | null = null;
  private ajv: Ajv;

  protected constructor() {
    this.ajv = new Ajv();
    ajvFormats(this.ajv);
  }

  public static getInstance<T extends OCPPResponseService>(this: new () => T): T {
    if (!OCPPResponseService.instance) {
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
    if (!chargingStation.getPayloadSchemaValidation()) {
      return true;
    }
    const validate = this.ajv.compile(schema);
    if (validate(payload)) {
      return true;
    }
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.validateResponsePayload: Response PDU is invalid: %j`,
      validate.errors
    );
    throw new OCPPError(
      OCPPServiceUtils.AjvErrorsToErrorType(validate.errors),
      'Response PDU is invalid',
      commandName,
      JSON.stringify(validate.errors, null, 2)
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  protected emptyResponseHandler() {}

  public abstract responseHandler(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: JsonType,
    requestPayload: JsonType
  ): Promise<void>;
}
