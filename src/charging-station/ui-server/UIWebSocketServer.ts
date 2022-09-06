import { IncomingMessage, createServer } from 'http';
import type internal from 'stream';

import { StatusCodes } from 'http-status-codes';
import * as uuid from 'uuid';
import WebSocket, { RawData, WebSocketServer } from 'ws';

import type { UIServerConfiguration } from '../../types/ConfigurationData';
import type { ProtocolRequest, ProtocolResponse } from '../../types/UIProtocol';
import { WebSocketCloseEventStatusCode } from '../../types/WebSocket';
import logger from '../../utils/Logger';
import Utils from '../../utils/Utils';
import { AbstractUIServer } from './AbstractUIServer';
import { UIServiceUtils } from './ui-services/UIServiceUtils';

const moduleName = 'UIWebSocketServer';

export default class UIWebSocketServer extends AbstractUIServer {
  private readonly webSocketServer: WebSocketServer;

  public constructor(protected readonly uiServerConfiguration: UIServerConfiguration) {
    super(uiServerConfiguration);
    this.httpServer = createServer();
    this.webSocketServer = new WebSocketServer({
      handleProtocols: UIServiceUtils.handleProtocols,
      noServer: true,
    });
  }

  public start(): void {
    this.webSocketServer.on('connection', (ws: WebSocket, req: IncomingMessage): void => {
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
      this.registerProtocolVersionUIService(version);
      ws.on('message', (rawData) => {
        const request = this.validateRawDataRequest(rawData);
        if (request === false) {
          ws.close(WebSocketCloseEventStatusCode.CLOSE_INVALID_PAYLOAD);
          return;
        }
        const [messageId, procedureName, payload] = request as ProtocolRequest;
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
    this.httpServer.on(
      'upgrade',
      (req: IncomingMessage, socket: internal.Duplex, head: Buffer): void => {
        this.authenticate(req, (err) => {
          if (err) {
            socket.write(`HTTP/1.1 ${StatusCodes.UNAUTHORIZED} Unauthorized\r\n\r\n`);
            socket.destroy();
            return;
          }
          this.webSocketServer.handleUpgrade(req, socket, head, (ws: WebSocket) => {
            this.webSocketServer.emit('connection', ws, req);
          });
        });
      }
    );
    if (this.httpServer.listening === false) {
      this.httpServer.listen(this.uiServerConfiguration.options);
    }
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
    for (const client of this.webSocketServer.clients) {
      if (client?.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  private authenticate(req: IncomingMessage, next: (err?: Error) => void): void {
    if (this.isBasicAuthEnabled() === true) {
      if (this.isValidBasicAuth(req) === false) {
        next(new Error('Unauthorized'));
      } else {
        next();
      }
    } else {
      next();
    }
  }

  private validateRawDataRequest(rawData: RawData): ProtocolRequest | false {
    // logger.debug(
    //   `${this.logPrefix(
    //     moduleName,
    //     'validateRawDataRequest'
    //   )} Raw data received in string format: ${rawData.toString()}`
    // );

    const request = JSON.parse(rawData.toString()) as ProtocolRequest;

    if (Array.isArray(request) === false) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateRawDataRequest'
        )} UI protocol request is not an array:`,
        request
      );
      return false;
    }

    if (request.length !== 3) {
      logger.error(
        `${this.logPrefix(moduleName, 'validateRawDataRequest')} UI protocol request is malformed:`,
        request
      );
      return false;
    }

    if (uuid.validate(request[0]) === false) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateRawDataRequest'
        )} UI protocol request UUID field is invalid:`,
        request
      );
      return false;
    }

    return request;
  }
}
