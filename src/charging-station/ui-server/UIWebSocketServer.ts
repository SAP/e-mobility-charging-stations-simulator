import type { IncomingMessage } from 'http';

import WebSocket, { RawData } from 'ws';

import BaseError from '../../exception/BaseError';
import type { ServerOptions } from '../../types/ConfigurationData';
import type { ProtocolRequest, ProtocolResponse } from '../../types/UIProtocol';
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
    this.server.on('connection', (ws: WebSocket, request: IncomingMessage): void => {
      const [protocol, version] = UIServiceUtils.getProtocolAndVersion(ws.protocol);
      if (UIServiceUtils.isProtocolAndVersionSupported(protocol, version) === false) {
        logger.error(
          `${this.logPrefix(
            moduleName,
            'start.server.onconnection'
          )} Unsupported UI protocol version: '${protocol}${version}'`
        );
        ws.close(WebSocketCloseEventStatusCode.CLOSE_PROTOCOL_ERROR);
      }
      if (this.uiServices.has(version) === false) {
        this.uiServices.set(version, UIServiceFactory.getUIServiceImplementation(version, this));
      }
      ws.on('message', (rawData) => {
        const [messageId, procedureName, payload] = this.validateRawDataRequest(rawData);
        this.uiServices
          .get(version)
          .requestHandler(this.buildProtocolRequest(messageId, procedureName, payload))
          .catch(() => {
            /* Error caught by AbstractUIService */
          });
      });
      ws.on('error', (error) => {
        logger.error(`${this.logPrefix(moduleName, 'start.ws.onerror')} WebSocket error:`, error);
      });
      ws.on('close', (code, reason) => {
        logger.debug(
          `${this.logPrefix(
            moduleName,
            'start.ws.onclose'
          )} WebSocket closed: '${Utils.getWebSocketCloseEventStatusString(
            code
          )}' - '${reason.toString()}'`
        );
      });
    });
  }

  public stop(): void {
    this.chargingStations.clear();
  }

  public sendRequest(request: ProtocolRequest): void {
    this.broadcastToClients(JSON.stringify(request));
  }

  public sendResponse(response: ProtocolResponse): void {
    // TODO: send response only to the client that sent the request
    this.broadcastToClients(JSON.stringify(response));
  }

  public logPrefix(modName?: string, methodName?: string, prefixSuffix?: string): string {
    const logMsgPrefix = prefixSuffix
      ? `UI WebSocket Server ${prefixSuffix}`
      : 'UI WebSocket Server';
    const logMsg =
      modName && methodName ? ` ${logMsgPrefix} | ${modName}.${methodName}:` : ` ${logMsgPrefix} |`;
    return Utils.logPrefix(logMsg);
  }

  private broadcastToClients(message: string): void {
    for (const client of (this.server as WebSocket.Server).clients) {
      if (client?.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  private validateRawDataRequest(rawData: RawData): ProtocolRequest {
    // logger.debug(
    //   `${this.logPrefix(
    //     moduleName,
    //     'validateRawDataRequest'
    //   )} Raw data received in string format: ${rawData.toString()}`
    // );

    const request = JSON.parse(rawData.toString()) as ProtocolRequest;

    if (Array.isArray(request) === false) {
      throw new BaseError('UI protocol request is not an array');
    }

    if (request.length !== 3) {
      throw new BaseError('UI protocol request is malformed');
    }

    return request;
  }
}
