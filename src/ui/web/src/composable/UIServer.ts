import { ProcedureName, ProtocolRequest, ProtocolResponse } from '@/type/UIProtocol';

import { JsonType } from '@/type/JsonType';
import { SimulatorUI } from '@/type/SimulatorUI';
import Utils from './Utils';
import config from '@/assets/config';
import { toNumber } from '@vue/shared';
import { v4 as uuidv4 } from 'uuid';

export default class UIServer {
  private static _instance: UIServer | null = null;

  private _server: WebSocket;
  private _responseHandler: Map<
    string,
    {
      resolve: (value: JsonType | PromiseLike<JsonType>) => void;
      reject: (reason?: any) => void;
    }
  >;
  private _toBeSent: Array<string>;

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
    this._toBeSent = [];

    this._server.onopen = () => {
      if (this._toBeSent.length > 0) {
        this._toBeSent.forEach((msg) => this._server.send(msg));
      }
    };
    this._server.onmessage = UIServer.handleMessage;
  }

  public static get Instance() {
    return UIServer._instance || (UIServer._instance = new UIServer());
  }

  public static async listChargingStations(): Promise<SimulatorUI[]> {
    console.debug('listChargingStations');

    const list = await UIServer.send(ProcedureName.LIST_CHARGING_STATIONS, {});

    return list as unknown as SimulatorUI[];
  }

  public static async startTransaction(
    hashId: string,
    connectorId: number,
    idTag: string
  ): Promise<void> {
    console.debug('startTransaction');

    const _ = await UIServer.send(ProcedureName.START_TRANSACTION, {
      hashId,
      connectorId,
      idTag,
      command: ProcedureName.START_TRANSACTION,
    });
  }

  public static async stopTransaction(hashId: string, connectorId: number): Promise<void> {
    console.debug('stopTransaction');

    const _ = await UIServer.send(ProcedureName.STOP_TRANSACTION, {
      hashId,
      connectorId,
      command: ProcedureName.STOP_TRANSACTION,
    });
  }

  private static get Server() {
    return UIServer.Instance._server;
  }

  private static setHandler(
    id: string,
    resolve: (value: JsonType | PromiseLike<JsonType>) => void,
    reject: (reason?: any) => void
  ) {
    UIServer.Instance._responseHandler.set(id, { resolve, reject });
  }
  private static getHandler(id: string) {
    return UIServer.Instance._responseHandler.get(id);
  }

  private static async send(command: ProcedureName, data: JsonType): Promise<JsonType> {
    return new Promise((resolve, reject) => {
      const uuid = uuidv4();
      const msg = JSON.stringify([uuid, command, data]);

      if (UIServer.Server.readyState !== UIServer.Server.OPEN) {
        UIServer.Instance._toBeSent.push(msg);
      } else {
        console.debug('send:', msg);
        UIServer.Server.send(msg);
      }

      UIServer.setHandler(uuid, resolve, reject);
    });
  }

  private static handleMessage(ev: MessageEvent<any>): void {
    const data = JSON.parse(ev.data);

    if (Utils.isIterable(data) === false) {
      console.error('message not iterable:', data);
    }

    const [uuid, response] = data as ProtocolResponse;

    const messageHandler = UIServer.getHandler(uuid);
    if (Utils.isUndefined(messageHandler)) {
      console.error('message not a response/timed out:', data);
    }

    messageHandler?.resolve(response);
  }
}
