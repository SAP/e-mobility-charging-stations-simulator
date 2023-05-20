import chalk from 'chalk';

import { logger } from './Logger';
import { Utils } from './Utils';
import type { ChargingStation } from '../charging-station';
import type {
  EmptyObject,
  FileType,
  HandleErrorParams,
  IncomingRequestCommand,
  RequestCommand,
} from '../types';

export class ErrorUtils {
  private constructor() {
    // This is intentional
  }

  public static handleUncaughtException(): void {
    process.on('uncaughtException', (error: Error) => {
      console.error(chalk.red('Uncaught exception: '), error);
    });
  }

  public static handleUnhandledRejection(): void {
    process.on('unhandledRejection', (reason: unknown) => {
      console.error(chalk.red('Unhandled rejection: '), reason);
    });
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

  public static handleSendMessageError(
    chargingStation: ChargingStation,
    commandName: RequestCommand | IncomingRequestCommand,
    error: Error,
    params: HandleErrorParams<EmptyObject> = { throwError: false }
  ): void {
    logger.error(`${chargingStation.logPrefix()} Request command '${commandName}' error:`, error);
    if (params?.throwError === true) {
      throw error;
    }
  }
}
