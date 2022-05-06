import type ChargingStation from '../ChargingStation';
import { JsonObject } from '../../types/JsonType';
import { RequestCommand } from '../../types/ocpp/Requests';

export default abstract class OCPPResponseService {
  private static readonly instances: Map<string, OCPPResponseService> = new Map<
    string,
    OCPPResponseService
  >();

  protected readonly chargingStation: ChargingStation;

  protected constructor(chargingStation: ChargingStation) {
    this.chargingStation = chargingStation;
  }

  public static getInstance<T extends OCPPResponseService>(
    this: new (chargingStation: ChargingStation) => T,
    chargingStation: ChargingStation
  ): T {
    if (!OCPPResponseService.instances.has(chargingStation.hashId)) {
      OCPPResponseService.instances.set(chargingStation.hashId, new this(chargingStation));
    }
    return OCPPResponseService.instances.get(chargingStation.hashId) as T;
  }

  public abstract responseHandler(
    commandName: RequestCommand,
    payload: JsonObject,
    requestPayload: JsonObject
  ): Promise<void>;
}
