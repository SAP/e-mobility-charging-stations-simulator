import type { Format } from 'logform';
import { Logger, createLogger, format, transport } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import TransportType from 'winston/lib/winston/transports/index.js';

import Configuration from './Configuration';
import Utils from './Utils';

let transports: transport[];
if (Configuration.getLogRotate()) {
  const logMaxFiles = Configuration.getLogMaxFiles();
  transports = [
    new DailyRotateFile({
      filename: Utils.insertAt(
        Configuration.getLogErrorFile(),
        '-%DATE%',
        Configuration.getLogErrorFile().indexOf('.log')
      ),
      level: 'error',
      maxFiles: logMaxFiles,
    }),
    new DailyRotateFile({
      filename: Utils.insertAt(
        Configuration.getLogFile(),
        '-%DATE%',
        Configuration.getLogFile().indexOf('.log')
      ),
      maxFiles: logMaxFiles,
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
  format: format.combine(format.splat(), (format[Configuration.getLogFormat()] as () => Format)()),
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
        (format[Configuration.getLogFormat()] as () => Format)()
      ),
    })
  );
}

export default logger;
