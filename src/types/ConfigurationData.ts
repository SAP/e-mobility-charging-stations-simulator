import { StorageType } from './Storage';
import type { WorkerChoiceStrategy } from 'poolifier';
import { WorkerProcessType } from './Worker';

export interface StationTemplateURL {
  file: string;
  numberOfStations: number;
}

export interface StorageConfiguration {
  enabled?: boolean;
  type?: StorageType;
  URI?: string;
}

export default interface ConfigurationData {
  supervisionURLs?: string[];
  stationTemplateURLs: StationTemplateURL[];
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
