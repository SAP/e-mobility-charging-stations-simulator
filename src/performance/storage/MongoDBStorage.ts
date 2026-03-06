// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { MongoClient } from 'mongodb'

import { BaseError } from '../../exception/index.js'
import { type Statistics, StorageType } from '../../types/index.js'
import { Constants } from '../../utils/index.js'
import { Storage } from './Storage.js'

export class MongoDBStorage extends Storage {
  private readonly client: MongoClient
  private opened: boolean

  constructor (storageUri: string, logPrefix: string) {
    super(storageUri, logPrefix)
    this.client = new MongoClient(this.storageUri.toString())
    this.opened = false
    this.dbName = this.storageUri.pathname.replace(/(?:^\/)|(?:\/$)/g, '')
  }

  public async close (): Promise<void> {
    this.clearPerformanceStatistics()
    try {
      if (this.opened) {
        await this.client.close()
        this.opened = false
      }
    } catch (error) {
      this.handleDBStorageError(StorageType.MONGO_DB, error as Error)
    }
  }

  public async open (): Promise<void> {
    try {
      if (!this.opened) {
        await this.client.connect()
        this.opened = true
      }
    } catch (error) {
      this.handleDBStorageError(StorageType.MONGO_DB, error as Error)
    }
  }

  public async storePerformanceStatistics (performanceStatistics: Statistics): Promise<void> {
    try {
      this.setPerformanceStatistics(performanceStatistics)
      this.checkDBConnection()
      await this.client
        .db(this.dbName)
        .collection<Statistics>(Constants.PERFORMANCE_RECORDS_TABLE)
        .replaceOne(
          { id: performanceStatistics.id },
          this.serializePerformanceStatistics(performanceStatistics) as unknown as Statistics,
          { upsert: true }
        )
    } catch (error) {
      this.handleDBStorageError(
        StorageType.MONGO_DB,
        error as Error,
        Constants.PERFORMANCE_RECORDS_TABLE
      )
    }
  }

  private checkDBConnection (): void {
    if (!this.opened) {
      throw new BaseError(
        `${this.logPrefix} ${this.getDBNameFromStorageType(StorageType.MONGO_DB) ?? 'Unknown'} connection not opened while trying to issue a request`
      )
    }
  }
}
