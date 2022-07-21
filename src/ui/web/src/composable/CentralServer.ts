import config from '@/assets/config';
import { JsonArray } from '@/type/JsonType';
import { SimulatorUI } from '@/type/SimulatorUI';
import { CommandCode, ProtocolCommand } from '@/type/UIProtocol';
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

  public static async listChargingStations(): Promise<SimulatorUI[]> {
    console.debug('listChargingStations');

    const [_, list] = (await CentralServer.send([
      CommandCode.LIST_CHARGING_STATIONS,
      {},
    ])) as ProtocolCommand;

    return list as unknown as SimulatorUI[];
  }

  public static async startTransaction(
    hashId: string,
    connectorId: number,
    idTag: string
  ): Promise<void> {
    console.debug('startTransaction');

    const [_] = (await CentralServer.send([
      CommandCode.START_TRANSACTION,
      { hashId, connectorId, idTag, command: CommandCode.START_TRANSACTION },
    ])) as ProtocolCommand;

    // return list as Record<string, unknown>[];
  }

  public static async stopTransaction(hashId: string, connectorId: number): Promise<void> {
    console.debug('stopTransaction');

    const _ = (await CentralServer.send([
      CommandCode.STOP_TRANSACTION,
      { hashId, connectorId, command: CommandCode.STOP_TRANSACTION },
    ])) as ProtocolCommand;

    // return list as Record<string, unknown>[];
  }

  private static async send(data: JsonArray): Promise<JsonArray> {
    return CentralServer.Instance._socket.send(data);
  }
}
