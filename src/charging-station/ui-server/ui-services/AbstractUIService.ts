import { RawData } from 'ws';

import BaseError from '../../../exception/BaseError';
import { JsonType } from '../../../types/JsonType';
import {
  ProcedureName,
  ProtocolRequest,
  ProtocolRequestHandler,
  ProtocolResponse,
  ProtocolVersion,
  RequestPayload,
  ResponsePayload,
  ResponseStatus,
} from '../../../types/UIProtocol';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';
import Bootstrap from '../../Bootstrap';
import UIServiceWorkerBroadcastChannel from '../../UIServiceWorkerBroadcastChannel';
import { AbstractUIServer } from '../AbstractUIServer';

const moduleName = 'AbstractUIService';

export default abstract class AbstractUIService {
  protected readonly version: ProtocolVersion;
  protected readonly uiServer: AbstractUIServer;
  protected readonly requestHandlers: Map<ProcedureName, ProtocolRequestHandler>;
  protected uiServiceWorkerBroadcastChannel: UIServiceWorkerBroadcastChannel;

  constructor(uiServer: AbstractUIServer, version: ProtocolVersion) {
    this.version = version;
    this.uiServer = uiServer;
    this.requestHandlers = new Map<ProcedureName, ProtocolRequestHandler>([
      [ProcedureName.LIST_CHARGING_STATIONS, this.handleListChargingStations.bind(this)],
      [ProcedureName.START_SIMULATOR, this.handleStartSimulator.bind(this)],
      [ProcedureName.STOP_SIMULATOR, this.handleStopSimulator.bind(this)],
    ]);
    this.uiServiceWorkerBroadcastChannel = new UIServiceWorkerBroadcastChannel(this);
  }

  public async requestHandler(request: RawData): Promise<void> {
    let messageId: string;
    let command: ProcedureName;
    let requestPayload: RequestPayload | undefined;
    let responsePayload: ResponsePayload;
    try {
      [messageId, command, requestPayload] = this.requestValidation(request);

      if (this.requestHandlers.has(command) === false) {
        throw new BaseError(
          `${command} is not implemented to handle message payload ${JSON.stringify(
            requestPayload,
            null,
            2
          )}`
        );
      }

      // Call the request handler to build the response payload
      responsePayload = await this.requestHandlers.get(command)(messageId, requestPayload);
    } catch (error) {
      // Log
      logger.error(
        `${this.uiServer.logPrefix(moduleName, 'messageHandler')} Handle request error:`,
        error
      );
      responsePayload = {
        status: ResponseStatus.FAILURE,
        command,
        requestPayload,
        responsePayload,
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack,
      };
    }

    if (responsePayload !== undefined) {
      // Send the response
      this.uiServer.sendResponse(this.buildProtocolResponse(messageId ?? 'error', responsePayload));
    }
  }

  public sendRequest(
    messageId: string,
    procedureName: ProcedureName,
    requestPayload: RequestPayload
  ): void {
    this.uiServer.sendRequest(this.buildProtocolRequest(messageId, procedureName, requestPayload));
  }

  public sendResponse(messageId: string, responsePayload: ResponsePayload): void {
    this.uiServer.sendResponse(this.buildProtocolResponse(messageId, responsePayload));
  }

  public logPrefix(modName: string, methodName: string): string {
    return this.uiServer.logPrefix(modName, methodName);
  }

  private buildProtocolRequest(
    messageId: string,
    procedureName: ProcedureName,
    requestPayload: RequestPayload
  ): string {
    return JSON.stringify([messageId, procedureName, requestPayload] as ProtocolRequest);
  }

  private buildProtocolResponse(messageId: string, responsePayload: ResponsePayload): string {
    return JSON.stringify([messageId, responsePayload] as ProtocolResponse);
  }

  // Validate the raw data received from the WebSocket
  // TODO: should probably be moved to the ws verify clients callback
  private requestValidation(rawData: RawData): ProtocolRequest {
    // logger.debug(
    //   `${this.uiServer.logPrefix(
    //     moduleName,
    //     'dataValidation'
    //   )} Raw data received: ${rawData.toString()}`
    // );

    const data = JSON.parse(rawData.toString()) as JsonType[];

    if (Utils.isIterable(data) === false) {
      throw new BaseError('UI protocol request is not iterable');
    }

    if (data.length !== 3) {
      throw new BaseError('UI protocol request is malformed');
    }

    return data as ProtocolRequest;
  }

  private handleListChargingStations(): ResponsePayload {
    // TODO: remove cast to unknown
    return {
      status: ResponseStatus.SUCCESS,
      ...Array.from(this.uiServer.chargingStations.values()),
    } as unknown as ResponsePayload;
  }

  private async handleStartSimulator(): Promise<ResponsePayload> {
    await Bootstrap.getInstance().start();
    return { status: ResponseStatus.SUCCESS };
  }

  private async handleStopSimulator(): Promise<ResponsePayload> {
    await Bootstrap.getInstance().stop();
    return { status: ResponseStatus.SUCCESS };
  }
}
