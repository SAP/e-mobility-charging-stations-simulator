// Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { closeSync, existsSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

import { Storage } from './Storage';
import { BaseError } from '../../exception';
import { FileType, type Statistics } from '../../types';
import {
  AsyncLock,
  AsyncLockType,
  JSONStringifyWithMapSupport,
  handleFileException,
  isNullOrUndefined,
} from '../../utils';

export class JsonFileStorage extends Storage {
  private static readonly performanceRecords: Map<string, Statistics> = new Map<
    string,
    Statistics
  >();

  private fd?: number;

  constructor(storageUri: string, logPrefix: string) {
    super(storageUri, logPrefix);
    this.dbName = this.storageUri.pathname;
  }

  public storePerformanceStatistics(performanceStatistics: Statistics): void {
    this.checkPerformanceRecordsFile();
    JsonFileStorage.performanceRecords.set(performanceStatistics.id, performanceStatistics);
    AsyncLock.runExclusive(AsyncLockType.performance, () => {
      writeSync(
        this.fd!,
        JSONStringifyWithMapSupport([...JsonFileStorage.performanceRecords.values()], 2),
        0,
        'utf8',
      );
    }).catch((error) => {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        error as NodeJS.ErrnoException,
        this.logPrefix,
      );
    });
  }

  public open(): void {
    try {
      if (isNullOrUndefined(this?.fd)) {
        if (!existsSync(dirname(this.dbName))) {
          mkdirSync(dirname(this.dbName), { recursive: true });
        }
        this.fd = openSync(this.dbName, 'w');
      }
    } catch (error) {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        error as NodeJS.ErrnoException,
        this.logPrefix,
      );
    }
  }

  public close(): void {
    try {
      if (this?.fd) {
        closeSync(this.fd);
        delete this?.fd;
      }
    } catch (error) {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        error as NodeJS.ErrnoException,
        this.logPrefix,
      );
    }
  }

  private checkPerformanceRecordsFile(): void {
    if (!this?.fd) {
      throw new BaseError(
        `${this.logPrefix} Performance records '${this.dbName}' file descriptor not found`,
      );
    }
  }
}
