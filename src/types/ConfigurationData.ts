import { ServerOptions } from 'ws';
import { StorageType } from './Storage';
import type { WorkerChoiceStrategy } from 'poolifier';
import { WorkerProcessType } from './Worker';

export interface StationTemplateUrl {
  file: string;
  numberOfStations: number;
}

export interface UIWebSocketServerConfiguration {
  enabled?: boolean;
  options?: ServerOptions;
}

export interface StorageConfiguration {
  enabled?: boolean;
  type?: StorageType;
  uri?: string;
}

export default interface ConfigurationData {
  supervisionUrls?: string[];
  stationTemplateUrls: StationTemplateUrl[];
  uiWebSocketServer?: UIWebSocketServerConfiguration;
  performanceStorage?: StorageConfiguration;
  autoReconnectMaxRetries?: number;
  distributeStationsToTenantsEqually?: boolean;
  workerProcess?: WorkerProcessType;
  workerStartDelay?: number;
  workerPoolMinSize?: number;
  workerPoolMaxSize?: number;
  workerPoolStrategy?: WorkerChoiceStrategy;
  chargingStationsPerWorker?: number;
  logStatisticsInterval?: number;
  logFormat?: string;
  logLevel?: string;
  logRotate?: boolean;
  logMaxFiles?: number;
  logFile?: string;
  logErrorFile?: string;
  logConsole?: boolean;
}
