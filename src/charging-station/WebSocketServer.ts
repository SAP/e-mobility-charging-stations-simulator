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
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.on('connection', (socket: WebSocket, request: IncomingMessage): void => {
      // Check connection validity
    });
    this.on('message', (messageData) => {
      let [version, command, payload]: ProtocolRequest = [ProtocolVersion['0.0.1'], ProtocolCommand.UNKNOWN, {}];
      // FIXME: check for iterable object
      [version, command, payload] = JSON.parse(messageData.toString()) as ProtocolRequest;
      switch (version) {
        case ProtocolVersion['0.0.1']:
          self.webSocketServerService.handleMessage(command, payload).catch(() => { });
          break;
        default:
          logger.error(`${this.logPrefix()} Unknown protocol version: ${version}`);
      }
    });
  }

  public stop(): void {
    this.close();
  }

  public logPrefix(): string {
    return Utils.logPrefix('WebSocket Server:');
  }
}
