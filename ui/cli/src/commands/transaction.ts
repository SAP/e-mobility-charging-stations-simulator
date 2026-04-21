import { Command } from 'commander'
import {
  OCPP20IdTokenEnumType,
  OCPP20TransactionEventEnumType,
  OCPPVersion,
  ProcedureName,
  type RequestPayload,
} from 'ui-common'

import {
  MIXED_OCPP_VERSION_ERROR,
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
    .requiredOption('--connector-id <id>', 'connector ID', parseInteger)
    .requiredOption('--id-tag <tag>', 'RFID tag for authorization')
    .option('--evse-id <id>', 'EVSE ID (OCPP 2.0.x; defaults to 1)', parseInteger)
    .option(
      PAYLOAD_OPTION,
      PAYLOAD_DESC + ' (uses OCPP 1.6 procedure; for 2.0.x raw payloads use ocpp transaction-event)'
    )
    .action(
      async (
        hashIds: string[],
        options: { connectorId: number; evseId?: number; idTag: string; payload?: string }
      ) => {
        let procedureName: ProcedureName
        let payload: RequestPayload
        if (options.payload == null) {
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
              throw new Error(MIXED_OCPP_VERSION_ERROR)
          }
          await runAction(program, procedureName, payload, undefined, config)
        } else {
          // Low-level passthrough: -p provided, uses OCPP 1.6 procedure; for 2.0.x raw payloads use ocpp transaction-event
          procedureName = ProcedureName.START_TRANSACTION
          payload = buildHashIdsPayload(hashIds)
          await runAction(program, procedureName, payload, options.payload)
        }
      }
    )

  cmd
    .command('stop [hashIds...]')
    .description('Stop a transaction on station(s)')
    .requiredOption('--transaction-id <id>', 'transaction ID')
    .option(
      PAYLOAD_OPTION,
      PAYLOAD_DESC + ' (uses OCPP 1.6 procedure; for 2.0.x raw payloads use ocpp transaction-event)'
    )
    .action(async (hashIds: string[], options: { payload?: string; transactionId: string }) => {
      let procedureName: ProcedureName
      let payload: RequestPayload
      if (options.payload == null) {
        // High-level: detect OCPP version and build correct payload
        const { config, ocppVersion, resolvedHashIds } = await resolveOcppVersionFromProgram(
          program,
          hashIds
        )
        switch (ocppVersion) {
          case OCPPVersion.VERSION_16:
            procedureName = ProcedureName.STOP_TRANSACTION
            payload = {
              transactionId: parseInteger(options.transactionId),
              ...buildHashIdsPayload(resolvedHashIds),
            }
            break
          case OCPPVersion.VERSION_20:
          case OCPPVersion.VERSION_201:
            procedureName = ProcedureName.TRANSACTION_EVENT
            payload = {
              eventType: OCPP20TransactionEventEnumType.ENDED,
              transactionId: options.transactionId,
              ...buildHashIdsPayload(resolvedHashIds),
            }
            break
          default:
            throw new Error(MIXED_OCPP_VERSION_ERROR)
        }
        await runAction(program, procedureName, payload, undefined, config)
      } else {
        // Low-level passthrough: -p provided, uses OCPP 1.6 procedure; for 2.0.x raw payloads use ocpp transaction-event
        procedureName = ProcedureName.STOP_TRANSACTION
        payload = buildHashIdsPayload(hashIds)
        await runAction(program, procedureName, payload, options.payload)
      }
    })

  return cmd
}
