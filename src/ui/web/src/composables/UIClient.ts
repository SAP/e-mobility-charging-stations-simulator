import type { JsonType } from '@/types/JsonType';
import { ProcedureName, ResponseStatus } from '@/types/UIProtocol';
import type { ProtocolResponse, ResponsePayload } from '@/types/UIProtocol';

import Utils from './Utils';
import config from '@/assets/config';
import { v4 as uuidv4 } from 'uuid';

type ResponseHandler = {
  procedureName: ProcedureName;
  resolve: (value: ResponsePayload | PromiseLike<ResponsePayload>) => void;
  reject: (reason?: any) => void;
};

export default class UIClient {
  private static _instance: UIClient | null = null;

  private _ws!: WebSocket;
  private _responseHandlers: Map<string, ResponseHandler>;

  private constructor() {
    this.openWS();
    this._responseHandlers = new Map<string, ResponseHandler>();
  }

  public static getInstance() {
    if (UIClient._instance === null) {
      UIClient._instance = new UIClient();
    }
    return UIClient._instance;
  }

  public registerWSonOpenListener(listener: (event: Event) => void) {
    this._ws.addEventListener('open', listener);
  }

  public async startSimulator(): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.START_SIMULATOR, {});
  }

  public async stopSimulator(): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.STOP_SIMULATOR, {});
  }

  public async listChargingStations(): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.LIST_CHARGING_STATIONS, {});
  }

  public async startChargingStation(hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.START_CHARGING_STATION, { hashId });
  }

  public async stopChargingStation(hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.STOP_CHARGING_STATION, { hashId });
  }

  public async openConnection(hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.OPEN_CONNECTION, {
      hashId,
    });
  }

  public async closeConnection(hashId: string): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.CLOSE_CONNECTION, {
      hashId,
    });
  }

  public async startTransaction(
    hashId: string,
    connectorId: number,
    idTag: string | undefined
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.START_TRANSACTION, {
      hashId,
      connectorId,
      idTag,
    });
  }

  public async stopTransaction(
    hashId: string,
    transactionId: number | undefined
  ): Promise<ResponsePayload> {
    return this.sendRequest(ProcedureName.STOP_TRANSACTION, {
      hashId,
      transactionId,
    });
  }

  private openWS(): void {
    this._ws = new WebSocket(
      `ws://${config.uiServer.host}:${config.uiServer.port}`,
      config.uiServer.protocol
    );
    this._ws.onmessage = this.responseHandler.bind(this);
    this._ws.onerror = (errorEvent) => {
      console.error('WebSocket error: ', errorEvent);
    };
    this._ws.onclose = (closeEvent) => {
      console.info('WebSocket close: ', closeEvent);
    };
  }

  private setResponseHandler(
    id: string,
    procedureName: ProcedureName,
    resolve: (value: ResponsePayload | PromiseLike<ResponsePayload>) => void,
    reject: (reason?: any) => void
  ): void {
    this._responseHandlers.set(id, { procedureName, resolve, reject });
  }

  private getResponseHandler(id: string): ResponseHandler | undefined {
    return this._responseHandlers.get(id);
  }

  private deleteResponseHandler(id: string): boolean {
    return this._responseHandlers.delete(id);
  }

  private async sendRequest(command: ProcedureName, data: JsonType): Promise<ResponsePayload> {
    let uuid: string;
    return Utils.promiseWithTimeout(
      new Promise((resolve, reject) => {
        uuid = uuidv4();
        const msg = JSON.stringify([uuid, command, data]);

        if (this._ws.readyState !== WebSocket.OPEN) {
          this.openWS();
        }
        if (this._ws.readyState === WebSocket.OPEN) {
          this._ws.send(msg);
        } else {
          throw new Error(`Send request ${command} message: connection not opened`);
        }

        this.setResponseHandler(uuid, command, resolve, reject);
      }),
      60 * 1000,
      Error(`Send request ${command} message timeout`),
      () => {
        this._responseHandlers.delete(uuid);
      }
    );
  }

  private responseHandler(messageEvent: MessageEvent<string>): void {
    const data = JSON.parse(messageEvent.data) as ProtocolResponse;

    if (Array.isArray(data) === false) {
      throw new Error('Response not an array: ' + JSON.stringify(data, null, 2));
    }

    const [uuid, response] = data;

    if (this._responseHandlers.has(uuid) === true) {
      switch (response.status) {
        case ResponseStatus.SUCCESS:
          this.getResponseHandler(uuid)?.resolve(response);
          break;
        case ResponseStatus.FAILURE:
          this.getResponseHandler(uuid)?.reject(response);
          break;
        default:
          console.error(`Response status not supported: ${response.status}`);
      }
      this.deleteResponseHandler(uuid);
    } else {
      throw new Error('Not a response to a request: ' + JSON.stringify(data, null, 2));
    }
  }
}
