import chalk from 'chalk'

import {
  type ConfigurationData,
  ConfigurationSection,
  type StationTemplateUrl,
} from '../types/index.js'
import { WorkerProcessType } from '../worker/index.js'
import { logPrefix } from './ConfigurationUtils.js'
import { has } from './Utils.js'

/**
 * Check and warn about deprecated configuration keys
 * @param configurationData - The configuration data to check
 */
export function checkDeprecatedConfigurationKeys (
  configurationData: ConfigurationData | undefined
): void {
  const deprecatedKeys: [string, ConfigurationSection | undefined, string][] = [
    // connection timeout
    [
      'autoReconnectTimeout',
      undefined,
      "Use 'ConnectionTimeOut' OCPP parameter in charging station template instead",
    ],
    [
      'connectionTimeout',
      undefined,
      "Use 'ConnectionTimeOut' OCPP parameter in charging station template instead",
    ],
    // connection retries
    ['autoReconnectMaxRetries', undefined, 'Use it in charging station template instead'],
    // station template url(s)
    ['stationTemplateURLs', undefined, "Use 'stationTemplateUrls' instead"],
    // supervision url(s)
    ['supervisionURLs', undefined, "Use 'supervisionUrls' instead"],
    // supervision urls distribution
    ['distributeStationToTenantEqually', undefined, "Use 'supervisionUrlDistribution' instead"],
    ['distributeStationsToTenantsEqually', undefined, "Use 'supervisionUrlDistribution' instead"],
    // worker section
    [
      'useWorkerPool',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the type of worker process model instead`,
    ],
    [
      'workerProcess',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the type of worker process model instead`,
    ],
    [
      'workerStartDelay',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker start delay instead`,
    ],
    [
      'chargingStationsPerWorker',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the number of element(s) per worker instead`,
    ],
    [
      'elementAddDelay',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker's element add delay instead`,
    ],
    [
      'workerPoolMinSize',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool minimum size instead`,
    ],
    [
      'workerPoolSize',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool maximum size instead`,
    ],
    [
      'workerPoolMaxSize',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool maximum size instead`,
    ],
    [
      'workerPoolStrategy',
      undefined,
      `Use '${ConfigurationSection.worker}' section to define the worker pool strategy instead`,
    ],
    ['poolStrategy', ConfigurationSection.worker, 'Not publicly exposed to end users'],
    ['elementStartDelay', ConfigurationSection.worker, "Use 'elementAddDelay' instead"],
    // log section
    [
      'logEnabled',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the logging enablement instead`,
    ],
    [
      'logFile',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log file instead`,
    ],
    [
      'logErrorFile',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log error file instead`,
    ],
    [
      'logConsole',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the console logging enablement instead`,
    ],
    [
      'logStatisticsInterval',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log statistics interval instead`,
    ],
    [
      'logLevel',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log level instead`,
    ],
    [
      'logFormat',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log format instead`,
    ],
    [
      'logRotate',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log rotation enablement instead`,
    ],
    [
      'logMaxFiles',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log maximum files instead`,
    ],
    [
      'logMaxSize',
      undefined,
      `Use '${ConfigurationSection.log}' section to define the log maximum size instead`,
    ],
    // performanceStorage section
    ['URI', ConfigurationSection.performanceStorage, "Use 'uri' instead"],
  ]
  for (const [key, section, msg] of deprecatedKeys) {
    warnDeprecatedConfigurationKey(configurationData, key, section, msg)
  }
  // station template url(s) remapping
  if (configurationData?.['stationTemplateURLs' as keyof ConfigurationData] != null) {
    configurationData.stationTemplateUrls = configurationData[
      'stationTemplateURLs' as keyof ConfigurationData
    ] as StationTemplateUrl[]
  }
  configurationData?.stationTemplateUrls.forEach((stationTemplateUrl: StationTemplateUrl) => {
    if (stationTemplateUrl['numberOfStation' as keyof StationTemplateUrl] != null) {
      console.error(
        `${chalk.green(logPrefix())} ${chalk.red(
          `Deprecated configuration key 'numberOfStation' usage for template file '${stationTemplateUrl.file}' in 'stationTemplateUrls'. Use 'numberOfStations' instead`
        )}`
      )
    }
  })
  // worker section: staticPool check
  if (configurationData?.worker?.processType === ('staticPool' as WorkerProcessType)) {
    console.error(
      `${chalk.green(logPrefix())} ${chalk.red(
        `Deprecated configuration 'staticPool' value usage in worker section 'processType' field. Use '${WorkerProcessType.fixedPool}' value instead`
      )}`
    )
  }
  // uiServer section
  if (has('uiWebSocketServer', configurationData)) {
    console.error(
      `${chalk.green(logPrefix())} ${chalk.red(
        `Deprecated configuration section 'uiWebSocketServer' usage. Use '${ConfigurationSection.uiServer}' instead`
      )}`
    )
  }
}

/**
 * Warn about a deprecated configuration key
 * @param configurationData - The configuration data to check
 * @param key - The deprecated key name
 * @param configurationSection - The configuration section containing the key
 * @param logMsgToAppend - Additional message to append to the warning
 */
function warnDeprecatedConfigurationKey (
  configurationData: ConfigurationData | undefined,
  key: string,
  configurationSection?: ConfigurationSection,
  logMsgToAppend = ''
): void {
  if (
    configurationSection != null &&
    configurationData?.[configurationSection as keyof ConfigurationData] != null &&
    (configurationData[configurationSection as keyof ConfigurationData] as Record<string, unknown>)[
      key
    ] != null
  ) {
    console.error(
      `${chalk.green(logPrefix())} ${chalk.red(
        `Deprecated configuration key '${key}' usage in section '${configurationSection}'${
          logMsgToAppend.trim().length > 0 ? `. ${logMsgToAppend}` : ''
        }`
      )}`
    )
  } else if (configurationData?.[key as keyof ConfigurationData] != null) {
    console.error(
      `${chalk.green(logPrefix())} ${chalk.red(
        `Deprecated configuration key '${key}' usage${
          logMsgToAppend.trim().length > 0 ? `. ${logMsgToAppend}` : ''
        }`
      )}`
    )
  }
}
