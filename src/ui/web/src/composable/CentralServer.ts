import { ref, Ref } from 'vue';
import config from '@/assets/config';
import { JsonArray, JsonType } from '@/type/JsonType';
import { ProtocolCommand, ProtocolRequest } from '@/../../../types/UIProtocol';
import SynchronousWS from './SynchronousWS';

export default class CentralServer {
  private static _instance: CentralServer | null = null;
  private _socket: SynchronousWS;

  private constructor() {
    this._socket = new SynchronousWS(
      `ws://${config.emobility.host}:${config.emobility.port}`,
      config.emobility.protocol
    );
  }

  public static get Instance() {
    return CentralServer._instance || (CentralServer._instance = new CentralServer());
  }

  public static async listChargingStations(): Promise<Record<string, unknown>[]> {
    console.debug('listChargingStations');
    const [command, list] = (await CentralServer.send([
      ProtocolCommand.LIST_CHARGING_STATIONS,
      {},
    ])) as ProtocolRequest;
    return list as Record<string, unknown>[];
  }

  private static async send(data: JsonType): Promise<JsonType> {
    return CentralServer.Instance._socket.send(data);
  }
}
