// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
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

  /**
   * Closes the storage, releasing any underlying handles.
   * @returns Promise that resolves once closed, or `void` for synchronous implementations.
   */
  public abstract close (): Promise<void> | void

  public getPerformanceStatistics (): IterableIterator<Statistics> {
    return Storage.performanceStatistics.values()
  }

  /**
   * Opens the storage, acquiring any underlying handles.
   * @returns Promise that resolves once open, or `void` for synchronous implementations.
   */
  public abstract open (): Promise<void> | void

  /**
   * Persists a performance statistics snapshot.
   * @param performanceStatistics - Statistics snapshot to persist.
   * @returns Promise that resolves once the snapshot is stored, or `void` for synchronous implementations.
   */
  public abstract storePerformanceStatistics (
    performanceStatistics: Statistics
  ): Promise<void> | void

  protected clearPerformanceStatistics (): void {
    Storage.performanceStatistics.clear()
  }

  protected ensureDBDirectory (): void {
    if (!existsSync(dirname(this.dbName))) {
      mkdirSync(dirname(this.dbName), { recursive: true })
    }
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
    const inTableOrCollectionStr = table != null ? ` in table or collection '${table}'` : ''
    logger.error(
      `${this.logPrefix} ${this.getDBNameFromStorageType(type) ?? 'Unknown'} error '${error.message}'${inTableOrCollectionStr}:`,
      error
    )
    if (params.throwError === true) {
      throw error
    }
  }

  protected serializePerformanceStatistics (
    performanceStatistics: Statistics
  ): Record<string, unknown> {
    return {
      ...performanceStatistics,
      statisticsData: Array.from(performanceStatistics.statisticsData, ([name, value]) => ({
        ...value,
        measurementTimeSeries:
          value.measurementTimeSeries != null ? [...value.measurementTimeSeries] : undefined,
        name,
      })),
    }
  }

  protected setPerformanceStatistics (performanceStatistics: Statistics): void {
    Storage.performanceStatistics.set(performanceStatistics.id, performanceStatistics)
  }
}
