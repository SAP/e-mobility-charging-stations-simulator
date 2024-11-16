import { expect } from '@std/expect'
import { randomInt } from 'node:crypto'
import { describe, it } from 'node:test'

import { AsyncLock, AsyncLockType } from '../../src/utils/AsyncLock.js'

await describe('AsyncLock test suite', async () => {
  await it('Verify runExclusive() on sync fn', () => {
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
        // eslint-disable-next-line @typescript-eslint/use-unknown-in-catch-callback-variable
        .catch(console.error)
    }
  })

  await it('Verify runExclusive() on async fn', () => {
    const runs = 10
    const executed: number[] = []
    let count = 0
    const asyncFn = async () => {
      await new Promise(resolve => {
        setTimeout(resolve, randomInt(1, 100))
      })
      executed.push(++count)
    }
    for (let i = 0; i < runs; i++) {
      AsyncLock.runExclusive(AsyncLockType.configuration, asyncFn)
        .then(() => {
          expect(executed).toStrictEqual(new Array(count).fill(0).map((_, i) => ++i))
          return undefined
        })
        // eslint-disable-next-line @typescript-eslint/use-unknown-in-catch-callback-variable
        .catch(console.error)
    }
  })
})
