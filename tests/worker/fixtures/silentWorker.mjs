import { parentPort } from 'node:worker_threads'

// Standalone worker used by WorkerSet.test.ts that registers a message listener
// (keeping the worker alive) but never replies, to exercise pending-request
// rejection when its hosting worker is terminated.
parentPort?.on('message', () => {
  /* Intentionally never responds */
})
