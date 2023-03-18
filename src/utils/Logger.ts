import type { FormatWrap } from 'logform';
import { type Logger, createLogger, format, type transport } from 'winston';
import TransportType from 'winston/lib/winston/transports/index.js';
import DailyRotateFile from 'winston-daily-rotate-file';

// import { Configuration, Utils } from './internal';
import { Configuration } from './Configuration';
import { Utils } from './Utils';

let transports: transport[];
if (Configuration.getLogRotate() === true) {
  const logMaxFiles = Configuration.getLogMaxFiles();
  const logMaxSize = Configuration.getLogMaxSize();
  transports = [
    new DailyRotateFile({
      filename: Utils.insertAt(
        Configuration.getLogErrorFile(),
        '-%DATE%',
        Configuration.getLogErrorFile()?.indexOf('.log')
      ),
      level: 'error',
      ...(logMaxFiles && { maxFiles: logMaxFiles }),
      ...(logMaxSize && { maxSize: logMaxSize }),
    }),
    new DailyRotateFile({
      filename: Utils.insertAt(
        Configuration.getLogFile(),
        '-%DATE%',
        Configuration.getLogFile()?.indexOf('.log')
      ),
      ...(logMaxFiles && { maxFiles: logMaxFiles }),
      ...(logMaxSize && { maxSize: logMaxSize }),
    }),
  ];
} else {
  transports = [
    new TransportType.File({ filename: Configuration.getLogErrorFile(), level: 'error' }),
    new TransportType.File({ filename: Configuration.getLogFile() }),
  ];
}

const logger: Logger = createLogger({
  level: Configuration.getLogLevel(),
  format: format.combine(format.splat(), (format[Configuration.getLogFormat()] as FormatWrap)()),
  transports,
});

//
// If enabled, log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (Configuration.getLogConsole()) {
  logger.add(
    new TransportType.Console({
      format: format.combine(
        format.splat(),
        (format[Configuration.getLogFormat()] as FormatWrap)()
      ),
    })
  );
}

export { logger };
