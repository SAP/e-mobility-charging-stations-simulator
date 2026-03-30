// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { type Options as SqliteOptions, MikroORM as SqliteORM } from '@mikro-orm/better-sqlite'
import { type Options as MariaDbOptions, MikroORM as MariaDbORM } from '@mikro-orm/mariadb'

import { BaseError } from '../../exception/index.js'
import { PerformanceRecord, type Statistics, StorageType } from '../../types/index.js'
import { Constants, ensureError } from '../../utils/index.js'
import { Storage } from './Storage.js'

export class MikroOrmStorage extends Storage {
  private orm?: MariaDbORM | SqliteORM
  private readonly storageType: StorageType

  constructor(storageUri: string, logPrefix: string, storageType: StorageType) {
    super(storageUri, logPrefix)
    this.storageType = storageType
    this.dbName = this.getDBName()
  }

  public async close(): Promise<void> {
    this.clearPerformanceStatistics()
    try {
      if (this.orm != null) {
        await this.orm.close()
        delete this.orm
      }
    } catch (error) {
      this.handleDBStorageError(this.storageType, ensureError(error))
    }
  }

  public async open(): Promise<void> {
    try {
      if (this.orm == null) {
        let orm: MariaDbORM | SqliteORM | undefined
        switch (this.storageType) {
          case StorageType.MARIA_DB:
          case StorageType.MYSQL:
            orm = await MariaDbORM.init(this.getOptions() as MariaDbOptions)
            break
          case StorageType.SQLITE:
            this.ensureDBDirectory()
            orm = await SqliteORM.init(this.getOptions() as SqliteOptions)
            break
        }
        if (orm != null) {
          try {
            await orm.schema.updateSchema()
          } catch (error) {
            await orm.close()
            throw error
          }
          this.orm = orm
        }
      }
    } catch (error) {
      this.handleDBStorageError(this.storageType, ensureError(error))
    }
  }

  public async storePerformanceStatistics(performanceStatistics: Statistics): Promise<void> {
    try {
      this.setPerformanceStatistics(performanceStatistics)
      this.checkDBConnection()
      const em = this.orm?.em.fork()
      await em?.upsert(
        PerformanceRecord,
        this.serializePerformanceStatistics(performanceStatistics)
      )
    } catch (error) {
      this.handleDBStorageError(
        this.storageType,
        ensureError(error),
        Constants.PERFORMANCE_RECORDS_TABLE
      )
    }
  }

  private checkDBConnection(): void {
    if (this.orm == null) {
      throw new BaseError(
        `${this.logPrefix} ${this.getDBNameFromStorageType(this.storageType) ?? 'Unknown'} ORM not initialized while trying to issue a request`
      )
    }
  }

  private getClientUrl(): string | undefined {
    switch (this.storageType) {
      case StorageType.MARIA_DB:
      case StorageType.MYSQL:
      case StorageType.SQLITE:
        return this.storageUri.toString()
    }
  }

  private getDBName(): string {
    if (this.storageType === StorageType.SQLITE) {
      return `${Constants.DEFAULT_PERFORMANCE_DIRECTORY}/${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`
    }
    return this.storageUri.pathname.replace(/(?:^\/)|(?:\/$)/g, '')
  }

  private getOptions(): MariaDbOptions | SqliteOptions {
    return {
      clientUrl: this.getClientUrl(),
      dbName: this.dbName,
      entities: [PerformanceRecord],
    }
  }
}
