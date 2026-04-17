import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { parseInteger, runAction } from './action.js'
import { buildHashIdsPayload } from './payload.js'

export const createTransactionCommands = (program: Command): Command => {
  const cmd = new Command('transaction').description('Transaction management')

  cmd
    .command('start [hashIds...]')
    .description('Start a transaction')
    .requiredOption('--connector-id <id>', 'connector ID', parseInteger)
    .requiredOption('--id-tag <tag>', 'RFID tag for authorization')
    .action(async (hashIds: string[], options: { connectorId: number; idTag: string }) => {
      const payload: RequestPayload = {
        connectorId: options.connectorId,
        idTag: options.idTag,
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.START_TRANSACTION, payload)
    })

  cmd
    .command('stop [hashIds...]')
    .description('Stop a transaction')
    .requiredOption('--transaction-id <id>', 'transaction ID', parseInteger)
    .action(async (hashIds: string[], options: { transactionId: number }) => {
      const payload: RequestPayload = {
        transactionId: options.transactionId,
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.STOP_TRANSACTION, payload)
    })

  return cmd
}
