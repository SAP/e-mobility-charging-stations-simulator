import { type FSWatcher, watch, type WatchListener } from 'node:fs'

import type { FileType } from '../types/index.js'

import { ensureError, handleFileException } from './ErrorUtils.js'
import { logger } from './Logger.js'
import { isNotEmptyString } from './Utils.js'

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
    logger.info(`${logPrefix} No ${fileType} file to watch given. Not monitoring its changes`)
  }
}
