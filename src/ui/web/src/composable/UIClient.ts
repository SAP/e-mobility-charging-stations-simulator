import { JsonType } from '@/type/JsonType';
import { ProcedureName } from '@/type/UIProtocol';
import { ChargingStationData } from '@/type/ChargingStationType';
import Utils from './Utils';
import config from '@/assets/config';
import { v4 as uuidv4 } from 'uuid';

type ResponseHandler = {
  resolve: (value: JsonType | PromiseLike<JsonType>) => void;
  reject: (reason?: any) => void;
  procedureName: ProcedureName;
};

export default class UIClient {
  private static _instance: UIClient | null = null;

  private _ws: WebSocket;
  private _responseHandlers: Map<string, ResponseHandler>;

  private constructor() {
    this._ws = new WebSocket(
      `ws://${config.emobility.host}:${config.emobility.port}`,
      config.emobility.protocol
    );

    this._responseHandlers = new Map<string, ResponseHandler>();

    this._ws.onmessage = this.handleResponse.bind(this);
  }

  public static get instance() {
    if (UIClient._instance === null) {
      UIClient._instance = new UIClient();
    }
    return UIClient._instance;
  }

  public onOpen(listener: (this: WebSocket, ev: Event) => void) {
    this._ws.addEventListener('open', listener);
  }

  public async listChargingStations(): Promise<ChargingStationData[]> {
    console.debug('listChargingStations');

    const list = await this.sendRequest(ProcedureName.LIST_CHARGING_STATIONS, {});

    return list as ChargingStationData[];
  }

  public async startTransaction(hashId: string, connectorId: number, idTag: string): Promise<void> {
    console.debug('startTransaction');

    const _ = await this.sendRequest(ProcedureName.START_TRANSACTION, {
      hashId,
      connectorId,
      idTag,
    });
  }

  public async stopTransaction(hashId: string, transactionId: number): Promise<void> {
    console.debug('stopTransaction');

    const _ = await this.sendRequest(ProcedureName.STOP_TRANSACTION, {
      hashId,
      transactionId,
    });
  }

  private setResponseHandler(
    id: string,
    resolve: (value: JsonType | PromiseLike<JsonType>) => void,
    reject: (reason?: any) => void,
    procedureName: ProcedureName
  ): void {
    this._responseHandlers.set(id, { resolve, reject, procedureName });
  }

  private getResponseHandler(id: string): ResponseHandler | undefined {
    return this._responseHandlers.get(id);
  }

  private async sendRequest(command: ProcedureName, data: JsonType): Promise<JsonType> {
    let uuid: string;
    return Utils.promiseWithTimeout(
      new Promise((resolve, reject) => {
        uuid = uuidv4();
        const msg = JSON.stringify([uuid, command, data]);

        if (this._ws.readyState === this._ws.OPEN) {
          console.debug(`Send request ${command} message: `, msg);
          this._ws.send(msg);
        } else {
          throw new Error(`Send request ${command} message: connection not opened`);
        }

        this.setResponseHandler(uuid, resolve, reject, command);
      }),
      60 * 1000,
      Error(`Send request ${command} message timeout`),
      () => {
        this._responseHandlers.delete(uuid);
      }
    );
  }

  private handleResponse(ev: MessageEvent<string>): void {
    const data = JSON.parse(ev.data);

    if (Utils.isIterable(data) === false) {
      throw new Error('Response not iterable: ' + JSON.stringify(data, null, 2));
    }

    const [uuid, response] = data;

    if (this._responseHandlers.has(uuid) === true) {
      this.getResponseHandler(uuid)?.resolve(response);
    } else {
      throw new Error('Not a response to a request: ' + JSON.stringify(data, null, 2));
    }
  }
}
