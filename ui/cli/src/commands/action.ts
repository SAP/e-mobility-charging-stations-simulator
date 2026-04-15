import type { Command } from 'commander'

import process from 'node:process'
import { type ProcedureName, type RequestPayload, ServerFailureError } from 'ui-common'

import type { GlobalOptions } from '../types.js'

import { executeCommand } from '../client/lifecycle.js'
import { loadConfig } from '../config/loader.js'
import { createFormatter } from '../output/formatter.js'

export const parseInteger = (value: string): number => {
  const n = Number.parseInt(value, 10)
  if (Number.isNaN(n)) {
    throw new Error(`Expected integer, got '${value}'`)
  }
  return n
}

export const runAction = async (
  program: Command,
  procedureName: ProcedureName,
  payload: RequestPayload
): Promise<void> => {
  const rootOpts = program.opts<GlobalOptions>()
  const formatter = createFormatter(rootOpts.json)
  try {
    const config = await loadConfig({ configPath: rootOpts.config, url: rootOpts.url })
    await executeCommand({ config, formatter, payload, procedureName })
    process.exitCode = 0
  } catch (error: unknown) {
    if (error instanceof ServerFailureError) {
      formatter.output(error.payload)
    } else {
      formatter.error(error)
    }
    process.exitCode = 1
  }
}
