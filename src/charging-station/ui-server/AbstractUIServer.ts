import AbstractUIService from './ui-services/AbstractUIService';
import { Server as HttpServer } from 'http';
import { ProtocolVersion } from '../../types/UIProtocol';
import WebSocket from 'ws';

export abstract class AbstractUIServer {
  public readonly chargingStations: Set<string>;
  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>;
  protected server: WebSocket.Server | HttpServer;

  public constructor() {
    this.chargingStations = new Set<string>();
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>();
  }

  public abstract start(): void;
  public abstract stop(): void;
  public abstract sendResponse(message: string): void;
  public abstract logPrefix(): string;
}
