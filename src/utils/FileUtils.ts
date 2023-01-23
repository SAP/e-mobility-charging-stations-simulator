import fs from 'fs';

import chalk from 'chalk';

import logger from './Logger';
import Utils from './Utils';
import type { EmptyObject } from '../types/EmptyObject';
import type { HandleErrorParams } from '../types/Error';
import type { FileType } from '../types/FileType';
import type { JsonType } from '../types/JsonType';

export default class FileUtils {
  private constructor() {
    // This is intentional
  }

  public static watchJsonFile<T extends JsonType>(
    logPrefix: string,
    fileType: FileType,
    file: string,
    refreshedVariable?: T,
    listener: fs.WatchListener<string> = (event, filename) => {
      if (filename && event === 'change') {
        try {
          logger.debug(`${logPrefix} ${fileType} file ${file} have changed, reload`);
          refreshedVariable && (refreshedVariable = JSON.parse(fs.readFileSync(file, 'utf8')) as T);
        } catch (error) {
          FileUtils.handleFileException(logPrefix, fileType, file, error as NodeJS.ErrnoException, {
            throwError: false,
          });
        }
      }
    }
  ): fs.FSWatcher {
    if (file) {
      try {
        return fs.watch(file, listener);
      } catch (error) {
        FileUtils.handleFileException(logPrefix, fileType, file, error as NodeJS.ErrnoException, {
          throwError: false,
        });
      }
    } else {
      logger.info(`${logPrefix} No ${fileType} file to watch given. Not monitoring its changes`);
    }
  }

  public static handleFileException(
    logPrefix: string,
    fileType: FileType,
    file: string,
    error: NodeJS.ErrnoException,
    params: HandleErrorParams<EmptyObject> = { throwError: true, consoleOut: false }
  ): void {
    const prefix = !Utils.isEmptyString(logPrefix) ? `${logPrefix} ` : '';
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
      logMsg = `${logMsg} `;
      console.warn(`${chalk.green(prefix)}${chalk.yellow(logMsg)}`, error);
    } else {
      logger.warn(`${prefix}${logMsg}`, error);
    }
    if (params?.throwError) {
      throw error;
    }
  }
}
