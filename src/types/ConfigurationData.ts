import type { ListenOptions } from 'node:net';

import type { WorkerChoiceStrategy } from 'poolifier';

import type { StorageType } from './Storage';
import type { ApplicationProtocol, AuthenticationType } from './UIProtocol';
import type { WorkerProcessType } from '../worker';

type ServerOptions = ListenOptions;

export enum ConfigurationSection {
  log = 'log',
  performanceStorage = 'performanceStorage',
  worker = 'worker',
  uiServer = 'uiServer',
}

export enum SupervisionUrlDistribution {
  ROUND_ROBIN = 'round-robin',
  RANDOM = 'random',
  CHARGING_STATION_AFFINITY = 'charging-station-affinity',
}

export interface StationTemplateUrl {
  file: string;
  numberOfStations: number;
}

export interface LogConfiguration {
  enabled?: boolean;
  file?: string;
  errorFile?: string;
  statisticsInterval?: number;
  level?: string;
  console?: boolean;
  format?: string;
  rotate?: boolean;
  maxFiles?: string | number;
  maxSize?: string | number;
}

export interface UIServerConfiguration {
  enabled?: boolean;
  type?: ApplicationProtocol;
  options?: ServerOptions;
  authentication?: {
    enabled: boolean;
    type: AuthenticationType;
    username?: string;
    password?: string;
  };
}

export interface StorageConfiguration {
  enabled?: boolean;
  type?: StorageType;
  uri?: string;
}

export interface WorkerConfiguration {
  processType?: WorkerProcessType;
  startDelay?: number;
  elementsPerWorker?: number | 'auto';
  elementStartDelay?: number;
  poolMinSize?: number;
  poolMaxSize?: number;
  /** @deprecated Not publicly exposed to end users. */
  poolStrategy?: WorkerChoiceStrategy;
}

export interface ConfigurationData {
  supervisionUrls?: string | string[];
  supervisionUrlDistribution?: SupervisionUrlDistribution;
  stationTemplateUrls: StationTemplateUrl[];
  log?: LogConfiguration;
  worker?: WorkerConfiguration;
  uiServer?: UIServerConfiguration;
  performanceStorage?: StorageConfiguration;
  autoReconnectMaxRetries?: number;
  /** @deprecated Moved to worker configuration section. */
  workerProcess?: WorkerProcessType;
  /** @deprecated Moved to worker configuration section. */
  workerStartDelay?: number;
  /** @deprecated Moved to worker configuration section. */
  elementStartDelay?: number;
  /** @deprecated Moved to worker configuration section. */
  workerPoolMinSize?: number;
  /** @deprecated Moved to worker configuration section. */
  workerPoolMaxSize?: number;
  /** @deprecated Moved to worker configuration section. */
  workerPoolStrategy?: WorkerChoiceStrategy;
  /** @deprecated Moved to worker configuration section. */
  chargingStationsPerWorker?: number;
  /** @deprecated Moved to log configuration section. */
  logStatisticsInterval?: number;
  /** @deprecated Moved to log configuration section. */
  logEnabled?: boolean;
  /** @deprecated Moved to log configuration section. */
  logConsole?: boolean;
  /** @deprecated Moved to log configuration section. */
  logFormat?: string;
  /** @deprecated Moved to log configuration section. */
  logLevel?: string;
  /** @deprecated Moved to log configuration section. */
  logRotate?: boolean;
  /** @deprecated Moved to log configuration section. */
  logMaxFiles?: number | string;
  /** @deprecated Moved to log configuration section. */
  logMaxSize?: number | string;
  /** @deprecated Moved to log configuration section. */
  logFile?: string;
  /** @deprecated Moved to log configuration section. */
  logErrorFile?: string;
}
