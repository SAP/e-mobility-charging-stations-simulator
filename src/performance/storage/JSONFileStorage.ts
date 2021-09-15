// Copyright Jerome Benoit. 2021. All Rights Reserved.

import Constants from '../../utils/Constants';
import FileUtils from '../../utils/FileUtils';
import Statistics from '../../types/Statistics';
import { Storage } from './Storage';
import fs from 'fs';
import lockfile from 'proper-lockfile';

export class JSONFileStorage extends Storage {
  private fd: number | null = null;

  constructor(storageURI: string, logPrefix: string) {
    super(storageURI, logPrefix);
    this.dbName = this.storageURI.pathname;
  }

  public storePerformanceStatistics(performanceStatistics: Statistics): void {
    this.checkPerformanceRecordsFile();
    lockfile.lock(this.dbName, { stale: 5000, retries: 3 })
      .then(async (release) => {
        try {
          const fileData = fs.readFileSync(this.dbName, 'utf8');
          const performanceRecords: Statistics[] = fileData ? JSON.parse(fileData) as Statistics[] : [];
          performanceRecords.push(performanceStatistics);
          fs.writeFileSync(this.dbName, JSON.stringify(performanceRecords, null, 2), 'utf8');
        } catch (error) {
          FileUtils.handleFileException(this.logPrefix, Constants.PERFORMANCE_RECORDS_FILETYPE, this.dbName, error);
        }
        await release();
      })
      .catch(() => { /* This is intentional */ });
  }

  public open(): void {
    try {
      if (!this?.fd) {
        this.fd = fs.openSync(this.dbName, 'a+');
      }
    } catch (error) {
      FileUtils.handleFileException(this.logPrefix, Constants.PERFORMANCE_RECORDS_FILETYPE, this.dbName, error);
    }
  }

  public close(): void {
    try {
      if (this?.fd) {
        fs.closeSync(this.fd);
        this.fd = null;
      }
    } catch (error) {
      FileUtils.handleFileException(this.logPrefix, Constants.PERFORMANCE_RECORDS_FILETYPE, this.dbName, error);
    }
  }

  private checkPerformanceRecordsFile(): void {
    if (!this?.fd) {
      throw new Error(`${this.logPrefix} Performance records '${this.dbName}' file descriptor not found`);
    }
  }
}
