import { ProtocolCommand, ProtocolRequestHandler } from '../../types/UIProtocol';

import BaseError from '../../exception/BaseError';
import { JsonType } from '../../types/JsonType';
import UIWebSocketServer from '../UIWebSocketServer';
import Utils from '../../utils/Utils';
import logger from '../../utils/Logger';

export default abstract class AbstractUIService {
  protected readonly uiWebSocketServer: UIWebSocketServer;
  protected readonly messageHandlers: Map<ProtocolCommand, ProtocolRequestHandler>;

  constructor(uiWebSocketServer: UIWebSocketServer) {
    this.uiWebSocketServer = uiWebSocketServer;
    this.messageHandlers = new Map<ProtocolCommand, ProtocolRequestHandler>([
      [ProtocolCommand.LIST_CHARGING_STATIONS, this.handleListChargingStations],
    ]);
  }

  public async messageHandler(command: ProtocolCommand, payload: JsonType): Promise<void> {
    let messageResponse: JsonType;
    if (this.messageHandlers.has(command)) {
      try {
        // Call the method to build the message response
        messageResponse = (await this.messageHandlers.get(command)(payload)) as JsonType;
      } catch (error) {
        // Log
        logger.error(this.uiWebSocketServer.logPrefix() + ' Handle message error: %j', error);
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
    logger.debug(messageResponse);
    // Send the built message response
    this.uiWebSocketServer.broadcastToClients(this.buildProtocolMessage(command, messageResponse));
  }

  protected buildProtocolMessage(command: ProtocolCommand, payload: JsonType): string {
    return JSON.stringify([command, payload]);
  }

  private handleListChargingStations = (): JsonType =>
    Array.from(
      this.uiWebSocketServer.chargingStations,
      ([_key, value]) => value as unknown as JsonType
    );

  private logPrefix(): string {
    return Utils.logPrefix(' AbstractUIService |');
  }
}
