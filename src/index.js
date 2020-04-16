const Configuration = require('./utils/Configuration');
const Utils = require('./utils/Utils');
const Wrk = require('./charging-station/Worker');
const fs = require('fs');
const logger = require('./utils/Logger');

class Bootstrap {
  static async start() {
    try {
      logger.info('%s Configuration: %j', Utils.basicFormatLog(), Configuration.getConfig());
      // Start each ChargingStation object in a worker thread
      if (Configuration.getChargingStationTemplateURLs()) {
        Configuration.getChargingStationTemplateURLs().forEach((stationURL) => {
          try {
            // load file
            const fileDescriptor = fs.openSync(stationURL.file, 'r');
            const stationTemplate = JSON.parse(fs.readFileSync(fileDescriptor, 'utf8'));
            fs.closeSync(fileDescriptor);
            const nbStation = (stationURL.numberOfStation ? stationURL.numberOfStation : 0);
            for (let index = 1; index <= nbStation; index++) {
              const worker = new Wrk('./src/charging-station/StationWorker.js', {
                index,
                template: JSON.parse(JSON.stringify(stationTemplate)),
              });
              worker.start();
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.log('Template file' + stationURL.file + ' error' + error);
          }
        });
      } else {
        const nbStation = Configuration.getNumberofChargingStation();
        for (let index = 1; index <= nbStation; index++) {
          const worker = new Wrk('./src/charging-station/StationWorker.js', {
            index,
            template: JSON.parse(JSON.stringify(Configuration.getChargingStationTemplate())),
          });
          worker.start();
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log('Bootstrap start error ' + JSON.stringify(error, null, ' '));
    }
  }
}

Bootstrap.start();
