import { BroadcastChannel } from 'worker_threads';

export default class WorkerBroadcastChannel extends BroadcastChannel {
  constructor() {
    super('worker');
  }
}
