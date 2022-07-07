import AbstractUIService from './ui-services/AbstractUIService';
import { Server as HttpServer } from 'http';
import { ProtocolVersion } from '../../types/UIProtocol';
import WebSocket from 'ws';
import { ChargingStationUI } from '../../types/SimulatorUI';

export abstract class AbstractUIServer {
  public readonly chargingStations: Map<string, ChargingStationUI>;
  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>;
  protected server: WebSocket.Server | HttpServer;

  public constructor() {
    this.chargingStations = new Map<string, ChargingStationUI>();
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>();
  }

  public abstract start(): void;
  public abstract stop(): void;
  public abstract sendResponse(message: string): void;
  public abstract logPrefix(): string;
}
