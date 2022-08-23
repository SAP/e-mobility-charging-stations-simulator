import { IncomingMessage } from 'http';

import WebSocket from 'ws';

import { ServerOptions } from '../../types/ConfigurationData';
import { Protocol, ProtocolVersion } from '../../types/UIProtocol';
import Configuration from '../../utils/Configuration';
import logger from '../../utils/Logger';
import Utils from '../../utils/Utils';
import { AbstractUIServer } from './AbstractUIServer';
import UIServiceFactory from './ui-services/UIServiceFactory';

const moduleName = 'UIWebSocketServer';

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
          .requestHandler(messageData)
          .catch((error) => {
            logger.error(
              `${this.logPrefix(
                moduleName,
                'start.socket.onmessage'
              )} Error while handling message:`,
              error
            );
          });
      });
      socket.on('error', (error) => {
        logger.error(
          `${this.logPrefix(moduleName, 'start.socket.onerror')} Error on WebSocket:`,
          error
        );
      });
    });
  }

  public stop(): void {
    this.server.close();
  }

  public sendRequest(request: string): void {
    this.broadcastToClients(request);
  }

  public sendResponse(response: string): void {
    this.broadcastToClients(response);
  }

  public logPrefix(modName?: string, methodName?: string): string {
    const logMsg =
      modName && methodName
        ? ` UI WebSocket Server | ${modName}.${methodName}:`
        : ' UI WebSocket Server |';
    return Utils.logPrefix(logMsg);
  }

  private broadcastToClients(message: string): void {
    for (const client of (this.server as WebSocket.Server).clients) {
      if (client?.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}
