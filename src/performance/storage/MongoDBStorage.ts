// Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { MongoClient } from 'mongodb'

import { BaseError } from '../../exception/index.js'
import { type Statistics, StorageType } from '../../types/index.js'
import { Constants } from '../../utils/index.js'
import { Storage } from './Storage.js'

export class MongoDBStorage extends Storage {
  private readonly client?: MongoClient
  private connected: boolean

  constructor (storageUri: string, logPrefix: string) {
    super(storageUri, logPrefix)
    this.client = new MongoClient(this.storageUri.toString())
    this.connected = false
    this.dbName = this.storageUri.pathname.replace(/(?:^\/)|(?:\/$)/g, '')
  }

  public async close (): Promise<void> {
    this.clearPerformanceStatistics()
    try {
      if (this.connected && this.client != null) {
        await this.client.close()
        this.connected = false
      }
    } catch (error) {
      this.handleDBStorageError(StorageType.MONGO_DB, error as Error)
    }
  }

  public async open (): Promise<void> {
    try {
      if (!this.connected && this.client != null) {
        await this.client.connect()
        this.connected = true
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
        ?.db(this.dbName)
        .collection<Statistics>(Constants.PERFORMANCE_RECORDS_TABLE)
        .replaceOne({ id: performanceStatistics.id }, performanceStatistics, {
          upsert: true,
        })
    } catch (error) {
      this.handleDBStorageError(
        StorageType.MONGO_DB,
        error as Error,
        Constants.PERFORMANCE_RECORDS_TABLE
      )
    }
  }

  private checkDBConnection (): void {
    if (this.client == null) {
      throw new BaseError(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${this.logPrefix} ${this.getDBNameFromStorageType(
          StorageType.MONGO_DB
        )} client initialization failed while trying to issue a request`
      )
    }
    if (!this.connected) {
      throw new BaseError(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${this.logPrefix} ${this.getDBNameFromStorageType(
          StorageType.MONGO_DB
        )} connection not opened while trying to issue a request`
      )
    }
  }
}
