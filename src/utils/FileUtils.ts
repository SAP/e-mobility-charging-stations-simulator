import chalk from 'chalk';
import logger from './Logger';

export default class FileUtils {
  static handleFileException(logPrefix: string, fileType: string, filePath: string, error: NodeJS.ErrnoException, consoleOut = false): void {
    const prefix = logPrefix.length !== 0 ? logPrefix + ' ' : '';
    if (error.code === 'ENOENT') {
      if (consoleOut) {
        console.warn(chalk.green(prefix) + chalk.yellow(fileType + ' file ' + filePath + ' not found: '), error);
      } else {
        logger.warn(prefix + fileType + ' file ' + filePath + ' not found: %j', error);
      }
    } else if (error.code === 'EEXIST') {
      if (consoleOut) {
        console.warn(chalk.green(prefix) + chalk.yellow(fileType + ' file ' + filePath + ' already exists: '), error);
      } else {
        logger.warn(prefix + fileType + ' file ' + filePath + ' already exists: %j', error);
      }
    } else if (error.code === 'EACCES') {
      if (consoleOut) {
        console.warn(chalk.green(prefix) + chalk.yellow(fileType + ' file ' + filePath + ' access denied: '), error);
      } else {
        logger.warn(prefix + fileType + ' file ' + filePath + ' access denied: %j', error);
      }
    } else {
      if (consoleOut) {
        console.warn(chalk.green(prefix) + chalk.yellow(fileType + ' file ' + filePath + ' error: '), error);
      } else {
        logger.warn(prefix + fileType + ' file ' + filePath + ' error: %j', error);
      }
      throw error;
    }
  }
}
