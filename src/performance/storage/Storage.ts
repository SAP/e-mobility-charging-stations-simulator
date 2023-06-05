// Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { URL } from 'node:url';

import {
  DBName,
  type EmptyObject,
  type HandleErrorParams,
  type Statistics,
  StorageType,
} from '../../types';
import { Utils, logger, setDefaultErrorParams } from '../../utils';

export abstract class Storage {
  protected readonly storageUri: URL;
  protected readonly logPrefix: string;
  protected dbName!: string;

  constructor(storageUri: string, logPrefix: string) {
    this.storageUri = new URL(storageUri);
    this.logPrefix = logPrefix;
  }

  protected handleDBError(
    type: StorageType,
    error: Error,
    table?: string,
    params: HandleErrorParams<EmptyObject> = { throwError: false, consoleOut: false }
  ): void {
    setDefaultErrorParams(params, { throwError: false, consoleOut: false });
    const inTableOrCollectionStr =
      (!Utils.isNullOrUndefined(table) || !table) && ` in table or collection '${table}'`;
    logger.error(
      `${this.logPrefix} ${this.getDBNameFromStorageType(type)} error '${
        error.message
      }'${inTableOrCollectionStr}:`,
      error
    );
    if (params?.throwError) {
      throw error;
    }
  }

  protected getDBNameFromStorageType(type: StorageType): DBName | undefined {
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
  public abstract storePerformanceStatistics(
    performanceStatistics: Statistics
  ): void | Promise<void>;
}
