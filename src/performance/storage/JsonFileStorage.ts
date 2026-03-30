// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { closeSync, openSync, writeSync } from 'node:fs'

import { BaseError } from '../../exception/index.js'
import { FileType, MapStringifyFormat, type Statistics } from '../../types/index.js'
import {
  AsyncLock,
  AsyncLockType,
  ensureError,
  handleFileException,
  JSONStringify,
} from '../../utils/index.js'
import { Storage } from './Storage.js'

export class JsonFileStorage extends Storage {
  private fd?: number

  constructor(storageUri: string, logPrefix: string) {
    super(storageUri, logPrefix)
    this.dbName = this.storageUri.pathname
  }

  public close(): void {
    this.clearPerformanceStatistics()
    try {
      if (this.fd != null) {
        closeSync(this.fd)
        delete this.fd
      }
    } catch (error) {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        ensureError(error),
        this.logPrefix
      )
    }
  }

  public open(): void {
    try {
      if (this.fd == null) {
        this.ensureDBDirectory()
        this.fd = openSync(this.dbName, 'w')
      }
    } catch (error) {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        ensureError(error),
        this.logPrefix
      )
    }
  }

  public storePerformanceStatistics(performanceStatistics: Statistics): void {
    this.setPerformanceStatistics(performanceStatistics)
    const fd = this.checkPerformanceRecordsFile()
    AsyncLock.runExclusive(AsyncLockType.performance, () => {
      writeSync(
        fd,
        JSONStringify([...this.getPerformanceStatistics()], 2, MapStringifyFormat.object),
        0,
        'utf8'
      )
    }).catch((error: unknown) => {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        ensureError(error),
        this.logPrefix
      )
    })
  }

  private checkPerformanceRecordsFile(): number {
    if (this.fd == null) {
      throw new BaseError(
        `${this.logPrefix} Performance records '${this.dbName}' file descriptor not found`
      )
    }
    return this.fd
  }
}
