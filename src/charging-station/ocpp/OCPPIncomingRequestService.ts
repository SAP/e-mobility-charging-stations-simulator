import ChargingStation from '../ChargingStation';
import { IncomingRequestCommand } from '../../types/ocpp/Requests';
import { JsonType } from '../../types/JsonType';
import getLogger from '../../utils/Logger';

export default abstract class OCPPIncomingRequestService {
  protected chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    this.chargingStation = chargingStation;
  }

  protected handleIncomingRequestError<T>(commandName: IncomingRequestCommand, error: Error, errorOcppResponse?: T): T {
    getLogger().error(this.chargingStation.logPrefix() + ' Incoming request command %s error: %j', commandName, error);
    if (errorOcppResponse) {
      return errorOcppResponse;
    }
    throw error;
  }

  public abstract handleRequest(messageId: string, commandName: IncomingRequestCommand, commandPayload: JsonType): Promise<void>;
}
