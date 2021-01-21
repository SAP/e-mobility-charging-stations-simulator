import { isMainThread, parentPort, workerData } from 'worker_threads';

import ChargingStation from './ChargingStation';
import Constants from '../utils/Constants';

if (!isMainThread) {
  startChargingStation({ index: workerData.index as number, templateFile: workerData.templateFile as string });

  // Listener: start new charging station from main thread
  addListener();
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
