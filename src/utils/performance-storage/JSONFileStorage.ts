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
    if (!fs.existsSync(performanceJSONFilePath)) {
      this.open(performanceJSONFilePath);
    }
    fs.readFile(performanceJSONFilePath, 'utf-8', (error, data) => {
      if (error) {
        FileUtils.handleFileException(this.logPrefix, 'Performance measurements', performanceJSONFilePath, error);
      } else {
        const performanceRecords: Statistics[] = data ? JSON.parse(data.toString()) as Statistics[] : [];
        performanceRecords.push(performanceStatistics);
        fs.writeFile(performanceJSONFilePath, JSON.stringify(performanceRecords, null, 2), 'utf-8', (err) => {
          if (err) {
            FileUtils.handleFileException(this.logPrefix, 'Performance measurements', performanceJSONFilePath, err);
          }
        });
      }
    });
  }

  private open(filePath: string): void {
    try {
      fs.openSync(filePath, 'w+');
    } catch (error) {
      FileUtils.handleFileException(this.logPrefix, 'Performance measurements', filePath, error);
    }
  }
}
