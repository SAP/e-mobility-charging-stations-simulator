import type { IncomingMessage } from 'http';
import type internal from 'stream';

import { StatusCodes } from 'http-status-codes';
import WebSocket, { type RawData, WebSocketServer } from 'ws';

import type { UIServerConfiguration } from '../../types/ConfigurationData';
import type { ProtocolRequest, ProtocolResponse } from '../../types/UIProtocol';
import { WebSocketCloseEventStatusCode } from '../../types/WebSocket';
import logger from '../../utils/Logger';
import Utils from '../../utils/Utils';
import { AbstractUIServer } from './AbstractUIServer';
import { UIServerUtils } from './UIServerUtils';

const moduleName = 'UIWebSocketServer';

export default class UIWebSocketServer extends AbstractUIServer {
  private readonly webSocketServer: WebSocketServer;

  public constructor(protected readonly uiServerConfiguration: UIServerConfiguration) {
    super(uiServerConfiguration);
    this.webSocketServer = new WebSocketServer({
      handleProtocols: UIServerUtils.handleProtocols,
      noServer: true,
    });
  }

  public start(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.webSocketServer.on('connection', (ws: WebSocket, req: IncomingMessage): void => {
      if (UIServerUtils.isProtocolAndVersionSupported(ws.protocol) === false) {
        logger.error(
          `${this.logPrefix(
            moduleName,
            'start.server.onconnection'
          )} Unsupported UI protocol version: '${ws.protocol}'`
        );
        ws.close(WebSocketCloseEventStatusCode.CLOSE_PROTOCOL_ERROR);
      }
      const [, version] = UIServerUtils.getProtocolAndVersion(ws.protocol);
      this.registerProtocolVersionUIService(version);
      ws.on('message', (rawData) => {
        const request = this.validateRawDataRequest(rawData);
        if (request === false) {
          ws.close(WebSocketCloseEventStatusCode.CLOSE_INVALID_PAYLOAD);
          return;
        }
        const [requestId] = request as ProtocolRequest;
        this.responseHandlers.set(requestId, ws);
        this.uiServices
          .get(version)
          .requestHandler(request)
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
    this.startHttpServer();
  }

  public sendRequest(request: ProtocolRequest): void {
    this.broadcastToClients(JSON.stringify(request));
  }

  public sendResponse(response: ProtocolResponse): void {
    const responseId = response[0];
    try {
      if (this.responseHandlers.has(responseId)) {
        const ws = this.responseHandlers.get(responseId) as WebSocket;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(response));
        } else {
          logger.error(
            `${this.logPrefix(
              moduleName,
              'sendResponse'
            )} Error at sending response id '${responseId}', WebSocket is not open: ${
              ws?.readyState
            }`
          );
        }
      } else {
        logger.error(
          `${this.logPrefix(
            moduleName,
            'sendResponse'
          )} Response for unknown request id: ${responseId}`
        );
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'sendResponse'
        )} Error at sending response id '${responseId}':`,
        error
      );
    } finally {
      this.responseHandlers.delete(responseId);
    }
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

    if (Utils.validateUUID(request[0]) === false) {
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
