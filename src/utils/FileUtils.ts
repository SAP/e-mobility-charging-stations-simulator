import { JsonType, JsonValue } from '../types/JsonType';

import { EmptyObject } from '../types/EmptyObject';
import { FileType } from '../types/FileType';
import { HandleErrorParams } from '../types/Error';
import Utils from './Utils';
import chalk from 'chalk';
import fs from 'fs';
import logger from './Logger';

export default class FileUtils {
  static watchJsonFile<T extends JsonType | JsonValue>(
    logPrefix: string,
    fileType: FileType,
    file: string,
    attribute?: T,
    listener: fs.WatchListener<string> = (event, filename) => {
      if (filename && event === 'change') {
        try {
          logger.debug(logPrefix + ' ' + fileType + ' file ' + file + ' have changed, reload');
          attribute = JSON.parse(fs.readFileSync(file, 'utf8')) as T;
        } catch (error) {
          FileUtils.handleFileException(logPrefix, fileType, file, error as NodeJS.ErrnoException, {
            throwError: false,
          });
        }
      }
    }
  ) {
    if (file) {
      try {
        fs.watch(file, listener);
      } catch (error) {
        FileUtils.handleFileException(logPrefix, fileType, file, error as NodeJS.ErrnoException, {
          throwError: false,
        });
      }
    } else {
      logger.info(`${logPrefix} No ${fileType} file to watch given. Not monitoring its changes`);
    }
  }

  static handleFileException(
    logPrefix: string,
    fileType: FileType,
    file: string,
    error: NodeJS.ErrnoException,
    params: HandleErrorParams<EmptyObject> = { throwError: true, consoleOut: false }
  ): void {
    const prefix = !Utils.isEmptyString(logPrefix) ? logPrefix + ' ' : '';
    if (error.code === 'ENOENT') {
      if (params?.consoleOut) {
        console.warn(
          chalk.green(prefix) + chalk.yellow(fileType + ' file ' + file + ' not found: '),
          error
        );
      } else {
        logger.warn(prefix + fileType + ' file ' + file + ' not found: %j', error);
      }
    } else if (error.code === 'EEXIST') {
      if (params?.consoleOut) {
        console.warn(
          chalk.green(prefix) + chalk.yellow(fileType + ' file ' + file + ' already exists: '),
          error
        );
      } else {
        logger.warn(prefix + fileType + ' file ' + file + ' already exists: %j', error);
      }
    } else if (error.code === 'EACCES') {
      if (params?.consoleOut) {
        console.warn(
          chalk.green(prefix) + chalk.yellow(fileType + ' file ' + file + ' access denied: '),
          error
        );
      } else {
        logger.warn(prefix + fileType + ' file ' + file + ' access denied: %j', error);
      }
    } else {
      if (params?.consoleOut) {
        console.warn(
          chalk.green(prefix) + chalk.yellow(fileType + ' file ' + file + ' error: '),
          error
        );
      } else {
        logger.warn(prefix + fileType + ' file ' + file + ' error: %j', error);
      }
      if (params?.throwError) {
        throw error;
      }
    }
  }
}
