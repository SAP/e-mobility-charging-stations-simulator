// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { FileType, MapStringifyFormat, type Statistics } from '../../types/index.js'
import {
  AsyncLock,
  AsyncLockType,
  atomicWriteFileSync,
  ensureError,
  handleFileException,
  JSONStringify,
} from '../../utils/index.js'
import { Storage } from './Storage.js'

export class JsonFileStorage extends Storage {
  constructor (storageUri: string, logPrefix: string) {
    super(storageUri, logPrefix)
    this.dbName = this.storageUri.pathname
  }

  public close (): void {
    this.clearPerformanceStatistics()
  }

  public open (): void {
    try {
      this.ensureDBDirectory()
    } catch (error) {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        ensureError(error),
        this.logPrefix
      )
    }
  }

  public async storePerformanceStatistics (performanceStatistics: Statistics): Promise<void> {
    this.setPerformanceStatistics(performanceStatistics)
    try {
      await AsyncLock.runExclusive(AsyncLockType.performance, () => {
        // The storage directory is created by `open()`; skip the per-write `mkdir`
        // to keep the per-sample cost minimal.
        atomicWriteFileSync(
          this.dbName,
          JSONStringify([...this.getPerformanceStatistics()], 2, MapStringifyFormat.object),
          FileType.PerformanceRecords,
          this.logPrefix,
          { ensureDir: false }
        )
      })
    } catch (error) {
      handleFileException(
        this.dbName,
        FileType.PerformanceRecords,
        ensureError(error),
        this.logPrefix,
        { throwError: false }
      )
    }
  }
}
