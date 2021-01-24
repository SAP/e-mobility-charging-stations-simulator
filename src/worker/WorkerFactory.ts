import Configuration from '../utils/Configuration';
import WorkerPool from './WorkerPool';
import WorkerSet from './WorkerSet';
import Wrk from './Worker';

export default class WorkerFactory {
  public static getWorkerImpl(workerScript: string): Wrk {
    if (Configuration.useWorkerPool()) {
      return new WorkerPool(workerScript);
    }
    return new WorkerSet(workerScript, Configuration.getChargingStationsPerWorker());
  }
}
