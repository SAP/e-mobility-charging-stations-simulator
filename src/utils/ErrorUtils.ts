import chalk from 'chalk'
import process from 'node:process'

import type { ChargingStation } from '../charging-station/index.js'
import type {
  EmptyObject,
  FileType,
  HandleErrorParams,
  IncomingRequestCommand,
  JsonType,
  MessageType,
  RequestCommand,
} from '../types/index.js'

import { getMessageTypeString } from '../charging-station/ocpp/OCPPServiceUtils.js'
import { logger } from './Logger.js'
import { isNotEmptyString } from './Utils.js'

const moduleName = 'ErrorUtils'

export const handleUncaughtException = (): void => {
  process.on('uncaughtException', (error: Error) => {
    console.error(chalk.red('Uncaught exception: '), error)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    logger?.error?.('Uncaught exception:', error)
  })
}

export const handleUnhandledRejection = (): void => {
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error(chalk.red('Unhandled rejection: '), { promise, reason })
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    logger?.error?.('Unhandled rejection:', { promise, reason })
  })
}

export const handleFileException = (
  file: string,
  fileType: FileType,
  error: NodeJS.ErrnoException,
  logPrefix: string,
  params?: HandleErrorParams<EmptyObject>
): void => {
  params = {
    ...{
      consoleOut: false,
      throwError: true,
    },
    ...params,
  }
  const prefix = isNotEmptyString(logPrefix) ? `${logPrefix} ` : ''
  let logMsg: string
  switch (error.code) {
    case 'EACCES':
      logMsg = `${fileType} file ${file} access denied:`
      break
    case 'EEXIST':
      logMsg = `${fileType} file ${file} already exists:`
      break
    case 'EISDIR':
      logMsg = `${fileType} file ${file} is a directory:`
      break
    case 'ENOENT':
      logMsg = `${fileType} file ${file} not found:`
      break
    case 'ENOSPC':
      logMsg = `${fileType} file ${file} no space left on device:`
      break
    case 'ENOTDIR':
      logMsg = `${fileType} file ${file} parent is not a directory:`
      break
    case 'EPERM':
      logMsg = `${fileType} file ${file} permission denied:`
      break
    case 'EROFS':
      logMsg = `${fileType} file ${file} read-only file system:`
      break
    default:
      logMsg = `${fileType} file ${file} error:`
  }
  if (params.consoleOut === true) {
    logMsg = `${logMsg} `
    if (params.throwError === true) {
      console.error(`${chalk.green(prefix)}${chalk.red(logMsg)}`, error)
    } else {
      console.warn(`${chalk.green(prefix)}${chalk.yellow(logMsg)}`, error)
    }
  } else if (params.consoleOut === false) {
    if (params.throwError === true) {
      logger.error(`${prefix}${logMsg}`, error)
    } else {
      logger.warn(`${prefix}${logMsg}`, error)
    }
  }
  if (params.throwError === true) {
    throw error
  }
}

export const handleSendMessageError = (
  chargingStation: ChargingStation,
  commandName: IncomingRequestCommand | RequestCommand,
  messageType: MessageType,
  error: Error,
  params?: HandleErrorParams<EmptyObject>
): void => {
  params = {
    ...{
      consoleOut: false,
      throwError: false,
    },
    ...params,
  }
  const logMsg = `${chargingStation.logPrefix()} ${moduleName}.handleSendMessageError: Send ${getMessageTypeString(messageType)} command '${commandName}' error:`
  if (params.consoleOut === true) {
    console.error(logMsg, error)
  } else {
    logger.error(logMsg, error)
  }
  if (params.throwError === true) {
    throw error
  }
}

export const handleIncomingRequestError = <T extends JsonType>(
  chargingStation: ChargingStation,
  commandName: IncomingRequestCommand,
  error: Error,
  params?: HandleErrorParams<T>
): T | undefined => {
  params = {
    ...{
      consoleOut: false,
      throwError: false,
    },
    ...params,
  }
  const logMsg = `${chargingStation.logPrefix()} ${moduleName}.handleIncomingRequestError: Incoming request command '${commandName}' error:`
  if (params.consoleOut === true) {
    console.error(logMsg, error)
  } else {
    logger.error(logMsg, error)
  }
  if (params.throwError === false) {
    return params.errorResponse
  }
  throw error
}
