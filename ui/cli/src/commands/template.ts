import { Command } from 'commander'
import { ProcedureName } from 'ui-common'

import { runAction } from './action.js'

export const createTemplateCommands = (program: Command): Command => {
  const cmd = new Command('template').description('Template management')

  cmd
    .command('list')
    .description('List available station templates')
    .action(async () => {
      await runAction(program, ProcedureName.LIST_TEMPLATES, {})
    })

  return cmd
}
