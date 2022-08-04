import { ListenOptions } from 'net';

import type { WorkerChoiceStrategy } from 'poolifier';
import { ServerOptions as WSServerOptions } from 'ws';

import { StorageType } from './Storage';
import { WorkerProcessType } from './Worker';

export type ServerOptions = WSServerOptions & ListenOptions;

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

export interface WorkerConfiguration {
  processType?: WorkerProcessType;
  startDelay?: number;
  elementsPerWorker?: number;
  elementStartDelay?: number;
  poolMinSize?: number;
  poolMaxSize?: number;
  poolStrategy?: WorkerChoiceStrategy;
}

export default interface ConfigurationData {
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
}
