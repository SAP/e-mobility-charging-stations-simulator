const {isMainThread, workerData} = require('worker_threads');
const ChargingStation = require('./ChargingStation');

if (!isMainThread) {
  const station = new ChargingStation(workerData.index, workerData.templateFile);
  station.start();
}
