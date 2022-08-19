import { RawData } from 'ws';

import BaseError from '../../../exception/BaseError';
import { JsonType } from '../../../types/JsonType';
import {
  ProcedureName,
  ProtocolRequest,
  ProtocolRequestHandler,
  ProtocolVersion,
} from '../../../types/UIProtocol';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';
import WorkerChannel from '../../WorkerChannel';
import { AbstractUIServer } from '../AbstractUIServer';

export default abstract class AbstractUIService {
  protected readonly version: ProtocolVersion;
  protected readonly uiServer: AbstractUIServer;
  protected readonly messageHandlers: Map<ProcedureName, ProtocolRequestHandler>;
  protected channel: WorkerChannel;

  constructor(uiServer: AbstractUIServer, version: ProtocolVersion) {
    this.version = version;
    this.uiServer = uiServer;
    this.messageHandlers = new Map<ProcedureName, ProtocolRequestHandler>([
      [
        ProcedureName.LIST_CHARGING_STATIONS,
        this.handleListChargingStations.bind(this) as ProtocolRequestHandler,
      ],
    ]);
    this.channel = new WorkerChannel();
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

    let messageResponse: JsonType;

    try {
      // Call the message handler to build the message response
      messageResponse = (await this.messageHandlers.get(command)(payload)) as JsonType;
    } catch (error) {
      // Log
      logger.error(this.uiServer.logPrefix() + ' Handle message error: %j', error);
      throw error;
    }

    // Send the message response
    this.uiServer.sendResponse(this.buildProtocolResponse(messageId, messageResponse));
  }

  protected buildProtocolResponse(messageId: string, payload: JsonType): string {
    return JSON.stringify([messageId, payload]);
  }

  // Validate the RawData received from the websocket
  private dataValidation(rdata: RawData): ProtocolRequest {
    let data = JSON.parse(rdata.toString()) as JsonType;
    logger.debug(`${this.uiServer.logPrefix()} UI message received | ${rdata.toString()}`);

    if (Utils.isIterable(data) === false) {
      throw new BaseError('UI protocol request is not iterable');
    }

    data = data as JsonType[];

    // TODO: should probably be moved to the ws verify clients callback
    if (data.length !== 3) {
      throw new BaseError('UI protocol request is malformed');
    }

    switch (data[1]) {
      case ProcedureName.LIST_CHARGING_STATIONS:
      case ProcedureName.START_TRANSACTION:
      case ProcedureName.STOP_TRANSACTION:
        break;
      default:
        throw new BaseError('UI protocol request is malformed');
    }

    return data as ProtocolRequest;
  }

  private handleListChargingStations(): JsonType {
    return Array.from(
      this.uiServer.chargingStations,
      ([_key, value]) => value as unknown as JsonType
    );
  }
}
