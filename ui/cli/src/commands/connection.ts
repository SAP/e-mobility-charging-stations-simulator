import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { runAction } from './action.js'
import { buildHashIdsPayload } from './payload.js'

export const createConnectionCommands = (program: Command): Command => {
  const cmd = new Command('connection').description('WebSocket connection management')

  cmd
    .command('open [hashIds...]')
    .description('Open WebSocket connection to CSMS on station(s)')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = buildHashIdsPayload(hashIds)
      await runAction(program, ProcedureName.OPEN_CONNECTION, payload)
    })

  cmd
    .command('close [hashIds...]')
    .description('Close WebSocket connection to CSMS on station(s)')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = buildHashIdsPayload(hashIds)
      await runAction(program, ProcedureName.CLOSE_CONNECTION, payload)
    })

  return cmd
}
