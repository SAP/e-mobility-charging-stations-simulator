import type { Server as HttpServer } from 'http';

import type WebSocket from 'ws';

import type { ChargingStationData } from '../../types/ChargingStationWorker';
import type {
  ProcedureName,
  ProtocolRequest,
  ProtocolResponse,
  ProtocolVersion,
  RequestPayload,
  ResponsePayload,
} from '../../types/UIProtocol';
import type AbstractUIService from './ui-services/AbstractUIService';

export abstract class AbstractUIServer {
  public readonly chargingStations: Map<string, ChargingStationData>;
  protected server: WebSocket.Server | HttpServer;
  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>;

  public constructor() {
    this.chargingStations = new Map<string, ChargingStationData>();
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

  public abstract start(): void;
  public abstract stop(): void;
  public abstract sendRequest(request: ProtocolRequest): void;
  public abstract sendResponse(response: ProtocolResponse): void;
  public abstract logPrefix(
    moduleName?: string,
    methodName?: string,
    prefixSuffix?: string
  ): string;
}
