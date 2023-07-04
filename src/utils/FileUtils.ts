import { type FSWatcher, type WatchListener, readFileSync, watch } from 'node:fs';

import { handleFileException } from './ErrorUtils';
import { logger } from './Logger';
import { Utils } from './Utils';
import type { FileType, JsonType } from '../types';

export const watchJsonFile = <T extends JsonType>(
  file: string,
  fileType: FileType,
  logPrefix: string,
  refreshedVariable?: T,
  listener: WatchListener<string> = (event, filename) => {
    if (Utils.isNotEmptyString(filename) && event === 'change') {
      try {
        logger.debug(`${logPrefix} ${fileType} file ${file} have changed, reload`);
        refreshedVariable && (refreshedVariable = JSON.parse(readFileSync(file, 'utf8')) as T);
      } catch (error) {
        handleFileException(file, fileType, error as NodeJS.ErrnoException, logPrefix, {
          throwError: false,
        });
      }
    }
  }
): FSWatcher | undefined => {
  if (Utils.isNotEmptyString(file)) {
    try {
      return watch(file, listener);
    } catch (error) {
      handleFileException(file, fileType, error as NodeJS.ErrnoException, logPrefix, {
        throwError: false,
      });
    }
  } else {
    logger.info(`${logPrefix} No ${fileType} file to watch given. Not monitoring its changes`);
  }
};
