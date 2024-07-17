import type { FormatWrap } from 'logform'
import { createLogger, format, type transport } from 'winston'
import TransportType from 'winston/lib/winston/transports/index.js'
import DailyRotateFile from 'winston-daily-rotate-file'

import { ConfigurationSection, type LogConfiguration } from '../types/index.js'
import { Configuration } from './Configuration.js'
import { insertAt } from './Utils.js'

const logConfiguration = Configuration.getConfigurationSection<LogConfiguration>(
  ConfigurationSection.log
)
let transports: transport[]
if (logConfiguration.rotate === true) {
  const logMaxFiles = logConfiguration.maxFiles
  const logMaxSize = logConfiguration.maxSize
  transports = [
    new DailyRotateFile({
      filename: insertAt(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        logConfiguration.errorFile!,
        '-%DATE%',
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        logConfiguration.errorFile!.indexOf('.log')
      ),
      level: 'error',
      ...(logMaxFiles != null && { maxFiles: logMaxFiles }),
      ...(logMaxSize != null && { maxSize: logMaxSize }),
    }),
    new DailyRotateFile({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      filename: insertAt(logConfiguration.file!, '-%DATE%', logConfiguration.file!.indexOf('.log')),
      ...(logMaxFiles != null && { maxFiles: logMaxFiles }),
      ...(logMaxSize != null && { maxSize: logMaxSize }),
    }),
  ]
} else {
  transports = [
    new TransportType.File({
      filename: logConfiguration.errorFile,
      level: 'error',
    }),
    new TransportType.File({
      filename: logConfiguration.file,
    }),
  ]
}

export const logger = createLogger({
  silent: logConfiguration.enabled === false,
  level: logConfiguration.level,
  format: format.combine(
    format.splat(),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (format[logConfiguration.format! as keyof FormatWrap] as FormatWrap)()
  ),
  transports,
})

//
// If enabled, log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (logConfiguration.console === true) {
  logger.add(
    new TransportType.Console({
      format: format.combine(
        format.splat(),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (format[logConfiguration.format! as keyof FormatWrap] as FormatWrap)()
      ),
    })
  )
}
