import ChargingStation from '../ChargingStation';
import { JsonType } from '../../types/JsonType';
import { RequestCommand } from '../../types/ocpp/Requests';

export default abstract class OCPPResponseService {
  protected chargingStation: ChargingStation;

  constructor(chargingStation: ChargingStation) {
    this.chargingStation = chargingStation;
  }

  public abstract handleResponse(commandName: RequestCommand, payload: JsonType | string, requestPayload: JsonType): Promise<void>;
}
