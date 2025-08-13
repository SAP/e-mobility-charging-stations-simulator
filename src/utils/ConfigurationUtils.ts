import chalk from 'chalk'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { type ElementsPerWorkerType, type FileType, StorageType } from '../types/index.js'
import { WorkerProcessType } from '../worker/index.js'
import { Constants } from './Constants.js'
import { isNotEmptyString, logPrefix as utilsLogPrefix } from './Utils.js'

export const logPrefix = (): string => {
  return utilsLogPrefix(' Simulator configuration |')
}

export const buildPerformanceUriFilePath = (file: string): string => {
  return pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), '..', file)).toString()
}

export const getDefaultPerformanceStorageUri = (storageType: StorageType): string => {
  switch (storageType) {
    case StorageType.JSON_FILE:
      return buildPerformanceUriFilePath(
        join(
          Constants.DEFAULT_PERFORMANCE_DIRECTORY,
          Constants.DEFAULT_PERFORMANCE_RECORDS_FILENAME
        )
      )
    case StorageType.SQLITE:
      return buildPerformanceUriFilePath(
        join(
          Constants.DEFAULT_PERFORMANCE_DIRECTORY,
          `${Constants.DEFAULT_PERFORMANCE_RECORDS_DB_NAME}.db`
        )
      )
    default:
      throw new Error(`Unsupported storage type '${storageType}'`)
  }
}

export const handleFileException = (
  file: string,
  fileType: FileType,
  error: NodeJS.ErrnoException,
  logPfx: string
): void => {
  const prefix = isNotEmptyString(logPfx) ? `${logPfx} ` : ''
  let logMsg: string
  switch (error.code) {
    case 'EACCES':
      logMsg = `${fileType} file ${file} access denied: `
      break
    case 'EEXIST':
      logMsg = `${fileType} file ${file} already exists: `
      break
    case 'EISDIR':
      logMsg = `${fileType} file ${file} is a directory: `
      break
    case 'ENOENT':
      logMsg = `${fileType} file ${file} not found: `
      break
    case 'ENOSPC':
      logMsg = `${fileType} file ${file} no space left on device: `
      break
    case 'ENOTDIR':
      logMsg = `${fileType} file ${file} parent is not a directory: `
      break
    case 'EPERM':
      logMsg = `${fileType} file ${file} permission denied: `
      break
    case 'EROFS':
      logMsg = `${fileType} file ${file} read-only file system: `
      break
    default:
      logMsg = `${fileType} file ${file} error: `
  }
  console.error(`${chalk.green(prefix)}${chalk.red(logMsg)}`, error)
  throw error
}

export const checkWorkerProcessType = (workerProcessType: WorkerProcessType): void => {
  if (!Object.values(WorkerProcessType).includes(workerProcessType)) {
    throw new SyntaxError(
      `Invalid worker process type '${workerProcessType}' defined in configuration`
    )
  }
}

export const checkWorkerElementsPerWorker = (
  elementsPerWorker: ElementsPerWorkerType | undefined
): void => {
  if (elementsPerWorker == null || elementsPerWorker === 'auto' || elementsPerWorker === 'all') {
    return
  }
  if (!Number.isSafeInteger(elementsPerWorker)) {
    throw new SyntaxError(
      `Invalid number of elements per worker '${elementsPerWorker.toString()}' defined in configuration`
    )
  }
  if (elementsPerWorker <= 0) {
    throw new RangeError(
      `Invalid negative or zero number of elements per worker '${elementsPerWorker.toString()}' defined in configuration`
    )
  }
}
