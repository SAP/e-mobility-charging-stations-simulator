// Copyright Jerome Benoit. 2021. All Rights Reserved.

import Constants from '../../utils/Constants';
import FileUtils from '../../utils/FileUtils';
import Statistics from '../../types/Statistics';
import { Storage } from './Storage';
import fs from 'fs';

export class JSONFileStorage extends Storage {
  private fd: number | null = null;

  constructor(storageURI: string, logPrefix: string) {
    super(storageURI, logPrefix);
    this.dbName = this.storageURI.pathname;
  }

  public storePerformanceStatistics(performanceStatistics: Statistics): void {
    this.checkPerformanceRecordsFile();
    fs.readFile(this.dbName, 'utf-8', (error, data) => {
      if (error) {
        FileUtils.handleFileException(this.logPrefix, Constants.PERFORMANCE_RECORDS_FILETYPE, this.dbName, error);
      } else {
        const performanceRecords: Statistics[] = data ? JSON.parse(data) as Statistics[] : [];
        performanceRecords.push(performanceStatistics);
        fs.writeFile(this.dbName, JSON.stringify(performanceRecords, null, 2), 'utf-8', (err) => {
          if (err) {
            FileUtils.handleFileException(this.logPrefix, Constants.PERFORMANCE_RECORDS_FILETYPE, this.dbName, err);
          }
        });
      }
    });
  }

  public open(): void {
    try {
      this.fd = fs.openSync(this.dbName, 'a+');
    } catch (error) {
      FileUtils.handleFileException(this.logPrefix, Constants.PERFORMANCE_RECORDS_FILETYPE, this.dbName, error);
    }
  }

  public close(): void {
    try {
      if (this.fd) {
        fs.closeSync(this.fd);
        this.fd = null;
      }
    } catch (error) {
      FileUtils.handleFileException(this.logPrefix, Constants.PERFORMANCE_RECORDS_FILETYPE, this.dbName, error);
    }
  }

  private checkPerformanceRecordsFile(): void {
    if (!this.fd) {
      throw new Error(`${this.logPrefix} Performance records '${this.dbName}' file descriptor not found`);
    }
  }
}
