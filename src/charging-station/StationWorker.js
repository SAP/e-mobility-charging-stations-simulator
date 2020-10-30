import {isMainThread, workerData} from 'worker_threads';

import ChargingStation from './ChargingStation.js';

if (!isMainThread) {
  const station = new ChargingStation(workerData.index, workerData.templateFile);
  station.start();
}
