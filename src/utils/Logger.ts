import type { FormatWrap } from 'logform'

import { parse } from 'node:path'
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
import { isEmpty, isNotEmptyString } from './Utils.js'

let loggerInitialized = false

/**
 * Builds the daily rotated log file name pattern by inserting the date
 * placeholder before the file extension of the base name, or at the end
 * when the file has no extension.
 * Trailing separators are ignored without changing the directory prefix.
 * @param file - Log file path
 * @returns Log file path pattern with the `%DATE%` placeholder
 */
export const getRotatingLogFileName = (file: string): string => {
  const { base, ext, name } = parse(file)
  return `${file.slice(0, file.lastIndexOf(base))}${name}-%DATE%${ext}`
}

const configureLogger = (): void => {
  const logConfiguration = Configuration.getConfigurationSection<LogConfiguration>(
    ConfigurationSection.log
  )
  const logTransports: transport[] = []
  if (logConfiguration.rotate === true) {
    const logMaxFiles = logConfiguration.maxFiles
    const logMaxSize = logConfiguration.maxSize
    if (isNotEmptyString(logConfiguration.errorFile)) {
      logTransports.push(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment -- false positive: winston's transport class is reached through an `export =` + `export import` alias (typescript-eslint#13234)
        new DailyRotateFile({
          filename: getRotatingLogFileName(logConfiguration.errorFile),
          level: 'error',
          ...(logMaxFiles != null && { maxFiles: logMaxFiles }),
          ...(logMaxSize != null && { maxSize: logMaxSize }),
        })
      )
    }
    if (isNotEmptyString(logConfiguration.file)) {
      logTransports.push(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment -- false positive: winston's transport class is reached through an `export =` + `export import` alias (typescript-eslint#13234)
        new DailyRotateFile({
          filename: getRotatingLogFileName(logConfiguration.file),
          ...(logMaxFiles != null && { maxFiles: logMaxFiles }),
          ...(logMaxSize != null && { maxSize: logMaxSize }),
        })
      )
    }
  } else {
    if (isNotEmptyString(logConfiguration.errorFile)) {
      logTransports.push(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment -- false positive: winston's transport class is reached through an `export =` + `export import` alias (typescript-eslint#13234)
        new WinstonTransports.File({
          filename: logConfiguration.errorFile,
          level: 'error',
        })
      )
    }
    if (isNotEmptyString(logConfiguration.file)) {
      logTransports.push(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment -- false positive: winston's transport class is reached through an `export =` + `export import` alias (typescript-eslint#13234)
        new WinstonTransports.File({
          filename: logConfiguration.file,
        })
      )
    }
  }
  const logFormat = format.combine(
    format.splat(),
    (format[(logConfiguration.format ?? 'simple') as keyof FormatWrap] as FormatWrap)()
  )
  logger.configure({
    format: logFormat,
    level: logConfiguration.level,
    silent:
      logConfiguration.enabled === false ||
      isEmpty(logTransports) ||
      process.env.NODE_ENV === 'test',
    transports: logTransports,
  })
  //
  // If enabled, log to the `console` with the format:
  // `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
  //
  if (logConfiguration.console === true) {
    logger.add(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment -- false positive: winston's transport class is reached through an `export =` + `export import` alias (typescript-eslint#13234)
      new WinstonTransports.Console({
        format: logFormat,
      })
    )
  }
}

const initializeLogger = (): void => {
  if (loggerInitialized) {
    return
  }
  // Configuration calls back through the proxy while attaching transports.
  loggerInitialized = true
  try {
    configureLogger()
  } catch (error) {
    loggerInitialized = false
    throw error
  }
}

const createLoggerTarget = (): WinstonLogger => {
  const target = createLogger({ silent: true })
  // Winston generates these methods on a private prototype and defaults detached calls
  // to its raw instance. Preserve the public receiver for detached calls.
  const prototype = Reflect.getPrototypeOf(target) as Record<
    string,
    (...args: unknown[]) => WinstonLogger
  >
  for (const level of Object.keys(target.levels)) {
    const log = prototype[level]
    prototype[level] = function (this: unknown, ...args: unknown[]): WinstonLogger {
      if (!this) {
        return log.apply(logger, args)
      }
      return log.apply(this, args)
    }
  }
  // Stream callbacks can emit on the raw target. Use it as the root pipe source
  // even when the caller holds the proxy, so unpipe matches the registered source.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The apply traps supply the stream receiver.
  const { pipe, unpipe } = target
  target.pipe = new Proxy(pipe, {
    apply (pipe, receiver: unknown, args): unknown {
      return Reflect.apply(pipe, receiver === logger ? target : receiver, args) as unknown
    },
  })
  target.unpipe = new Proxy(unpipe, {
    apply (unpipe, receiver: unknown, args): unknown {
      const result: unknown = Reflect.apply(unpipe, receiver === logger ? target : receiver, args)
      return receiver === logger && result === target ? logger : result
    },
  })
  return target
}

// Configure the actual target in place. There is no second set of stream state or descriptors.
export const logger = new Proxy<WinstonLogger>(createLoggerTarget(), {
  defineProperty (target, property, descriptor): boolean {
    initializeLogger()
    return Reflect.defineProperty(target, property, descriptor)
  },
  deleteProperty (target, property): boolean {
    initializeLogger()
    return Reflect.deleteProperty(target, property)
  },
  get (target, property, receiver): unknown {
    initializeLogger()
    return Reflect.get(target, property, receiver) as unknown
  },
  getOwnPropertyDescriptor (target, property): PropertyDescriptor | undefined {
    initializeLogger()
    return Reflect.getOwnPropertyDescriptor(target, property)
  },
  getPrototypeOf (target): null | object {
    initializeLogger()
    return Reflect.getPrototypeOf(target)
  },
  has (target, property): boolean {
    initializeLogger()
    return Reflect.has(target, property)
  },
  ownKeys (target): ArrayLike<string | symbol> {
    initializeLogger()
    return Reflect.ownKeys(target)
  },
  preventExtensions (target): boolean {
    initializeLogger()
    return Reflect.preventExtensions(target)
  },
  set (target, property, value, receiver): boolean {
    initializeLogger()
    return Reflect.set(target, property, value, receiver)
  },
  setPrototypeOf (target, prototype): boolean {
    initializeLogger()
    return Reflect.setPrototypeOf(target, prototype)
  },
})
