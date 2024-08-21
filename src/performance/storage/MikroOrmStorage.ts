// Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { type Options as MariaDbOptions, MikroORM as MariaDbORM } from '@mikro-orm/mariadb'
import { type Options as SqliteOptions, MikroORM as SqliteORM } from '@mikro-orm/sqlite'

import { type PerformanceRecord, type Statistics, StorageType } from '../../types/index.js'
import { Constants } from '../../utils/index.js'
import { Storage } from './Storage.js'

export class MikroOrmStorage extends Storage {
  private orm?: MariaDbORM | SqliteORM
  private readonly storageType: StorageType

  constructor (storageUri: string, logPrefix: string, storageType: StorageType) {
    super(storageUri, logPrefix)
    this.storageType = storageType
    this.dbName = this.getDBName()
  }

  private getClientUrl (): string | undefined {
    switch (this.storageType) {
      case StorageType.SQLITE:
      case StorageType.MARIA_DB:
      case StorageType.MYSQL:
        return this.storageUri.toString()
    }
  }

  private getDBName (): string {
    if (this.storageType === StorageType.SQLITE) {
      return `${Constants.DEFAULT_PERFORMANCE_DIRECTORY}/${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`
    }
    return this.storageUri.pathname.replace(/(?:^\/)|(?:\/$)/g, '')
  }

  private getOptions (): MariaDbOptions | SqliteOptions {
    return {
      clientUrl: this.getClientUrl(),
      dbName: this.dbName,
      entities: ['./dist/types/orm/entities/*.js'],
      entitiesTs: ['./src/types/orm/entities/*.ts'],
    }
  }

  public async close (): Promise<void> {
    this.clearPerformanceStatistics()
    try {
      if (this.orm != null) {
        await this.orm.close()
        delete this.orm
      }
    } catch (error) {
      this.handleDBStorageError(this.storageType, error as Error)
    }
  }

  public async open (): Promise<void> {
    try {
      if (this.orm == null) {
        switch (this.storageType) {
          case StorageType.SQLITE:
            this.orm = await SqliteORM.init(this.getOptions() as SqliteOptions)
            break
          case StorageType.MARIA_DB:
          case StorageType.MYSQL:
            this.orm = await MariaDbORM.init(this.getOptions() as MariaDbOptions)
            break
        }
      }
    } catch (error) {
      this.handleDBStorageError(this.storageType, error as Error)
    }
  }

  public async storePerformanceStatistics (performanceStatistics: Statistics): Promise<void> {
    try {
      this.setPerformanceStatistics(performanceStatistics)
      await this.orm?.em.upsert({
        ...performanceStatistics,
        statisticsData: Array.from(performanceStatistics.statisticsData, ([name, value]) => ({
          name,
          ...value,
        })),
      } satisfies PerformanceRecord)
    } catch (error) {
      this.handleDBStorageError(
        this.storageType,
        error as Error,
        Constants.PERFORMANCE_RECORDS_TABLE
      )
    }
  }
}
