// Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import fs from 'node:fs';

import lockfile from 'proper-lockfile';

import { Storage } from './Storage';
import { FileType } from '../../types/FileType';
import type { Statistics } from '../../types/Statistics';
import FileUtils from '../../utils/FileUtils';
import Utils from '../../utils/Utils';

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
            Utils.JSONStringifyWithMapSupport(performanceRecords, 2),
            'utf8'
          );
        } catch (error) {
          FileUtils.handleFileException(
            this.dbName,
            FileType.PerformanceRecords,
            error as NodeJS.ErrnoException,
            this.logPrefix
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
      if (this?.fd === undefined || this?.fd === null) {
        this.fd = fs.openSync(this.dbName, 'a+');
      }
    } catch (error) {
      FileUtils.handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        error as NodeJS.ErrnoException,
        this.logPrefix
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
        this.dbName,
        FileType.PerformanceRecords,
        error as NodeJS.ErrnoException,
        this.logPrefix
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
