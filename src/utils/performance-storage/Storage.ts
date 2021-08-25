import Statistics from '../../types/Statistics';
import { URL } from 'url';

export abstract class Storage {
  protected storageURI: URL;
  protected logPrefix: string;

  constructor(storageURI: string, logPrefix: string) {
    this.storageURI = new URL(storageURI);
    this.logPrefix = logPrefix;
  }

  public abstract storePerformanceStatistics(performanceStatistics: Statistics): void;
}
