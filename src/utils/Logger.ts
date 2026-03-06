import type { FormatWrap } from 'logform'

import {
  createLogger,
  format,
  type transport,
  type Logger as WinstonLogger,
  transports as WinstonTransports,
} from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

import { ConfigurationSection, type LogConfiguration } from '../types/index.js'
import { Configuration } from './Configuration.js'
import { insertAt, isNotEmptyString } from './Utils.js'

let loggerInstance: undefined | WinstonLogger

const getLoggerInstance = (): WinstonLogger => {
  if (loggerInstance !== undefined) {
    return loggerInstance
  }
  const logConfiguration = Configuration.getConfigurationSection<LogConfiguration>(
    ConfigurationSection.log
  )
  const logTransports: transport[] = []
  if (logConfiguration.rotate === true) {
    const logMaxFiles = logConfiguration.maxFiles
    const logMaxSize = logConfiguration.maxSize
    if (isNotEmptyString(logConfiguration.errorFile)) {
      logTransports.push(
        new DailyRotateFile({
          filename: insertAt(
            logConfiguration.errorFile,
            '-%DATE%',
            logConfiguration.errorFile.indexOf('.log')
          ),
          level: 'error',
          ...(logMaxFiles != null && { maxFiles: logMaxFiles }),
          ...(logMaxSize != null && { maxSize: logMaxSize }),
        })
      )
    }
    if (isNotEmptyString(logConfiguration.file)) {
      logTransports.push(
        new DailyRotateFile({
          filename: insertAt(
            logConfiguration.file,
            '-%DATE%',
            logConfiguration.file.indexOf('.log')
          ),
          ...(logMaxFiles != null && { maxFiles: logMaxFiles }),
          ...(logMaxSize != null && { maxSize: logMaxSize }),
        })
      )
    }
  } else {
    if (isNotEmptyString(logConfiguration.errorFile)) {
      logTransports.push(
        new WinstonTransports.File({
          filename: logConfiguration.errorFile,
          level: 'error',
        })
      )
    }
    if (isNotEmptyString(logConfiguration.file)) {
      logTransports.push(
        new WinstonTransports.File({
          filename: logConfiguration.file,
        })
      )
    }
  }
  const logFormat = format.combine(
    format.splat(),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (format[logConfiguration.format! as keyof FormatWrap] as FormatWrap)()
  )
  loggerInstance = createLogger({
    format: logFormat,
    level: logConfiguration.level,
    silent: logConfiguration.enabled === false || logTransports.length === 0,
    transports: logTransports,
  })
  //
  // If enabled, log to the `console` with the format:
  // `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
  //
  if (logConfiguration.console === true) {
    loggerInstance.add(
      new WinstonTransports.Console({
        format: logFormat,
      })
    )
  }
  return loggerInstance
}

export const logger = new Proxy({} as WinstonLogger, {
  get (target, property, receiver): unknown {
    if (Reflect.has(target, property)) {
      return Reflect.get(target, property, receiver) as unknown
    }
    return Reflect.get(getLoggerInstance(), property, receiver) as unknown
  },
  getOwnPropertyDescriptor (target, property) {
    return (
      Reflect.getOwnPropertyDescriptor(target, property) ??
      Reflect.getOwnPropertyDescriptor(getLoggerInstance(), property)
    )
  },
  getPrototypeOf () {
    return Reflect.getPrototypeOf(getLoggerInstance())
  },
  has (target, property) {
    return Reflect.has(target, property) || Reflect.has(getLoggerInstance(), property)
  },
  set (target, property, value, receiver) {
    return Reflect.set(target, property, value, receiver)
  },
})
