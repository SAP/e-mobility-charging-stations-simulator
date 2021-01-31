import ChargingStation from '../ChargingStation';
import { RequestCommand } from '../../types/ocpp/Requests';

export default abstract class OCPPResponseService {
  protected chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    this.chargingStation = chargingStation;
  }

  public abstract handleResponse(commandName: RequestCommand, payload: Record<string, unknown> | string, requestPayload: Record<string, unknown>): Promise<void>;
}
