import fs from 'node:fs';

import chalk from 'chalk';

import { logger } from './Logger';
import { Utils } from './Utils';
import type { EmptyObject, FileType, HandleErrorParams, JsonType } from '../types';

export class FileUtils {
  private constructor() {
    // This is intentional
  }

  public static watchJsonFile<T extends JsonType>(
    file: string,
    fileType: FileType,
    logPrefix: string,
    refreshedVariable?: T,
    listener: fs.WatchListener<string> = (event, filename) => {
      if (Utils.isNotEmptyString(filename) && event === 'change') {
        try {
          logger.debug(`${logPrefix} ${fileType} file ${file} have changed, reload`);
          refreshedVariable && (refreshedVariable = JSON.parse(fs.readFileSync(file, 'utf8')) as T);
        } catch (error) {
          FileUtils.handleFileException(file, fileType, error as NodeJS.ErrnoException, logPrefix, {
            throwError: false,
          });
        }
      }
    }
  ): fs.FSWatcher | undefined {
    if (Utils.isNotEmptyString(file)) {
      try {
        return fs.watch(file, listener);
      } catch (error) {
        FileUtils.handleFileException(file, fileType, error as NodeJS.ErrnoException, logPrefix, {
          throwError: false,
        });
      }
    } else {
      logger.info(`${logPrefix} No ${fileType} file to watch given. Not monitoring its changes`);
    }
  }

  public static handleFileException(
    file: string,
    fileType: FileType,
    error: NodeJS.ErrnoException,
    logPrefix: string,
    params: HandleErrorParams<EmptyObject> = { throwError: true, consoleOut: false }
  ): void {
    const prefix = Utils.isNotEmptyString(logPrefix) ? `${logPrefix} ` : '';
    let logMsg: string;
    switch (error.code) {
      case 'ENOENT':
        logMsg = `${fileType} file ${file} not found:`;
        break;
      case 'EEXIST':
        logMsg = `${fileType} file ${file} already exists:`;
        break;
      case 'EACCES':
        logMsg = `${fileType} file ${file} access denied:`;
        break;
      default:
        logMsg = `${fileType} file ${file} error:`;
    }
    if (params?.consoleOut) {
      console.warn(`${chalk.green(prefix)}${chalk.yellow(`${logMsg} `)}`, error);
    } else {
      logger.warn(`${prefix}${logMsg}`, error);
    }
    if (params?.throwError) {
      throw error;
    }
  }
}
