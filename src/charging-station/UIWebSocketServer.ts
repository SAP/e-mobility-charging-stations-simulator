import { Protocol, ProtocolCommand, ProtocolRequest, ProtocolVersion } from '../types/UIProtocol';

import AbstractUIService from './UIWebSocketServices/AbstractUIService';
import BaseError from '../exception/BaseError';
import { IncomingMessage } from 'http';
import UIServiceFactory from './UIWebSocketServices/UIServiceFactory';
import Utils from '../utils/Utils';
import WebSocket from 'ws';
import logger from '../utils/Logger';

export default class UIWebSocketServer extends WebSocket.Server {
  public uiService: AbstractUIService;

  public constructor(options?: WebSocket.ServerOptions, callback?: () => void) {
    // Create the WebSocket Server
    super(options ?? { port: 80 }, callback);
  }

  public broadcastToClients(message: string | Record<string, unknown>): void {
    for (const client of this.clients) {
      if (client?.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  public start(): void {
    this.on('connection', (socket: WebSocket, request: IncomingMessage): void => {
      const protocolIndex = socket.protocol.indexOf(Protocol.UI);
      const version = socket.protocol.substring(protocolIndex + Protocol.UI.length) as ProtocolVersion;
      this.uiService = UIServiceFactory.getUIServiceImplementation(version, this);
      if (!this.uiService) {
        throw new BaseError(`Could not find a UI service implementation for protocol version ${version}`);
      }
      // FIXME: check connection validity
      socket.on('message', (messageData) => {
        let [command, payload]: ProtocolRequest = [ProtocolCommand.UNKNOWN, {}];
        const protocolRequest = JSON.parse(messageData.toString()) as ProtocolRequest;
        if (Utils.isIterable(protocolRequest)) {
          [command, payload] = protocolRequest;
        } else {
          throw new BaseError('Protocol request is not iterable');
        }
        this.uiService.handleMessage(command, payload).catch(() => {
          logger.error(`${this.logPrefix()} Error while handling command %s message: %j`, command, payload);
        });
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
