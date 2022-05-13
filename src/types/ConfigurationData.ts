import { ServerOptions } from 'ws';
import { StorageType } from './Storage';
import type { WorkerChoiceStrategy } from 'poolifier';
import { WorkerProcessType } from './Worker';

export enum SupervisionUrlDistribution {
  ROUND_ROBIN = 'round-robin',
  RANDOM = 'random',
  SEQUENTIAL = 'sequential',
}

export interface StationTemplateUrl {
  file: string;
  numberOfStations: number;
}

export interface UIServerConfiguration {
  enabled?: boolean;
  options?: ServerOptions;
}

export interface StorageConfiguration {
  enabled?: boolean;
  type?: StorageType;
  uri?: string;
}

export default interface ConfigurationData {
  supervisionUrls?: string | string[];
  supervisionUrlDistribution?: SupervisionUrlDistribution;
  stationTemplateUrls: StationTemplateUrl[];
  uiServer?: UIServerConfiguration;
  performanceStorage?: StorageConfiguration;
  autoReconnectMaxRetries?: number;
  workerProcess?: WorkerProcessType;
  workerStartDelay?: number;
  elementStartDelay?: number;
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
