import { Server as HttpServer } from 'http';

import WebSocket from 'ws';

import { ChargingStationData } from '../../types/ChargingStationWorker';
import { ProtocolVersion } from '../../types/UIProtocol';
import type AbstractUIService from './ui-services/AbstractUIService';

export abstract class AbstractUIServer {
  public readonly chargingStations: Map<string, ChargingStationData>;
  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>;
  protected server: WebSocket.Server | HttpServer;

  public constructor() {
    this.chargingStations = new Map<string, ChargingStationData>();
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>();
  }

  public abstract start(): void;
  public abstract stop(): void;
  public abstract sendRequest(request: string): void;
  public abstract sendResponse(response: string): void;
  public abstract logPrefix(modName?: string, methodName?: string): string;
}
