import config from '@/assets/config';
import { JsonArray } from '@/type/JsonType';
import { SimulatorUI } from '@/type/SimulatorUI';
import { CommandCode, ProtocolMessage } from '@/type/UIProtocol';
import { v4 as uuidv4 } from 'uuid';
import Utils from './Utils';

export default class UIClient {
  private static _instance: UIClient | null = null;

  private _ws: WebSocket;
  private _responseHandlers: Map<
    string,
    {
      resolve: (value: JsonArray | PromiseLike<JsonArray>) => void;
      reject: (reason?: any) => void;
    }
  >;

  private constructor() {
    this._ws = new WebSocket(
      `ws://${config.emobility.host}:${config.emobility.port}`,
      config.emobility.protocol
    );

    this._responseHandlers = new Map<
      string,
      {
        resolve: (value: unknown | PromiseLike<unknown>) => void;
        reject: (reason?: any) => void;
      }
    >();

    this._ws.onmessage = this.handleMessage;
  }

  public static get instance() {
    return UIClient._instance || (UIClient._instance = new UIClient());
  }

  public async listChargingStations(): Promise<SimulatorUI[]> {
    console.debug('listChargingStations');

    const [_, list] = (await this.send([
      CommandCode.LIST_CHARGING_STATIONS,
      {},
    ])) as ProtocolMessage;

    return list as unknown as SimulatorUI[];
  }

  public async startTransaction(hashId: string, connectorId: number, idTag: string): Promise<void> {
    console.debug('startTransaction');

    const [_] = (await this.send([
      CommandCode.START_TRANSACTION,
      { hashId, connectorId, idTag, command: CommandCode.START_TRANSACTION },
    ])) as ProtocolMessage;

    // return list as Record<string, unknown>[];
  }

  public async stopTransaction(hashId: string, connectorId: number): Promise<void> {
    console.debug('stopTransaction');

    const _ = (await this.send([
      CommandCode.STOP_TRANSACTION,
      { hashId, connectorId, command: CommandCode.STOP_TRANSACTION },
    ])) as ProtocolMessage;

    // return list as Record<string, unknown>[];
  }

  private get server() {
    return this._ws;
  }

  private setHandler(
    id: string,
    resolve: (value: JsonArray | PromiseLike<JsonArray>) => void,
    reject: (reason?: any) => void
  ) {
    this._responseHandlers.set(id, { resolve, reject });
  }
  private getHandler(id: string) {
    return this._responseHandlers.get(id);
  }

  private async send(data: JsonArray): Promise<JsonArray> {
    return new Promise((resolve, reject) => {
      const uuid = uuidv4();
      const msg = JSON.stringify([uuid, ...data]);

      console.debug('send:', msg);
      this.server.send(msg);

      this.setHandler(uuid, resolve, reject);
    });
  }

  private handleMessage(ev: MessageEvent<any>): void {
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
