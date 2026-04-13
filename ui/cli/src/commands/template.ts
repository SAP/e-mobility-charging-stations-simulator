import type { Command } from 'commander'

import { Command as Cmd } from 'commander'
import { ProcedureName } from 'ui-common'

import { runAction } from './action.js'

export const createTemplateCommands = (program: Command): Command => {
  const cmd = new Cmd('template').description('Template management')

  cmd
    .command('list')
    .description('List available station templates')
    .action(async () => {
      await runAction(program, ProcedureName.LIST_TEMPLATES, {})
    })

  return cmd
}
