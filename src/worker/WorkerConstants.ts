export default class WorkerConstants {
  static readonly DEFAULT_ELEMENT_START_DELAY = 0;
  static readonly DEFAULT_WORKER_START_DELAY = 500;
  static readonly POOL_MAX_INACTIVE_TIME = 60000;
  static readonly DEFAULT_POOL_MIN_SIZE = 4;
  static readonly DEFAULT_POOL_MAX_SIZE = 16;
  static readonly DEFAULT_ELEMENTS_PER_WORKER = 1;

  private constructor() {
    // This is intentional
  }
}
