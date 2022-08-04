import { RawData } from 'ws';

import BaseError from '../../../exception/BaseError';
import { JsonType } from '../../../types/JsonType';
import {
  ProtocolCommand,
  ProtocolRequest,
  ProtocolRequestHandler,
  ProtocolVersion,
} from '../../../types/UIProtocol';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';
import { AbstractUIServer } from '../AbstractUIServer';

export default abstract class AbstractUIService {
  protected readonly version: ProtocolVersion;
  protected readonly uiServer: AbstractUIServer;
  protected readonly messageHandlers: Map<ProtocolCommand, ProtocolRequestHandler>;

  constructor(uiServer: AbstractUIServer, version: ProtocolVersion) {
    this.version = version;
    this.uiServer = uiServer;
    this.messageHandlers = new Map<ProtocolCommand, ProtocolRequestHandler>([
      [
        ProtocolCommand.LIST_CHARGING_STATIONS,
        this.handleListChargingStations.bind(this) as ProtocolRequestHandler,
      ],
    ]);
  }

  public async messageHandler(request: RawData): Promise<void> {
    let messageId: string;
    let command: ProtocolCommand;
    let payload: JsonType;
    const protocolRequest = JSON.parse(request.toString()) as ProtocolRequest;
    if (Utils.isIterable(protocolRequest)) {
      [messageId, command, payload] = protocolRequest;
    } else {
      throw new BaseError('UI protocol request is not iterable');
    }
    // TODO: should probably be moved to the ws verify clients callback
    if (protocolRequest.length !== 3) {
      throw new BaseError('UI protocol request is malformed');
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
    this.uiServer.sendResponse(this.buildProtocolMessage(messageId, command, messageResponse));
  }

  protected buildProtocolMessage(
    messageId: string,
    command: ProtocolCommand,
    payload: JsonType
  ): string {
    return JSON.stringify([messageId, command, payload]);
  }

  private handleListChargingStations(): JsonType {
    return Array.from(
      this.uiServer.chargingStations,
      ([_key, value]) => value as unknown as JsonType
    );
  }

  private logPrefix(): string {
    return Utils.logPrefix(' AbstractUIService |');
  }
}
