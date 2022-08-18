import { JsonType } from '../../types/JsonType';
import { RequestCommand } from '../../types/ocpp/Requests';
import type ChargingStation from '../ChargingStation';

const moduleName = 'OCPPResponseService';

export default abstract class OCPPResponseService {
  private static instance: OCPPResponseService | null = null;

  protected constructor() {
    // This is intentional
  }

  public static getInstance<T extends OCPPResponseService>(this: new () => T): T {
    if (!OCPPResponseService.instance) {
      OCPPResponseService.instance = new this();
    }
    return OCPPResponseService.instance as T;
  }

  public abstract responseHandler(
    chargingStation: ChargingStation,
    commandName: RequestCommand,
    payload: JsonType,
    requestPayload: JsonType
  ): Promise<void>;
}
