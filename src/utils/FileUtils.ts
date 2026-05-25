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

import type { EmptyObject, FileType, HandleErrorParams } from '../types/index.js'

import { ensureError, handleFileException } from './ErrorUtils.js'
import { logger } from './Logger.js'
import { isNotEmptyString } from './Utils.js'

const moduleName = 'FileUtils'

/**
 * Default file mode for newly created files (umask is applied by the OS).
 */
const DEFAULT_FILE_MODE = 0o666

/**
 * Monotonic counter used together with the process id to build unique temp filenames.
 * Single-process simulators do not need cryptographic randomness here; uniqueness within
 * the process suffices because callers serialize concurrent writes externally.
 */
let tmpInvocationCounter = 0

/**
 * Options for atomic file write operations.
 */
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
   * Whether to flush (`fsync`) the temp file to the storage device before renaming.
   * Provides crash durability at a small performance cost. Defaults to `true`.
   */
  flush?: boolean
  /**
   * File mode to apply when creating the temp file. The OS umask is applied on top.
   * Defaults to `0o666`.
   */
  mode?: number
}

/**
 * Builds a unique temporary file path placed in the same directory as `file`.
 *
 * Same-directory placement guarantees `rename(2)` cannot fail with `EXDEV` and that
 * the rename is atomic at the filesystem level.
 * @param file - Final destination file path.
 * @returns Temporary file path.
 */
const buildTmpPath = (file: string): string => {
  tmpInvocationCounter += 1
  return `${file}.${pid.toString()}.${tmpInvocationCounter.toString()}.tmp`
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
 * optionally flushed to disk, then atomically renamed to `file`. Concurrent readers see
 * either the previous file content or the complete new content, never a partial write.
 *
 * Concurrent writers to the same `file` MUST be serialized externally (for example via
 * `AsyncLock.runExclusive`); this primitive does not queue or deduplicate calls.
 *
 * On error, the temporary file is removed best-effort and the failure is funnelled
 * through {@link handleFileException} using `fileType` and `logPrefix`.
 * @param file - Destination file path.
 * @param data - Content to write.
 * @param fileType - File type used for error logging.
 * @param logPrefix - Caller-supplied log prefix used for error logging.
 * @param options - Atomic write options.
 * @param errorParams - Error handling parameters forwarded to {@link handleFileException}.
 * @returns A promise that resolves once the rename has completed, or rejects when
 *   `errorParams.throwError !== false` and the write failed.
 */
export const atomicWriteFile = async (
  file: string,
  data: NodeJS.ArrayBufferView | string,
  fileType: FileType,
  logPrefix: string,
  options?: AtomicWriteOptions,
  errorParams?: HandleErrorParams<EmptyObject>
): Promise<void> => {
  const { encoding, ensureDir, flush, mode } = {
    encoding: 'utf8' as BufferEncoding,
    ensureDir: true,
    flush: true,
    mode: DEFAULT_FILE_MODE,
    ...options,
  }
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
 * @param errorParams - Error handling parameters forwarded to {@link handleFileException}.
 */
export const atomicWriteFileSync = (
  file: string,
  data: NodeJS.ArrayBufferView | string,
  fileType: FileType,
  logPrefix: string,
  options?: AtomicWriteOptions,
  errorParams?: HandleErrorParams<EmptyObject>
): void => {
  const { encoding, ensureDir, flush, mode } = {
    encoding: 'utf8' as BufferEncoding,
    ensureDir: true,
    flush: true,
    mode: DEFAULT_FILE_MODE,
    ...options,
  }
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
