import type { IncomingMessage } from 'http';

import WebSocket from 'ws';

import type { ServerOptions } from '../../types/ConfigurationData';
import { WebSocketCloseEventStatusCode } from '../../types/WebSocket';
import Configuration from '../../utils/Configuration';
import logger from '../../utils/Logger';
import Utils from '../../utils/Utils';
import { AbstractUIServer } from './AbstractUIServer';
import UIServiceFactory from './ui-services/UIServiceFactory';
import { UIServiceUtils } from './ui-services/UIServiceUtils';

const moduleName = 'UIWebSocketServer';

export default class UIWebSocketServer extends AbstractUIServer {
  public constructor(options?: ServerOptions) {
    super();
    this.server = new WebSocket.Server(options ?? Configuration.getUIServer().options);
  }

  public start(): void {
    this.server.on('connection', (socket: WebSocket, request: IncomingMessage): void => {
      const [protocol, version] = UIServiceUtils.getProtocolAndVersion(socket.protocol);
      if (UIServiceUtils.isProtocolAndVersionSupported(protocol, version) === false) {
        logger.error(
          `${this.logPrefix(
            moduleName,
            'start.server.onconnection'
          )} Unsupported UI protocol version: '${protocol}${version}'`
        );
        socket.close(WebSocketCloseEventStatusCode.CLOSE_PROTOCOL_ERROR);
      }
      if (!this.uiServices.has(version)) {
        this.uiServices.set(version, UIServiceFactory.getUIServiceImplementation(version, this));
      }
      // FIXME: check connection validity
      socket.on('message', (rawData) => {
        this.uiServices
          .get(version)
          .requestHandler(rawData)
          .catch(() => {
            /* Error caught by AbstractUIService */
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
    this.chargingStations.clear();
  }

  public sendRequest(request: string): void {
    this.broadcastToClients(request);
  }

  public sendResponse(response: string): void {
    // TODO: send response only to the client that sent the request
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
