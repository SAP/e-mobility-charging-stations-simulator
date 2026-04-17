import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { runAction } from './action.js'
import { buildHashIdsPayload } from './payload.js'

export const createSupervisionCommands = (program: Command): Command => {
  const cmd = new Command('supervision').description('Supervision URL management')

  cmd
    .command('set-url [hashIds...]')
    .description('Set supervision URL for station(s)')
    .requiredOption('--url <url>', 'supervision URL')
    .action(async (hashIds: string[], options: { url: string }) => {
      const payload: RequestPayload = {
        url: options.url,
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.SET_SUPERVISION_URL, payload)
    })

  return cmd
}
