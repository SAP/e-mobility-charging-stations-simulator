import { isMainThread, parentPort, workerData } from 'worker_threads';

import ChargingStation from './ChargingStation';
import Utils from '../utils/Utils';
import { WorkerEvents } from '../types/WorkerEvents';

if (!isMainThread) {
  // Add listener to start charging station from main thread
  addListener();
  if (!Utils.isUndefined(workerData)) {
    startChargingStation({ index: workerData.index as number, templateFile: workerData.templateFile as string });
  }
}

function addListener() {
  parentPort.on('message', (message) => {
    if (message.id === WorkerEvents.START_WORKER_ELEMENT) {
      startChargingStation(message.workerData);
    }
  });
}

function startChargingStation(data: any) {
  const station = new ChargingStation(data.index as number, data.templateFile as string);
  station.start();
}
