import 'winston-daily-rotate-file';

import Configuration from './Configuration';
import Utils from './Utils';
import winston from 'winston';

const maxLogFiles = 7;

const logger = winston.createLogger({
  level: Configuration.getLogLevel(),
  format: winston.format.combine(winston.format.splat(), winston.format[Configuration.getLogFormat()]()),
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.DailyRotateFile({ filename: Utils.insertAt(Configuration.getLogErrorFile(), '-%DATE%', Configuration.getLogErrorFile().indexOf('.log')), level: 'error', maxFiles: maxLogFiles }),
    new winston.transports.DailyRotateFile({ filename: Utils.insertAt(Configuration.getLogFile(), '-%DATE%', Configuration.getLogFile().indexOf('.log')), maxFiles: maxLogFiles }),
  ],
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
