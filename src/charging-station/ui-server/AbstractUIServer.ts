import { Server as HttpServer } from 'http';

import WebSocket from 'ws';

import { SimulatorUI } from '../../types/SimulatorUI';
import { ProtocolVersion } from '../../types/UIProtocol';
import AbstractUIService from './ui-services/AbstractUIService';

export abstract class AbstractUIServer {
  public readonly chargingStations: Map<string, SimulatorUI>;
  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>;
  protected server: WebSocket.Server | HttpServer;

  public constructor() {
    this.chargingStations = new Map<string, SimulatorUI>();
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>();
  }

  public abstract start(): void;
  public abstract stop(): void;
  public abstract sendResponse(message: string): void;
  public abstract logPrefix(modName?: string, methodName?: string): string;
}
