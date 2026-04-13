import type { Command } from 'commander'
import type { ProcedureName, RequestPayload } from 'ui-common'

import process from 'node:process'

import type { GlobalOptions } from '../types.js'

import { executeCommand } from '../client/lifecycle.js'
import { loadConfig } from '../config/loader.js'
import { createFormatter } from '../output/formatter.js'

export const runAction = async (
  program: Command,
  procedureName: ProcedureName,
  payload: RequestPayload
): Promise<void> => {
  const rootOpts = program.opts<GlobalOptions>()
  const config = await loadConfig({ configPath: rootOpts.config, url: rootOpts.url })
  const formatter = createFormatter(rootOpts.json)
  try {
    await executeCommand({ config, formatter, payload, procedureName })
    process.exit(0)
  } catch (error: unknown) {
    formatter.error(error)
    process.exit(1)
  }
}
