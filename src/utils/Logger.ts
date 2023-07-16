import type { FormatWrap } from 'logform';
import { createLogger, format, type transport } from 'winston';
import TransportType from 'winston/lib/winston/transports/index.js';
import DailyRotateFile from 'winston-daily-rotate-file';

import { Configuration } from './Configuration';
import { insertAt } from './Utils';
import { ConfigurationSection, type LogConfiguration } from '../types';

let transports: transport[];
if (
  Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log).rotate === true
) {
  const logMaxFiles = Configuration.getConfigurationSection<LogConfiguration>(
    ConfigurationSection.log,
  ).maxFiles;
  const logMaxSize = Configuration.getConfigurationSection<LogConfiguration>(
    ConfigurationSection.log,
  ).maxSize;
  transports = [
    new DailyRotateFile({
      filename: insertAt(
        Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log)
          .errorFile!,
        '-%DATE%',
        Configuration.getConfigurationSection<LogConfiguration>(
          ConfigurationSection.log,
        ).errorFile!.indexOf('.log'),
      ),
      level: 'error',
      ...(logMaxFiles && { maxFiles: logMaxFiles }),
      ...(logMaxSize && { maxSize: logMaxSize }),
    }),
    new DailyRotateFile({
      filename: insertAt(
        Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log).file!,
        '-%DATE%',
        Configuration.getConfigurationSection<LogConfiguration>(
          ConfigurationSection.log,
        ).file!.indexOf('.log'),
      ),
      ...(logMaxFiles && { maxFiles: logMaxFiles }),
      ...(logMaxSize && { maxSize: logMaxSize }),
    }),
  ];
} else {
  transports = [
    new TransportType.File({
      filename: Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log)
        .errorFile,
      level: 'error',
    }),
    new TransportType.File({
      filename: Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log)
        .file,
    }),
  ];
}

export const logger = createLogger({
  silent: !Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log)
    .enabled,
  level: Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log).level,
  format: format.combine(
    format.splat(),
    (
      format[
        Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log).format!
      ] as FormatWrap
    )(),
  ),
  transports,
});

//
// If enabled, log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log).console) {
  logger.add(
    new TransportType.Console({
      format: format.combine(
        format.splat(),
        (
          format[
            Configuration.getConfigurationSection<LogConfiguration>(ConfigurationSection.log)
              .format!
          ] as FormatWrap
        )(),
      ),
    }),
  );
}
