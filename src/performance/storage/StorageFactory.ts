// Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

import { JsonFileStorage } from './JsonFileStorage.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { MikroOrmStorage } from './MikroOrmStorage.js'
import { MongoDBStorage } from './MongoDBStorage.js'
import type { Storage } from './Storage.js'
import { BaseError } from '../../exception/index.js'
import { StorageType } from '../../types/index.js'

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
      case StorageType.MONGO_DB:
        storageInstance = new MongoDBStorage(connectionUri, logPrefix)
        break
      // case StorageType.SQLITE:
      // case StorageType.MYSQL:
      // case StorageType.MARIA_DB:
      //   storageInstance = new MikroOrmStorage(connectionUri, logPrefix, type)
      //   break
      default:
        throw new BaseError(`${logPrefix} Unknown storage type: ${type}`)
    }
    return storageInstance
  }
}
