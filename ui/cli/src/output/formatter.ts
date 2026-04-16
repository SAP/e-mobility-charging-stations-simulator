import type { ResponsePayload } from 'ui-common'

import { extractErrorMessage } from '../utils/errors.js'
import { printError } from './human.js'
import { outputJson, outputJsonError } from './json.js'
import { outputTable } from './table.js'

export interface Formatter {
  error: (error: unknown) => void
  output: (payload: ResponsePayload) => void
}

export const createFormatter = (jsonMode: boolean): Formatter => {
  if (jsonMode) {
    return {
      error: outputJsonError,
      output: outputJson,
    }
  }
  return {
    error: (error: unknown) => {
      const message = extractErrorMessage(error)
      printError(message)
    },
    output: outputTable,
  }
}
