import ChargingStation from '../ChargingStation';
import { IncomingRequestCommand } from '../../types/ocpp/Requests';
import logger from '../../utils/Logger';

export default abstract class OCPPIncomingRequestService {
  protected chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    this.chargingStation = chargingStation;
  }

  protected handleIncomingRequestError<T>(commandName: IncomingRequestCommand, error: Error, errorOcppResponse?: T): T {
    logger.error(this.chargingStation.logPrefix() + ' Incoming request command ' + commandName + ' error: %j', error);
    if (errorOcppResponse) {
      return errorOcppResponse;
    }
    throw error;
  }

  public abstract handleRequest(messageId: string, commandName: IncomingRequestCommand, commandPayload: Record<string, unknown>): Promise<void>;
}
