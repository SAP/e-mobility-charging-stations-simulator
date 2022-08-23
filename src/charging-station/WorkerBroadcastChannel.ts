import { BroadcastChannel } from 'worker_threads';

import { BroadcastChannelRequest, BroadcastChannelResponse } from '../types/WorkerBroadcastChannel';

export default abstract class WorkerBroadcastChannel extends BroadcastChannel {
  protected constructor() {
    super('worker');
  }

  public sendRequest(request: BroadcastChannelRequest): void {
    this.postMessage(request);
  }

  protected sendResponse(response: BroadcastChannelResponse): void {
    this.postMessage(response);
  }

  protected isRequest(message: any): boolean {
    return Array.isArray(message) && message.length === 3;
  }

  protected isResponse(message: any): boolean {
    return Array.isArray(message) && message.length === 2;
  }
}
