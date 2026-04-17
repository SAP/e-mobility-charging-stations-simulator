import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { parseInteger, runAction } from './action.js'
import { buildHashIdsPayload, pickDefined } from './payload.js'

export const createOcppCommands = (program: Command): Command => {
  const cmd = new Command('ocpp').description('OCPP protocol commands')

  cmd
    .command('authorize [hashIds...]')
    .description('Send OCPP Authorize')
    .requiredOption('--id-tag <tag>', 'RFID tag for authorization')
    .action(async (hashIds: string[], options: { idTag: string }) => {
      const payload: RequestPayload = {
        idTag: options.idTag,
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.AUTHORIZE, payload)
    })

  cmd
    .command('data-transfer [hashIds...]')
    .description('Send OCPP DataTransfer')
    .option('--vendor-id <id>', 'vendor identifier')
    .option('--message-id <id>', 'message identifier')
    .option('--data <json>', 'data payload (JSON string)')
    .action(
      async (
        hashIds: string[],
        options: { data?: string; messageId?: string; vendorId?: string }
      ) => {
        const payload: RequestPayload = {
          ...pickDefined(options as Record<string, unknown>, {
            data: 'data',
            messageId: 'messageId',
            vendorId: 'vendorId',
          }),
          ...buildHashIdsPayload(hashIds),
        } as RequestPayload
        await runAction(program, ProcedureName.DATA_TRANSFER, payload)
      }
    )

  cmd
    .command('meter-values [hashIds...]')
    .description('Send OCPP MeterValues')
    .requiredOption('--connector-id <id>', 'connector ID', parseInteger)
    .action(async (hashIds: string[], options: { connectorId: number }) => {
      const payload: RequestPayload = {
        connectorId: options.connectorId,
        ...buildHashIdsPayload(hashIds),
      }
      await runAction(program, ProcedureName.METER_VALUES, payload)
    })

  cmd
    .command('status-notification [hashIds...]')
    .description('Send OCPP StatusNotification')
    .requiredOption('--connector-id <id>', 'connector ID', parseInteger)
    .requiredOption('--error-code <code>', 'connector error code')
    .requiredOption('--status <status>', 'connector status')
    .action(
      async (
        hashIds: string[],
        options: { connectorId: number; errorCode: string; status: string }
      ) => {
        const payload: RequestPayload = {
          connectorId: options.connectorId,
          errorCode: options.errorCode,
          status: options.status,
          ...buildHashIdsPayload(hashIds),
        }
        await runAction(program, ProcedureName.STATUS_NOTIFICATION, payload)
      }
    )

  const simpleOcppCommands: [string, string, ProcedureName][] = [
    ['boot-notification', 'Send OCPP BootNotification', ProcedureName.BOOT_NOTIFICATION],
    ['diagnostics-status-notification', 'Send OCPP DiagnosticsStatusNotification', ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION],
    ['firmware-status-notification', 'Send OCPP FirmwareStatusNotification', ProcedureName.FIRMWARE_STATUS_NOTIFICATION],
    ['get-15118-ev-certificate', 'Send OCPP Get15118EVCertificate', ProcedureName.GET_15118_EV_CERTIFICATE],
    ['get-certificate-status', 'Send OCPP GetCertificateStatus', ProcedureName.GET_CERTIFICATE_STATUS],
    ['heartbeat', 'Send OCPP Heartbeat', ProcedureName.HEARTBEAT],
    ['log-status-notification', 'Send OCPP LogStatusNotification', ProcedureName.LOG_STATUS_NOTIFICATION],
    ['notify-customer-information', 'Send OCPP NotifyCustomerInformation', ProcedureName.NOTIFY_CUSTOMER_INFORMATION],
    ['notify-report', 'Send OCPP NotifyReport', ProcedureName.NOTIFY_REPORT],
    ['security-event-notification', 'Send OCPP SecurityEventNotification', ProcedureName.SECURITY_EVENT_NOTIFICATION],
    ['sign-certificate', 'Send OCPP SignCertificate', ProcedureName.SIGN_CERTIFICATE],
    ['transaction-event', 'Send OCPP TransactionEvent', ProcedureName.TRANSACTION_EVENT],
  ]

  for (const [name, description, procedureName] of simpleOcppCommands) {
    cmd
      .command(`${name} [hashIds...]`)
      .description(description)
      .action(async (hashIds: string[]) => {
        await runAction(program, procedureName, buildHashIdsPayload(hashIds))
      })
  }

  return cmd
}
