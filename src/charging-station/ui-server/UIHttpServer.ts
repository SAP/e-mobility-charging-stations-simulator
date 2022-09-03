import { IncomingMessage, RequestListener, Server, ServerResponse } from 'http';

import { StatusCodes } from 'http-status-codes';

import BaseError from '../../exception/BaseError';
import type { ServerOptions } from '../../types/ConfigurationData';
import {
  ProcedureName,
  Protocol,
  ProtocolRequest,
  ProtocolResponse,
  ProtocolVersion,
  RequestPayload,
  ResponseStatus,
} from '../../types/UIProtocol';
import Configuration from '../../utils/Configuration';
import logger from '../../utils/Logger';
import Utils from '../../utils/Utils';
import { AbstractUIServer } from './AbstractUIServer';
import UIServiceFactory from './ui-services/UIServiceFactory';
import { UIServiceUtils } from './ui-services/UIServiceUtils';

const moduleName = 'UIHttpServer';

type responseHandler = { procedureName: ProcedureName; res: ServerResponse };

export default class UIHttpServer extends AbstractUIServer {
  private readonly responseHandlers: Map<string, responseHandler>;

  public constructor(private options?: ServerOptions) {
    super();
    this.server = new Server(this.requestListener.bind(this) as RequestListener);
    this.responseHandlers = new Map<string, responseHandler>();
  }

  public start(): void {
    if ((this.server as Server).listening === false) {
      (this.server as Server).listen(this.options ?? Configuration.getUIServer().options);
    }
  }

  public stop(): void {
    this.chargingStations.clear();
    this.responseHandlers.clear();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public sendRequest(request: ProtocolRequest): void {
    // This is intentionally left blank
  }

  public sendResponse(response: ProtocolResponse): void {
    const [uuid, payload] = response;
    const statusCode = this.responseStatusToStatusCode(payload.status);
    if (this.responseHandlers.has(uuid) === true) {
      const { res } = this.responseHandlers.get(uuid);
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.write(JSON.stringify(payload));
      res.end();
      this.responseHandlers.delete(uuid);
    } else {
      logger.error(
        `${this.logPrefix(moduleName, 'sendResponse')} Response for unknown request id: ${uuid}`
      );
    }
  }

  public logPrefix(modName?: string, methodName?: string, prefixSuffix?: string): string {
    const logMsgPrefix = prefixSuffix ? `UI HTTP Server ${prefixSuffix}` : 'UI HTTP Server';
    const logMsg =
      modName && methodName ? ` ${logMsgPrefix} | ${modName}.${methodName}:` : ` ${logMsgPrefix} |`;
    return Utils.logPrefix(logMsg);
  }

  private requestListener(req: IncomingMessage, res: ServerResponse): void {
    // Expected request URL pathname: /ui/:version/:procedureName
    const [protocol, version, procedureName] = req.url?.split('/').slice(1) as [
      Protocol,
      ProtocolVersion,
      ProcedureName
    ];
    const uuid = Utils.generateUUID();
    this.responseHandlers.set(uuid, { procedureName, res });
    try {
      if (UIServiceUtils.isProtocolAndVersionSupported(protocol, version) === false) {
        throw new BaseError(`Unsupported UI protocol version: '/${protocol}/${version}'`);
      }
      req.on('error', (error) => {
        logger.error(
          `${this.logPrefix(moduleName, 'requestListener.req.onerror')} Error on HTTP request:`,
          error
        );
      });
      if (this.uiServices.has(version) === false) {
        this.uiServices.set(version, UIServiceFactory.getUIServiceImplementation(version, this));
      }
      if (req.method === 'POST') {
        const bodyBuffer = [];
        req
          .on('data', (chunk) => {
            bodyBuffer.push(chunk);
          })
          .on('end', () => {
            const body = JSON.parse(Buffer.concat(bodyBuffer).toString()) as RequestPayload;
            this.uiServices
              .get(version)
              .requestHandler(this.buildProtocolRequest(uuid, procedureName, body ?? {}))
              .catch(() => {
                this.sendResponse(
                  this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE })
                );
              });
          });
      } else {
        throw new BaseError(`Unsupported HTTP method: '${req.method}'`);
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix(moduleName, 'requestListener')} Handle HTTP request error:`,
        error
      );
      this.sendResponse(this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE }));
    }
  }

  private responseStatusToStatusCode(status: ResponseStatus): StatusCodes {
    switch (status) {
      case ResponseStatus.SUCCESS:
        return StatusCodes.OK;
      case ResponseStatus.FAILURE:
        return StatusCodes.BAD_REQUEST;
      default:
        return StatusCodes.INTERNAL_SERVER_ERROR;
    }
  }
}
