import type { FormatWrap } from 'logform'

import { createLogger, format, type transport, transports as WinstonTransports } from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

import { ConfigurationSection, type LogConfiguration } from '../types/index.js'
import { Configuration } from './Configuration.js'
import { insertAt, isNotEmptyString } from './Utils.js'

const logConfiguration = Configuration.getConfigurationSection<LogConfiguration>(
  ConfigurationSection.log
)
const transports: transport[] = []
if (logConfiguration.rotate === true) {
  const logMaxFiles = logConfiguration.maxFiles
  const logMaxSize = logConfiguration.maxSize
  if (isNotEmptyString(logConfiguration.errorFile)) {
    transports.push(
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
    transports.push(
      new DailyRotateFile({
        filename: insertAt(logConfiguration.file, '-%DATE%', logConfiguration.file.indexOf('.log')),
        ...(logMaxFiles != null && { maxFiles: logMaxFiles }),
        ...(logMaxSize != null && { maxSize: logMaxSize }),
      })
    )
  }
} else {
  if (isNotEmptyString(logConfiguration.errorFile)) {
    transports.push(
      new WinstonTransports.File({
        filename: logConfiguration.errorFile,
        level: 'error',
      })
    )
  }
  if (isNotEmptyString(logConfiguration.file)) {
    transports.push(
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

const logger = createLogger({
  format: logFormat,
  level: logConfiguration.level,
  silent: logConfiguration.enabled === false || transports.length === 0,
  transports,
})

//
// If enabled, log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (logConfiguration.console === true) {
  logger.add(
    new WinstonTransports.Console({
      format: logFormat,
    })
  )
}

export { logger }
