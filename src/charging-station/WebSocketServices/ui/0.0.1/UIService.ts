import { ProtocolCommand, ProtocolRequestHandler } from '../../../../types/UIProtocol';

import AbstractUIService from '../AbstractUIService';
import BaseError from '../../../../exception/BaseError';
import WebSocketServer from '../../../WebSocketServer';
import logger from '../../../../utils/Logger';

export default class UIService extends AbstractUIService {
  private readonly messageHandlers: Map<ProtocolCommand, ProtocolRequestHandler>;

  constructor(webSocketServer: WebSocketServer) {
    super(webSocketServer);
    this.messageHandlers = new Map<ProtocolCommand, ProtocolRequestHandler>([
      [ProtocolCommand.START_TRANSACTION, this.handleStartTransaction.bind(this)],
      [ProtocolCommand.STOP_TRANSACTION, this.handleStopTransaction.bind(this)],
    ]);
  }

  async handleMessage(command: ProtocolCommand, payload: Record<string, unknown>): Promise<void> {
    let messageResponse: Record<string, unknown>;
    if (this.messageHandlers.has(command)) {
      try {
        // Call the method to build the response
        messageResponse = await this.messageHandlers.get(command)(payload);
      } catch (error) {
        // Log
        logger.error(this.webSocketServer.logPrefix() + ' Handle request error: %j', error);
        throw error;
      }
    } else {
      // Throw exception
      throw new BaseError(`${command} is not implemented to handle message payload ${JSON.stringify(payload, null, 2)}`);
    }
    // Send the built response
    this.webSocketServer.broadcastToClients(messageResponse);
  }

  private handleStartTransaction(payload: Record<string, unknown>) { }
  private handleStopTransaction(payload: Record<string, unknown>) { }
}
