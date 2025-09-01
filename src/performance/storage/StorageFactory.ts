// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { Storage } from './Storage.js'

import { BaseError } from '../../exception/index.js'
import { StorageType } from '../../types/index.js'
import { JsonFileStorage } from './JsonFileStorage.js'
import { MikroOrmStorage } from './MikroOrmStorage.js'
import { MongoDBStorage } from './MongoDBStorage.js'
import { None } from './None.js'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StorageFactory {
  private constructor () {
    // This is intentional
  }

  public static getStorage (
    type: StorageType,
    connectionUri: string,
    logPrefix: string
  ): Storage | undefined {
    let storageInstance: Storage
    switch (type) {
      case StorageType.JSON_FILE:
        storageInstance = new JsonFileStorage(connectionUri, logPrefix)
        break
      case StorageType.MARIA_DB:
      case StorageType.MYSQL:
      case StorageType.SQLITE:
        storageInstance = new MikroOrmStorage(connectionUri, logPrefix, type)
        break
      case StorageType.MONGO_DB:
        storageInstance = new MongoDBStorage(connectionUri, logPrefix)
        break
      case StorageType.NONE:
        storageInstance = new None()
        break
      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new BaseError(`${logPrefix} Unknown storage type: ${type}`)
    }
    return storageInstance
  }
}
