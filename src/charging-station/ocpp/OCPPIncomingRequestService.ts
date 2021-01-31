import ChargingStation from '../ChargingStation';
import { IncomingRequestCommand } from '../../types/ocpp/Requests';

export default abstract class OCPPIncomingRequestService {
  protected chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    this.chargingStation = chargingStation;
  }

  public abstract handleRequest(messageId: string, commandName: IncomingRequestCommand, commandPayload: Record<string, unknown>): Promise<void>;
}
