import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { runAction } from './action.js'
import { buildHashIdsPayload, pickDefined } from './payload.js'

export const createSupervisionCommands = (program: Command): Command => {
  const cmd = new Command('supervision').description('Supervision URL management')

  cmd
    .command('set-url [hashIds...]')
    .description('Set supervision URL for station(s)')
    .requiredOption('--supervision-url <url>', 'supervision URL')
    .option('--supervision-password <password>', 'CSMS basic auth password')
    .option('--supervision-user <user>', 'CSMS basic auth user')
    .action(
      async (
        hashIds: string[],
        options: {
          supervisionPassword?: string
          supervisionUrl: string
          supervisionUser?: string
        }
      ) => {
        const payload: RequestPayload = {
          url: options.supervisionUrl,
          ...pickDefined(options as Record<string, unknown>, {
            supervisionPassword: 'supervisionPassword',
            supervisionUser: 'supervisionUser',
          }),
          ...buildHashIdsPayload(hashIds),
        }
        await runAction(program, ProcedureName.SET_SUPERVISION_URL, payload)
      }
    )

  return cmd
}
