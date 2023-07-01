import { availableParallelism } from 'poolifier';

export class WorkerConstants {
  public static readonly EMPTY_FUNCTION = Object.freeze(() => {
    /* This is intentional */
  });

  public static readonly DEFAULT_ELEMENT_START_DELAY = 0;
  public static readonly DEFAULT_WORKER_START_DELAY = 500;
  public static readonly POOL_MAX_INACTIVE_TIME = 60000;
  public static readonly DEFAULT_POOL_MIN_SIZE = availableParallelism() / 2;
  public static readonly DEFAULT_POOL_MAX_SIZE = availableParallelism();
  public static readonly DEFAULT_ELEMENTS_PER_WORKER = 1;

  private constructor() {
    // This is intentional
  }
}
