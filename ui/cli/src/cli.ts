import { Command } from 'commander'
import { argv } from 'node:process'

import { registerSignalHandlers } from './client/lifecycle.js'
import { createAtgCommands } from './commands/atg.js'
import { createConnectionCommands } from './commands/connection.js'
import { createConnectorCommands } from './commands/connector.js'
import { createOcppCommands } from './commands/ocpp.js'
import { createPerformanceCommands } from './commands/performance.js'
import { createSimulatorCommands } from './commands/simulator.js'
import { createStationCommands } from './commands/station.js'
import { createSupervisionCommands } from './commands/supervision.js'
import { createTemplateCommands } from './commands/template.js'
import { createTransactionCommands } from './commands/transaction.js'

declare const __CLI_VERSION__: string

const program = new Command()

program
  .name('evse-cli')
  .description('CLI to manage the e-mobility charging stations simulator via WebSocket UI service')
  .version(__CLI_VERSION__, '-V, --version', 'output the version number')
  .option('-C, --config <path>', 'path to configuration file')
  .option('--json', 'output results as JSON (machine-readable)', false)
  .option('--url <url>', 'simulator UI server WebSocket URL (overrides config)')

program.addCommand(createSimulatorCommands(program))
program.addCommand(createStationCommands(program))
program.addCommand(createTemplateCommands(program))
program.addCommand(createConnectionCommands(program))
program.addCommand(createConnectorCommands(program))
program.addCommand(createAtgCommands(program))
program.addCommand(createTransactionCommands(program))
program.addCommand(createOcppCommands(program))
program.addCommand(createPerformanceCommands(program))
program.addCommand(createSupervisionCommands(program))

registerSignalHandlers()
await program.parseAsync(argv)
