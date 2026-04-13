import type { ResponsePayload } from 'ui-common'

import process from 'node:process'
import { ResponseStatus } from 'ui-common'

export const outputJson = (payload: ResponsePayload): void => {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
}

export const outputJsonError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(
    JSON.stringify({ error: true, message, status: ResponseStatus.FAILURE }, null, 2) + '\n'
  )
}
