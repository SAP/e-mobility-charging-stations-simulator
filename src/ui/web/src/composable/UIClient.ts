import config from '@/assets/config';
import { JsonType } from '@/type/JsonType';
import { SimulatorUI } from '@/type/SimulatorUI';
import { ProcedureName } from '@/type/UIProtocol';
import { v4 as uuidv4 } from 'uuid';
import Utils from './Utils';

export default class UIClient {
  private static _instance: UIClient | null = null;

  private _ws: WebSocket;
  private _responseHandlers: Map<
    string,
    {
      resolve: (value: JsonType | PromiseLike<JsonType>) => void;
      reject: (reason?: any) => void;
    }
  >;
  private _toBeSent: Array<string>;

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
    this._toBeSent = [];

    this._ws.onopen = this.handleOpen.bind(this);
    this._ws.onmessage = this.handleMessage.bind(this);
  }

  public static get instance() {
    return UIClient._instance || (UIClient._instance = new UIClient());
  }

  public async listChargingStations(): Promise<SimulatorUI[]> {
    console.debug('listChargingStations');

    const list = await this.send(ProcedureName.LIST_CHARGING_STATIONS, {});

    return list as SimulatorUI[];
  }

  public async startTransaction(hashId: string, connectorId: number, idTag: string): Promise<void> {
    console.debug('startTransaction');

    const _ = await this.send(ProcedureName.START_TRANSACTION, {
      hashId,
      connectorId,
      idTag,
      command: ProcedureName.START_TRANSACTION,
    });
  }

  public async stopTransaction(hashId: string, connectorId: number): Promise<void> {
    console.debug('stopTransaction');

    const _ = await this.send(ProcedureName.STOP_TRANSACTION, {
      hashId,
      connectorId,
      command: ProcedureName.STOP_TRANSACTION,
    });
  }

  private setHandler(
    id: string,
    resolve: (value: JsonType | PromiseLike<JsonType>) => void,
    reject: (reason?: any) => void
  ) {
    this._responseHandlers.set(id, { resolve, reject });
  }

  private getHandler(id: string) {
    return this._responseHandlers.get(id);
  }

  private async send(command: ProcedureName, data: JsonType): Promise<JsonType> {
    return new Promise((resolve, reject) => {
      const uuid = uuidv4();
      const msg = JSON.stringify([uuid, command, data]);

      if (this._ws.readyState === this._ws.OPEN) {
        console.debug('send:', msg);
        this._ws.send(msg);
      } else {
        this._toBeSent.push(msg);
      }

      this.setHandler(uuid, resolve, reject);
    });
  }

  private handleOpen(ev: Event): void {
    this._toBeSent.forEach((msg) => {
      this._ws.send(msg);
    });
  }

  private handleMessage(ev: MessageEvent<any>): void {
    const data = JSON.parse(ev.data);

    if (Utils.isIterable(data) === false) {
      throw new Error('Message not iterable: ' + JSON.stringify(data, null, 2));
    }

    const [uuid, response] = data;

    let messageHandler;
    if (this._responseHandlers.has(uuid) === true) {
      messageHandler = this.getHandler(uuid);
    } else {
      throw new Error('Message not a response/timed out: ' + JSON.stringify(data, null, 2));
    }

    messageHandler?.resolve(response);
  }
}
