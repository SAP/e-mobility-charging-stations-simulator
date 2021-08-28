import { DBType } from '../../types/Storage';
import Statistics from '../../types/Statistics';
import { URL } from 'url';
import logger from '../Logger';

export abstract class Storage {
  protected readonly storageURI: URL;
  protected readonly logPrefix: string;
  protected dbName: string;

  constructor(storageURI: string, logPrefix: string) {
    this.storageURI = new URL(storageURI);
    this.logPrefix = logPrefix;
  }

  protected handleDBError(DBEngine: DBType, error: Error, table?: string): void {
    logger.error(`${this.logPrefix} ${DBEngine} error${table && ` in table or collection ${table}`} %j`, error);
  }

  public abstract open(): void | Promise<void>;
  public abstract close(): void | Promise<void>;
  public abstract storePerformanceStatistics(performanceStatistics: Statistics): void | Promise<void>;
}
