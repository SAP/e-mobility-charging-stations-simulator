// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { fileURLToPath } from 'node:url'

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
    // Decode `file:` URIs into a native filesystem path; `URL.pathname` would yield
    // `/C:/...` on Windows which is not usable as-is. Other schemes (typically a relative
    // path passed as `jsonfile:./...`) keep `pathname` semantics for backward compatibility.
    this.dbName =
      this.storageUri.protocol === 'file:'
        ? fileURLToPath(this.storageUri)
        : this.storageUri.pathname
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
    await AsyncLock.runExclusive(AsyncLockType.performance, () => {
      // Performance records are observability data; skip the per-sample `mkdir` (the
      // directory is created by `open()`) and `fsync` (durability across crashes is
      // not required for telemetry) to keep the hot path cheap.
      atomicWriteFileSync(
        this.dbName,
        JSONStringify([...this.getPerformanceStatistics()], 2, MapStringifyFormat.object),
        FileType.PerformanceRecords,
        this.logPrefix,
        { ensureDir: false, errorParams: { throwError: false }, flush: false }
      )
    })
  }
}
