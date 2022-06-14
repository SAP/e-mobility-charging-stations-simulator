import { Protocol, ProtocolVersion } from '../../types/UIProtocol';

import { AbstractUIServer } from './AbstractUIServer';
import { ChargingStationSubData } from '../../types/ChargingStationWorker';
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
      if (protocolIndex === -1) {
        logger.error(`${this.logPrefix()} No UI PROTOCOL provided`);
        socket.close();
        return;
      }
      const version = socket.protocol.substring(
        protocolIndex + Protocol.UI.length
      ) as ProtocolVersion;
      if (version.length === 0) {
        logger.error(`${this.logPrefix()} No UI protocol VERSION provided`);
        socket.close();
        return;
      } else if (!this.uiServices.has(version)) {
        const uiServiceImplementation = UIServiceFactory.getUIServiceImplementation(version, this);
        if (uiServiceImplementation === null) {
          logger.error(`${this.logPrefix()} Unsupported version of UI protocol`);
          socket.close();
          return;
        }
        this.uiServices.set(version, uiServiceImplementation);
      }
      // FIXME: check connection validity
      const service = this.uiServices.get(version);
      socket.on('message', (messageData) => {
        service.messageHandler(messageData).catch(() => {
          logger.error(
            `${this.logPrefix()} Error while handling message data: %j`,
            messageData.toString()
          );
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
