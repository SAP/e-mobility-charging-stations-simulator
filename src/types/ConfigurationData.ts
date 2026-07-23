import type { z } from 'zod'

import type {
  ConfigurationSchema,
  LogConfigurationSchema,
  StationTemplateUrlSchema,
  StorageConfigurationSchema,
  UIServerConfigurationSchema,
  UIServerMetricsConfigurationSchema,
  UIServerSecurityHeadersConfigurationSchema,
  WorkerConfigurationSchema,
} from '../utils/index.js'

export enum ApplicationProtocolVersion {
  VERSION_11 = '1.1',
  VERSION_20 = '2.0',
}

export enum ConfigurationSection {
  log = 'log',
  performanceStorage = 'performanceStorage',
  uiServer = 'uiServer',
  worker = 'worker',
}

export enum SupervisionUrlDistribution {
  CHARGING_STATION_AFFINITY = 'charging-station-affinity',
  RANDOM = 'random',
  ROUND_ROBIN = 'round-robin',
}

export type ConfigurationData = z.infer<typeof ConfigurationSchema>
export type LogConfiguration = z.infer<typeof LogConfigurationSchema>
export type StationTemplateUrl = z.infer<typeof StationTemplateUrlSchema>
export type StorageConfiguration = z.infer<typeof StorageConfigurationSchema>
export type UIServerConfiguration = z.infer<typeof UIServerConfigurationSchema>
export type UIServerMetricsConfiguration = z.infer<typeof UIServerMetricsConfigurationSchema>
export type UIServerSecurityHeadersConfiguration = z.infer<
  typeof UIServerSecurityHeadersConfigurationSchema
>
export type WorkerConfiguration = z.infer<typeof WorkerConfigurationSchema>
