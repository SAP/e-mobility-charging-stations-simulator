import { parentPort } from 'node:worker_threads'

// Minimal standalone WorkerSet element worker used by WorkerSet.test.ts: echoes
// each addWorkerElement request back as an addedWorkerElement response so the
// set can track its per-worker element count, and stays alive until terminated.
// A request whose data carries `hold: true` is deliberately left unanswered, to
// exercise in-flight-addition handling.
parentPort?.on('message', message => {
  const { data, event, uuid } = message
  if (event === 'addWorkerElement' && data?.hold !== true) {
    parentPort?.postMessage({ data, event: 'addedWorkerElement', uuid })
  }
})
