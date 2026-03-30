// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { URL } from 'node:url'

import { secondsToMilliseconds } from 'date-fns'
import { CircularBuffer } from 'mnemonist'
import { performance, type PerformanceEntry, PerformanceObserver } from 'node:perf_hooks'
import { parentPort } from 'node:worker_threads'

import { BaseError } from '../exception/index.js'
import {
  ConfigurationSection,
  type IncomingRequestCommand,
  type LogConfiguration,
  MapStringifyFormat,
  MessageType,
  type RequestCommand,
  type Statistics,
  type StatisticsData,
  type StorageConfiguration,
  type TimestampedData,
} from '../types/index.js'
import {
  average,
  buildPerformanceStatisticsMessage,
  Configuration,
  Constants,
  extractTimeSeriesValues,
  formatDurationSeconds,
  generateUUID,
  JSONStringify,
  logger,
  logPrefix,
  max,
  median,
  min,
  percentile,
  std,
} from '../utils/index.js'

export class PerformanceStatistics {
  private static readonly instances: Map<string, PerformanceStatistics> = new Map<
    string,
    PerformanceStatistics
  >()

  private displayInterval?: NodeJS.Timeout
  private readonly objId: string | undefined
  private readonly objName: string | undefined
  private performanceObserver!: PerformanceObserver
  private readonly statistics: Statistics

  private constructor(objId: string, objName: string, uri: URL) {
    this.objId = objId
    this.objName = objName
    this.initializePerformanceObserver()
    this.statistics = {
      createdAt: new Date(),
      id: this.objId,
      name: this.objName,
      statisticsData: new Map(),
      uri: uri.toString(),
    }
  }

  public static beginMeasure(id: string): string {
    const markId = `${id.charAt(0).toUpperCase()}${id.slice(1)}~${generateUUID()}`
    performance.mark(markId)
    return markId
  }

