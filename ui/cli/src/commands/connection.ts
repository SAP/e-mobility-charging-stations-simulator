import type { Command } from 'commander'
import type { RequestPayload } from 'ui-common'

import { Command as Cmd } from 'commander'
import { ProcedureName } from 'ui-common'

import { runAction } from './action.js'

export const createConnectionCommands = (program: Command): Command => {
  const cmd = new Cmd('connection').description('WebSocket connection management')

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
