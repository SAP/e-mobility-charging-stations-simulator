// Copyright Jerome Benoit. 2021. All Rights Reserved.

import Constants from '../../utils/Constants';
import { MongoClient } from 'mongodb';
import Statistics from '../../types/Statistics';
import { Storage } from './Storage';
import { StorageType } from '../../types/Storage';

export class MongoDBStorage extends Storage {
  private client: MongoClient;
  private connected: boolean;

  constructor(storageURI: string, logPrefix: string) {
    super(storageURI, logPrefix);
    this.client = new MongoClient(this.storageURI.toString());
    this.connected = false;
    this.dbName = this.storageURI.pathname.replace(/(?:^\/)|(?:\/$)/g, '') ?? Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME;
  }

  public async storePerformanceStatistics(performanceStatistics: Statistics): Promise<void> {
    try {
      this.checkDBConnection();
      await this.client.db(this.dbName).collection<Statistics>(Constants.PERFORMANCE_RECORDS_TABLE).insertOne(performanceStatistics);
    } catch (error) {
      this.handleDBError(StorageType.MONGO_DB, error, Constants.PERFORMANCE_RECORDS_TABLE);
    }
  }

  public async open(): Promise<void> {
    try {
      if (!this.connected) {
        await this.client.connect();
        this.connected = true;
      }
    } catch (error) {
      this.handleDBError(StorageType.MONGO_DB, error);
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.connected) {
        await this.client.close();
        this.connected = false;
      }
    } catch (error) {
      this.handleDBError(StorageType.MONGO_DB, error);
    }
  }

  private checkDBConnection() {
    if (!this.connected) {
      throw new Error(`${this.logPrefix} ${this.getDBNameFromStorageType(StorageType.MONGO_DB)} connection not opened while trying to issue a request`);
    }
  }
}
