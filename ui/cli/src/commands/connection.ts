import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { runAction } from './action.js'

export const createConnectionCommands = (program: Command): Command => {
  const cmd = new Command('connection').description('WebSocket connection management')

  cmd
    .command('open [hashIds...]')
    .description('Open WebSocket connection')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.OPEN_CONNECTION, payload)
    })

  cmd
    .command('close [hashIds...]')
    .description('Close WebSocket connection')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.CLOSE_CONNECTION, payload)
    })

  return cmd
}
