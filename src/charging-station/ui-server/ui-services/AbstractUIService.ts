import { RawData } from 'ws';

import BaseError from '../../../exception/BaseError';
import { JsonType } from '../../../types/JsonType';
import {
  ProcedureName,
  ProtocolRequest,
  ProtocolRequestHandler,
  ProtocolResponse,
  ProtocolVersion,
} from '../../../types/UIProtocol';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';
import WorkerBroadcastChannel from '../../WorkerBroadcastChannel';
import { AbstractUIServer } from '../AbstractUIServer';

const moduleName = 'AbstractUIService';

export default abstract class AbstractUIService {
  protected readonly version: ProtocolVersion;
  protected readonly uiServer: AbstractUIServer;
  protected readonly messageHandlers: Map<ProcedureName, ProtocolRequestHandler>;
  protected workerBroadcastChannel: WorkerBroadcastChannel;

  constructor(uiServer: AbstractUIServer, version: ProtocolVersion) {
    this.version = version;
    this.uiServer = uiServer;
    this.messageHandlers = new Map<ProcedureName, ProtocolRequestHandler>([
      [ProcedureName.LIST_CHARGING_STATIONS, this.handleListChargingStations.bind(this)],
    ]);
    this.workerBroadcastChannel = new WorkerBroadcastChannel();
  }

  public async messageHandler(request: RawData): Promise<void> {
    const [messageId, command, payload] = this.dataValidation(request);

    if (this.messageHandlers.has(command) === false) {
      // Throw exception
      throw new BaseError(
        `${command} is not implemented to handle message payload ${JSON.stringify(
          payload,
          null,
          2
        )}`
      );
    }

    let responsePayload: JsonType;
    try {
      // Call the message handler to build the message response
      responsePayload = (await this.messageHandlers.get(command)(payload)) as JsonType;
    } catch (error) {
      // Log
      logger.error(
        `${this.uiServer.logPrefix(moduleName, 'messageHandler')} Handle message error: %j`,
        error
      );
      throw error;
    }

    // Send the message response
    this.uiServer.sendResponse(this.buildProtocolResponse(messageId, responsePayload));
  }

  protected buildProtocolResponse(messageId: string, payload: JsonType): string {
    return JSON.stringify([messageId, payload] as ProtocolResponse);
  }

  // Validate the raw data received from the WebSocket
  // TODO: should probably be moved to the ws verify clients callback
  private dataValidation(rawData: RawData): ProtocolRequest {
    logger.debug(
      `${this.uiServer.logPrefix(moduleName, 'dataValidation')} Raw data = ${rawData.toString()}`
    );
    const data = JSON.parse(rawData.toString()) as JsonType[];

    if (Utils.isIterable(data) === false) {
      throw new BaseError('UI protocol request is not iterable');
    }

    if (data.length !== 3) {
      throw new BaseError('UI protocol request is malformed');
    }

    const [, procedureName] = data as ProtocolRequest;

    if (Object.values(ProcedureName).includes(procedureName) === false) {
      throw new BaseError('UI protocol request with unknown procedure name');
    }

    return data as ProtocolRequest;
  }

  private handleListChargingStations(): JsonType {
    return Array.from(this.uiServer.chargingStations.values()) as JsonType;
  }
}
