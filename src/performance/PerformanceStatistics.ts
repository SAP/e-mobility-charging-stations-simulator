// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { type PerformanceEntry, PerformanceObserver, performance } from 'node:perf_hooks';
import type { URL } from 'node:url';
import { parentPort } from 'node:worker_threads';

import { secondsToMilliseconds } from 'date-fns';

import {
  ConfigurationSection,
  type IncomingRequestCommand,
  type LogConfiguration,
  MessageType,
  type RequestCommand,
  type Statistics,
  type StorageConfiguration,
  type TimestampedData,
} from '../types';
import {
  CircularArray,
  Configuration,
  Constants,
  JSONStringifyWithMapSupport,
  average,
  buildPerformanceStatisticsMessage,
  extractTimeSeriesValues,
  formatDurationSeconds,
  generateUUID,
  logPrefix,
  logger,
  max,
  median,
  min,
  nthPercentile,
  stdDeviation,
} from '../utils';

export class PerformanceStatistics {
  private static readonly instances: Map<string, PerformanceStatistics> = new Map<
    string,
    PerformanceStatistics
  >();

  private readonly objId: string;
  private readonly objName: string;
  private performanceObserver!: PerformanceObserver;
  private readonly statistics: Statistics;
  private displayInterval?: NodeJS.Timeout;

  private constructor(objId: string, objName: string, uri: URL) {
    this.objId = objId;
    this.objName = objName;
    this.initializePerformanceObserver();
    this.statistics = {
      id: this.objId ?? 'Object id not specified',
      name: this.objName ?? 'Object name not specified',
      uri: uri.toString(),
      createdAt: new Date(),
      statisticsData: new Map(),
    };
  }

  public static getInstance(
    objId: string,
    objName: string,
    uri: URL,
  ): PerformanceStatistics | undefined {
    if (!PerformanceStatistics.instances.has(objId)) {
      PerformanceStatistics.instances.set(objId, new PerformanceStatistics(objId, objName, uri));
    }
    return PerformanceStatistics.instances.get(objId);
  }

  public static beginMeasure(id: string): string {
    const markId = `${id.charAt(0).toUpperCase()}${id.slice(1)}~${generateUUID()}`;
    performance.mark(markId);
    return markId;
  }

  public static endMeasure(name: string, markId: string): void {
    performance.measure(name, markId);
    performance.clearMarks(markId);
    performance.clearMeasures(name);
  }

  public addRequestStatistic(
    command: RequestCommand | IncomingRequestCommand,
    messageType: MessageType,
  ): void {
    switch (messageType) {
      case MessageType.CALL_MESSAGE:
        if (
          this.statistics.statisticsData.has(command) &&
          this.statistics.statisticsData.get(command)?.requestCount
        ) {
          ++this.statistics.statisticsData.get(command)!.requestCount!;
        } else {
          this.statistics.statisticsData.set(command, {
            ...this.statistics.statisticsData.get(command),
            requestCount: 1,
          });
        }
        break;
      case MessageType.CALL_RESULT_MESSAGE:
        if (
          this.statistics.statisticsData.has(command) &&
          this.statistics.statisticsData.get(command)?.responseCount
        ) {
          ++this.statistics.statisticsData.get(command)!.responseCount!;
        } else {
          this.statistics.statisticsData.set(command, {
            ...this.statistics.statisticsData.get(command),
            responseCount: 1,
          });
        }
        break;
      case MessageType.CALL_ERROR_MESSAGE:
        if (
          this.statistics.statisticsData.has(command) &&
          this.statistics.statisticsData.get(command)?.errorCount
        ) {
          ++this.statistics.statisticsData.get(command)!.errorCount!;
        } else {
          this.statistics.statisticsData.set(command, {
            ...this.statistics.statisticsData.get(command),
            errorCount: 1,
          });
        }
        break;
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        logger.error(`${this.logPrefix()} wrong message type ${messageType}`);
        break;
    }
  }

  public start(): void {
    this.startLogStatisticsInterval();
    const performanceStorageConfiguration =
      Configuration.getConfigurationSection<StorageConfiguration>(
        ConfigurationSection.performanceStorage,
      );
    if (performanceStorageConfiguration.enabled) {
      logger.info(
        `${this.logPrefix()} storage enabled: type ${performanceStorageConfiguration.type}, uri: ${
          performanceStorageConfiguration.uri
        }`,
      );
    }
  }

  public stop(): void {
    this.stopLogStatisticsInterval();
    performance.clearMarks();
    performance.clearMeasures();
    this.performanceObserver?.disconnect();
  }

  public restart(): void {
    this.stop();
    this.start();
  }

