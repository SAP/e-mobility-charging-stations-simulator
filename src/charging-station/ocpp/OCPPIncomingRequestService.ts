import type ChargingStation from '../ChargingStation';
import { HandleErrorParams } from '../../types/Error';
import { IncomingRequestCommand } from '../../types/ocpp/Requests';
import { JsonType } from '../../types/JsonType';
import logger from '../../utils/Logger';

export default abstract class OCPPIncomingRequestService {
  private static readonly instances: Map<string, OCPPIncomingRequestService> = new Map<string, OCPPIncomingRequestService>();
  protected chargingStation: ChargingStation;

  protected constructor(chargingStation: ChargingStation) {
    this.chargingStation = chargingStation;
  }

  public static getInstance<T extends OCPPIncomingRequestService>(this: new (chargingStation: ChargingStation) => T, chargingStation: ChargingStation): T {
    if (!OCPPIncomingRequestService.instances.has(chargingStation.id)) {
      OCPPIncomingRequestService.instances.set(chargingStation.id, new this(chargingStation));
    }
    return OCPPIncomingRequestService.instances.get(chargingStation.id) as T;
  }

  protected handleIncomingRequestError<T>(commandName: IncomingRequestCommand, error: Error, params: HandleErrorParams<T> = { throwError: true }): T {
    logger.error(this.chargingStation.logPrefix() + ' Incoming request command %s error: %j', commandName, error);
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

  public abstract handleRequest(messageId: string, commandName: IncomingRequestCommand, commandPayload: JsonType): Promise<void>;
}
