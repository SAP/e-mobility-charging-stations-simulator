import config from '@/assets/config';
import { JsonArray } from '@/type/JsonType';
import { SimulatorUI } from '@/type/SimulatorUI';
import { CommandCode, ProtocolMessage } from '@/type/UIProtocol';
import { v4 as uuidv4 } from 'uuid';
import Utils from './Utils';

export default class UIServer {
  private static _instance: UIServer | null = null;

  private _server: WebSocket;
  private _responseHandler: Map<
    string,
    {
      resolve: (value: JsonArray | PromiseLike<JsonArray>) => void;
      reject: (reason?: any) => void;
    }
  >;

  private constructor() {
    this._server = new WebSocket(
      `ws://${config.emobility.host}:${config.emobility.port}`,
      config.emobility.protocol
    );

    this._responseHandler = new Map<
      string,
      {
        resolve: (value: unknown | PromiseLike<unknown>) => void;
        reject: (reason?: any) => void;
      }
    >();

    this._server.onmessage = UIServer.handleMessage;
  }

  public static get Instance() {
    return UIServer._instance || (UIServer._instance = new UIServer());
  }

  public static async listChargingStations(): Promise<SimulatorUI[]> {
    console.debug('listChargingStations');

    const [_, list] = (await UIServer.send([
      CommandCode.LIST_CHARGING_STATIONS,
      {},
    ])) as ProtocolMessage;

    return list as unknown as SimulatorUI[];
  }

  public static async startTransaction(
    hashId: string,
    connectorId: number,
    idTag: string
  ): Promise<void> {
    console.debug('startTransaction');

    const [_] = (await UIServer.send([
      CommandCode.START_TRANSACTION,
      { hashId, connectorId, idTag, command: CommandCode.START_TRANSACTION },
    ])) as ProtocolMessage;

    // return list as Record<string, unknown>[];
  }

  public static async stopTransaction(hashId: string, connectorId: number): Promise<void> {
    console.debug('stopTransaction');

    const _ = (await UIServer.send([
      CommandCode.STOP_TRANSACTION,
      { hashId, connectorId, command: CommandCode.STOP_TRANSACTION },
    ])) as ProtocolMessage;

    // return list as Record<string, unknown>[];
  }

  private static get Server() {
    return UIServer.Instance._server;
  }

  private static setHandler(
    id: string,
    resolve: (value: JsonArray | PromiseLike<JsonArray>) => void,
    reject: (reason?: any) => void
  ) {
    UIServer.Instance._responseHandler.set(id, { resolve, reject });
  }
  private static getHandler(id: string) {
    return UIServer.Instance._responseHandler.get(id);
  }

  private static async send(data: JsonArray): Promise<JsonArray> {
    return new Promise((resolve, reject) => {
      const uuid = uuidv4();
      const msg = JSON.stringify([uuid, ...data]);

      console.debug('send:', msg);
      UIServer.Server.send(msg);

      UIServer.setHandler(uuid, resolve, reject);
    });
  }

  private static handleMessage(ev: MessageEvent<any>): void {
    const data = JSON.parse(ev.data);

    if (Utils.isIterable(data) === false) {
      console.error('message not iterable:', data);
    }

    const [uuid, ...response] = data as ProtocolMessage;

    const messageHandler = this.getHandler(uuid);
    if (Utils.isUndefined(messageHandler)) {
      console.error('message not a response/timed out:', data);
    }

    messageHandler?.resolve(response);
  }
}
