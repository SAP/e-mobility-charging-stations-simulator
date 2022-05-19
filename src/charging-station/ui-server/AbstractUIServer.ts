import AbstractUIService from './ui-services/AbstractUIService';
import { Server as HttpServer } from 'http';
import { ProtocolVersion } from '../../types/UIProtocol';
import { Server as WSServer } from 'ws';
import { ChargingStationSubData } from '../../types/ChargingStationWorker';

export abstract class AbstractUIServer {
  public readonly chargingStations: Map<string, ChargingStationSubData>;
  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>;
  protected server: WSServer | HttpServer;

  public constructor() {
    this.chargingStations = new Map<string, ChargingStationSubData>();
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>();
  }

  public abstract start(): void;
  public abstract stop(): void;
  public abstract sendResponse(message: string): void;
  public abstract logPrefix(): string;
}
