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
  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>;
  protected server: WebSocket.Server | HttpServer;

  public constructor() {
    this.chargingStations = new Map<string, ChargingStationData>();
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>();
  }

  public buildProtocolRequest(
    id: string,
    procedureName: ProcedureName,
    requestPayload: RequestPayload
  ): string {
    return JSON.stringify([id, procedureName, requestPayload] as ProtocolRequest);
  }

  public buildProtocolResponse(id: string, responsePayload: ResponsePayload): string {
    return JSON.stringify([id, responsePayload] as ProtocolResponse);
  }

  public abstract start(): void;
  public abstract stop(): void;
  public abstract sendRequest(request: string): void;
  public abstract sendResponse(response: string): void;
  public abstract logPrefix(modName?: string, methodName?: string, prefixSuffix?: string): string;
}
