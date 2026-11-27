/**
 * @file Tests for WorkerSet
 * @description Element-granular worker termination (issue #2027): a removed
 * element's hosting worker is terminated once it hosts zero elements, without
 * disrupting sibling elements or unrelated in-flight additions, and bulk stop()
 * stays unchanged with no leaked pending-response or element-map entries.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import type { WorkerData } from '../../src/worker/index.js'

import { WorkerSet } from '../../src/worker/WorkerSet.js'
import { flushMicrotasks, standardCleanup } from '../helpers/TestLifecycleHelpers.js'

interface TestElement extends WorkerData {
  hold?: boolean
  id: string
}

interface WorkerSetElementView {
  numberOfWorkerElements: number
  terminating: boolean
  worker: { terminate: () => Promise<number>; threadId: number }
}

interface WorkerSetInternals {
  elementMap: Map<string, WorkerSetElementView>
  pendingSlotByElement: Map<unknown, number>
  promiseResponseMap: Map<unknown, unknown>
  workerSet: Set<WorkerSetElementView>
}

const ECHO_WORKER_SCRIPT = fileURLToPath(new URL('./fixtures/echoWorker.mjs', import.meta.url))

const createWorkerSet = (elementsPerWorker: number): WorkerSet<TestElement, TestElement> =>
  new WorkerSet<TestElement, TestElement>(
    ECHO_WORKER_SCRIPT,
    {
      elementAddDelay: 0,
      elementsPerWorker,
      poolMaxSize: 4,
      poolMinSize: 1,
      workerStartDelay: 0,
    },
    element => element.id
  )

const internalsOf = (workerSet: WorkerSet<TestElement, TestElement>): WorkerSetInternals =>
  workerSet as unknown as WorkerSetInternals

await describe('WorkerSet', async () => {
  let workerSet: undefined | WorkerSet<TestElement, TestElement>

  afterEach(async () => {
    await workerSet?.stop()
    workerSet = undefined
    standardCleanup()
  })

  await it('should terminate the hosting worker once it hosts zero elements', async () => {
    workerSet = createWorkerSet(1)
    await workerSet.start()
    const info = await workerSet.addElement({ id: 'cs-1' })
    assert.strictEqual(info.id, 'cs-1')
    assert.strictEqual(workerSet.size, 1)

    await workerSet.removeElement('cs-1')

    assert.strictEqual(workerSet.size, 0)
  })

  await it('should not terminate a worker still hosting sibling elements', async () => {
    workerSet = createWorkerSet(2)
    await workerSet.start()
    await workerSet.addElement({ id: 'cs-1' })
    await workerSet.addElement({ id: 'cs-2' })
    assert.strictEqual(workerSet.size, 1)
    const internals = internalsOf(workerSet)
    const [hostingWorker] = [...internals.workerSet]
    const threadIdBefore = hostingWorker.worker.threadId

    await workerSet.removeElement('cs-1')

    // The shared worker survives with only the sibling element remaining.
    assert.strictEqual(workerSet.size, 1)
    assert.strictEqual([...internals.workerSet][0].worker.threadId, threadIdBefore)
    assert.strictEqual(hostingWorker.numberOfWorkerElements, 1)
    assert.strictEqual(internals.elementMap.has('cs-2'), true)
    assert.strictEqual(internals.elementMap.has('cs-1'), false)
  })

  await it('should terminate only at the last sibling when draining a shared worker', async () => {
    workerSet = createWorkerSet(3)
    await workerSet.start()
    await workerSet.addElement({ id: 'cs-1' })
    await workerSet.addElement({ id: 'cs-2' })
    await workerSet.addElement({ id: 'cs-3' })
    assert.strictEqual(workerSet.size, 1)

    await workerSet.removeElement('cs-1')
    assert.strictEqual(workerSet.size, 1)
    await workerSet.removeElement('cs-2')
    assert.strictEqual(workerSet.size, 1)
    await workerSet.removeElement('cs-3')
    assert.strictEqual(workerSet.size, 0)
  })

  await it('should not disrupt a sibling element addition still in flight', async () => {
    workerSet = createWorkerSet(2)
    await workerSet.start()
    await workerSet.addElement({ id: 'cs-1' })
    const pendingSibling = workerSet.addElement({ hold: true, id: 'cs-2' })
    await flushMicrotasks()
    assert.strictEqual(internalsOf(workerSet).promiseResponseMap.size, 1)

    await workerSet.removeElement('cs-1')

    // The in-flight sibling keeps the worker alive despite the empty count.
    assert.strictEqual(workerSet.size, 1)
    await workerSet.stop()
    await assert.rejects(pendingSibling)
  })

  await it('should not route a new element addition onto a terminating worker', async () => {
    workerSet = createWorkerSet(1)
    await workerSet.start()
    await workerSet.addElement({ id: 'cs-1' })
    // Start terminating cs-1's worker, then add an unrelated element in the same
    // window: it must land on a fresh worker, not the terminating one.
    const removing = workerSet.removeElement('cs-1')
    const info = await workerSet.addElement({ id: 'cs-9' })
    await removing

    assert.strictEqual(info.id, 'cs-9')
    assert.strictEqual(workerSet.size, 1)
    assert.strictEqual(internalsOf(workerSet).elementMap.has('cs-9'), true)
  })

  await it('should keep the count consistent when the same element key is re-added', async () => {
    workerSet = createWorkerSet(2)
    await workerSet.start()
    await workerSet.addElement({ id: 'cs-1' })
    await workerSet.addElement({ id: 'cs-1' })
    const [hostingWorker] = [...internalsOf(workerSet).workerSet]
    assert.strictEqual(hostingWorker.numberOfWorkerElements, 1)

    await workerSet.removeElement('cs-1')

    // A duplicate add must not inflate the count and orphan the worker.
    assert.strictEqual(workerSet.size, 0)
  })

  await it('should no-op when removing an unknown element key', async () => {
    workerSet = createWorkerSet(1)
    await workerSet.start()
    await workerSet.addElement({ id: 'cs-1' })

    await workerSet.removeElement('unknown')

    assert.strictEqual(workerSet.size, 1)
    assert.strictEqual(internalsOf(workerSet).elementMap.has('cs-1'), true)
  })

  await it('should terminate all workers on bulk stop', async () => {
    workerSet = createWorkerSet(1)
    await workerSet.start()
    await workerSet.addElement({ id: 'cs-1' })
    await workerSet.addElement({ id: 'cs-2' })
    assert.strictEqual(workerSet.size, 2)

    await workerSet.stop()

    assert.strictEqual(workerSet.size, 0)
    assert.strictEqual(workerSet.info.started, false)
    assert.strictEqual(internalsOf(workerSet).promiseResponseMap.size, 0)
  })

  await it('should not leak pending-response or element-map entries after termination', async () => {
    workerSet = createWorkerSet(1)
    await workerSet.start()
    await workerSet.addElement({ id: 'cs-1' })
    const internals = internalsOf(workerSet)
    assert.strictEqual(internals.promiseResponseMap.size, 0)
    assert.strictEqual(internals.elementMap.size, 1)

    await workerSet.removeElement('cs-1')

    assert.strictEqual(internals.elementMap.size, 0)
    assert.strictEqual(internals.promiseResponseMap.size, 0)
    assert.strictEqual(workerSet.size, 0)
  })

  await it('should reject an in-flight element addition when its worker is terminated', async () => {
    workerSet = createWorkerSet(1)
    await workerSet.start()
    const pendingAddition = workerSet.addElement({ hold: true, id: 'cs-1' })
    await flushMicrotasks()
    assert.strictEqual(internalsOf(workerSet).promiseResponseMap.size, 1)

    await workerSet.stop()

    await assert.rejects(pendingAddition)
  })

  await it('should resolve and clean up when worker.terminate() rejects', async () => {
    workerSet = createWorkerSet(1)
    await workerSet.start()
    await workerSet.addElement({ id: 'cs-1' })
    const [hostingWorker] = [...internalsOf(workerSet).workerSet]
    const realTerminate = hostingWorker.worker.terminate.bind(hostingWorker.worker)
    hostingWorker.worker.terminate = () => Promise.reject(new Error('ERR_WORKER_NOT_RUNNING'))

    // A rejected terminate() must not hang or reject removeElement; the element
    // is still removed and the worker record cleaned up.
    await workerSet.removeElement('cs-1')

    assert.strictEqual(workerSet.size, 0)
    assert.strictEqual(internalsOf(workerSet).elementMap.size, 0)
    await realTerminate()
  })

  await it('should reject an in-flight addition when its worker terminate() rejects on stop', async () => {
    workerSet = createWorkerSet(1)
    await workerSet.start()
    const pendingAddition = workerSet.addElement({ hold: true, id: 'cs-1' })
    await flushMicrotasks()
    const [hostingWorker] = [...internalsOf(workerSet).workerSet]
    const realTerminate = hostingWorker.worker.terminate.bind(hostingWorker.worker)
    hostingWorker.worker.terminate = () => Promise.reject(new Error('ERR_WORKER_NOT_RUNNING'))

    await workerSet.stop()

    // terminateWorker's cleanup rejects the pending addition even though the
    // worker never emitted 'exit'.
    await assert.rejects(pendingAddition)
    assert.strictEqual(internalsOf(workerSet).promiseResponseMap.size, 0)
    await realTerminate()
  })

  await it('should spread concurrent additions across workers respecting elementsPerWorker', async () => {
    const target = createWorkerSet(2)
    workerSet = target
    await target.start()

    const ids = ['cs-1', 'cs-2', 'cs-3', 'cs-4', 'cs-5', 'cs-6']
    await Promise.allSettled(ids.map(id => target.addElement({ id })))

    const counts = [...internalsOf(target).workerSet].map(
      workerSetElement => workerSetElement.numberOfWorkerElements
    )
    assert.deepStrictEqual(counts, [2, 2, 2])
    assert.strictEqual(internalsOf(target).workerSet.size, 3)
    assert.strictEqual(internalsOf(target).pendingSlotByElement.size, 0)
  })

  await it('should release the reservation when an addition is rejected', async () => {
    workerSet = createWorkerSet(1)
    await workerSet.start()
    await workerSet.addElement({ id: 'cs-1' })
    const rejecting = workerSet.addElement({ hold: true, id: 'cs-2' })
    await flushMicrotasks()
    const internals = internalsOf(workerSet)
    const [hostingWorker] = [...internals.workerSet]
    const realTerminate = hostingWorker.worker.terminate.bind(hostingWorker.worker)
    hostingWorker.worker.terminate = () => Promise.reject(new Error('ERR_WORKER_NOT_RUNNING'))

    await workerSet.stop()

    await assert.rejects(rejecting)
    assert.strictEqual(internals.promiseResponseMap.size, 0)
    assert.strictEqual(internals.pendingSlotByElement.size, 0)
    await realTerminate()
  })

  await it('should reject cleanly when stop() happens during the creation delay', async () => {
    const target = new WorkerSet<TestElement, TestElement>(
      ECHO_WORKER_SCRIPT,
      {
        elementAddDelay: 0,
        elementsPerWorker: 1,
        poolMaxSize: 4,
        poolMinSize: 1,
        workerStartDelay: 150,
      },
      element => element.id
    )
    workerSet = target
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      await target.start()
      await target.addElement({ id: 'cs-1' })
      // cs-2 forces a new worker to be created (worker 1 is full), then the
      // creation delay is pending.
      const pendingAddition = target.addElement({ hold: true, id: 'cs-2' })
      await flushMicrotasks()

      await target.stop()

      await assert.rejects(pendingAddition)
      // Give the unhandled-rejection listener a tick to fire.
      await new Promise(resolve => setTimeout(resolve, 20))
      assert.strictEqual(unhandled.length, 0)
      assert.strictEqual(internalsOf(target).promiseResponseMap.size, 0)
      assert.strictEqual(internalsOf(target).pendingSlotByElement.size, 0)
    } finally {
      process.removeListener('unhandledRejection', onUnhandled)
    }
  })

  await it('should keep the reservation of a held sibling when another addition succeeds', async () => {
    const target = new WorkerSet<TestElement, TestElement>(
      ECHO_WORKER_SCRIPT,
      {
        elementAddDelay: 0,
        elementsPerWorker: 2,
        poolMaxSize: 4,
        poolMinSize: 1,
        workerStartDelay: 0,
      },
      element => element.id
    )
    workerSet = target
    await target.start()
    const a = target.addElement({ id: 'cs-a' })
    const heldSibling = target.addElement({ hold: true, id: 'cs-b' })
    heldSibling.catch(() => undefined) // settle the floating outer promise so the assertion below is deterministic
    const internals = internalsOf(target)
    await a
    // Only the held sibling's reservation must be left (cs-a is converted to
    // an occupied count); the sibling must not lose its slot when another
    // addition succeeds.
    assert.strictEqual(internals.workerSet.size, 1)
    assert.deepStrictEqual([...internals.pendingSlotByElement.values()], [1])
    // A third addition must not reuse the full worker 1 (1 occupied + 1 pending).
    const c = target.addElement({ id: 'cs-c' })
    await c
    assert.strictEqual(internals.workerSet.size, 2)
    await target.stop()
    await assert.rejects(heldSibling)
    assert.strictEqual(internals.pendingSlotByElement.size, 0)
  })
})
