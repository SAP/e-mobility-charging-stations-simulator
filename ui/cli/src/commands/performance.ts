import { Command } from 'commander'
import { ProcedureName } from 'ui-common'

import { runAction } from './action.js'

export const createPerformanceCommands = (program: Command): Command => {
  const cmd = new Command('performance').description('Performance statistics')

  cmd
    .command('stats')
    .description('Get performance statistics')
    .action(async () => {
      await runAction(program, ProcedureName.PERFORMANCE_STATISTICS, {})
    })

  return cmd
}
