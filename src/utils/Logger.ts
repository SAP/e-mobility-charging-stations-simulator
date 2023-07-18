import type { FormatWrap } from 'logform';
import { createLogger, format, type transport } from 'winston';
import TransportType from 'winston/lib/winston/transports/index.js';
import DailyRotateFile from 'winston-daily-rotate-file';

import { Configuration } from './Configuration';
import { insertAt } from './Utils';
import { ConfigurationSection, type LogConfiguration } from '../types';

const logConfiguration = Configuration.getConfigurationSection<LogConfiguration>(
  ConfigurationSection.log,
);
let transports: transport[];
if (logConfiguration.rotate === true) {
  const logMaxFiles = logConfiguration.maxFiles;
  const logMaxSize = logConfiguration.maxSize;
  transports = [
    new DailyRotateFile({
      filename: insertAt(
        logConfiguration.errorFile!,
        '-%DATE%',
        logConfiguration.errorFile!.indexOf('.log'),
      ),
      level: 'error',
      ...(logMaxFiles && { maxFiles: logMaxFiles }),
      ...(logMaxSize && { maxSize: logMaxSize }),
    }),
    new DailyRotateFile({
      filename: insertAt(logConfiguration.file!, '-%DATE%', logConfiguration.file!.indexOf('.log')),
      ...(logMaxFiles && { maxFiles: logMaxFiles }),
      ...(logMaxSize && { maxSize: logMaxSize }),
    }),
  ];
} else {
  transports = [
    new TransportType.File({
      filename: logConfiguration.errorFile,
      level: 'error',
    }),
    new TransportType.File({
      filename: logConfiguration.file,
    }),
  ];
}

export const logger = createLogger({
  silent: !logConfiguration.enabled,
  level: logConfiguration.level,
  format: format.combine(
    format.splat(),
    (format[logConfiguration.format! as keyof FormatWrap] as FormatWrap)(),
  ),
  transports,
});

//
// If enabled, log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (logConfiguration.console) {
  logger.add(
    new TransportType.Console({
      format: format.combine(
        format.splat(),
        (format[logConfiguration.format! as keyof FormatWrap] as FormatWrap)(),
      ),
    }),
  );
}
