import { isMainThread, parentPort, workerData } from 'worker_threads';

import ChargingStation from './ChargingStation';
import Constants from '../utils/Constants';

if (!isMainThread) {
  const station = new ChargingStation(workerData.index as number, workerData.templateFile as string);
  station.start();

  // Listener: start new charging station from main thread
  addListener();
}

function addListener() {
  parentPort.setMaxListeners(Constants.MAX_LISTENERS);
  parentPort.on('message', (e) => {
    if (e.id === Constants.START_CHARGING_STATION) {
      startChargingStation(e.workerData);
    }
  });
}

function startChargingStation(data: any) {
  const station = new ChargingStation(data.index as number, data.templateFile as string);
  station.start();
}
