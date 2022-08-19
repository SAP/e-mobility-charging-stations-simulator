import { BroadcastChannel } from 'worker_threads';

export default class WorkerChannel extends BroadcastChannel {
  // public channel: BroadcastChannel;

  constructor() {
    super('worker');
  }
}
