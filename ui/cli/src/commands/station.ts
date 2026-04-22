import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { parseInteger, runAction } from './action.js'
import { buildHashIdsPayload, pickDefined } from './payload.js'

export const createStationCommands = (program: Command): Command => {
  const cmd = new Command('station').description('Charging station management')

  cmd
    .command('list')
    .description('List all stations')
    .action(async () => {
      await runAction(program, ProcedureName.LIST_CHARGING_STATIONS, {})
    })

  cmd
    .command('start [hashIds...]')
    .description('Start station(s)')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = buildHashIdsPayload(hashIds)
      await runAction(program, ProcedureName.START_CHARGING_STATION, payload)
    })

  cmd
    .command('stop [hashIds...]')
    .description('Stop station(s)')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = buildHashIdsPayload(hashIds)
      await runAction(program, ProcedureName.STOP_CHARGING_STATION, payload)
    })

  cmd
    .command('add')
    .description('Add stations from template')
    .requiredOption('-t, --template <name>', 'station template name')
    .requiredOption('-n, --count <n>', 'number of stations to add', parseInteger)
    .option('--auto-start', 'auto-start added stations')
    .option('--base-name <name>', 'override template base name for station id')
    .option('--fixed-name', 'use base name verbatim as station id')
    .option('--name-suffix <suffix>', 'suffix appended to derived station id')
    .option('--ocpp-strict', 'enable OCPP strict compliance')
    .option('--persistent-config', 'enable persistent OCPP configuration')
    .option('--supervision-password <password>', 'CSMS basic auth password')
    .option('--supervision-url <url>', 'supervision URL for new stations')
    .option('--supervision-user <user>', 'CSMS basic auth user')
    .action(
      async (options: {
        autoStart?: true
        baseName?: string
        count: number
        fixedName?: true
        nameSuffix?: string
        ocppStrict?: true
        persistentConfig?: true
        supervisionPassword?: string
        supervisionUrl?: string
        supervisionUser?: string
        template: string
      }) => {
        const payload: RequestPayload = {
          numberOfStations: options.count,
          options: pickDefined(options as Record<string, unknown>, {
            autoStart: 'autoStart',
            baseName: 'baseName',
            fixedName: 'fixedName',
            nameSuffix: 'nameSuffix',
            ocppStrict: 'ocppStrictCompliance',
            persistentConfig: 'persistentConfiguration',
            supervisionPassword: 'supervisionPassword',
            supervisionUrl: 'supervisionUrls',
            supervisionUser: 'supervisionUser',
          }) as RequestPayload,
          template: options.template,
        }
        await runAction(program, ProcedureName.ADD_CHARGING_STATIONS, payload)
      }
    )

  cmd
    .command('delete [hashIds...]')
    .description('Delete station(s)')
    .option('--delete-config', 'delete station configuration files')
    .action(async (hashIds: string[], options: { deleteConfig?: true }) => {
      const payload: RequestPayload = {
        ...(pickDefined(options as Record<string, unknown>, {
          deleteConfig: 'deleteConfiguration',
        }) as RequestPayload),
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.DELETE_CHARGING_STATIONS, payload)
    })

  return cmd
}
