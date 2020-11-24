import { isMainThread, workerData } from 'worker_threads';

import ChargingStation from './ChargingStation';

if (!isMainThread) {
  const station = new ChargingStation(workerData.index as number, workerData.templateFile as string);
  station.start();
}
