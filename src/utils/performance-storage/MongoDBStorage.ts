import Statistics from '../../types/Statistics';
import { Storage } from './Storage';

export class MongoDBStorage extends Storage {
  constructor(storageURI: string, logPrefix: string) {
    super(storageURI, logPrefix);
  }

  public storePerformanceStatistics(performanceStatistics: Statistics): void {
    throw new Error('Method not yet implemented');
  }

  private open(): void {}

  private close(): void {}
}
