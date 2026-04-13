import { Command } from 'commander'
import { ProcedureName } from 'ui-common'

import { runAction } from './action.js'

export const createSimulatorCommands = (program: Command): Command => {
  const cmd = new Command('simulator').description('Simulator lifecycle management')

  cmd
    .command('state')
    .description('Get simulator state and statistics')
    .action(async () => {
      await runAction(program, ProcedureName.SIMULATOR_STATE, {})
    })

  cmd
    .command('start')
    .description('Start the simulator')
    .action(async () => {
      await runAction(program, ProcedureName.START_SIMULATOR, {})
    })

  cmd
    .command('stop')
    .description('Stop the simulator')
    .action(async () => {
      await runAction(program, ProcedureName.STOP_SIMULATOR, {})
    })

  return cmd
}
