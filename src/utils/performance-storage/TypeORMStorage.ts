// Copyright Jerome Benoit. 2021. All Rights Reserved.

import { Connection, ConnectionOptions, createConnection } from 'typeorm';
import { PerformanceData, PerformanceRecords } from '../../types/orm/entities/PerformanceRecords';

import Constants from '../Constants';
import Statistics from '../../types/Statistics';
import { Storage } from './Storage';
import { StorageType } from '../../types/Storage';
import path from 'path';

export class TypeORMStorage extends Storage {
  private storageType: StorageType;
  private connection: Connection;

  constructor(storageURI: string, logPrefix: string, storageType: StorageType) {
    super(storageURI, logPrefix);
    this.storageType = storageType;
    this.dbName = this.storageURI.pathname.replace(/(?:^\/)|(?:\/$)/g, '') ?? Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME;
  }

  public async storePerformanceStatistics(performanceStatistics: Statistics): Promise<void> {
    try {
      const performanceDataArray: PerformanceData[] = [];
      for (const key of Object.keys(performanceStatistics.statisticsData)) {
        const statisticsData = performanceStatistics.statisticsData[key];
        let performanceData = new PerformanceData();
        performanceData = {
          commandName: key,
          countRequest: statisticsData.countRequest,
          countResponse: statisticsData.countResponse,
          countError: statisticsData.countError,
          countTimeMeasurement: statisticsData.countTimeMeasurement,
          timeMeasurementSeries: statisticsData.timeMeasurementSeries,
          currentTimeMeasurement: statisticsData.currentTimeMeasurement,
          minTimeMeasurement: statisticsData.minTimeMeasurement,
          maxTimeMeasurement: statisticsData.maxTimeMeasurement,
          totalTimeMeasurement: statisticsData.totalTimeMeasurement,
          avgTimeMeasurement: statisticsData.avgTimeMeasurement,
          medTimeMeasurement: statisticsData.medTimeMeasurement,
          ninetyFiveThPercentileTimeMeasurement: statisticsData.ninetyFiveThPercentileTimeMeasurement,
          stdDevTimeMeasurement: statisticsData.stdDevTimeMeasurement
        };
        await this.connection.manager.save(performanceData);
        performanceDataArray.push(performanceData);
      }
      let performanceRecords = new PerformanceRecords();
      performanceRecords = {
        id: performanceStatistics.id,
        URI: performanceStatistics.URI,
        createdAt: performanceStatistics.createdAt,
        lastUpdatedAt: performanceStatistics.lastUpdatedAt,
        performanceData: performanceDataArray
      };
      await this.connection.manager.save(performanceRecords);
    } catch (error) {
      this.handleDBError(this.storageType, error, Constants.PERFORMANCE_RECORDS_TABLE);
    }
  }

  public async open(): Promise<void> {
    try {
      this.connection = await createConnection(this.getDBOptions(this.storageType));
      await this.connection.connect();
    } catch (error) {
      this.handleDBError(this.storageType, error);
    }
  }

  public async close(): Promise<void> {
    try {
      await this.connection.close();
    } catch (error) {
      this.handleDBError(this.storageType, error);
    }
  }

  private getDBOptions(storageType: StorageType): ConnectionOptions {
    switch (storageType) {
      case StorageType.MYSQL:
      case StorageType.MARIA_DB:
        return {
          type: 'mysql',
          url: this.storageURI.toString(),
          entities: [
            PerformanceRecords,
            PerformanceData
          ],
        };
      case StorageType.SQLITE:
        return {
          type: 'sqlite',
          database: path.join(path.resolve(__dirname, '../../../'), this.dbName),
          entities: [
            PerformanceRecords,
            PerformanceData
          ],
        };
    }
  }
}

