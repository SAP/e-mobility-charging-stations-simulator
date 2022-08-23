import { BroadcastChannel } from 'worker_threads';

import { BroadcastChannelRequest } from '../types/WorkerBroadcastChannel';

export default class WorkerBroadcastChannel extends BroadcastChannel {
  constructor() {
    super('worker');
  }

  public sendRequest(request: BroadcastChannelRequest): void {
    this.postMessage(request);
  }
}
