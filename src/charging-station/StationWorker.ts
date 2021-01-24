import { isMainThread, parentPort, workerData } from 'worker_threads';

import ChargingStation from './ChargingStation';
import Constants from '../utils/Constants';
import Utils from '../utils/Utils';

if (!isMainThread) {
  // Add listener to start charging station from main thread
  addListener();
  if (!Utils.isUndefined(workerData)) {
    startChargingStation({ index: workerData.index as number, templateFile: workerData.templateFile as string });
  }
}

function addListener() {
  parentPort.on('message', (e) => {
    if (e.id === Constants.START_WORKER_ELEMENT) {
      startChargingStation(e.workerData);
    }
  });
}

function startChargingStation(data: any) {
  const station = new ChargingStation(data.index as number, data.templateFile as string);
  station.start();
}
