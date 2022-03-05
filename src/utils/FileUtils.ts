import { EmptyObject } from '../types/EmptyObject';
import { HandleErrorParams } from '../types/Error';
import Utils from './Utils';
import chalk from 'chalk';
import logger from './Logger';

export default class FileUtils {
  static handleFileException(
    logPrefix: string,
    fileType: string,
    filePath: string,
    error: NodeJS.ErrnoException,
    params: HandleErrorParams<EmptyObject> = { throwError: true, consoleOut: false }
  ): void {
    const prefix = !Utils.isEmptyString(logPrefix) ? logPrefix + ' ' : '';
    if (error.code === 'ENOENT') {
      if (params?.consoleOut) {
        console.warn(
          chalk.green(prefix) + chalk.yellow(fileType + ' file ' + filePath + ' not found: '),
          error
        );
      } else {
        logger.warn(prefix + fileType + ' file ' + filePath + ' not found: %j', error);
      }
    } else if (error.code === 'EEXIST') {
      if (params?.consoleOut) {
        console.warn(
          chalk.green(prefix) + chalk.yellow(fileType + ' file ' + filePath + ' already exists: '),
          error
        );
      } else {
        logger.warn(prefix + fileType + ' file ' + filePath + ' already exists: %j', error);
      }
    } else if (error.code === 'EACCES') {
      if (params?.consoleOut) {
        console.warn(
          chalk.green(prefix) + chalk.yellow(fileType + ' file ' + filePath + ' access denied: '),
          error
        );
      } else {
        logger.warn(prefix + fileType + ' file ' + filePath + ' access denied: %j', error);
      }
    } else {
      if (params?.consoleOut) {
        console.warn(
          chalk.green(prefix) + chalk.yellow(fileType + ' file ' + filePath + ' error: '),
          error
        );
      } else {
        logger.warn(prefix + fileType + ' file ' + filePath + ' error: %j', error);
      }
      if (params?.throwError) {
        throw error;
      }
    }
  }
}
