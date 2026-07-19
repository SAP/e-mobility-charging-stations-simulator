import { parentPort } from 'node:worker_threads'

// Minimal standalone WorkerSet element worker used by WorkerSet.test.ts: echoes
// each addWorkerElement request back as an addedWorkerElement response so the
// set can track its per-worker element count, and stays alive until terminated.
parentPort?.on('message', message => {
  const { data, event, uuid } = message
  if (event === 'addWorkerElement') {
    parentPort?.postMessage({ data, event: 'addedWorkerElement', uuid })
  }
})
