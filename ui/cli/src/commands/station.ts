import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { parseInteger, runAction } from './action.js'
import { buildHashIdsPayload, pickDefined } from './payload.js'

export const createStationCommands = (program: Command): Command => {
  const cmd = new Command('station').description('Charging station management')

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
      const payload: RequestPayload = buildHashIdsPayload(hashIds)
      await runAction(program, ProcedureName.START_CHARGING_STATION, payload)
    })

  cmd
    .command('stop [hashIds...]')
    .description('Stop charging station(s)')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = buildHashIdsPayload(hashIds)
      await runAction(program, ProcedureName.STOP_CHARGING_STATION, payload)
    })

  cmd
    .command('add')
    .description('Add charging stations from template')
    .requiredOption('-t, --template <name>', 'station template name')
    .requiredOption('-n, --count <n>', 'number of stations to add', parseInteger)
    .option('--supervision-url <url>', 'supervision URL for new stations')
    .option('--auto-start', 'auto-start added stations')
    .option('--persistent-config', 'enable persistent OCPP configuration')
    .option('--ocpp-strict', 'enable OCPP strict compliance')
    .action(
      async (options: {
        autoStart?: true
        count: number
        ocppStrict?: true
        persistentConfig?: true
        supervisionUrl?: string
        template: string
      }) => {
        const payload: RequestPayload = {
          numberOfStations: options.count,
          options: pickDefined(options as Record<string, unknown>, {
            autoStart: 'autoStart',
            ocppStrict: 'ocppStrictCompliance',
            persistentConfig: 'persistentConfiguration',
            supervisionUrl: 'supervisionUrls',
          }) as RequestPayload,
          template: options.template,
        }
        await runAction(program, ProcedureName.ADD_CHARGING_STATIONS, payload)
      }
    )

  cmd
    .command('delete [hashIds...]')
    .description('Delete charging station(s)')
    .option('--delete-config', 'delete station configuration files')
    .action(async (hashIds: string[], options: { deleteConfig?: true }) => {
      const payload: RequestPayload = {
        ...(options.deleteConfig != null && { deleteConfiguration: options.deleteConfig }),
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.DELETE_CHARGING_STATIONS, payload)
    })

  return cmd
}
