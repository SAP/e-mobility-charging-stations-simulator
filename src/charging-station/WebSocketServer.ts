import { ProtocolCommand, ProtocolRequest, ProtocolVersion } from '../types/UIProtocol';

import AbstractUIService from './WebSocketServices/ui/AbstractUIService';
import { IncomingMessage } from 'http';
import UIService from './WebSocketServices/ui/0.0.1/UIService';
import Utils from '../utils/Utils';
import WebSocket from 'ws';
import logger from '../utils/Logger';

export default class WebSocketServer extends WebSocket.Server {
  private webSocketServerService: AbstractUIService;

  public constructor(options?: WebSocket.ServerOptions, callback?: () => void) {
    // Create the WebSocket Server
    super(options, callback);
    // FIXME: version the instantiation
    this.webSocketServerService = new UIService(this);
  }

  public broadcastToClients(message: Record<string, unknown>): void {
    for (const client of this.clients) {
      if (client?.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  public start(): void {
    this.on('connection', (socket: WebSocket, request: IncomingMessage): void => {
      // FIXME: check connection validity
      socket.on('message', (messageData) => {
        let [version, command, payload]: ProtocolRequest = [ProtocolVersion['0.0.1'], ProtocolCommand.UNKNOWN, {}];
        // FIXME: check for iterable object
        [version, command, payload] = JSON.parse(messageData.toString()) as ProtocolRequest;
        switch (version) {
          case ProtocolVersion['0.0.1']:
            this.webSocketServerService.handleMessage(command, payload).catch(() => {
              logger.error(`${this.logPrefix()} Error while handling command %s message: %j`, command, payload);
            });
            break;
          default:
            logger.error(`${this.logPrefix()} Unknown protocol version: ${version}`);
        }
      });
      socket.on('error', (error) => {
        logger.error(`${this.logPrefix()} Error on WebSocket: %j`, error);
      });
    });
  }

  public stop(): void {
    this.close();
  }

  public logPrefix(): string {
    return Utils.logPrefix('WebSocket Server:');
  }
}
