import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { parseInteger, runAction } from './action.js'
import { buildHashIdsPayload, PAYLOAD_DESC, PAYLOAD_OPTION } from './payload.js'

export const createTransactionCommands = (program: Command): Command => {
  const cmd = new Command('transaction').description('Transaction management')

  cmd
    .command('start [hashIds...]')
    .description('Start a transaction on station(s)')
    .requiredOption('--connector-id <id>', 'connector ID', parseInteger)
    .requiredOption('--id-tag <tag>', 'RFID tag for authorization')
    .option(PAYLOAD_OPTION, PAYLOAD_DESC)
    .action(
      async (
        hashIds: string[],
        options: { connectorId: number; idTag: string; payload?: string }
      ) => {
        const payload: RequestPayload = {
          connectorId: options.connectorId,
          idTag: options.idTag,
          ...buildHashIdsPayload(hashIds),
        }
        await runAction(program, ProcedureName.START_TRANSACTION, payload, options.payload)
      }
    )

  cmd
    .command('stop [hashIds...]')
    .description('Stop a transaction on station(s)')
    .requiredOption('--transaction-id <id>', 'transaction ID', parseInteger)
    .option(PAYLOAD_OPTION, PAYLOAD_DESC)
    .action(async (hashIds: string[], options: { payload?: string; transactionId: number }) => {
      const payload: RequestPayload = {
        transactionId: options.transactionId,
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.STOP_TRANSACTION, payload, options.payload)
    })

  return cmd
}
