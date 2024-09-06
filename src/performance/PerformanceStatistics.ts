// Partial Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import type { URL } from 'node:url'

import { secondsToMilliseconds } from 'date-fns'
import { CircularBuffer } from 'mnemonist'
import { performance, type PerformanceEntry, PerformanceObserver } from 'node:perf_hooks'
import { parentPort } from 'node:worker_threads'
import { is, mean, median } from 'rambda'

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
  min,
  nthPercentile,
  stdDeviation,
} from '../utils/index.js'

export class PerformanceStatistics {
  private static readonly instances: Map<string, PerformanceStatistics> = new Map<
    string,
    PerformanceStatistics
  >()

  private static readonly logPrefix = (): string => {
    return logPrefix(' Performance statistics')
  }

  private displayInterval?: NodeJS.Timeout
  private readonly logPrefix = (): string => {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return logPrefix(` ${this.objName} | Performance statistics`)
  }

  private readonly objId: string | undefined
  private readonly objName: string | undefined

  private performanceObserver!: PerformanceObserver

  private readonly statistics: Statistics

  private constructor (objId: string, objName: string, uri: URL) {
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

  public static beginMeasure (id: string): string {
    const markId = `${id.charAt(0).toUpperCase()}${id.slice(1)}~${generateUUID()}`
    performance.mark(markId)
    return markId
  }

  public static deleteInstance (objId: string | undefined): boolean {
    if (objId == null) {
      const errMsg = 'Cannot delete performance statistics instance without specifying object id'
      logger.error(`${PerformanceStatistics.logPrefix()} ${errMsg}`)
      throw new BaseError(errMsg)
    }
    return PerformanceStatistics.instances.delete(objId)
  }

  public static endMeasure (name: string, markId: string): void {
    try {
      performance.measure(name, markId)
    } catch (error) {
      if (is(Error, error) && error.message.includes('performance mark has not been set')) {
        /* Ignore */
      } else {
        throw error
      }
    }
    performance.clearMarks(markId)
    performance.clearMeasures(name)
  }

  public static getInstance (
    objId: string | undefined,
    objName: string | undefined,
    uri: undefined | URL
  ): PerformanceStatistics | undefined {
    if (objId == null) {
      const errMsg = 'Cannot get performance statistics instance without specifying object id'
      logger.error(`${PerformanceStatistics.logPrefix()} ${errMsg}`)
      throw new BaseError(errMsg)
    }
    if (objName == null) {
      const errMsg = 'Cannot get performance statistics instance without specifying object name'
      logger.error(`${PerformanceStatistics.logPrefix()} ${errMsg}`)
      throw new BaseError(errMsg)
    }
    if (uri == null) {
      const errMsg = 'Cannot get performance statistics instance without specifying object uri'
      logger.error(`${PerformanceStatistics.logPrefix()} ${errMsg}`)
      throw new BaseError(errMsg)
    }
    if (!PerformanceStatistics.instances.has(objId)) {
      PerformanceStatistics.instances.set(objId, new PerformanceStatistics(objId, objName, uri))
    }
    return PerformanceStatistics.instances.get(objId)
  }

  private addPerformanceEntryToStatistics (entry: PerformanceEntry): void {
    // Initialize command statistics
    if (!this.statistics.statisticsData.has(entry.name)) {
      this.statistics.statisticsData.set(entry.name, {})
    }
    // Update current statistics
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.statistics.statisticsData.get(entry.name)!.timeMeasurementCount =
      (this.statistics.statisticsData.get(entry.name)?.timeMeasurementCount ?? 0) + 1
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.statistics.statisticsData.get(entry.name)!.currentTimeMeasurement = entry.duration
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.statistics.statisticsData.get(entry.name)!.minTimeMeasurement = min(
      entry.duration,
      this.statistics.statisticsData.get(entry.name)?.minTimeMeasurement ?? Number.POSITIVE_INFINITY
    )
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.statistics.statisticsData.get(entry.name)!.maxTimeMeasurement = max(
      entry.duration,
      this.statistics.statisticsData.get(entry.name)?.maxTimeMeasurement ?? Number.NEGATIVE_INFINITY
    )
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.statistics.statisticsData.get(entry.name)!.totalTimeMeasurement =
      (this.statistics.statisticsData.get(entry.name)?.totalTimeMeasurement ?? 0) + entry.duration
    if (
      !(
        this.statistics.statisticsData.get(entry.name)?.measurementTimeSeries instanceof
        CircularBuffer
      )
    ) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.statistics.statisticsData.get(entry.name)!.measurementTimeSeries =
        new CircularBuffer<TimestampedData>(
          Array<TimestampedData>,
          Constants.DEFAULT_CIRCULAR_BUFFER_CAPACITY
        )
    }
    this.statistics.statisticsData.get(entry.name)?.measurementTimeSeries?.push({
      timestamp: entry.startTime,
      value: entry.duration,
    })
    const timeMeasurementValues = extractTimeSeriesValues(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.statistics.statisticsData.get(entry.name)!
        .measurementTimeSeries as CircularBuffer<TimestampedData>
    )
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.statistics.statisticsData.get(entry.name)!.avgTimeMeasurement = mean(timeMeasurementValues)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.statistics.statisticsData.get(entry.name)!.medTimeMeasurement =
      median(timeMeasurementValues)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.statistics.statisticsData.get(entry.name)!.ninetyFiveThPercentileTimeMeasurement =
      nthPercentile(timeMeasurementValues, 95)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.statistics.statisticsData.get(entry.name)!.stdDevTimeMeasurement = stdDeviation(
      timeMeasurementValues,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.statistics.statisticsData.get(entry.name)!.avgTimeMeasurement
    )
    this.statistics.updatedAt = new Date()
    if (
      Configuration.getConfigurationSection<StorageConfiguration>(
        ConfigurationSection.performanceStorage
      ).enabled === true
    ) {
      parentPort?.postMessage(buildPerformanceStatisticsMessage(this.statistics))
    }
  }

