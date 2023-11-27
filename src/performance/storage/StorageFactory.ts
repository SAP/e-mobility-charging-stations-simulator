// Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { JsonFileStorage } from './JsonFileStorage';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { MikroOrmStorage } from './MikroOrmStorage';
import { MongoDBStorage } from './MongoDBStorage';
import type { Storage } from './Storage';
import { BaseError } from '../../exception';
import { StorageType } from '../../types';

export class StorageFactory {
  private constructor() {
    // This is intentional
  }

  public static getStorage(
    type: StorageType,
    connectionUri: string,
    logPrefix: string,
  ): Storage | undefined {
    let storageInstance: Storage;
    switch (type) {
      case StorageType.JSON_FILE:
        storageInstance = new JsonFileStorage(connectionUri, logPrefix);
        break;
      case StorageType.MONGO_DB:
        storageInstance = new MongoDBStorage(connectionUri, logPrefix);
        break;
      // case StorageType.MYSQL:
      // case StorageType.MARIA_DB:
      // case StorageType.SQLITE:
      //   storageInstance = new MikroOrmStorage(connectionUri, logPrefix, type);
      //   break;
      default:
        throw new BaseError(`${logPrefix} Unknown storage type: ${type}`);
    }
    return storageInstance;
  }
}
