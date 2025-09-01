// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { URL } from 'node:url'

import {
  DBName,
  type EmptyObject,
  type HandleErrorParams,
  type Statistics,
  StorageType,
} from '../../types/index.js'
import { logger } from '../../utils/index.js'

export abstract class Storage {
  private static readonly performanceStatistics = new Map<string, Statistics>()
  protected dbName!: string
  protected readonly logPrefix: string
  protected readonly storageUri: URL

  constructor (storageUri: string, logPrefix: string) {
    this.storageUri = new URL(storageUri)
    this.logPrefix = logPrefix
  }

  public abstract close (): Promise<void> | void

  public getPerformanceStatistics (): IterableIterator<Statistics> {
    return Storage.performanceStatistics.values()
  }

  public abstract open (): Promise<void> | void

  public abstract storePerformanceStatistics (
    performanceStatistics: Statistics
  ): Promise<void> | void

  protected clearPerformanceStatistics (): void {
    Storage.performanceStatistics.clear()
  }

  protected getDBNameFromStorageType (type: StorageType): DBName | undefined {
    switch (type) {
      case StorageType.MARIA_DB:
        return DBName.MARIA_DB
      case StorageType.MONGO_DB:
        return DBName.MONGO_DB
      case StorageType.MYSQL:
        return DBName.MYSQL
      case StorageType.SQLITE:
        return DBName.SQLITE
    }
  }

  protected handleDBStorageError (
    type: StorageType,
    error: Error,
    table?: string,
    params: HandleErrorParams<EmptyObject> = {
      consoleOut: false,
      throwError: false,
    }
  ): void {
    params = {
      ...{
        consoleOut: false,
        throwError: false,
      },
      ...params,
    }
    const inTableOrCollectionStr = table != null && ` in table or collection '${table}'`
    logger.error(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${this.logPrefix} ${this.getDBNameFromStorageType(type)} error '${
        error.message
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }'${inTableOrCollectionStr}:`,
      error
    )
    if (params.throwError === true) {
      throw error
    }
  }

  protected setPerformanceStatistics (performanceStatistics: Statistics): void {
    Storage.performanceStatistics.set(performanceStatistics.id, performanceStatistics)
  }
}
