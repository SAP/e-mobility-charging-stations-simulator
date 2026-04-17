import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { parseInteger, runAction } from './action.js'
import { buildHashIdsPayload, PAYLOAD_DESC, PAYLOAD_OPTION, pickDefined } from './payload.js'

export const createOcppCommands = (program: Command): Command => {
  const cmd = new Command('ocpp').description('OCPP protocol commands')

  cmd
    .command('authorize [hashIds...]')
    .description('Request station(s) to send OCPP Authorize')
    .requiredOption('--id-tag <tag>', 'RFID tag for authorization')
    .option(PAYLOAD_OPTION, PAYLOAD_DESC)
    .action(async (hashIds: string[], options: { idTag: string; payload?: string }) => {
      const payload: RequestPayload = {
        idTag: options.idTag,
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.AUTHORIZE, payload, options.payload)
    })

  cmd
    .command('data-transfer [hashIds...]')
    .description('Request station(s) to send OCPP DataTransfer')
    .option('--vendor-id <id>', 'vendor identifier')
    .option('--message-id <id>', 'message identifier')
    .option('--data <json>', 'data payload (JSON string)')
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
    .requiredOption('--connector-id <id>', 'connector ID', parseInteger)
    .option(PAYLOAD_OPTION, PAYLOAD_DESC)
    .action(async (hashIds: string[], options: { connectorId: number; payload?: string }) => {
      const payload: RequestPayload = {
        connectorId: options.connectorId,
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.METER_VALUES, payload, options.payload)
    })

  cmd
    .command('status-notification [hashIds...]')
    .description('Request station(s) to send OCPP StatusNotification')
    .requiredOption('--connector-id <id>', 'connector ID', parseInteger)
    .requiredOption('--error-code <code>', 'connector error code')
    .requiredOption('--status <status>', 'connector status')
    .option(PAYLOAD_OPTION, PAYLOAD_DESC)
    .action(
      async (
        hashIds: string[],
        options: { connectorId: number; errorCode: string; payload?: string; status: string }
      ) => {
        const payload: RequestPayload = {
          connectorId: options.connectorId,
          errorCode: options.errorCode,
          status: options.status,
          ...buildHashIdsPayload(hashIds),
        }
        await runAction(program, ProcedureName.STATUS_NOTIFICATION, payload, options.payload)
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
