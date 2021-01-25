import { WorkerProcessType } from './Worker';

export interface StationTemplateURL {
  file: string;
  numberOfStations: number;
}

export default interface ConfigurationData {
  supervisionURLs?: string[];
  stationTemplateURLs: StationTemplateURL[];
  statisticsDisplayInterval?: number;
  connectionTimeout?: number;
  autoReconnectMaxRetries?: number;
  distributeStationsToTenantsEqually?: boolean;
  workerProcess?: WorkerProcessType;
  workerPoolMinSize?: number;
  workerPoolMaxSize?: number;
  chargingStationsPerWorker?: number;
  logFormat?: string;
  logLevel?: string;
  logRotate?: boolean;
  logMaxFiles?: number;
  logFile?: string;
  logErrorFile?: string;
  logConsole?: boolean;
}
