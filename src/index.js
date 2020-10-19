const Configuration = require('./utils/Configuration');
const Utils = require('./utils/Utils');
const Wrk = require('./charging-station/Worker');
const logger = require('./utils/Logger');

class Bootstrap {
  static async start() {
    try {
      logger.debug('%s Configuration: %j', Utils.basicFormatLog(), Configuration.getConfig());
      // Start each ChargingStation object in a worker thread
      if (Configuration.getStationTemplateURLs()) {
        let numStationsTotal = 0;
        Configuration.getStationTemplateURLs().forEach((stationURL) => {
          try {
            const nbStation = stationURL.numberOfStation ? stationURL.numberOfStation : 0;
            numStationsTotal += nbStation;
            for (let index = 1; index <= nbStation; index++) {
              const worker = new Wrk('./src/charging-station/StationWorker.js', {
                index,
                templateFile: stationURL.file,
              }, numStationsTotal);
              worker.start();
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.log('Charging station start with template file ' + stationURL.file + ' error ' + JSON.stringify(error, null, ' '));
          }
        });
      } else {
        console.log('No stationTemplateURLs defined in configuration, exiting');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log('Bootstrap start error ' + JSON.stringify(error, null, ' '));
    }
  }
}

Bootstrap.start();
