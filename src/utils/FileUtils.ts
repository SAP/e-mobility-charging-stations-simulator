import logger from './Logger';

export default class FileUtils {
  static handleFileException(logPrefix: string, fileType: string, filePath: string, error: NodeJS.ErrnoException, consoleOut = false): void {
    const prefix = logPrefix.length !== 0 ? logPrefix + ' ' : '';
    if (error.code === 'ENOENT') {
      if (consoleOut) {
        console.warn(prefix + fileType + ' file ' + filePath + ' not found: ', error);
      } else {
        logger.warn(prefix + fileType + ' file ' + filePath + ' not found: %j', error);
      }
    } else {
      if (consoleOut) {
        console.error(prefix + fileType + ' file ' + filePath + ' opening error: ', error);
      } else {
        logger.error(prefix + fileType + ' file ' + filePath + ' opening error: %j', error);
      }
      throw error;
    }
  }
}
