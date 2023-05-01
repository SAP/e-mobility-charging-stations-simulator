// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

export enum AsyncLockType {
  configuration = 'configuration',
  performance = 'performance',
}

export class AsyncLock {
  private static readonly instances = new Map<AsyncLockType, AsyncLock>();
  private acquired: boolean;
  private readonly resolveQueue: ((value: void | PromiseLike<void>) => void)[];

  private constructor(private readonly type: AsyncLockType) {
    this.acquired = false;
    this.resolveQueue = [];
  }

  public static getInstance(type: AsyncLockType): AsyncLock {
    if (!AsyncLock.instances.has(type)) {
      AsyncLock.instances.set(type, new AsyncLock(type));
    }
    return AsyncLock.instances.get(type);
  }

  public async acquire(): Promise<void> {
    if (!this.acquired) {
      this.acquired = true;
    } else {
      return new Promise((resolve) => {
        this.resolveQueue.push(resolve);
      });
    }
  }

  public async release(): Promise<void> {
    if (this.resolveQueue.length === 0 && this.acquired) {
      this.acquired = false;
      return;
    }
    const queuedResolve = this.resolveQueue.shift();
    return new Promise((resolve) => {
      queuedResolve();
      resolve();
    });
  }
}