  private initializePerformanceObserver (): void {
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

  private logStatistics (): void {
    logger.info(this.logPrefix(), {
      ...this.statistics,
      statisticsData: JSON.parse(
        JSONStringify(this.statistics.statisticsData, undefined, MapStringifyFormat.object)
      ) as Map<IncomingRequestCommand | RequestCommand | string, StatisticsData>,
    })
  }

  private startLogStatisticsInterval (): void {
    const logConfiguration = Configuration.getConfigurationSection<LogConfiguration>(
      ConfigurationSection.log
    )
    const logStatisticsInterval =
      logConfiguration.enabled === true
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        logConfiguration.statisticsInterval!
        : 0
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

  private stopLogStatisticsInterval (): void {
    if (this.displayInterval != null) {
      clearInterval(this.displayInterval)
      delete this.displayInterval
    }
  }

  public addRequestStatistic (
    command: IncomingRequestCommand | RequestCommand,
    messageType: MessageType
  ): void {
    switch (messageType) {
      case MessageType.CALL_ERROR_MESSAGE:
        if (
          this.statistics.statisticsData.has(command) &&
          this.statistics.statisticsData.get(command)?.errorCount != null
        ) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ++this.statistics.statisticsData.get(command)!.errorCount!
        } else {
          this.statistics.statisticsData.set(command, {
            ...this.statistics.statisticsData.get(command),
            errorCount: 1,
          })
        }
        break
      case MessageType.CALL_MESSAGE:
        if (
          this.statistics.statisticsData.has(command) &&
          this.statistics.statisticsData.get(command)?.requestCount != null
        ) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ++this.statistics.statisticsData.get(command)!.requestCount!
        } else {
          this.statistics.statisticsData.set(command, {
            ...this.statistics.statisticsData.get(command),
            requestCount: 1,
          })
        }
        break
      case MessageType.CALL_RESULT_MESSAGE:
        if (
          this.statistics.statisticsData.has(command) &&
          this.statistics.statisticsData.get(command)?.responseCount != null
        ) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ++this.statistics.statisticsData.get(command)!.responseCount!
        } else {
          this.statistics.statisticsData.set(command, {
            ...this.statistics.statisticsData.get(command),
            responseCount: 1,
          })
        }
        break
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        logger.error(`${this.logPrefix()} wrong message type ${messageType}`)
        break
    }
  }

  public restart (): void {
    this.stop()
    this.start()
  }

  public start (): void {
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

  public stop (): void {
    this.stopLogStatisticsInterval()
    performance.clearMarks()
    performance.clearMeasures()
    this.performanceObserver.disconnect()
  }
}
