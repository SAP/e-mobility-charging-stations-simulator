import type { Command } from 'commander'
import type { RequestPayload } from 'ui-common'

import { Command as Cmd } from 'commander'
import { ProcedureName } from 'ui-common'

import { runAction } from './action.js'

export const createConnectorCommands = (program: Command): Command => {
  const cmd = new Cmd('connector').description('Connector management')

  cmd
    .command('lock [hashIds...]')
    .description('Lock a connector')
    .requiredOption('--connector-id <id>', 'connector ID', parseInt)
    .action(async (hashIds: string[], options: { connectorId: number }) => {
      const payload: RequestPayload = {
        connectorId: options.connectorId,
        ...(hashIds.length > 0 && { hashIds }),
      }
      await runAction(program, ProcedureName.LOCK_CONNECTOR, payload)
    })

  cmd
    .command('unlock [hashIds...]')
    .description('Unlock a connector')
    .requiredOption('--connector-id <id>', 'connector ID', parseInt)
    .action(async (hashIds: string[], options: { connectorId: number }) => {
      const payload: RequestPayload = {
        connectorId: options.connectorId,
        ...(hashIds.length > 0 && { hashIds }),
      }
      await runAction(program, ProcedureName.UNLOCK_CONNECTOR, payload)
    })

  return cmd
}
