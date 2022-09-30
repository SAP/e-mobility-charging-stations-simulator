import { type IncomingMessage, Server, type ServerResponse } from 'http';

import type { WebSocket } from 'ws';

import type { ChargingStationData } from '../../types/ChargingStationWorker';
import type { UIServerConfiguration } from '../../types/ConfigurationData';
import {
  AuthenticationType,
  ProcedureName,
  ProtocolRequest,
  ProtocolResponse,
  ProtocolVersion,
  RequestPayload,
  ResponsePayload,
} from '../../types/UIProtocol';
import type AbstractUIService from './ui-services/AbstractUIService';
import UIServiceFactory from './ui-services/UIServiceFactory';

export abstract class AbstractUIServer {
  public readonly chargingStations: Map<string, ChargingStationData>;
  protected readonly httpServer: Server;
  protected readonly responseHandlers: Map<string, ServerResponse | WebSocket>;
  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>;

  public constructor(protected readonly uiServerConfiguration: UIServerConfiguration) {
    this.chargingStations = new Map<string, ChargingStationData>();
    this.httpServer = new Server();
    this.responseHandlers = new Map<string, ServerResponse | WebSocket>();
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>();
  }

  public buildProtocolRequest(
    id: string,
    procedureName: ProcedureName,
    requestPayload: RequestPayload
  ): ProtocolRequest {
    return [id, procedureName, requestPayload];
  }

  public buildProtocolResponse(id: string, responsePayload: ResponsePayload): ProtocolResponse {
    return [id, responsePayload];
  }

  public stop(): void {
    this.chargingStations.clear();
  }

  protected startHttpServer(): void {
    if (this.httpServer.listening === false) {
      this.httpServer.listen(this.uiServerConfiguration.options);
    }
  }

  protected registerProtocolVersionUIService(version: ProtocolVersion): void {
    if (this.uiServices.has(version) === false) {
      this.uiServices.set(version, UIServiceFactory.getUIServiceImplementation(version, this));
    }
  }

  protected authenticate(req: IncomingMessage, next: (err?: Error) => void): void {
    if (this.isBasicAuthEnabled() === true) {
      if (this.isValidBasicAuth(req) === false) {
        next(new Error('Unauthorized'));
      }
      next();
    }
    next();
  }

  private isBasicAuthEnabled(): boolean {
    return (
      this.uiServerConfiguration.authentication?.enabled === true &&
      this.uiServerConfiguration.authentication?.type === AuthenticationType.BASIC_AUTH
    );
  }

  private isValidBasicAuth(req: IncomingMessage): boolean {
    const authorizationHeader = req.headers.authorization ?? '';
    const authorizationToken = authorizationHeader.split(/\s+/).pop() ?? '';
    const authentication = Buffer.from(authorizationToken, 'base64').toString();
    const authenticationParts = authentication.split(/:/);
    const username = authenticationParts.shift();
    const password = authenticationParts.join(':');
    return (
      this.uiServerConfiguration.authentication?.username === username &&
      this.uiServerConfiguration.authentication?.password === password
    );
  }

  public abstract start(): void;
  public abstract sendRequest(request: ProtocolRequest): void;
  public abstract sendResponse(response: ProtocolResponse): void;
  public abstract logPrefix(
    moduleName?: string,
    methodName?: string,
    prefixSuffix?: string
  ): string;
}
