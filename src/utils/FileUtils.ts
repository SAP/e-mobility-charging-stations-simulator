// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import {
  type FSWatcher,
  mkdirSync,
  renameSync,
  rmSync,
  watch,
  type WatchListener,
  type WriteFileOptions,
  writeFileSync,
} from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pid } from 'node:process'
import { threadId } from 'node:worker_threads'

import type { EmptyObject, FileType, HandleErrorParams } from '../types/index.js'

import { ensureError, handleFileException } from './ErrorUtils.js'
import { logger } from './Logger.js'
import { isNotEmptyString } from './Utils.js'

const moduleName = 'FileUtils'

const DEFAULT_FILE_MODE = 0o666

let tmpInvocationCounter = 0

export interface AtomicWriteOptions {
  /**
   * Character encoding when `data` is a string. Defaults to `'utf8'`.
   */
  encoding?: BufferEncoding
  /**
   * Whether to call `mkdir(dirname(file), { recursive: true })` before writing.
   * Defaults to `true`.
   */
  ensureDir?: boolean
  /**
   * Error handling parameters forwarded to {@link handleFileException}. Defaults
   * to `{ throwError: true, consoleOut: false }` (log at error level and rethrow).
   */
  errorParams?: HandleErrorParams<EmptyObject>
  /**
   * Whether to flush (`fsync`) the temp file to the storage device before renaming.
   * Defaults to `true`.
   */
  flush?: boolean
  /**
   * File mode applied at temp file creation; the OS umask is applied on top. The
   * destination inherits the temp file's mode after rename. Defaults to `0o666`.
   */
  mode?: number
}

const buildTmpPath = (file: string): string => {
  tmpInvocationCounter += 1
  return `${file}.${pid.toString()}.${threadId.toString()}.${tmpInvocationCounter.toString()}.tmp`
}

export const watchJsonFile = (
  file: string,
  fileType: FileType,
  logPrefix: string,
  listener: WatchListener<string>
): FSWatcher | undefined => {
  if (isNotEmptyString(file)) {
    try {
      return watch(file, listener)
    } catch (error) {
      handleFileException(file, fileType, ensureError(error), logPrefix, {
        throwError: false,
      })
    }
  } else {
    logger.info(
      `${logPrefix} ${moduleName}.watchJsonFile: No ${fileType} file to watch given. Not monitoring its changes`
    )
  }
}

/**
 * Asynchronously writes `data` to `file` atomically using a write-then-rename strategy.
 *
 * The data is first written to a unique temporary file in the same directory as `file`,
 * optionally flushed to disk via `fsync`, then renamed to `file`. The rename step is
 * atomic at the filesystem level, so a concurrent reader observes either the previous
 * file content or the complete new content, never a partially written file.
 *
 * Temporary file name encodes `pid`, `threadId` (0 in the main thread, non-zero per
 * worker thread), and a per-thread monotonic counter. This guarantees uniqueness across
 * processes and worker threads of the same process.
 *
 * Concurrent writers to the same `file` must be serialized externally (typically via
 * `AsyncLock.runExclusive`); this primitive does not queue, deduplicate, or order
 * concurrent calls. The `AsyncLock` instances in the project are per-thread, so when a
 * given destination can be written from multiple threads the caller must additionally
 * partition paths or coordinate across threads.
 *
 * Durability: when `flush` is `true` (default) the temporary file is fsync'd before
 * `rename`. The parent directory entry is not separately fsync'd, so a kernel-level
 * crash between `rename` and the directory inode flush may, on some filesystems,
 * revert the rename. This is acceptable for the simulator's persistence needs (config
 * files, simulator state, performance records, certificates) but is not full POSIX D
 * durability.
 *
 * On `SIGKILL`, OOM kill, or power loss between `writeFile` and `rename`, the
 * temporary `<file>.<pid>.<threadId>.<n>.tmp` artifact may remain on disk; it is inert
 * and safe to delete manually. Normal failure paths clean it up best-effort.
 *
 * On error, the temporary file is removed best-effort and the failure is forwarded to
 * {@link handleFileException} using `fileType`, `logPrefix`, and `options.errorParams`.
 * @param file - Destination file path.
 * @param data - Content to write.
 * @param fileType - File type used for error logging.
 * @param logPrefix - Caller-supplied log prefix used for error logging.
 * @param options - Atomic write options.
 * @returns A promise that resolves once the rename has completed.
 * @throws {Error} When the write fails and `options.errorParams.throwError !== false`
 *   (the default). The thrown error is the underlying `NodeJS.ErrnoException`
 *   re-thrown by {@link handleFileException} after logging.
 */
export const atomicWriteFile = async (
  file: string,
  data: NodeJS.ArrayBufferView | string,
  fileType: FileType,
  logPrefix: string,
  options?: AtomicWriteOptions
): Promise<void> => {
  const {
    encoding = 'utf8',
    ensureDir = true,
    errorParams,
    flush = true,
    mode = DEFAULT_FILE_MODE,
  } = options ?? {}
  const tmpFile = buildTmpPath(file)
  try {
    if (ensureDir) {
      await mkdir(dirname(file), { recursive: true })
    }
    await writeFile(tmpFile, data, { encoding, flush, mode })
    await rename(tmpFile, file)
  } catch (error) {
    try {
      await rm(tmpFile, { force: true })
    } catch {
      // Ignore secondary cleanup failure to surface the original error.
    }
    handleFileException(file, fileType, ensureError(error), logPrefix, errorParams)
  }
}

/**
 * Synchronous variant of {@link atomicWriteFile}.
 *
 * Same algorithm and contract as the asynchronous variant. Useful for shutdown paths
 * and other synchronous code where awaiting is not possible.
 * @param file - Destination file path.
 * @param data - Content to write.
 * @param fileType - File type used for error logging.
 * @param logPrefix - Caller-supplied log prefix used for error logging.
 * @param options - Atomic write options.
 * @throws {Error} When the write fails and `options.errorParams.throwError !== false`
 *   (the default). The thrown error is the underlying `NodeJS.ErrnoException`
 *   re-thrown by {@link handleFileException} after logging.
 */
export const atomicWriteFileSync = (
  file: string,
  data: NodeJS.ArrayBufferView | string,
  fileType: FileType,
  logPrefix: string,
  options?: AtomicWriteOptions
): void => {
  const {
    encoding = 'utf8',
    ensureDir = true,
    errorParams,
    flush = true,
    mode = DEFAULT_FILE_MODE,
  } = options ?? {}
  const tmpFile = buildTmpPath(file)
  try {
    if (ensureDir) {
      mkdirSync(dirname(file), { recursive: true })
    }
    const writeOptions: WriteFileOptions = { encoding, flush, mode }
    writeFileSync(tmpFile, data, writeOptions)
    renameSync(tmpFile, file)
  } catch (error) {
    try {
      rmSync(tmpFile, { force: true })
    } catch {
      // Ignore secondary cleanup failure to surface the original error.
    }
    handleFileException(file, fileType, ensureError(error), logPrefix, errorParams)
  }
}
