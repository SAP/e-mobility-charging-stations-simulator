import 'winston-daily-rotate-file';

import winston, { transport } from 'winston';

import Configuration from './Configuration';
import Utils from './Utils';

let transports: transport[];
if (Configuration.getLogRotate()) {
  const logMaxFiles = Configuration.getLogMaxFiles();
  transports = [
    new winston.transports.DailyRotateFile({ filename: Utils.insertAt(Configuration.getLogErrorFile(), '-%DATE%', Configuration.getLogErrorFile().indexOf('.log')), level: 'error', maxFiles: logMaxFiles }),
    new winston.transports.DailyRotateFile({ filename: Utils.insertAt(Configuration.getLogFile(), '-%DATE%', Configuration.getLogFile().indexOf('.log')), maxFiles: logMaxFiles }),
  ];
} else {
  transports = [
    new winston.transports.File({ filename: Configuration.getLogErrorFile(), level: 'error' }),
    new winston.transports.File({ filename: Configuration.getLogFile() }),
  ];
}

const logger = winston.createLogger({
  level: Configuration.getLogLevel(),
  format: winston.format.combine(winston.format.splat(), winston.format[Configuration.getLogFormat()]()),
  transports: transports,
});

//
// If enabled, log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (Configuration.getLogConsole()) {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(winston.format.splat(), winston.format[Configuration.getLogFormat()]()),
  }));
}

export default logger;
