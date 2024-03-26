import type { ListenOptions } from 'node:net'
import type { ResourceLimits } from 'node:worker_threads'

import type { WorkerChoiceStrategy } from 'poolifier'

import type { WorkerProcessType } from '../worker/index.js'
import type { StorageType } from './Storage.js'
import type { ApplicationProtocol, AuthenticationType } from './UIProtocol.js'

type ServerOptions = ListenOptions

export enum ConfigurationSection {
  log = 'log',
  performanceStorage = 'performanceStorage',
  worker = 'worker',
  uiServer = 'uiServer'
}

export enum SupervisionUrlDistribution {
  ROUND_ROBIN = 'round-robin',
  RANDOM = 'random',
  CHARGING_STATION_AFFINITY = 'charging-station-affinity'
}

export interface StationTemplateUrl {
  file: string
  numberOfStations: number
  provisionedNumberOfStations?: number
}

export interface LogConfiguration {
  enabled?: boolean
  file?: string
  errorFile?: string
  statisticsInterval?: number
  level?: string
  console?: boolean
  format?: string
  rotate?: boolean
  maxFiles?: string | number
  maxSize?: string | number
}

export enum ApplicationProtocolVersion {
  VERSION_11 = 1.1,
  VERSION_20 = 2.0
}

export interface UIServerConfiguration {
  enabled?: boolean
  type?: ApplicationProtocol
  version?: ApplicationProtocolVersion
  options?: ServerOptions
  authentication?: {
    enabled: boolean
    type: AuthenticationType
    username?: string
    password?: string
  }
}

export interface StorageConfiguration {
  enabled?: boolean
  type?: StorageType
  uri?: string
}

export type ElementsPerWorkerType = number | 'auto' | 'all'

export interface WorkerConfiguration {
  processType?: WorkerProcessType
  startDelay?: number
  elementsPerWorker?: ElementsPerWorkerType
  /** @deprecated Use `elementAddDelay` instead. */
  elementStartDelay?: number
  elementAddDelay?: number
  poolMinSize?: number
  poolMaxSize?: number
  resourceLimits?: ResourceLimits
}

export interface ConfigurationData {
  supervisionUrls?: string | string[]
  supervisionUrlDistribution?: SupervisionUrlDistribution
  stationTemplateUrls: StationTemplateUrl[]
  log?: LogConfiguration
  worker?: WorkerConfiguration
  uiServer?: UIServerConfiguration
  performanceStorage?: StorageConfiguration
  /** @deprecated Moved to charging station template. */
  autoReconnectMaxRetries?: number
  /** @deprecated Moved to worker configuration section. */
  workerProcess?: WorkerProcessType
  /** @deprecated Moved to worker configuration section. */
  workerStartDelay?: number
  /** @deprecated Moved to worker configuration section. */
  elementAddDelay?: number
  /** @deprecated Moved to worker configuration section. */
  workerPoolMinSize?: number
  /** @deprecated Moved to worker configuration section. */
  workerPoolMaxSize?: number
  /** @deprecated Moved to worker configuration section. */
  workerPoolStrategy?: WorkerChoiceStrategy
  /** @deprecated Moved to worker configuration section. */
  chargingStationsPerWorker?: number
  /** @deprecated Moved to log configuration section. */
  logStatisticsInterval?: number
  /** @deprecated Moved to log configuration section. */
  logEnabled?: boolean
  /** @deprecated Moved to log configuration section. */
  logConsole?: boolean
  /** @deprecated Moved to log configuration section. */
  logFormat?: string
  /** @deprecated Moved to log configuration section. */
  logLevel?: string
  /** @deprecated Moved to log configuration section. */
  logRotate?: boolean
  /** @deprecated Moved to log configuration section. */
  logMaxFiles?: number | string
  /** @deprecated Moved to log configuration section. */
  logMaxSize?: number | string
  /** @deprecated Moved to log configuration section. */
  logFile?: string
  /** @deprecated Moved to log configuration section. */
  logErrorFile?: string
}