  private initializePerformanceObserver(): void {
    this.performanceObserver = new PerformanceObserver((performanceObserverList) => {
      const lastPerformanceEntry = performanceObserverList.getEntries()[0];
      // logger.debug(
      //   `${this.logPrefix()} '${lastPerformanceEntry.name}' performance entry: %j`,
      //   lastPerformanceEntry,
      // );
      this.addPerformanceEntryToStatistics(lastPerformanceEntry);
    });
    this.performanceObserver.observe({ entryTypes: ['measure'] });
  }

  private logStatistics(): void {
    logger.info(`${this.logPrefix()}`, {
      ...this.statistics,
      statisticsData: JSONStringifyWithMapSupport(this.statistics.statisticsData),
    });
  }

  private startLogStatisticsInterval(): void {
    const logConfiguration = Configuration.getConfigurationSection<LogConfiguration>(
      ConfigurationSection.log,
    );
    const logStatisticsInterval = logConfiguration.enabled
      ? logConfiguration.statisticsInterval!
      : 0;
    if (logStatisticsInterval > 0 && !this.displayInterval) {
      this.displayInterval = setInterval(() => {
        this.logStatistics();
      }, secondsToMilliseconds(logStatisticsInterval));
      logger.info(
        `${this.logPrefix()} logged every ${formatDurationSeconds(logStatisticsInterval)}`,
      );
    } else if (this.displayInterval) {
      logger.info(
        `${this.logPrefix()} already logged every ${formatDurationSeconds(logStatisticsInterval)}`,
      );
    } else if (logConfiguration.enabled) {
      logger.info(
        `${this.logPrefix()} log interval is set to ${logStatisticsInterval}. Not logging statistics`,
      );
    }
  }

  private stopLogStatisticsInterval(): void {
    if (this.displayInterval) {
      clearInterval(this.displayInterval);
      delete this.displayInterval;
    }
  }

  private addPerformanceEntryToStatistics(entry: PerformanceEntry): void {
    const entryName = entry.name;
    // Initialize command statistics
    if (!this.statistics.statisticsData.has(entryName)) {
      this.statistics.statisticsData.set(entryName, {});
    }
    // Update current statistics
    this.statistics.statisticsData.get(entryName)!.timeMeasurementCount =
      (this.statistics.statisticsData.get(entryName)?.timeMeasurementCount ?? 0) + 1;
    this.statistics.statisticsData.get(entryName)!.currentTimeMeasurement = entry.duration;
    this.statistics.statisticsData.get(entryName)!.minTimeMeasurement = min(
      entry.duration,
      this.statistics.statisticsData.get(entryName)?.minTimeMeasurement ?? Infinity,
    );
    this.statistics.statisticsData.get(entryName)!.maxTimeMeasurement = max(
      entry.duration,
      this.statistics.statisticsData.get(entryName)?.maxTimeMeasurement ?? -Infinity,
    );
    this.statistics.statisticsData.get(entryName)!.totalTimeMeasurement =
      (this.statistics.statisticsData.get(entryName)?.totalTimeMeasurement ?? 0) + entry.duration;
    this.statistics.statisticsData.get(entryName)?.measurementTimeSeries instanceof CircularArray
      ? this.statistics.statisticsData
          .get(entryName)
          ?.measurementTimeSeries?.push({ timestamp: entry.startTime, value: entry.duration })
      : (this.statistics.statisticsData.get(entryName)!.measurementTimeSeries =
          new CircularArray<TimestampedData>(Constants.DEFAULT_CIRCULAR_BUFFER_CAPACITY, {
            timestamp: entry.startTime,
            value: entry.duration,
          }));
    const timeMeasurementValues = extractTimeSeriesValues(
      this.statistics.statisticsData.get(entryName)!.measurementTimeSeries!,
    );
    this.statistics.statisticsData.get(entryName)!.avgTimeMeasurement =
      average(timeMeasurementValues);
    this.statistics.statisticsData.get(entryName)!.medTimeMeasurement =
      median(timeMeasurementValues);
    this.statistics.statisticsData.get(entryName)!.ninetyFiveThPercentileTimeMeasurement =
      nthPercentile(timeMeasurementValues, 95);
    this.statistics.statisticsData.get(entryName)!.stdDevTimeMeasurement = stdDeviation(
      timeMeasurementValues,
      this.statistics.statisticsData.get(entryName)!.avgTimeMeasurement,
    );
    this.statistics.updatedAt = new Date();
    if (
      Configuration.getConfigurationSection<StorageConfiguration>(
        ConfigurationSection.performanceStorage,
      ).enabled
    ) {
      parentPort?.postMessage(buildPerformanceStatisticsMessage(this.statistics));
    }
  }

  private logPrefix = (): string => {
    return logPrefix(` ${this.objName} | Performance statistics`);
  };
}
