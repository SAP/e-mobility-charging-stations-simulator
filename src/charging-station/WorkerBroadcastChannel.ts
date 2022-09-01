import { BroadcastChannel } from 'worker_threads';

import BaseError from '../exception/BaseError';
import type { JsonType } from '../types/JsonType';
import type {
  BroadcastChannelRequest,
  BroadcastChannelResponse,
  MessageEvent,
} from '../types/WorkerBroadcastChannel';

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

  protected isRequest(message: JsonType[]): boolean {
    return Array.isArray(message) && message.length === 3;
  }

  protected isResponse(message: JsonType[]): boolean {
    return Array.isArray(message) && message.length === 2;
  }

  protected validateMessageEvent(messageEvent: MessageEvent): void {
    if (Array.isArray(messageEvent.data) === false) {
      throw new BaseError('Worker broadcast channel protocol message event data is not an array');
    }
  }
}
