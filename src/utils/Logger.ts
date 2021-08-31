import { Console, File } from 'winston/lib/winston/transports';
import { Logger, createLogger, format, transport } from 'winston';

import Configuration from './Configuration';
import DailyRotateFile from 'winston-daily-rotate-file';
import Utils from './Utils';

let transports: transport[];
if (Configuration.getLogRotate()) {
  const logMaxFiles = Configuration.getLogMaxFiles();
  transports = [
    new DailyRotateFile({ filename: Utils.insertAt(Configuration.getLogErrorFile(), '-%DATE%', Configuration.getLogErrorFile().indexOf('.log')), level: 'error', maxFiles: logMaxFiles }),
    new DailyRotateFile({ filename: Utils.insertAt(Configuration.getLogFile(), '-%DATE%', Configuration.getLogFile().indexOf('.log')), maxFiles: logMaxFiles }),
  ];
} else {
  transports = [
    new File({ filename: Configuration.getLogErrorFile(), level: 'error' }),
    new File({ filename: Configuration.getLogFile() }),
  ];
}

const logger: Logger = createLogger({
  level: Configuration.getLogLevel().toLowerCase(),
  format: format.combine(format.splat(), format[Configuration.getLogFormat()]()),
  transports: transports,
});

//
// If enabled, log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (Configuration.getLogConsole()) {
  logger.add(new Console({
    format: format.combine(format.splat(), format[Configuration.getLogFormat()]()),
  }));
}

export default logger;
