import Configuration from '../utils/Configuration';
import WorkerDynamicPool from './WorkerDynamicPool';
import { WorkerProcessType } from '../types/Worker';
import WorkerSet from './WorkerSet';
import WorkerStaticPool from './WorkerStaticPool';
import Wrk from './Wrk';

export default class WorkerFactory {
  public static getWorkerImpl(workerScript: string): Wrk {
    switch (Configuration.getWorkerProcess()) {
      case WorkerProcessType.WORKER_SET:
        return new WorkerSet(workerScript, Configuration.getChargingStationsPerWorker());
      case WorkerProcessType.STATIC_POOL:
        return new WorkerStaticPool(workerScript, Configuration.getWorkerPoolMaxSize());
      case WorkerProcessType.DYNAMIC_POOL:
        return new WorkerDynamicPool(workerScript, Configuration.getWorkerPoolMinSize(), Configuration.getWorkerPoolMaxSize());
      default:
        return null;
    }
  }
}
