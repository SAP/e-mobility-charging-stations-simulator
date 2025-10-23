import chalk from 'chalk'
import { getRandomValues } from 'node:crypto'

import { WorkerProcessType } from './WorkerTypes.js'

export const sleep = async (milliSeconds: number): Promise<NodeJS.Timeout> => {
  return await new Promise<NodeJS.Timeout>(resolve => {
    const timeout = setTimeout(() => {
      resolve(timeout)
    }, milliSeconds)
  })
}

export const defaultExitHandler = (code: number): void => {
  if (code === 0) {
    console.info(chalk.green('Worker exited successfully'))
  } else if (code === 1) {
    console.info(chalk.green('Worker terminated successfully'))
  } else if (code > 1) {
    console.error(chalk.red(`Worker exited with exit code: ${code.toString()}`))
  }
}

export const defaultErrorHandler = (error: Error): void => {
  console.error(chalk.red('Worker errored: '), error)
}

export const randomizeDelay = (delay: number): number => {
  const random = secureRandom()
  const sign = random < 0.5 ? -1 : 1
  const randomSum = delay * 0.2 * random // 0-20% of the delay
  return delay + sign * randomSum
}

export const checkWorkerProcessType = (workerProcessType: WorkerProcessType): void => {
  if (!Object.values(WorkerProcessType).includes(workerProcessType)) {
    throw new SyntaxError(
      `Invalid worker process type '${workerProcessType}' defined in configuration`
    )
  }
}

/**
 * Generates a cryptographically secure random number in the [0,1[ range
 * @returns A number in the [0,1[ range
 * @internal
 */
const secureRandom = (): number => {
  return getRandomValues(new Uint32Array(1))[0] / 0x100000000
}
