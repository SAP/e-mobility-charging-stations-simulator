import { RawData } from 'ws';

import BaseError from '../../../exception/BaseError';
import { JsonType } from '../../../types/JsonType';
import {
  ProtocolCommand,
  ProtocolRequest,
  ProtocolRequestHandler,
} from '../../../types/UIProtocol';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';
import { AbstractUIServer } from '../AbstractUIServer';

export default abstract class AbstractUIService {
  protected readonly uiServer: AbstractUIServer;
  protected readonly messageHandlers: Map<ProtocolCommand, ProtocolRequestHandler>;

  constructor(uiServer: AbstractUIServer) {
    this.uiServer = uiServer;
    this.messageHandlers = new Map<ProtocolCommand, ProtocolRequestHandler>([
      [ProtocolCommand.LIST_CHARGING_STATIONS, this.handleListChargingStations.bind(this)],
    ]);
  }

  public async messageHandler(request: RawData): Promise<void> {
    let command: ProtocolCommand;
    let payload: JsonType;
    const protocolRequest = JSON.parse(request.toString()) as ProtocolRequest;
    if (Utils.isIterable(protocolRequest)) {
      [command, payload] = protocolRequest;
    } else {
      throw new BaseError('UI protocol request is not iterable');
    }
    let messageResponse: JsonType;
    if (this.messageHandlers.has(command)) {
      try {
        // Call the message handler to build the message response
        messageResponse = (await this.messageHandlers.get(command)(payload)) as JsonType;
      } catch (error) {
        // Log
        logger.error(this.uiServer.logPrefix() + ' Handle message error: %j', error);
        throw error;
      }
    } else {
      // Throw exception
      throw new BaseError(
        `${command} is not implemented to handle message payload ${JSON.stringify(
          payload,
          null,
          2
        )}`
      );
    }
    // Send the message response
    this.uiServer.sendResponse(this.buildProtocolMessage(command, messageResponse));
  }

  protected buildProtocolMessage(command: ProtocolCommand, payload: JsonType): string {
    return JSON.stringify([command, payload]);
  }

  private handleListChargingStations(): JsonType {
    return Array.from(this.uiServer.chargingStations);
  }
}
