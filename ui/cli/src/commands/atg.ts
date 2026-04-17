import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { runAction } from './action.js'
import { buildHashIdsPayload, pickPresent } from './payload.js'

const parseCommaSeparatedInts = (value: string): number[] => {
  const parsed = value.split(',').map(s => Number.parseInt(s.trim(), 10))
  if (parsed.some(n => Number.isNaN(n))) {
    throw new Error(`Invalid connector IDs: '${value}' (expected comma-separated integers)`)
  }
  return parsed
}

export const createAtgCommands = (program: Command): Command => {
  const cmd = new Command('atg').description('Automatic Transaction Generator management')

  cmd
    .command('start [hashIds...]')
    .description('Start ATG on station(s)')
    .option('--connector-ids <ids>', 'comma-separated connector IDs', parseCommaSeparatedInts)
    .action(async (hashIds: string[], options: { connectorIds?: number[] }) => {
      const payload: RequestPayload = {
        ...(pickPresent(options as Record<string, unknown>, ['connectorIds']) as RequestPayload),
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR, payload)
    })

  cmd
    .command('stop [hashIds...]')
    .description('Stop ATG on station(s)')
    .option('--connector-ids <ids>', 'comma-separated connector IDs', parseCommaSeparatedInts)
    .action(async (hashIds: string[], options: { connectorIds?: number[] }) => {
      const payload: RequestPayload = {
        ...(pickPresent(options as Record<string, unknown>, ['connectorIds']) as RequestPayload),
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR, payload)
    })

  return cmd
}
