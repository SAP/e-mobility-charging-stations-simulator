import type { WorkerChoiceStrategy } from 'poolifier';
import { WorkerProcessType } from './Worker';

export interface StationTemplateURL {
  file: string;
  numberOfStations: number;
}

export default interface ConfigurationData {
  supervisionURLs?: string[];
  stationTemplateURLs: StationTemplateURL[];
  statisticsDisplayInterval?: number;
  autoReconnectMaxRetries?: number;
  distributeStationsToTenantsEqually?: boolean;
  workerProcess?: WorkerProcessType;
  workerStartDelay?: number;
  workerPoolMinSize?: number;
  workerPoolMaxSize?: number;
  workerPoolStrategy?: WorkerChoiceStrategy;
  chargingStationsPerWorker?: number;
  logFormat?: string;
  logLevel?: string;
  logRotate?: boolean;
  logMaxFiles?: number;
  logFile?: string;
  logErrorFile?: string;
  logConsole?: boolean;
}
