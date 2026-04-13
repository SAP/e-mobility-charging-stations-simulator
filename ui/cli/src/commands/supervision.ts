import type { Command } from 'commander'
import type { RequestPayload } from 'ui-common'

import { Command as Cmd } from 'commander'
import { ProcedureName } from 'ui-common'

import { runAction } from './action.js'

export const createSupervisionCommands = (program: Command): Command => {
  const cmd = new Cmd('supervision').description('Supervision URL management')

  cmd
    .command('set-url [hashIds...]')
    .description('Set supervision URL for station(s)')
    .requiredOption('--url <url>', 'supervision URL')
    .action(async (hashIds: string[], options: { url: string }) => {
      const payload: RequestPayload = {
        url: options.url,
        ...(hashIds.length > 0 && { hashIds }),
      }
      await runAction(program, ProcedureName.SET_SUPERVISION_URL, payload)
    })

  return cmd
}
