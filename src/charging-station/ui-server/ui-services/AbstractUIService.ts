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
import WorkerBroadcastChannel from '../../WorkerBroadcastChannel';
import { AbstractUIServer } from '../AbstractUIServer';

const moduleName = 'AbstractUIService';

export default abstract class AbstractUIService {
  protected readonly version: ProtocolVersion;
  protected readonly uiServer: AbstractUIServer;
  protected readonly requestHandlers: Map<ProcedureName, ProtocolRequestHandler>;
  protected workerBroadcastChannel: WorkerBroadcastChannel;

  constructor(uiServer: AbstractUIServer, version: ProtocolVersion) {
    this.version = version;
    this.uiServer = uiServer;
    this.requestHandlers = new Map<ProcedureName, ProtocolRequestHandler>([
      [ProcedureName.LIST_CHARGING_STATIONS, this.handleListChargingStations.bind(this)],
      [ProcedureName.START_SIMULATOR, this.handleStartSimulator.bind(this)],
      [ProcedureName.STOP_SIMULATOR, this.handleStopSimulator.bind(this)],
    ]);
    this.workerBroadcastChannel = new WorkerBroadcastChannel();
  }

  public async requestHandler(request: RawData): Promise<void> {
    let messageId: string;
    let command: ProcedureName;
    let requestPayload: RequestPayload;
    let responsePayload: ResponsePayload;
    try {
      [messageId, command, requestPayload] = this.dataValidation(request);

      if (this.requestHandlers.has(command) === false) {
        throw new BaseError(
          `${command} is not implemented to handle message payload ${JSON.stringify(
            requestPayload,
            null,
            2
          )}`
        );
      }

      // Call the message handler to build the response payload
      responsePayload = await this.requestHandlers.get(command)(messageId, requestPayload);
    } catch (error) {
      // Log
      logger.error(
        `${this.uiServer.logPrefix(moduleName, 'messageHandler')} Handle message error:`,
        error
      );
      // Send the message response failure
      this.uiServer.sendResponse(
        this.buildProtocolResponse(messageId ?? 'error', {
          status: ResponseStatus.FAILURE,
          command,
          requestPayload,
          errorMessage: (error as Error).message,
          errorStack: (error as Error).stack,
        })
      );
      throw error;
    }

    // Send the message response success
    this.uiServer.sendResponse(this.buildProtocolResponse(messageId, responsePayload));
  }

  protected buildProtocolRequest(
    messageId: string,
    procedureName: ProcedureName,
    payload: RequestPayload
  ): string {
    return JSON.stringify([messageId, procedureName, payload] as ProtocolRequest);
  }

  protected buildProtocolResponse(messageId: string, payload: ResponsePayload): string {
    return JSON.stringify([messageId, payload] as ProtocolResponse);
  }

  // Validate the raw data received from the WebSocket
  // TODO: should probably be moved to the ws verify clients callback
  private dataValidation(rawData: RawData): ProtocolRequest {
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
