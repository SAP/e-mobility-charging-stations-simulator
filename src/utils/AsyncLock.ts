// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

export enum AsyncLockType {
  configuration = 'configuration',
  performance = 'performance',
}

export class AsyncLock {
  private static readonly asyncLocks = new Map<AsyncLockType, AsyncLock>();
  private acquired: boolean;
  private readonly resolveQueue: ((value: void | PromiseLike<void>) => void)[];

  private constructor() {
    this.acquired = false;
    this.resolveQueue = [];
  }

  public static async acquire(type: AsyncLockType): Promise<void> {
    const asyncLock = AsyncLock.getAsyncLock(type);
    if (!asyncLock.acquired) {
      asyncLock.acquired = true;
    } else {
      return new Promise((resolve) => {
        asyncLock.resolveQueue.push(resolve);
      });
    }
  }

  public static async release(type: AsyncLockType): Promise<void> {
    const asyncLock = AsyncLock.getAsyncLock(type);
    if (asyncLock.resolveQueue.length === 0 && asyncLock.acquired) {
      asyncLock.acquired = false;
      return;
    }
    const queuedResolve = asyncLock.resolveQueue.shift();
    return new Promise((resolve) => {
      queuedResolve();
      resolve();
    });
  }

  private static getAsyncLock(type: AsyncLockType): AsyncLock {
    if (!AsyncLock.asyncLocks.has(type)) {
      AsyncLock.asyncLocks.set(type, new AsyncLock());
    }
    return AsyncLock.asyncLocks.get(type);
  }
}
