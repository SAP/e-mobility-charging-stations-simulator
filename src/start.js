import Configuration from './utils/Configuration.js';
import Utils from './utils/Utils.js';
import Wrk from './charging-station/Worker.js';
import logger from './utils/Logger.js';

class Bootstrap {
  static async start() {
    try {
      logger.debug('%s Configuration: %j', Utils.logPrefix(), Configuration.getConfig());
      let numStationsTotal = 0;
      // Start each ChargingStation object in a worker thread
      if (Configuration.getStationTemplateURLs()) {
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
      if (numStationsTotal === 0) {
        console.log('No charging station template enabled in configuration, exiting');
      } else {
        console.log('Charging station simulator started with ' + numStationsTotal + ' charging station(s)');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log('Bootstrap start error ' + JSON.stringify(error, null, ' '));
    }
  }
}

Bootstrap.start();
