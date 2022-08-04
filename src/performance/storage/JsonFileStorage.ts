// Copyright Jerome Benoit. 2021. All Rights Reserved.

import fs from 'fs';

import lockfile from 'proper-lockfile';

import { FileType } from '../../types/FileType';
import Statistics from '../../types/Statistics';
import FileUtils from '../../utils/FileUtils';
import { Storage } from './Storage';

export class JsonFileStorage extends Storage {
  private fd: number | null = null;

  constructor(storageUri: string, logPrefix: string) {
    super(storageUri, logPrefix);
    this.dbName = this.storageUri.pathname;
  }

  public storePerformanceStatistics(performanceStatistics: Statistics): void {
    this.checkPerformanceRecordsFile();
    lockfile
      .lock(this.dbName, { stale: 5000, retries: 3 })
      .then(async (release) => {
        try {
          const fileData = fs.readFileSync(this.dbName, 'utf8');
          const performanceRecords: Statistics[] = fileData
            ? (JSON.parse(fileData) as Statistics[])
            : [];
          performanceRecords.push(performanceStatistics);
          fs.writeFileSync(
            this.dbName,
            JSON.stringify(
              performanceRecords,
              (key, value) => {
                if (value instanceof Map) {
                  return {
                    dataType: 'Map',
                    value: [...value],
                  };
                }
                return value as Statistics;
              },
              2
            ),
            'utf8'
          );
        } catch (error) {
          FileUtils.handleFileException(
            this.logPrefix,
            FileType.PerformanceRecords,
            this.dbName,
            error as NodeJS.ErrnoException
          );
        }
        await release();
      })
      .catch(() => {
        /* This is intentional */
      });
  }

  public open(): void {
    try {
      if (!this?.fd) {
        this.fd = fs.openSync(this.dbName, 'a+');
      }
    } catch (error) {
      FileUtils.handleFileException(
        this.logPrefix,
        FileType.PerformanceRecords,
        this.dbName,
        error as NodeJS.ErrnoException
      );
    }
  }

  public close(): void {
    try {
      if (this?.fd) {
        fs.closeSync(this.fd);
        this.fd = null;
      }
    } catch (error) {
      FileUtils.handleFileException(
        this.logPrefix,
        FileType.PerformanceRecords,
        this.dbName,
        error as NodeJS.ErrnoException
      );
    }
  }

  private checkPerformanceRecordsFile(): void {
    if (!this?.fd) {
      throw new Error(
        `${this.logPrefix} Performance records '${this.dbName}' file descriptor not found`
      );
    }
  }
}
