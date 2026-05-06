/** Internal node for the O(1) FIFO waiting queue. Not exported. */
interface QueueNode {
  next: null | QueueNode
  resolve: () => void
}

/**
 * A concurrency limiter that restricts parallel execution to a maximum number of tasks.
 * Queue operations are O(1) amortized (singly-linked list).
 */
export class ConcurrencyPool {
  private head: null | QueueNode = null
  private running = 0
  private tail: null | QueueNode = null

  /**
   * @param max - Maximum number of concurrent tasks. Must be a positive integer >= 1.
   */
  constructor (private readonly max: number) {
    if (!Number.isInteger(max) || max < 1) {
      throw new RangeError('ConcurrencyPool max must be a positive integer >= 1')
    }
  }

  /**
   * Executes the given async function, waiting if the pool is at capacity.
   * @param fn - Async function to execute within the pool.
   * @returns The result of the function.
   * @remarks Re-entrant calls using the same pool instance may deadlock when all slots are occupied.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire (): Promise<void> {
    if (this.running < this.max) {
      this.running++
      return Promise.resolve()
    }
    return new Promise<void>(resolve => {
      const node: QueueNode = { next: null, resolve }
      if (this.tail === null) {
        this.head = node
        this.tail = node
      } else {
        this.tail.next = node
        this.tail = node
      }
    })
  }

  private release (): void {
    this.running--
    const next = this.head
    if (next !== null) {
      this.head = next.next
      if (this.head === null) {
        this.tail = null
      }
      this.running++
      next.resolve()
    }
  }
}
