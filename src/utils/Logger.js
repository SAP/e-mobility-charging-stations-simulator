const Configuration = require('./Configuration');
const Winston = require('winston');

const logger = Winston.createLogger({
  level: 'info',
  format: Winston.format.combine(Winston.format.splat(), Winston.format.json()),
  defaultMeta: {service: 'user-service'},
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new Winston.transports.File({filename: Configuration.getErrorFile(), level: 'error'}),
    new Winston.transports.File({filename: Configuration.getLogFile()}),
  ],
});

//
// If enabled, log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (Configuration.getConsoleLog()) {
  logger.add(new Winston.transports.Console({
    format: Winston.format.simple(),
  }));
}

module.exports = logger;
