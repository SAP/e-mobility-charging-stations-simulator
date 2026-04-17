import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { parseInteger, runAction } from './action.js'
import { buildHashIdsPayload } from './payload.js'

export const createConnectorCommands = (program: Command): Command => {
  const cmd = new Command('connector').description('Connector management')

  cmd
    .command('lock [hashIds...]')
    .description('Lock a connector')
    .requiredOption('--connector-id <id>', 'connector ID', parseInteger)
    .action(async (hashIds: string[], options: { connectorId: number }) => {
      const payload: RequestPayload = {
        connectorId: options.connectorId,
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.LOCK_CONNECTOR, payload)
    })

  cmd
    .command('unlock [hashIds...]')
    .description('Unlock a connector')
    .requiredOption('--connector-id <id>', 'connector ID', parseInteger)
    .action(async (hashIds: string[], options: { connectorId: number }) => {
      const payload: RequestPayload = {
        connectorId: options.connectorId,
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.UNLOCK_CONNECTOR, payload)
    })

  return cmd
}
