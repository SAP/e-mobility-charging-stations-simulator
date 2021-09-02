// Copyright Jerome Benoit. 2021. All Rights Reserved.

import { DBName, StorageType } from '../../types/Storage';

import Statistics from '../../types/Statistics';
import { URL } from 'url';
import Utils from '../../utils/Utils';
import logger from '../../utils/Logger';

export abstract class Storage {
  protected readonly storageURI: URL;
  protected readonly logPrefix: string;
  protected dbName: string;

  constructor(storageURI: string, logPrefix: string) {
    this.storageURI = new URL(storageURI);
    this.logPrefix = logPrefix;
  }

  protected handleDBError(type: StorageType, error: Error, table?: string): void {
    logger.error(`${this.logPrefix} ${this.getDBNameFromStorageType(type)} error '${error.message}'${(!Utils.isNullOrUndefined(table) || !table) && ` in table or collection '${table}'`}: %j`, error);
  }

  protected getDBNameFromStorageType(type: StorageType): DBName {
    switch (type) {
      case StorageType.MARIA_DB:
        return DBName.MARIA_DB;
      case StorageType.MONGO_DB:
        return DBName.MONGO_DB;
      case StorageType.MYSQL:
        return DBName.MYSQL;
      case StorageType.SQLITE:
        return DBName.SQLITE;
    }
  }

  public abstract open(): void | Promise<void>;
  public abstract close(): void | Promise<void>;
  public abstract storePerformanceStatistics(performanceStatistics: Statistics): void | Promise<void>;
}
