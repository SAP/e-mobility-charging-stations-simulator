import { Protocol, ProtocolCommand, ProtocolRequest, ProtocolVersion } from '../types/UIProtocol';
import WebSocket, { OPEN, Server, ServerOptions } from 'ws';

import AbstractUIService from './ui-websocket-services/AbstractUIService';
import BaseError from '../exception/BaseError';
import Configuration from '../utils/Configuration';
import { IncomingMessage } from 'http';
import UIServiceFactory from './ui-websocket-services/UIServiceFactory';
import Utils from '../utils/Utils';
import getLogger from '../utils/Logger';

export default class UIWebSocketServer extends Server {
  public readonly chargingStations: Set<string>;
  public readonly uiServices: Map<ProtocolVersion, AbstractUIService>;

  public constructor(options?: ServerOptions, callback?: () => void) {
    // Create the WebSocket Server
    super(options ?? Configuration.getUIWebSocketServer().options, callback);
    this.chargingStations = new Set<string>();
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>();
    for (const version of Object.values(ProtocolVersion)) {
      this.uiServices.set(version, UIServiceFactory.getUIServiceImplementation(version, this));
    }
  }

  public broadcastToClients(message: string): void {
    for (const client of this.clients) {
      if (client?.readyState === OPEN) {
        client.send(message);
      }
    }
  }

  public start(): void {
    this.on('connection', (socket: WebSocket, request: IncomingMessage): void => {
      const protocolIndex = socket.protocol.indexOf(Protocol.UI);
      const version = socket.protocol.substring(protocolIndex + Protocol.UI.length) as ProtocolVersion;
      if (!this.uiServices.has(version)) {
        throw new BaseError(`Could not find a UI service implementation for UI protocol version ${version}`);
      }
      // FIXME: check connection validity
      socket.on('message', (messageData) => {
        let [command, payload]: ProtocolRequest = [ProtocolCommand.UNKNOWN, {}];
        const protocolRequest = JSON.parse(messageData.toString()) as ProtocolRequest;
        if (Utils.isIterable(protocolRequest)) {
          [command, payload] = protocolRequest;
        } else {
          throw new BaseError('UI protocol request is not iterable');
        }
        this.uiServices.get(version).handleMessage(command, payload).catch(() => {
          getLogger().error(`${this.logPrefix()} Error while handling command %s message: %j`, command, payload);
        });
      });
      socket.on('error', (error) => {
        getLogger().error(`${this.logPrefix()} Error on WebSocket: %j`, error);
      });
    });
  }

  public stop(): void {
    this.close();
  }

  public logPrefix(): string {
    return Utils.logPrefix(' UI WebSocket Server:');
  }
}
