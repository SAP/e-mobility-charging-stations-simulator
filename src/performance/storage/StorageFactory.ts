// Copyright Jerome Benoit. 2021. All Rights Reserved.

import { JSONFileStorage } from './JSONFileStorage';
import { MikroORMStorage } from './MikroORMStorage';
import { MongoDBStorage } from './MongoDBStorage';
import { Storage } from './Storage';
import { StorageType } from '../../types/Storage';

export class StorageFactory {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {
    // This is intentional
  }

  public static getStorage(type: StorageType, connectionURI: string, logPrefix: string): Storage {
    let storageInstance: Storage = null;
    switch (type) {
      case StorageType.JSON_FILE:
        storageInstance = new JSONFileStorage(connectionURI, logPrefix);
        break;
      case StorageType.MONGO_DB:
        storageInstance = new MongoDBStorage(connectionURI, logPrefix);
        break;
      // case StorageType.MYSQL:
      // case StorageType.MARIA_DB:
      // case StorageType.SQLITE:
      //   storageInstance = new MikroORMStorage(connectionURI, logPrefix, type);
      //   break;
      default:
        throw new Error(`${logPrefix} Unknown storage type: ${type}`);
    }
    return storageInstance;
  }
}
