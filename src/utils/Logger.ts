import type { FormatWrap } from 'logform';
import { createLogger, format, type transport } from 'winston';
import TransportType from 'winston/lib/winston/transports/index.js';
import DailyRotateFile from 'winston-daily-rotate-file';

import { Configuration } from './Configuration';
import { insertAt } from './Utils';

let transports: transport[];
if (Configuration.getLog().rotate === true) {
  const logMaxFiles = Configuration.getLog().maxFiles;
  const logMaxSize = Configuration.getLog().maxSize;
  transports = [
    new DailyRotateFile({
      filename: insertAt(
        Configuration.getLog().errorFile,
        '-%DATE%',
        Configuration.getLog().errorFile?.indexOf('.log')
      ),
      level: 'error',
      ...(logMaxFiles && { maxFiles: logMaxFiles }),
      ...(logMaxSize && { maxSize: logMaxSize }),
    }),
    new DailyRotateFile({
      filename: insertAt(
        Configuration.getLog().file,
        '-%DATE%',
        Configuration.getLog().file?.indexOf('.log')
      ),
      ...(logMaxFiles && { maxFiles: logMaxFiles }),
      ...(logMaxSize && { maxSize: logMaxSize }),
    }),
  ];
} else {
  transports = [
    new TransportType.File({ filename: Configuration.getLog().errorFile, level: 'error' }),
    new TransportType.File({ filename: Configuration.getLog().file }),
  ];
}

export const logger = createLogger({
  silent: !Configuration.getLog().enabled,
  level: Configuration.getLog().level,
  format: format.combine(format.splat(), (format[Configuration.getLog().format] as FormatWrap)()),
  transports,
});

//
// If enabled, log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (Configuration.getLog().console) {
  logger.add(
    new TransportType.Console({
      format: format.combine(
        format.splat(),
        (format[Configuration.getLog().format] as FormatWrap)()
      ),
    })
  );
}
