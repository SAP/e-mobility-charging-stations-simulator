// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { PerformanceEntry, PerformanceObserver, performance } from 'perf_hooks';
import type { URL } from 'url';
import { parentPort } from 'worker_threads';

import { MessageChannelUtils } from '../charging-station/MessageChannelUtils';
import { MessageType } from '../types/ocpp/MessageType';
import type { IncomingRequestCommand, RequestCommand } from '../types/ocpp/Requests';
import type { Statistics, StatisticsData, TimeSeries } from '../types/Statistics';
import { CircularArray, DEFAULT_CIRCULAR_ARRAY_SIZE } from '../utils/CircularArray';
import Configuration from '../utils/Configuration';
import logger from '../utils/Logger';
import Utils from '../utils/Utils';

export default class PerformanceStatistics {
  private static readonly instances: Map<string, PerformanceStatistics> = new Map<
    string,
    PerformanceStatistics
  >();

  private readonly objId: string;
  private readonly objName: string;
  private performanceObserver: PerformanceObserver;
  private readonly statistics: Statistics;
  private displayInterval: NodeJS.Timeout;

  private constructor(objId: string, objName: string, uri: URL) {
    this.objId = objId;
    this.objName = objName;
    this.initializePerformanceObserver();
    this.statistics = {
      id: this.objId ?? 'Object id not specified',
      name: this.objName ?? 'Object name not specified',
      uri: uri.toString(),
      createdAt: new Date(),
      statisticsData: new Map<string, Partial<StatisticsData>>(),
    };
  }

  public static getInstance(
    objId: string,
    objName: string,
    uri: URL
  ): PerformanceStatistics | undefined {
    if (!PerformanceStatistics.instances.has(objId)) {
      PerformanceStatistics.instances.set(objId, new PerformanceStatistics(objId, objName, uri));
    }
    return PerformanceStatistics.instances.get(objId);
  }

  public static beginMeasure(id: string): string {
    const markId = `${id.charAt(0).toUpperCase() + id.slice(1)}~${Utils.generateUUID()}`;
    performance.mark(markId);
    return markId;
  }

  public static endMeasure(name: string, markId: string): void {
    performance.measure(name, markId);
    performance.clearMarks(markId);
  }

