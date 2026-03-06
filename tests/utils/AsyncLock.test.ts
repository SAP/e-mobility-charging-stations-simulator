/**
 * @file Tests for AsyncLock
 * @description Unit tests for asynchronous lock utilities
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import { AsyncLock, AsyncLockType } from '../../src/utils/AsyncLock.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('AsyncLock', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await it('should run synchronous functions exclusively in sequence', async () => {
    const runs = 10
    const executed: number[] = []
    let count = 0
    const fn = () => {
      executed.push(++count)
    }

    const promises: Promise<void>[] = []
    for (let i = 0; i < runs; i++) {
      promises.push(AsyncLock.runExclusive(AsyncLockType.configuration, fn))
    }
    await Promise.all(promises)
    expect(executed).toStrictEqual(new Array(runs).fill(0).map((_, i) => ++i))
  })

  await it('should run asynchronous functions exclusively in sequence', async () => {
    const runs = 10
    const executed: number[] = []
    let count = 0
    const asyncFn = async () => {
      // Yield to event loop without real timers
      await new Promise<void>(resolve => {
        queueMicrotask(resolve)
      })
      executed.push(++count)
    }

    const promises: Promise<void>[] = []
    for (let i = 0; i < runs; i++) {
      promises.push(AsyncLock.runExclusive(AsyncLockType.configuration, asyncFn))
    }
    await Promise.all(promises)
    expect(executed).toStrictEqual(new Array(runs).fill(0).map((_, i) => ++i))
  })

  await it('should propagate error thrown in exclusive function', async () => {
    await expect(
      AsyncLock.runExclusive(AsyncLockType.configuration, () => {
        throw new Error('test error')
      })
    ).rejects.toThrow('test error')
  })

  await it('should release lock after error and allow subsequent runs', async () => {
    await expect(
      AsyncLock.runExclusive(AsyncLockType.configuration, () => {
        throw new Error('first fails')
      })
    ).rejects.toThrow('first fails')

    let recovered = false
    await AsyncLock.runExclusive(AsyncLockType.configuration, () => {
      recovered = true
    })
    expect(recovered).toBe(true)
  })

  await it('should isolate locks across different lock types', async () => {
    const order: string[] = []
    let resolveConfig!: () => void
    const configPromise = AsyncLock.runExclusive(AsyncLockType.configuration, async () => {
      await new Promise<void>(resolve => {
        resolveConfig = resolve
      })
      order.push('configuration')
    })
    const perfPromise = AsyncLock.runExclusive(AsyncLockType.performance, () => {
      order.push('performance')
    })
    await perfPromise
    resolveConfig()
    await configPromise
    expect(order[0]).toBe('performance')
    expect(order[1]).toBe('configuration')
  })

  await it('should return value from exclusive function', async () => {
    const result = await AsyncLock.runExclusive(AsyncLockType.configuration, () => 42)
    expect(result).toBe(42)
  })
})
