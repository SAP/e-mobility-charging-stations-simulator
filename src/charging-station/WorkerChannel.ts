import { BroadcastChannel } from 'worker_threads';

export default class WorkerChannel {
  private static _instance: WorkerChannel | null = null;

  public _channel: BroadcastChannel;

  private constructor() {
    this._channel = new BroadcastChannel('worker');
  }

  public static get instance(): WorkerChannel {
    if (WorkerChannel._instance === null) {
      WorkerChannel._instance = new WorkerChannel();
    }
    return WorkerChannel._instance;
  }

  public get name(): string {
    return this._channel.name;
  }

  public set onmessage(messageHandler: (message: unknown) => void) {
    this._channel.onmessage = messageHandler;
  }

  public start() {}

  public stop() {
    this._channel.close();
  }

  public postMessage(message: unknown) {
    console.log('postMessage');
    this._channel.postMessage(message);
  }
}
