import { Command } from 'commander'
import { argv } from 'node:process'

declare const __CLI_VERSION__: string

const program = new Command()

program
  .name('evse-cli')
  .description('CLI to manage the e-mobility charging stations simulator via WebSocket UI service')
  .version(__CLI_VERSION__, '-V, --version', 'output the version number')
  .option('-C, --config <path>', 'path to configuration file')
  .option('--json', 'output results as JSON (machine-readable)', false)
  .option('--url <url>', 'simulator UI server WebSocket URL (overrides config)')

/** @returns ATG subcommand group. */
function createAtgCommands (): Command {
  const cmd = new Command('atg').description('Automatic Transaction Generator management')
  cmd
    .command('start')
    .description('Start ATG on station(s)')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  cmd
    .command('stop')
    .description('Stop ATG on station(s)')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  return cmd
}

/** @returns Connection subcommand group. */
function createConnectionCommands (): Command {
  const cmd = new Command('connection').description('WebSocket connection management')
  cmd
    .command('open')
    .description('Open WebSocket connection')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  cmd
    .command('close')
    .description('Close WebSocket connection')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  return cmd
}

/** @returns Connector subcommand group. */
function createConnectorCommands (): Command {
  const cmd = new Command('connector').description('Connector management')
  cmd
    .command('lock')
    .description('Lock a connector')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  cmd
    .command('unlock')
    .description('Unlock a connector')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  return cmd
}

/** @returns OCPP subcommand group. */
function createOcppCommands (): Command {
  const cmd = new Command('ocpp').description('OCPP protocol commands')
  for (const name of [
    'authorize',
    'boot-notification',
    'data-transfer',
    'diagnostics-status-notification',
    'firmware-status-notification',
    'get-15118-ev-certificate',
    'get-certificate-status',
    'heartbeat',
    'log-status-notification',
    'meter-values',
    'notify-customer-information',
    'notify-report',
    'security-event-notification',
    'sign-certificate',
    'status-notification',
    'transaction-event',
  ]) {
    cmd
      .command(name)
      .description(`Send OCPP ${name} command`)
      .allowUnknownOption()
      .action(() => {
        throw new Error('Not implemented yet')
      })
  }
  return cmd
}

/** @returns Performance subcommand group. */
function createPerformanceCommands (): Command {
  const cmd = new Command('performance').description('Performance statistics')
  cmd
    .command('stats')
    .description('Get performance statistics')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  return cmd
}

/** @returns Simulator subcommand group. */
function createSimulatorCommands (): Command {
  const cmd = new Command('simulator').description('Simulator lifecycle management')
  cmd
    .command('state')
    .description('Get simulator state')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  cmd
    .command('start')
    .description('Start the simulator')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  cmd
    .command('stop')
    .description('Stop the simulator')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  return cmd
}

/** @returns Station subcommand group. */
function createStationCommands (): Command {
  const cmd = new Command('station').description('Charging station management')
  cmd
    .command('list')
    .description('List all charging stations')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  cmd
    .command('start')
    .description('Start charging station(s)')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  cmd
    .command('stop')
    .description('Stop charging station(s)')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  cmd
    .command('add')
    .description('Add charging stations from template')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  cmd
    .command('delete')
    .description('Delete charging station(s)')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  return cmd
}

/** @returns Supervision subcommand group. */
function createSupervisionCommands (): Command {
  const cmd = new Command('supervision').description('Supervision URL management')
  cmd
    .command('set-url')
    .description('Set supervision URL')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  return cmd
}

/** @returns Template subcommand group. */
function createTemplateCommands (): Command {
  const cmd = new Command('template').description('Template management')
  cmd
    .command('list')
    .description('List available station templates')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  return cmd
}

/** @returns Transaction subcommand group. */
function createTransactionCommands (): Command {
  const cmd = new Command('transaction').description('Transaction management')
  cmd
    .command('start')
    .description('Start a transaction')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  cmd
    .command('stop')
    .description('Stop a transaction')
    .action(() => {
      throw new Error('Not implemented yet')
    })
  return cmd
}

program.addCommand(createSimulatorCommands())
program.addCommand(createStationCommands())
program.addCommand(createTemplateCommands())
program.addCommand(createConnectionCommands())
program.addCommand(createConnectorCommands())
program.addCommand(createAtgCommands())
program.addCommand(createTransactionCommands())
program.addCommand(createOcppCommands())
program.addCommand(createPerformanceCommands())
program.addCommand(createSupervisionCommands())

await program.parseAsync(argv)
