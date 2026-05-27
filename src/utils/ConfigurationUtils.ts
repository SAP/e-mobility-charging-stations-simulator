import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { StorageType } from '../types/index.js'
import { Constants } from './Constants.js'
import { logPrefix as utilsLogPrefix } from './Utils.js'

export const configurationLogPrefix = (): string => {
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
