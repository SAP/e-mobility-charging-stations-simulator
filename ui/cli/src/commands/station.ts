import { Command as Cmd, type Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { runAction } from './action.js'

export const createStationCommands = (program: Command): Command => {
  const cmd = new Cmd('station').description('Charging station management')

  cmd
    .command('list')
    .description('List all charging stations')
    .action(async () => {
      await runAction(program, ProcedureName.LIST_CHARGING_STATIONS, {})
    })

  cmd
    .command('start [hashIds...]')
    .description('Start charging station(s)')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.START_CHARGING_STATION, payload)
    })

  cmd
    .command('stop [hashIds...]')
    .description('Stop charging station(s)')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.STOP_CHARGING_STATION, payload)
    })

  cmd
    .command('add')
    .description('Add charging stations from template')
    .requiredOption('-t, --template <name>', 'station template name')
    .requiredOption('-n, --count <n>', 'number of stations to add', Number.parseInt)
    .option('--supervision-url <url>', 'supervision URL for new stations')
    .option('--auto-start', 'auto-start added stations', false)
    .option('--persistent-config', 'enable persistent OCPP configuration', false)
    .option('--ocpp-strict', 'enable OCPP strict compliance', false)
    .action(
      async (options: {
        autoStart: boolean
        count: number
        ocppStrict: boolean
        persistentConfig: boolean
        supervisionUrl?: string
        template: string
      }) => {
        const payload: RequestPayload = {
          numberOfStations: options.count,
          options: {
            autoStart: options.autoStart,
            ocppStrictCompliance: options.ocppStrict,
            persistentConfiguration: options.persistentConfig,
            ...(options.supervisionUrl != null && {
              supervisionUrls: options.supervisionUrl,
            }),
          },
          template: options.template,
        }
        await runAction(program, ProcedureName.ADD_CHARGING_STATIONS, payload)
      }
    )

  cmd
    .command('delete [hashIds...]')
    .description('Delete charging station(s)')
    .option('--delete-config', 'delete station configuration files', false)
    .action(async (hashIds: string[], options: { deleteConfig: boolean }) => {
      const payload: RequestPayload = {
        deleteConfiguration: options.deleteConfig,
        ...(hashIds.length > 0 && { hashIds }),
      }
      await runAction(program, ProcedureName.DELETE_CHARGING_STATIONS, payload)
    })

  return cmd
}
