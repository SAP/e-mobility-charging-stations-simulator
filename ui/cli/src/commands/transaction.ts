import { Command, Option } from 'commander'
import {
  OCPP20IdTokenEnumType,
  OCPP20TransactionEventEnumType,
  OCPPVersion,
  ProcedureName,
  type RequestPayload,
} from 'ui-common'

import {
  handleActionErrors,
  parseInteger,
  resolveOcppVersionFromProgram,
  runAction,
  UNSUPPORTED_OCPP_VERSION_ERROR,
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
      new Option('--evse-id <id>', 'EVSE ID (OCPP 2.0.x; resolved from connector ID when omitted)')
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
            switch (ocppVersion) {
              case OCPPVersion.VERSION_16:
                procedureName = ProcedureName.START_TRANSACTION
                payload = {
                  connectorId: options.connectorId,
                  idTag: options.idTag,
                  ...buildHashIdsPayload(resolvedHashIds),
                }
                break
              case OCPPVersion.VERSION_20:
              case OCPPVersion.VERSION_201:
                procedureName = ProcedureName.TRANSACTION_EVENT
                payload = {
                  connectorId: options.connectorId,
                  eventType: OCPP20TransactionEventEnumType.STARTED,
                  ...(options.evseId != null && { evseId: options.evseId }),
                  idToken: { idToken: options.idTag, type: OCPP20IdTokenEnumType.ISO14443 },
                  ...buildHashIdsPayload(resolvedHashIds),
                }
                break
              default:
                throw new Error(UNSUPPORTED_OCPP_VERSION_ERROR)
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
            switch (ocppVersion) {
              case OCPPVersion.VERSION_16:
                procedureName = ProcedureName.STOP_TRANSACTION
                payload = {
                  transactionId: parseInteger(
                    options.transactionId,
                    '--transaction-id (OCPP 1.6 requires integer)'
                  ),
                  ...buildHashIdsPayload(resolvedHashIds),
                }
                break
              case OCPPVersion.VERSION_20:
              case OCPPVersion.VERSION_201:
                if (options.connectorId == null) {
                  throw new Error('--connector-id is required for OCPP 2.0.x stations')
                }
                procedureName = ProcedureName.TRANSACTION_EVENT
                payload = {
                  connectorId: options.connectorId,
                  eventType: OCPP20TransactionEventEnumType.ENDED,
                  transactionId: options.transactionId,
                  ...buildHashIdsPayload(resolvedHashIds),
                }
                break
              default:
                throw new Error(UNSUPPORTED_OCPP_VERSION_ERROR)
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
