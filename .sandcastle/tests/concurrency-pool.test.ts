/**
 * @file Tests for `ConcurrencyPool` (FIFO concurrency limiter).
 * @description Covers constructor validation, FIFO order under saturation,
 * release-on-rejection, and concurrent-gauge invariant. The pool is the
 * fan-out primitive used by `main.ts` to cap parallel task processing.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ConcurrencyPool } from '../concurrency-pool.js'

const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

await describe('ConcurrencyPool', async () => {
  await it('throws RangeError on max=0', () => {
    assert.throws(() => new ConcurrencyPool(0), RangeError)
  })

  await it('throws RangeError on negative or non-integer max', () => {
    assert.throws(() => new ConcurrencyPool(-1), RangeError)
    assert.throws(() => new ConcurrencyPool(1.5), RangeError)
  })

  await it('runs tasks immediately when below capacity', async () => {
    const pool = new ConcurrencyPool(2)
    const t0 = Date.now()
    await Promise.all([pool.run(() => Promise.resolve(1)), pool.run(() => Promise.resolve(2))])
    assert.ok(Date.now() - t0 < 100)
  })

  await it('preserves FIFO order when queue saturates', async () => {
    const pool = new ConcurrencyPool(1)
    const order: number[] = []
    const tasks = [1, 2, 3, 4, 5].map(n =>
      pool.run(() => {
        order.push(n)
        return Promise.resolve()
      })
    )
    await Promise.all(tasks)
    assert.deepEqual(order, [1, 2, 3, 4, 5])
  })

  await it('releases the slot when fn throws (next task still runs)', async () => {
    const pool = new ConcurrencyPool(1)
    await assert.rejects(() => pool.run(() => Promise.reject(new Error('boom'))))
    let ran = false
    await pool.run(() => {
      ran = true
      return Promise.resolve()
    })
    assert.equal(ran, true)
  })

  await it('never exceeds max concurrent fns under burst load', async () => {
    const pool = new ConcurrencyPool(3)
    let running = 0
    let peak = 0
    const tasks = Array.from({ length: 30 }, () =>
      pool.run(async () => {
        running++
        peak = Math.max(peak, running)
        await tick()
        running--
      })
    )
    await Promise.all(tasks)
    assert.ok(peak <= 3, `observed peak ${String(peak)} exceeded max=3`)
    assert.equal(running, 0)
  })

  await it('forwards the resolved value of fn', async () => {
    const pool = new ConcurrencyPool(2)
    const result = await pool.run(() => Promise.resolve('hello'))
    assert.equal(result, 'hello')
  })
})
