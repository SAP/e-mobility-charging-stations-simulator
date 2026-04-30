import { Command, Option } from 'commander'
import {
  buildStartTransactionPayload,
  buildStopTransactionPayload,
  isOCPP20x,
  OCPPVersion,
  ProcedureName,
  type RequestPayload,
} from 'ui-common'

import {
  handleActionErrors,
  parseInteger,
  resolveOcppVersionFromProgram,
  runAction,
} from './action.js'
import { buildHashIdsPayload, PAYLOAD_DESC, PAYLOAD_OPTION } from './payload.js'

export const createTransactionCommands = (program: Command): Command => {
  const cmd = new Command('transaction').description('Transaction management')

  cmd
    .command('start [hashIds...]')
    .description('Start a transaction on station(s)')
    .addOption(
      new Option('--connector-id <id>', 'connector ID').argParser(parseInteger).conflicts('payload')
    )
    .addOption(new Option('--id-tag <tag>', 'RFID tag for authorization').conflicts('payload'))
    .addOption(
      new Option('--evse-id <id>', 'EVSE ID (OCPP 2.0.x; derived from connector ID if omitted)')
        .argParser(parseInteger)
        .conflicts('payload')
    )
    .addOption(
      new Option(
        PAYLOAD_OPTION,
        PAYLOAD_DESC +
          ' (uses OCPP 1.6 procedure; for 2.0.x raw payloads use ocpp transaction-event)'
      ).conflicts(['connectorId', 'evseId', 'idTag'])
    )
    .action(
      async (
        hashIds: string[],
        options: { connectorId?: number; evseId?: number; idTag?: string; payload?: string }
      ) => {
        await handleActionErrors(program, async () => {
          let procedureName: ProcedureName
          let payload: RequestPayload
          if (options.payload == null) {
            if (options.connectorId == null) {
              throw new Error('--connector-id is required when -p/--payload is not provided')
            }
            if (options.idTag == null) {
              throw new Error('--id-tag is required when -p/--payload is not provided')
            }
            // High-level: detect OCPP version and build correct payload
            const { config, ocppVersion, resolvedHashIds } = await resolveOcppVersionFromProgram(
              program,
              hashIds
            )
            const { payload: built, procedureName: proc } = buildStartTransactionPayload(
              options.connectorId,
              ocppVersion,
              { evseId: options.evseId, idTag: options.idTag }
            )
            procedureName =
              proc === 'transactionEvent'
                ? ProcedureName.TRANSACTION_EVENT
                : ProcedureName.START_TRANSACTION
            payload = {
              ...built,
              ...buildHashIdsPayload(resolvedHashIds),
            }
            await runAction(program, procedureName, payload, undefined, config)
          } else {
            // Low-level passthrough: -p provided, uses OCPP 1.6 procedure; for 2.0.x raw payloads use ocpp transaction-event
            procedureName = ProcedureName.START_TRANSACTION
            payload = buildHashIdsPayload(hashIds)
            await runAction(program, procedureName, payload, options.payload)
          }
        })
      }
    )

  cmd
    .command('stop [hashIds...]')
    .description('Stop a transaction on station(s)')
    .addOption(new Option('--transaction-id <id>', 'transaction ID').conflicts('payload'))
    .addOption(
      new Option('--connector-id <id>', 'connector ID (required for OCPP 2.0.x)')
        .argParser(parseInteger)
        .conflicts('payload')
    )
    .addOption(
      new Option(
        PAYLOAD_OPTION,
        PAYLOAD_DESC +
          ' (uses OCPP 1.6 procedure; for 2.0.x raw payloads use ocpp transaction-event)'
      ).conflicts(['transactionId', 'connectorId'])
    )
    .action(
      async (
        hashIds: string[],
        options: { connectorId?: number; payload?: string; transactionId?: string }
      ) => {
        await handleActionErrors(program, async () => {
          let procedureName: ProcedureName
          let payload: RequestPayload
          if (options.payload == null) {
            if (options.transactionId == null) {
              throw new Error('--transaction-id is required when -p/--payload is not provided')
            }
            // High-level: detect OCPP version and build correct payload
            const { config, ocppVersion, resolvedHashIds } = await resolveOcppVersionFromProgram(
              program,
              hashIds
            )
            if (isOCPP20x(ocppVersion) && options.connectorId == null) {
              throw new Error('--connector-id is required for OCPP 2.0.x stations')
            }
            const { payload: built, procedureName: proc } = buildStopTransactionPayload(
              ocppVersion === OCPPVersion.VERSION_16
                ? parseInteger(
                  options.transactionId,
                  '--transaction-id (OCPP 1.6 requires integer)'
                )
                : options.transactionId,
              ocppVersion,
              options.connectorId
            )
            procedureName =
              proc === 'transactionEvent'
                ? ProcedureName.TRANSACTION_EVENT
                : ProcedureName.STOP_TRANSACTION
            payload = {
              ...built,
              ...buildHashIdsPayload(resolvedHashIds),
            }
            await runAction(program, procedureName, payload, undefined, config)
          } else {
            // Low-level passthrough: -p provided, uses OCPP 1.6 procedure; for 2.0.x raw payloads use ocpp transaction-event
            procedureName = ProcedureName.STOP_TRANSACTION
            payload = buildHashIdsPayload(hashIds)
            await runAction(program, procedureName, payload, options.payload)
          }
        })
      }
    )

  return cmd
}
