// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { closeSync, existsSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'

import { BaseError } from '../../exception/index.js'
import { FileType, MapStringifyFormat, type Statistics } from '../../types/index.js'
import { AsyncLock, AsyncLockType, handleFileException, JSONStringify } from '../../utils/index.js'
import { Storage } from './Storage.js'

export class JsonFileStorage extends Storage {
  private fd?: number

  constructor (storageUri: string, logPrefix: string) {
    super(storageUri, logPrefix)
    this.dbName = this.storageUri.pathname
  }

  public close (): void {
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
        error as NodeJS.ErrnoException,
        this.logPrefix
      )
    }
  }

  public open (): void {
    try {
      if (this.fd == null) {
        if (!existsSync(dirname(this.dbName))) {
          mkdirSync(dirname(this.dbName), { recursive: true })
        }
        this.fd = openSync(this.dbName, 'w')
      }
    } catch (error) {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        error as NodeJS.ErrnoException,
        this.logPrefix
      )
    }
  }

  public storePerformanceStatistics (performanceStatistics: Statistics): void {
    this.setPerformanceStatistics(performanceStatistics)
    this.checkPerformanceRecordsFile()
    AsyncLock.runExclusive(AsyncLockType.performance, () => {
      writeSync(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.fd!,
        JSONStringify([...this.getPerformanceStatistics()], 2, MapStringifyFormat.object),
        0,
        'utf8'
      )
    }).catch((error: unknown) => {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        error as NodeJS.ErrnoException,
        this.logPrefix
      )
    })
  }

  private checkPerformanceRecordsFile (): void {
    if (this.fd == null) {
      throw new BaseError(
        `${this.logPrefix} Performance records '${this.dbName}' file descriptor not found`
      )
    }
  }
}
