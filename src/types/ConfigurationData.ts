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
  uiServer = 'uiServer',
  worker = 'worker'
}

export enum SupervisionUrlDistribution {
  CHARGING_STATION_AFFINITY = 'charging-station-affinity',
  RANDOM = 'random',
  ROUND_ROBIN = 'round-robin'
}

export interface StationTemplateUrl {
  file: string
  numberOfStations: number
  provisionedNumberOfStations?: number
}

export interface LogConfiguration {
  console?: boolean
  enabled?: boolean
  errorFile?: string
  file?: string
  format?: string
  level?: string
  maxFiles?: number | string
  maxSize?: number | string
  rotate?: boolean
  statisticsInterval?: number
}

export enum ApplicationProtocolVersion {
  VERSION_11 = '1.1',
  VERSION_20 = '2.0'
}

export interface UIServerConfiguration {
  authentication?: {
    enabled: boolean
    password?: string
    type: AuthenticationType
    username?: string
  }
  enabled?: boolean
  options?: ServerOptions
  type?: ApplicationProtocol
  version?: ApplicationProtocolVersion
}

export interface StorageConfiguration {
  enabled?: boolean
  type?: StorageType
  uri?: string
}

export type ElementsPerWorkerType = 'all' | 'auto' | number

export interface WorkerConfiguration {
  elementAddDelay?: number
  elementsPerWorker?: ElementsPerWorkerType
  /** @deprecated Use `elementAddDelay` instead. */
  elementStartDelay?: number
  poolMaxSize?: number
  poolMinSize?: number
  processType?: WorkerProcessType
  resourceLimits?: ResourceLimits
  startDelay?: number
}

export interface ConfigurationData {
  /** @deprecated Moved to charging station template. */
  autoReconnectMaxRetries?: number
  /** @deprecated Moved to worker configuration section. */
  chargingStationsPerWorker?: number
  /** @deprecated Moved to worker configuration section. */
  elementAddDelay?: number
  log?: LogConfiguration
  /** @deprecated Moved to log configuration section. */
  logConsole?: boolean
  /** @deprecated Moved to log configuration section. */
  logEnabled?: boolean
  /** @deprecated Moved to log configuration section. */
  logErrorFile?: string
  /** @deprecated Moved to log configuration section. */
  logFile?: string
  /** @deprecated Moved to log configuration section. */
  logFormat?: string
  /** @deprecated Moved to log configuration section. */
  logLevel?: string
  /** @deprecated Moved to log configuration section. */
  logMaxFiles?: number | string
  /** @deprecated Moved to log configuration section. */
  logMaxSize?: number | string
  /** @deprecated Moved to log configuration section. */
  logRotate?: boolean
  /** @deprecated Moved to log configuration section. */
  logStatisticsInterval?: number
  performanceStorage?: StorageConfiguration
  stationTemplateUrls: StationTemplateUrl[]
  supervisionUrlDistribution?: SupervisionUrlDistribution
  supervisionUrls?: string | string[]
  uiServer?: UIServerConfiguration
  worker?: WorkerConfiguration
  /** @deprecated Moved to worker configuration section. */
  workerPoolMaxSize?: number
  /** @deprecated Moved to worker configuration section. */
  workerPoolMinSize?: number
  /** @deprecated Moved to worker configuration section. */
  workerPoolStrategy?: WorkerChoiceStrategy
  /** @deprecated Moved to worker configuration section. */
  workerProcess?: WorkerProcessType
  /** @deprecated Moved to worker configuration section. */
  workerStartDelay?: number
}
