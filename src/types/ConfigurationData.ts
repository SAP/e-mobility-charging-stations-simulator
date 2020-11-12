export interface StationTemplateURL {
  file: string;
  numberOfStations: number;
}

export default interface ConfigurationData {
  supervisionURLs?: string[];
  stationTemplateURLs: StationTemplateURL[];
  statisticsDisplayInterval?: number;
  autoReconnectTimeout?: number;
  autoReconnectMaxRetries?: number;
  distributeStationsToTenantsEqually?: boolean;
  useWorkerPool?: boolean;
  workerPoolSize?: number;
  logFormat?: string;
  logLevel?: string;
  logFile?: string;
  logErrorFile?: string;
  logConsole?: boolean;
}
