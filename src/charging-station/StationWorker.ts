import { isMainThread, parentPort, workerData } from 'worker_threads';
import Constants from '../utils/Constants';

import ChargingStation from './ChargingStation';

if (!isMainThread) {
  const station = new ChargingStation(workerData.index as number, workerData.templateFile as string);
  station.start();

  // Listener: start new charging station from main thread
  addListener();
}

function addListener() {
  parentPort.setMaxListeners(1000);
  parentPort.on("message", e => {
    if (e.id === Constants.START_NEW_CHARGING_STATION) {
        startChargingStation(e.workerData);
    }
  });
}

function startChargingStation(data: any) {
  const station = new ChargingStation(data.index as number, data.templateFile as string);
  station.start();
}
