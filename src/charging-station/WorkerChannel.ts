import { Worker } from 'cluster';
import { BroadcastChannel } from 'worker_threads';

import { MessageEvent } from 'ws';

import BaseError from '../exception/BaseError';

export default class WorkerChannel {
  private static _instance: WorkerChannel | null = null;

  public _channel: BroadcastChannel;

  private constructor(name: string) {
    this._channel = new BroadcastChannel(name);
  }

  public static get instance(): WorkerChannel {
    return WorkerChannel._instance;
  }

  public get name(): string {
    return this._channel.name;
  }

  public set onmessage(messageHandler: (message: unknown) => void) {
    this._channel.onmessage = messageHandler;
  }

  public static start(name: string) {
    if (this._instance !== null) {
      throw new BaseError('channel already open');
    }
    this._instance = new WorkerChannel(name);
  }

  public static stop() {
    this._instance._channel.close();
    delete this._instance;
    this._instance = null;
  }

  public postMessage(message: unknown) {
    console.log('postMessage');
    this._channel.postMessage(message);
  }
}
