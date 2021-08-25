import FileUtils from '../FileUtils';
import Statistics from '../../types/Statistics';
import { Storage } from './Storage';
import fs from 'fs';
import path from 'path';

export class JSONFileStorage extends Storage {
  constructor(storageURI: string, logPrefix: string) {
    super(storageURI, logPrefix);
  }

  public storePerformanceStatistics(performanceStatistics: Statistics): void {
    const performanceJSONFilePath = path.join(path.resolve(__dirname, '../../../'), this.storageURI.pathname.replace(/(?:^\/)|(?:\/$)/g, ''));
    fs.appendFile(performanceJSONFilePath, JSON.stringify(performanceStatistics, null, 2), 'utf8', (err) => {
      if (err) {
        FileUtils.handleFileException(this.logPrefix, 'Performance measurements', performanceJSONFilePath, err);
      }
    });
  }
}
