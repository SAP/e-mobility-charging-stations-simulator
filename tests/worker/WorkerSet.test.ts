/**
 * @file Tests for WorkerSet
 * @description Element-granular worker termination (issue #2027): a removed
 * element's hosting worker is terminated once it hosts zero elements, without
 * disrupting sibling elements, and bulk stop() stays unchanged with no leaked
 * pending-response or element-map entries.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import type { WorkerData } from '../../src/worker/index.js'

import { WorkerSet } from '../../src/worker/WorkerSet.js'
import { flushMicrotasks, standardCleanup } from '../helpers/TestLifecycleHelpers.js'

interface TestElement extends WorkerData {
  id: string
}

interface WorkerSetElementView {
  numberOfWorkerElements: number
  worker: { threadId: number }
}

interface WorkerSetInternals {
  elementMap: Map<PropertyKey, WorkerSetElementView>
  promiseResponseMap: Map<unknown, unknown>
  workerSet: Set<WorkerSetElementView>
}

const ECHO_WORKER_SCRIPT = fileURLToPath(new URL('./fixtures/echoWorker.mjs', import.meta.url))
const SILENT_WORKER_SCRIPT = fileURLToPath(new URL('./fixtures/silentWorker.mjs', import.meta.url))

const createWorkerSet = (
  elementsPerWorker: number,
  workerScript = ECHO_WORKER_SCRIPT
): WorkerSet<TestElement, TestElement> =>
  new WorkerSet<TestElement, TestElement>(
    workerScript,
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
    workerSet = createWorkerSet(1, SILENT_WORKER_SCRIPT)
    await workerSet.start()
    const pendingAddition = workerSet.addElement({ id: 'cs-1' })
    await flushMicrotasks()
    assert.strictEqual(internalsOf(workerSet).promiseResponseMap.size, 1)

    await workerSet.stop()

    await assert.rejects(pendingAddition)
  })
})
