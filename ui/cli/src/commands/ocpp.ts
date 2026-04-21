import { Command, Option } from 'commander'
import { OCPP20IdTokenEnumType, OCPPVersion, ProcedureName, type RequestPayload } from 'ui-common'

import {
  handleActionErrors,
  parseInteger,
  resolveOcppVersionFromProgram,
  runAction,
  UNSUPPORTED_OCPP_VERSION_ERROR,
} from './action.js'
import { buildHashIdsPayload, PAYLOAD_DESC, PAYLOAD_OPTION, pickDefined } from './payload.js'

export const createOcppCommands = (program: Command): Command => {
  const cmd = new Command('ocpp').description('OCPP protocol commands')

  cmd
    .command('authorize [hashIds...]')
    .description('Request station(s) to send OCPP Authorize')
    .addOption(new Option('--id-tag <tag>', 'RFID tag for authorization').conflicts('payload'))
    .addOption(new Option(PAYLOAD_OPTION, PAYLOAD_DESC).conflicts('idTag'))
    .action(async (hashIds: string[], options: { idTag?: string; payload?: string }) => {
      await handleActionErrors(program, async () => {
        let payload: RequestPayload
        if (options.payload == null) {
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
              payload = {
                idTag: options.idTag,
                ...buildHashIdsPayload(resolvedHashIds),
              }
              break
            case OCPPVersion.VERSION_20:
            case OCPPVersion.VERSION_201:
              payload = {
                idToken: { idToken: options.idTag, type: OCPP20IdTokenEnumType.ISO14443 },
                ...buildHashIdsPayload(resolvedHashIds),
              }
              break
            default:
              throw new Error(UNSUPPORTED_OCPP_VERSION_ERROR)
          }
          await runAction(program, ProcedureName.AUTHORIZE, payload, undefined, config)
        } else {
          // Low-level passthrough: -p provided, use only routing fields; raw payload has full control
          payload = buildHashIdsPayload(hashIds)
          await runAction(program, ProcedureName.AUTHORIZE, payload, options.payload)
        }
      })
    })

  cmd
    .command('data-transfer [hashIds...]')
    .description('Request station(s) to send OCPP DataTransfer')
    .option('--vendor-id <id>', 'vendor identifier')
    .option('--message-id <id>', 'message identifier')
    .option('--data <data>', 'data payload (free-form string)')
    .option(PAYLOAD_OPTION, PAYLOAD_DESC)
    .action(
      async (
        hashIds: string[],
        options: { data?: string; messageId?: string; payload?: string; vendorId?: string }
      ) => {
        const payload: RequestPayload = {
          ...pickDefined(options as Record<string, unknown>, {
            data: 'data',
            messageId: 'messageId',
            vendorId: 'vendorId',
          }),
          ...buildHashIdsPayload(hashIds),
        } as RequestPayload
        await runAction(program, ProcedureName.DATA_TRANSFER, payload, options.payload)
      }
    )

  cmd
    .command('meter-values [hashIds...]')
    .description('Request station(s) to send OCPP MeterValues')
    .addOption(
      new Option('--connector-id <id>', 'connector ID').argParser(parseInteger).conflicts('payload')
    )
    .addOption(
      new Option('--evse-id <id>', 'EVSE ID (OCPP 2.0.x; derived from connector ID if omitted)')
        .argParser(parseInteger)
        .conflicts('payload')
    )
    .addOption(new Option(PAYLOAD_OPTION, PAYLOAD_DESC).conflicts(['connectorId', 'evseId']))
    .action(
      async (
        hashIds: string[],
        options: { connectorId?: number; evseId?: number; payload?: string }
      ) => {
        await handleActionErrors(program, async () => {
          let payload: RequestPayload
          if (options.payload == null) {
            if (options.connectorId == null && options.evseId == null) {
              throw new Error(
                '--connector-id or --evse-id is required when -p/--payload is not provided'
              )
            }
            // High-level: detect OCPP version and build correct payload
            const { config, ocppVersion, resolvedHashIds } = await resolveOcppVersionFromProgram(
              program,
              hashIds
            )
            switch (ocppVersion) {
              case OCPPVersion.VERSION_16:
                if (options.connectorId == null) {
                  throw new Error('--connector-id is required for OCPP 1.6 stations')
                }
                payload = {
                  connectorId: options.connectorId,
                  ...buildHashIdsPayload(resolvedHashIds),
                }
                break
              case OCPPVersion.VERSION_20:
              case OCPPVersion.VERSION_201:
                payload = {
                  ...(options.connectorId != null && { connectorId: options.connectorId }),
                  ...(options.evseId != null && { evseId: options.evseId }),
                  ...buildHashIdsPayload(resolvedHashIds),
                }
                break
              default:
                throw new Error(UNSUPPORTED_OCPP_VERSION_ERROR)
            }
            await runAction(program, ProcedureName.METER_VALUES, payload, undefined, config)
          } else {
            // Low-level passthrough: -p provided, use only routing fields; raw payload has full control
            payload = buildHashIdsPayload(hashIds)
            await runAction(program, ProcedureName.METER_VALUES, payload, options.payload)
          }
        })
      }
    )

  cmd
    .command('status-notification [hashIds...]')
    .description('Request station(s) to send OCPP StatusNotification')
    .addOption(
      new Option('--connector-id <id>', 'connector ID').argParser(parseInteger).conflicts('payload')
    )
    .addOption(
      new Option('--error-code <code>', 'connector error code (OCPP 1.6)').conflicts('payload')
    )
    .addOption(
      new Option('--evse-id <id>', 'EVSE ID (OCPP 2.0.x; derived from connector ID if omitted)')
        .argParser(parseInteger)
        .conflicts('payload')
    )
    .addOption(new Option('--status <status>', 'connector status').conflicts('payload'))
    .addOption(
      new Option(PAYLOAD_OPTION, PAYLOAD_DESC).conflicts([
        'connectorId',
        'errorCode',
        'evseId',
        'status',
      ])
    )
    .action(
      async (
        hashIds: string[],
        options: {
          connectorId?: number
          errorCode?: string
          evseId?: number
          payload?: string
          status?: string
        }
      ) => {
        await handleActionErrors(program, async () => {
          let payload: RequestPayload
          if (options.payload == null) {
            if (options.connectorId == null) {
              throw new Error('--connector-id is required when -p/--payload is not provided')
            }
            if (options.status == null) {
              throw new Error('--status is required when -p/--payload is not provided')
            }
            // High-level: detect OCPP version and build correct payload
            const { config, ocppVersion, resolvedHashIds } = await resolveOcppVersionFromProgram(
              program,
              hashIds
            )
            switch (ocppVersion) {
              case OCPPVersion.VERSION_16:
                if (options.errorCode == null) {
                  throw new Error('--error-code is required for OCPP 1.6 stations')
                }
                payload = {
                  connectorId: options.connectorId,
                  errorCode: options.errorCode,
                  status: options.status,
                  ...buildHashIdsPayload(resolvedHashIds),
                }
                break
              case OCPPVersion.VERSION_20:
              case OCPPVersion.VERSION_201:
                payload = {
                  connectorId: options.connectorId,
                  connectorStatus: options.status,
                  ...(options.evseId != null && { evseId: options.evseId }),
                  ...buildHashIdsPayload(resolvedHashIds),
                }
                break
              default:
                throw new Error(UNSUPPORTED_OCPP_VERSION_ERROR)
            }
            await runAction(program, ProcedureName.STATUS_NOTIFICATION, payload, undefined, config)
          } else {
            // Low-level passthrough: -p provided, use only routing fields; raw payload has full control
            payload = buildHashIdsPayload(hashIds)
            await runAction(program, ProcedureName.STATUS_NOTIFICATION, payload, options.payload)
          }
        })
      }
    )

  const simpleOcppCommands: [string, string, ProcedureName][] = [
    [
      'boot-notification',
      'Request station(s) to send OCPP BootNotification',
      ProcedureName.BOOT_NOTIFICATION,
    ],
    [
      'diagnostics-status-notification',
      'Request station(s) to send OCPP DiagnosticsStatusNotification',
      ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION,
    ],
    [
      'firmware-status-notification',
      'Request station(s) to send OCPP FirmwareStatusNotification',
      ProcedureName.FIRMWARE_STATUS_NOTIFICATION,
    ],
    [
      'get-15118-ev-certificate',
      'Request station(s) to send OCPP Get15118EVCertificate',
      ProcedureName.GET_15118_EV_CERTIFICATE,
    ],
    [
      'get-certificate-status',
      'Request station(s) to send OCPP GetCertificateStatus',
      ProcedureName.GET_CERTIFICATE_STATUS,
    ],
    ['heartbeat', 'Request station(s) to send OCPP Heartbeat', ProcedureName.HEARTBEAT],
    [
      'log-status-notification',
      'Request station(s) to send OCPP LogStatusNotification',
      ProcedureName.LOG_STATUS_NOTIFICATION,
    ],
    [
      'notify-customer-information',
      'Request station(s) to send OCPP NotifyCustomerInformation',
      ProcedureName.NOTIFY_CUSTOMER_INFORMATION,
    ],
    ['notify-report', 'Request station(s) to send OCPP NotifyReport', ProcedureName.NOTIFY_REPORT],
    [
      'security-event-notification',
      'Request station(s) to send OCPP SecurityEventNotification',
      ProcedureName.SECURITY_EVENT_NOTIFICATION,
    ],
    [
      'sign-certificate',
      'Request station(s) to send OCPP SignCertificate',
      ProcedureName.SIGN_CERTIFICATE,
    ],
    [
      'transaction-event',
      'Request station(s) to send OCPP TransactionEvent',
      ProcedureName.TRANSACTION_EVENT,
    ],
  ]

  for (const [name, description, procedureName] of simpleOcppCommands) {
    cmd
      .command(`${name} [hashIds...]`)
      .description(description)
      .option(PAYLOAD_OPTION, PAYLOAD_DESC)
      .action(async (hashIds: string[], options: { payload?: string }) => {
        await runAction(program, procedureName, buildHashIdsPayload(hashIds), options.payload)
      })
  }

  return cmd
}
