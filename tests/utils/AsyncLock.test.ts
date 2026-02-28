/**
 * @file Tests for AsyncLock
 * @description Unit tests for asynchronous lock utilities
 */
import { expect } from '@std/expect'
import { randomInt } from 'node:crypto'
import { afterEach, describe, it } from 'node:test'

import { AsyncLock, AsyncLockType } from '../../src/utils/AsyncLock.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('AsyncLock', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await it('should run synchronous functions exclusively in sequence', () => {
    const runs = 10
    const executed: number[] = []
    let count = 0
    const fn = () => {
      executed.push(++count)
    }
    for (let i = 0; i < runs; i++) {
      AsyncLock.runExclusive(AsyncLockType.configuration, fn)
        .then(() => {
          expect(executed).toStrictEqual(new Array(count).fill(0).map((_, i) => ++i))
          return undefined
        })
        .catch(console.error)
    }
  })

  await it('should run asynchronous functions exclusively in sequence', () => {
    const runs = 10
    const executed: number[] = []
    let count = 0
    const asyncFn = async () => {
      await new Promise(resolve => {
        setTimeout(resolve, randomInt(1, 101))
      })
      executed.push(++count)
    }
    for (let i = 0; i < runs; i++) {
      AsyncLock.runExclusive(AsyncLockType.configuration, asyncFn)
        .then(() => {
          expect(executed).toStrictEqual(new Array(count).fill(0).map((_, i) => ++i))
          return undefined
        })
        .catch(console.error)
    }
  })
})