  public static deleteInstance(objId: string | undefined): boolean {
    if (objId == null) {
      const errorMsg = 'Cannot delete performance statistics instance without specifying object id'
      logger.error(`${PerformanceStatistics.logPrefix()} ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
    return PerformanceStatistics.instances.delete(objId)
  }

  public static endMeasure(name: string, markId: string): void {
    try {
      performance.measure(name, markId)
    } catch (error) {
      if (error instanceof Error && error.message.includes('performance mark has not been set')) {
        /* Ignore */
      } else {
        throw error
      }
    }
    performance.clearMarks(markId)
    performance.clearMeasures(name)
  }

  public static getInstance(
    objId: string | undefined,
    objName: string | undefined,
    uri: undefined | URL
  ): PerformanceStatistics | undefined {
    if (objId == null) {
      const errorMsg = 'Cannot get performance statistics instance without specifying object id'
      logger.error(`${PerformanceStatistics.logPrefix()} ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
    if (objName == null) {
      const errorMsg = 'Cannot get performance statistics instance without specifying object name'
      logger.error(`${PerformanceStatistics.logPrefix()} ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
    if (uri == null) {
      const errorMsg = 'Cannot get performance statistics instance without specifying object uri'
      logger.error(`${PerformanceStatistics.logPrefix()} ${errorMsg}`)
      throw new BaseError(errorMsg)
    }
    if (!PerformanceStatistics.instances.has(objId)) {
      PerformanceStatistics.instances.set(objId, new PerformanceStatistics(objId, objName, uri))
    }
    return PerformanceStatistics.instances.get(objId)
  }

  private static readonly logPrefix = (): string => {
    return logPrefix(' Performance statistics')
  }

  public addRequestStatistic(
    command: IncomingRequestCommand | RequestCommand,
    messageType: MessageType
  ): void {
    switch (messageType) {
      case MessageType.CALL_ERROR_MESSAGE: {
        const commandStatisticsData = this.statistics.statisticsData.get(command)
        if (commandStatisticsData?.errorCount != null) {
          ++commandStatisticsData.errorCount
        } else {
          this.statistics.statisticsData.set(command, {
            ...commandStatisticsData,
            errorCount: 1,
          })
        }
        break
      }
      case MessageType.CALL_MESSAGE: {
        const commandStatisticsData = this.statistics.statisticsData.get(command)
        if (commandStatisticsData?.requestCount != null) {
          ++commandStatisticsData.requestCount
        } else {
          this.statistics.statisticsData.set(command, {
            ...commandStatisticsData,
            requestCount: 1,
          })
        }
        break
      }
      case MessageType.CALL_RESULT_MESSAGE: {
        const commandStatisticsData = this.statistics.statisticsData.get(command)
        if (commandStatisticsData?.responseCount != null) {
          ++commandStatisticsData.responseCount
        } else {
          this.statistics.statisticsData.set(command, {
            ...commandStatisticsData,
            responseCount: 1,
          })
        }
        break
      }
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        logger.error(`${this.logPrefix()} wrong message type ${messageType}`)
        break
    }
  }

  public restart(): void {
    this.stop()
    this.start()
  }

  public start(): void {
    this.startLogStatisticsInterval()
    const performanceStorageConfiguration =
      Configuration.getConfigurationSection<StorageConfiguration>(
        ConfigurationSection.performanceStorage
      )
    if (performanceStorageConfiguration.enabled === true) {
      logger.info(
        `${this.logPrefix()} storage enabled: type ${
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          performanceStorageConfiguration.type
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        }, uri: ${performanceStorageConfiguration.uri}`
      )
    }
  }

  public stop(): void {
    this.stopLogStatisticsInterval()
    performance.clearMarks()
    performance.clearMeasures()
    this.performanceObserver.disconnect()
  }

  private addPerformanceEntryToStatistics(entry: PerformanceEntry): void {
    // Initialize command statistics
    if (!this.statistics.statisticsData.has(entry.name)) {
      this.statistics.statisticsData.set(entry.name, {})
    }
    const entryStatisticsData = this.statistics.statisticsData.get(entry.name)
    if (entryStatisticsData != null) {
      // Update current statistics
      entryStatisticsData.timeMeasurementCount = (entryStatisticsData.timeMeasurementCount ?? 0) + 1
      entryStatisticsData.currentTimeMeasurement = entry.duration
      entryStatisticsData.minTimeMeasurement = min(
        entry.duration,
        entryStatisticsData.minTimeMeasurement ?? Number.POSITIVE_INFINITY
      )
      entryStatisticsData.maxTimeMeasurement = max(
        entry.duration,
        entryStatisticsData.maxTimeMeasurement ?? Number.NEGATIVE_INFINITY
      )
      entryStatisticsData.totalTimeMeasurement =
        (entryStatisticsData.totalTimeMeasurement ?? 0) + entry.duration
      if (!(entryStatisticsData.measurementTimeSeries instanceof CircularBuffer)) {
        entryStatisticsData.measurementTimeSeries = new CircularBuffer<TimestampedData>(
          Array<TimestampedData>,
          Constants.DEFAULT_CIRCULAR_BUFFER_CAPACITY
        )
      }
      entryStatisticsData.measurementTimeSeries.push({
        timestamp: entry.startTime,
        value: entry.duration,
      })
      const timeMeasurementValues = extractTimeSeriesValues(
        entryStatisticsData.measurementTimeSeries
      )
      entryStatisticsData.avgTimeMeasurement = average(timeMeasurementValues)
      entryStatisticsData.medTimeMeasurement = median(timeMeasurementValues)
      entryStatisticsData.ninetyFiveThPercentileTimeMeasurement = percentile(
        timeMeasurementValues,
        95
      )
      entryStatisticsData.stdTimeMeasurement = std(
        timeMeasurementValues,
        entryStatisticsData.avgTimeMeasurement
      )
    }
    this.statistics.updatedAt = new Date()
    if (
      Configuration.getConfigurationSection<StorageConfiguration>(
        ConfigurationSection.performanceStorage
      ).enabled === true
    ) {
      parentPort?.postMessage(buildPerformanceStatisticsMessage(this.statistics))
    }
  }

  private initializePerformanceObserver(): void {
    this.performanceObserver = new PerformanceObserver(performanceObserverList => {
      const lastPerformanceEntry = performanceObserverList.getEntries()[0]
      // logger.debug(
      //   `${this.logPrefix()} '${lastPerformanceEntry.name}' performance entry: %j`,
      //   lastPerformanceEntry
      // )
      this.addPerformanceEntryToStatistics(lastPerformanceEntry)
    })
    this.performanceObserver.observe({ entryTypes: ['measure'] })
  }

  private readonly logPrefix = (): string => {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return logPrefix(` ${this.objName} | Performance statistics`)
  }

  private logStatistics(): void {
    logger.info(this.logPrefix(), {
      ...this.statistics,
      statisticsData: JSON.parse(
        JSONStringify(this.statistics.statisticsData, undefined, MapStringifyFormat.object)
      ) as Map<IncomingRequestCommand | RequestCommand | string, StatisticsData>,
    })
  }

  private startLogStatisticsInterval(): void {
    const logConfiguration = Configuration.getConfigurationSection<LogConfiguration>(
      ConfigurationSection.log
    )
    const logStatisticsInterval =
      logConfiguration.enabled === true ? (logConfiguration.statisticsInterval ?? 0) : 0
    if (logStatisticsInterval > 0 && this.displayInterval == null) {
      this.displayInterval = setInterval(() => {
        this.logStatistics()
      }, secondsToMilliseconds(logStatisticsInterval))
      logger.info(
        `${this.logPrefix()} logged every ${formatDurationSeconds(logStatisticsInterval)}`
      )
    } else if (this.displayInterval != null) {
      logger.info(
        `${this.logPrefix()} already logged every ${formatDurationSeconds(logStatisticsInterval)}`
      )
    } else if (logConfiguration.enabled === true) {
      logger.info(
        `${this.logPrefix()} log interval is set to ${logStatisticsInterval.toString()}. Not logging statistics`
      )
    }
  }

  private stopLogStatisticsInterval(): void {
    if (this.displayInterval != null) {
      clearInterval(this.displayInterval)
      delete this.displayInterval
    }
  }
}