  public addRequestStatistic(
    command: RequestCommand | IncomingRequestCommand,
    messageType: MessageType
  ): void {
    switch (messageType) {
      case MessageType.CALL_MESSAGE:
        if (
          this.statistics.statisticsData.has(command) &&
          this.statistics.statisticsData.get(command)?.countRequest
        ) {
          this.statistics.statisticsData.get(command).countRequest++;
        } else {
          this.statistics.statisticsData.set(
            command,
            Object.assign({ countRequest: 1 }, this.statistics.statisticsData.get(command))
          );
        }
        break;
      case MessageType.CALL_RESULT_MESSAGE:
        if (
          this.statistics.statisticsData.has(command) &&
          this.statistics.statisticsData.get(command)?.countResponse
        ) {
          this.statistics.statisticsData.get(command).countResponse++;
        } else {
          this.statistics.statisticsData.set(
            command,
            Object.assign({ countResponse: 1 }, this.statistics.statisticsData.get(command))
          );
        }
        break;
      case MessageType.CALL_ERROR_MESSAGE:
        if (
          this.statistics.statisticsData.has(command) &&
          this.statistics.statisticsData.get(command)?.countError
        ) {
          this.statistics.statisticsData.get(command).countError++;
        } else {
          this.statistics.statisticsData.set(
            command,
            Object.assign({ countError: 1 }, this.statistics.statisticsData.get(command))
          );
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
    if (Configuration.getPerformanceStorage().enabled) {
      logger.info(
        `${this.logPrefix()} storage enabled: type ${
          Configuration.getPerformanceStorage().type
        }, uri: ${Configuration.getPerformanceStorage().uri}`
      );
    }
  }

  public stop(): void {
    if (this.displayInterval) {
      clearInterval(this.displayInterval);
    }
    performance.clearMarks();
    this.performanceObserver?.disconnect();
  }

  public restart(): void {
    this.stop();
    this.start();
  }

  private initializePerformanceObserver(): void {
    this.performanceObserver = new PerformanceObserver((list) => {
      const lastPerformanceEntry = list.getEntries()[0];
      this.addPerformanceEntryToStatistics(lastPerformanceEntry);
      logger.debug(
        `${this.logPrefix()} '${lastPerformanceEntry.name}' performance entry: %j`,
        lastPerformanceEntry
      );
    });
    this.performanceObserver.observe({ entryTypes: ['measure'] });
  }

  private logStatistics(): void {
    logger.info(this.logPrefix() + ' %j', this.statistics);
  }

  private startLogStatisticsInterval(): void {
    if (Configuration.getLogStatisticsInterval() > 0) {
      this.displayInterval = setInterval(() => {
        this.logStatistics();
      }, Configuration.getLogStatisticsInterval() * 1000);
      logger.info(
        this.logPrefix() +
          ' logged every ' +
          Utils.formatDurationSeconds(Configuration.getLogStatisticsInterval())
      );
    } else {
      logger.info(
        this.logPrefix() +
          ' log interval is set to ' +
          Configuration.getLogStatisticsInterval().toString() +
          '. Not logging statistics'
      );
    }
  }

  private median(dataSet: number[]): number {
    if (Array.isArray(dataSet) === true && dataSet.length === 1) {
      return dataSet[0];
    }
    const sortedDataSet = dataSet.slice().sort((a, b) => a - b);
    const middleIndex = Math.floor(sortedDataSet.length / 2);
    if (sortedDataSet.length % 2) {
      return sortedDataSet[middleIndex / 2];
    }
    return (sortedDataSet[middleIndex - 1] + sortedDataSet[middleIndex]) / 2;
  }

  // TODO: use order statistics tree https://en.wikipedia.org/wiki/Order_statistic_tree
  private percentile(dataSet: number[], percentile: number): number {
    if (percentile < 0 && percentile > 100) {
      throw new RangeError('Percentile is not between 0 and 100');
    }
    if (Utils.isEmptyArray(dataSet)) {
      return 0;
    }
    const sortedDataSet = dataSet.slice().sort((a, b) => a - b);
    if (percentile === 0) {
      return sortedDataSet[0];
    }
    if (percentile === 100) {
      return sortedDataSet[sortedDataSet.length - 1];
    }
    const percentileIndex = (percentile / 100) * sortedDataSet.length - 1;
    if (Number.isInteger(percentileIndex)) {
      return (sortedDataSet[percentileIndex] + sortedDataSet[percentileIndex + 1]) / 2;
    }
    return sortedDataSet[Math.round(percentileIndex)];
  }

  private stdDeviation(dataSet: number[]): number {
    let totalDataSet = 0;
    for (const data of dataSet) {
      totalDataSet += data;
    }
    const dataSetMean = totalDataSet / dataSet.length;
    let totalGeometricDeviation = 0;
    for (const data of dataSet) {
      const deviation = data - dataSetMean;
      totalGeometricDeviation += deviation * deviation;
    }
    return Math.sqrt(totalGeometricDeviation / dataSet.length);
  }

  private addPerformanceEntryToStatistics(entry: PerformanceEntry): void {
    const entryName = entry.name;
    // Initialize command statistics
    if (!this.statistics.statisticsData.has(entryName)) {
      this.statistics.statisticsData.set(entryName, {});
    }
    // Update current statistics
    this.statistics.updatedAt = new Date();
    this.statistics.statisticsData.get(entryName).countTimeMeasurement =
      this.statistics.statisticsData.get(entryName)?.countTimeMeasurement
        ? this.statistics.statisticsData.get(entryName).countTimeMeasurement + 1
        : 1;
    this.statistics.statisticsData.get(entryName).currentTimeMeasurement = entry.duration;
    this.statistics.statisticsData.get(entryName).minTimeMeasurement =
      this.statistics.statisticsData.get(entryName)?.minTimeMeasurement
        ? this.statistics.statisticsData.get(entryName).minTimeMeasurement > entry.duration
          ? entry.duration
          : this.statistics.statisticsData.get(entryName).minTimeMeasurement
        : entry.duration;
    this.statistics.statisticsData.get(entryName).maxTimeMeasurement =
      this.statistics.statisticsData.get(entryName)?.maxTimeMeasurement
        ? this.statistics.statisticsData.get(entryName).maxTimeMeasurement < entry.duration
          ? entry.duration
          : this.statistics.statisticsData.get(entryName).maxTimeMeasurement
        : entry.duration;
    this.statistics.statisticsData.get(entryName).totalTimeMeasurement =
      this.statistics.statisticsData.get(entryName)?.totalTimeMeasurement
        ? this.statistics.statisticsData.get(entryName).totalTimeMeasurement + entry.duration
        : entry.duration;
    this.statistics.statisticsData.get(entryName).avgTimeMeasurement =
      this.statistics.statisticsData.get(entryName).totalTimeMeasurement /
      this.statistics.statisticsData.get(entryName).countTimeMeasurement;
    Array.isArray(this.statistics.statisticsData.get(entryName).timeMeasurementSeries) === true
      ? this.statistics.statisticsData
          .get(entryName)
          .timeMeasurementSeries.push({ timestamp: entry.startTime, value: entry.duration })
      : (this.statistics.statisticsData.get(entryName).timeMeasurementSeries =
          new CircularArray<TimeSeries>(DEFAULT_CIRCULAR_ARRAY_SIZE, {
            timestamp: entry.startTime,
            value: entry.duration,
          }));
    this.statistics.statisticsData.get(entryName).medTimeMeasurement = this.median(
      this.extractTimeSeriesValues(
        this.statistics.statisticsData.get(entryName).timeMeasurementSeries
      )
    );
    this.statistics.statisticsData.get(entryName).ninetyFiveThPercentileTimeMeasurement =
      this.percentile(
        this.extractTimeSeriesValues(
          this.statistics.statisticsData.get(entryName).timeMeasurementSeries
        ),
        95
      );
    this.statistics.statisticsData.get(entryName).stdDevTimeMeasurement = this.stdDeviation(
      this.extractTimeSeriesValues(
        this.statistics.statisticsData.get(entryName).timeMeasurementSeries
      )
    );
    if (Configuration.getPerformanceStorage().enabled) {
      parentPort.postMessage(
        MessageChannelUtils.buildPerformanceStatisticsMessage(this.statistics)
      );
    }
  }

  private extractTimeSeriesValues(timeSeries: CircularArray<TimeSeries>): number[] {
    return timeSeries.map((timeSeriesItem) => timeSeriesItem.value);
  }

  private logPrefix(): string {
    return Utils.logPrefix(` ${this.objName} | Performance statistics`);
  }
}
