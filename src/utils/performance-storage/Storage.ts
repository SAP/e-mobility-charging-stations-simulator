// Copyright Jerome Benoit. 2021. All Rights Reserved.

import { DBType, StorageType } from '../../types/Storage';

import Statistics from '../../types/Statistics';
import { URL } from 'url';
import Utils from '../Utils';
import logger from '../Logger';

export abstract class Storage {
  protected readonly storageURI: URL;
  protected readonly logPrefix: string;
  protected dbName: string;

  constructor(storageURI: string, logPrefix: string) {
    this.storageURI = new URL(storageURI);
    this.logPrefix = logPrefix;
  }

  protected handleDBError(type: StorageType, error: Error, table?: string): void {
    logger.error(`${this.logPrefix} ${this.getDBTypeFromStorageType(type)} error${(!Utils.isNullOrUndefined(table) || !table) && ` in table or collection '${table}'`} %j`, error);
  }

  protected getDBTypeFromStorageType(type: StorageType): DBType {
    switch (type) {
      case StorageType.MARIA_DB:
        return DBType.MARIA_DB;
      case StorageType.MONGO_DB:
        return DBType.MONGO_DB;
      case StorageType.MYSQL:
        return DBType.MYSQL;
      case StorageType.SQLITE:
        return DBType.SQLITE;
    }
  }

  public abstract open(): void | Promise<void>;
  public abstract close(): void | Promise<void>;
  public abstract storePerformanceStatistics(performanceStatistics: Statistics): void | Promise<void>;
}
