import { Command } from 'commander'
import {
  OCPP20IdTokenEnumType,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
  ProcedureName,
  randomUUID,
  type RequestPayload,
} from 'ui-common'

import type { GlobalOptions } from '../types.js'

import { loadConfig } from '../config/loader.js'
import { parseInteger, resolveOcppVersion, runAction } from './action.js'
import { buildHashIdsPayload, PAYLOAD_DESC, PAYLOAD_OPTION } from './payload.js'

export const createTransactionCommands = (program: Command): Command => {
  const cmd = new Command('transaction').description('Transaction management')

  cmd
    .command('start [hashIds...]')
    .description('Start a transaction on station(s)')
    .requiredOption('--connector-id <id>', 'connector ID', parseInteger)
    .requiredOption('--id-tag <tag>', 'RFID tag for authorization')
    .option(PAYLOAD_OPTION, PAYLOAD_DESC)
    .action(
      async (
        hashIds: string[],
        options: { connectorId: number; idTag: string; payload?: string }
      ) => {
        let procedureName: ProcedureName
        let payload: RequestPayload
        if (options.payload == null) {
          // High-level: detect OCPP version and build correct payload
          const rootOpts = program.opts<GlobalOptions>()
          const config = await loadConfig({ configPath: rootOpts.config, url: rootOpts.serverUrl })
          const ocppVersion = await resolveOcppVersion(hashIds, config)
          if (ocppVersion == null) {
            throw new Error(
              'Cannot determine a common OCPP version for the targeted stations. ' +
                'Target homogeneous stations (same OCPP version) or use -p to pass the payload directly.'
            )
          }
          if (ocppVersion === OCPPVersion.VERSION_20 || ocppVersion === OCPPVersion.VERSION_201) {
            procedureName = ProcedureName.TRANSACTION_EVENT
            payload = {
              eventType: OCPP20TransactionEventEnumType.STARTED,
              evse: { connectorId: options.connectorId, id: options.connectorId },
              idToken: { idToken: options.idTag, type: OCPP20IdTokenEnumType.ISO14443 },
              seqNo: 0,
              timestamp: new Date().toISOString(),
              transactionInfo: { transactionId: randomUUID() },
              triggerReason: OCPP20TriggerReasonEnumType.AUTHORIZED,
              ...buildHashIdsPayload(hashIds),
            }
          } else {
            procedureName = ProcedureName.START_TRANSACTION
            payload = {
              connectorId: options.connectorId,
              idTag: options.idTag,
              ...buildHashIdsPayload(hashIds),
            }
          }
        } else {
          // Low-level passthrough: -p provided, use only routing fields; raw payload has full control
          procedureName = ProcedureName.START_TRANSACTION
          payload = buildHashIdsPayload(hashIds)
        }
        await runAction(program, procedureName, payload, options.payload)
      }
    )

  cmd
    .command('stop [hashIds...]')
    .description('Stop a transaction on station(s)')
    .requiredOption(
      '--transaction-id <id>',
      'transaction ID (integer for OCPP 1.6, UUID for OCPP 2.0.x)'
    )
    .option(PAYLOAD_OPTION, PAYLOAD_DESC)
    .action(async (hashIds: string[], options: { payload?: string; transactionId: string }) => {
      let procedureName: ProcedureName
      let payload: RequestPayload
      if (options.payload == null) {
        // High-level: detect OCPP version and build correct payload
        const rootOpts = program.opts<GlobalOptions>()
        const config = await loadConfig({ configPath: rootOpts.config, url: rootOpts.serverUrl })
        const ocppVersion = await resolveOcppVersion(hashIds, config)
        if (ocppVersion == null) {
          throw new Error(
            'Cannot determine a common OCPP version for the targeted stations. ' +
              'Target homogeneous stations (same OCPP version) or use -p to pass the payload directly.'
          )
        }
        if (ocppVersion === OCPPVersion.VERSION_20 || ocppVersion === OCPPVersion.VERSION_201) {
          procedureName = ProcedureName.TRANSACTION_EVENT
          payload = {
            eventType: OCPP20TransactionEventEnumType.ENDED,
            seqNo: 0,
            timestamp: new Date().toISOString(),
            transactionInfo: { transactionId: options.transactionId },
            triggerReason: OCPP20TriggerReasonEnumType.REMOTE_STOP,
            ...buildHashIdsPayload(hashIds),
          }
        } else {
          procedureName = ProcedureName.STOP_TRANSACTION
          payload = {
            transactionId: parseInteger(options.transactionId),
            ...buildHashIdsPayload(hashIds),
          }
        }
      } else {
        // Low-level passthrough: -p provided, use only routing fields; raw payload has full control
        procedureName = ProcedureName.STOP_TRANSACTION
        payload = buildHashIdsPayload(hashIds)
      }
      await runAction(program, procedureName, payload, options.payload)
    })

  return cmd
}
