import { JSONFileStorage } from './JSONFileStorage';
import { MongoDBStorage } from './MongoDBStorage';
import { Storage } from './Storage';
import { StorageType } from '../../types/Storage';
import logger from '../Logger';

export class StorageFactory {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getStorage(type: StorageType, connectionURI: string, logPrefix: string): Storage {
    let storageInstance: Storage = null;
    switch (type) {
      case StorageType.JSON_FILE:
        storageInstance = new JSONFileStorage(connectionURI, logPrefix);
        break;
      case StorageType.MONGO_DB:
        storageInstance = new MongoDBStorage(connectionURI, logPrefix);
        break;
      default:
        logger.error(`${logPrefix} Unknown storage type: ${type}`);
    }
    return storageInstance;
  }
}
