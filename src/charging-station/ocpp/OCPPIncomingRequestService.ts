import type ChargingStation from '../ChargingStation';
import { HandleErrorParams } from '../../types/Error';
import { IncomingRequestCommand } from '../../types/ocpp/Requests';
import { JsonType } from '../../types/JsonType';
import logger from '../../utils/Logger';

export default abstract class OCPPIncomingRequestService {
  private static instance: OCPPIncomingRequestService | null = null;

  protected constructor() {
    // This is intentional
  }

  public static getInstance<T extends OCPPIncomingRequestService>(this: new () => T): T {
    if (!OCPPIncomingRequestService.instance) {
      OCPPIncomingRequestService.instance = new this();
    }
    return OCPPIncomingRequestService.instance as T;
  }

  protected handleIncomingRequestError<T>(
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand,
    error: Error,
    params: HandleErrorParams<T> = { throwError: true }
  ): T {
    logger.error(
      chargingStation.logPrefix() + ' Incoming request command %s error: %j',
      commandName,
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

  public abstract incomingRequestHandler(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: IncomingRequestCommand,
    commandPayload: JsonType
  ): Promise<void>;
}
