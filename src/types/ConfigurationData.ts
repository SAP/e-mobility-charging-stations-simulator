import type { ListenOptions } from 'net';

import type { WorkerChoiceStrategy } from 'poolifier';

import type { StorageType } from './Storage';
import type { ApplicationProtocol, AuthenticationType } from './UIProtocol';
import type { WorkerProcessType } from './Worker';

export type ServerOptions = ListenOptions;

export enum SupervisionUrlDistribution {
  ROUND_ROBIN = 'round-robin',
  RANDOM = 'random',
  CHARGING_STATION_AFFINITY = 'charging-station-affinity',
}

export type StationTemplateUrl = {
  file: string;
  numberOfStations: number;
};

export type UIServerConfiguration = {
  enabled?: boolean;
  type?: ApplicationProtocol;
  options?: ServerOptions;
  authentication?: {
    enabled: boolean;
    type: AuthenticationType;
    username?: string;
    password?: string;
  };
};

export type StorageConfiguration = {
  enabled?: boolean;
  type?: StorageType;
  uri?: string;
};

export type WorkerConfiguration = {
  processType?: WorkerProcessType;
  startDelay?: number;
  elementsPerWorker?: number;
  elementStartDelay?: number;
  poolMinSize?: number;
  poolMaxSize?: number;
  poolStrategy?: WorkerChoiceStrategy;
};

export type ConfigurationData = {
  supervisionUrls?: string | string[];
  supervisionUrlDistribution?: SupervisionUrlDistribution;
  stationTemplateUrls: StationTemplateUrl[];
  uiServer?: UIServerConfiguration;
  performanceStorage?: StorageConfiguration;
  worker?: WorkerConfiguration;
  autoReconnectMaxRetries?: number;
  // deprecated
  workerProcess?: WorkerProcessType;
  // deprecated
  workerStartDelay?: number;
  // deprecated
  elementStartDelay?: number;
  // deprecated
  workerPoolMinSize?: number;
  // deprecated
  workerPoolMaxSize?: number;
  // deprecated
  workerPoolStrategy?: WorkerChoiceStrategy;
  // deprecated
  chargingStationsPerWorker?: number;
  logStatisticsInterval?: number;
  logFormat?: string;
  logLevel?: string;
  logRotate?: boolean;
  logMaxFiles?: number;
  logFile?: string;
  logErrorFile?: string;
  logConsole?: boolean;
};
