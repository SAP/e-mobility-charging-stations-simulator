// Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { MongoClient } from 'mongodb'

import { Storage } from './Storage.js'
import { BaseError } from '../../exception/index.js'
import { type Statistics, StorageType } from '../../types/index.js'
import { Constants } from '../../utils/index.js'

export class MongoDBStorage extends Storage {
  private readonly client?: MongoClient
  private connected: boolean

  constructor (storageUri: string, logPrefix: string) {
    super(storageUri, logPrefix)
    this.client = new MongoClient(this.storageUri.toString())
    this.connected = false
    this.dbName = this.storageUri.pathname.replace(/(?:^\/)|(?:\/$)/g, '')
  }

  public async storePerformanceStatistics (performanceStatistics: Statistics): Promise<void> {
    try {
      this.checkDBConnection()
      await this.client
        ?.db(this.dbName)
        .collection<Statistics>(Constants.PERFORMANCE_RECORDS_TABLE)
        .replaceOne({ id: performanceStatistics.id }, performanceStatistics, { upsert: true })
    } catch (error) {
      this.handleDBError(StorageType.MONGO_DB, error as Error, Constants.PERFORMANCE_RECORDS_TABLE)
    }
  }

  public async open (): Promise<void> {
    try {
      if (!this.connected && this.client != null) {
        await this.client.connect()
        this.connected = true
      }
    } catch (error) {
      this.handleDBError(StorageType.MONGO_DB, error as Error)
    }
  }

  public async close (): Promise<void> {
    try {
      if (this.connected && this.client != null) {
        await this.client.close()
        this.connected = false
      }
    } catch (error) {
      this.handleDBError(StorageType.MONGO_DB, error as Error)
    }
  }

  private checkDBConnection (): void {
    if (this.client == null) {
      throw new BaseError(
        `${this.logPrefix} ${this.getDBNameFromStorageType(
          StorageType.MONGO_DB
        )} client initialization failed while trying to issue a request`
      )
    }
    if (!this.connected) {
      throw new BaseError(
        `${this.logPrefix} ${this.getDBNameFromStorageType(
          StorageType.MONGO_DB
        )} connection not opened while trying to issue a request`
      )
    }
  }
}
