import { BroadcastChannel } from 'node:worker_threads';

import type {
  BroadcastChannelRequest,
  BroadcastChannelResponse,
  JsonType,
  MessageEvent,
} from '../../types';
import { logPrefix, logger, validateUUID } from '../../utils';

const moduleName = 'WorkerBroadcastChannel';

export abstract class WorkerBroadcastChannel extends BroadcastChannel {
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
    return Array.isArray(message) === true && message.length === 3;
  }

  protected isResponse(message: JsonType[]): boolean {
    return Array.isArray(message) === true && message.length === 2;
  }

  protected validateMessageEvent(messageEvent: MessageEvent): MessageEvent | false {
    if (Array.isArray(messageEvent.data) === false) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateMessageEvent',
        )} Worker broadcast channel protocol message event data is not an array`,
      );
      return false;
    }
    if (validateUUID(messageEvent.data[0]) === false) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateMessageEvent',
        )} Worker broadcast channel protocol message event data UUID field is invalid`,
      );
      return false;
    }
    return messageEvent;
  }

  private logPrefix = (modName: string, methodName: string): string => {
    return logPrefix(` Worker Broadcast Channel | ${modName}.${methodName}:`);
  };
}
