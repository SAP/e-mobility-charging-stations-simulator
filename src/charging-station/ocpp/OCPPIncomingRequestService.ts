import { AsyncResource } from 'async_hooks';

import Ajv, { type JSONSchemaType } from 'ajv';
import ajvFormats from 'ajv-formats';

import OCPPConstants from './OCPPConstants';
import { OCPPServiceUtils } from './OCPPServiceUtils';
import OCPPError from '../../exception/OCPPError';
import type { HandleErrorParams } from '../../types/Error';
import type { JsonObject, JsonType } from '../../types/JsonType';
import type { OCPPVersion } from '../../types/ocpp/OCPPVersion';
import type { IncomingRequestCommand } from '../../types/ocpp/Requests';
import type { ClearCacheResponse } from '../../types/ocpp/Responses';
import logger from '../../utils/Logger';
import type ChargingStation from '../ChargingStation';
import { ChargingStationUtils } from '../ChargingStationUtils';

const moduleName = 'OCPPIncomingRequestService';

export default abstract class OCPPIncomingRequestService extends AsyncResource {
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
    chargingStation.authorizedTagsCache.deleteAuthorizedTags(
      ChargingStationUtils.getAuthorizationFile(chargingStation.stationInfo)
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
