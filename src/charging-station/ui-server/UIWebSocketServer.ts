import { Protocol, ProtocolVersion } from '../../types/UIProtocol';

import { AbstractUIServer } from './AbstractUIServer';
import Configuration from '../../utils/Configuration';
import { IncomingMessage } from 'http';
import { ServerOptions } from '../../types/ConfigurationData';
import UIServiceFactory from './ui-services/UIServiceFactory';
import Utils from '../../utils/Utils';
import WebSocket from 'ws';
import logger from '../../utils/Logger';

export default class UIWebSocketServer extends AbstractUIServer {
  public constructor(options?: ServerOptions) {
    super();
    this.server = new WebSocket.Server(options ?? Configuration.getUIServer().options);
  }

  public start(): void {
    this.server.on('connection', (socket: WebSocket, request: IncomingMessage): void => {
      const protocolIndex = socket.protocol.indexOf(Protocol.UI);
      const version = socket.protocol.substring(
        protocolIndex + Protocol.UI.length
      ) as ProtocolVersion;
      if (!this.uiServices.has(version)) {
        this.uiServices.set(version, UIServiceFactory.getUIServiceImplementation(version, this));
      }
      // FIXME: check connection validity
      socket.on('message', (messageData) => {
        this.uiServices
          .get(version)
          .messageHandler(messageData)
          .catch(() => {
            logger.error(`${this.logPrefix()} Error while handling message data: %j`, messageData);
          });
      });
      socket.on('error', (error) => {
        logger.error(`${this.logPrefix()} Error on WebSocket: %j`, error);
      });
    });
  }

  public stop(): void {
    this.server.close();
  }

  public sendResponse(message: string): void {
    this.broadcastToClients(message);
  }

  public logPrefix(): string {
    return Utils.logPrefix(' UI WebSocket Server:');
  }

  private broadcastToClients(message: string): void {
    for (const client of (this.server as WebSocket.Server).clients) {
      if (client?.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}
