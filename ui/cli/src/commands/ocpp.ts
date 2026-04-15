import { Command } from 'commander'
import { ProcedureName, type RequestPayload } from 'ui-common'

import { parseInteger, runAction } from './action.js'

export const createOcppCommands = (program: Command): Command => {
  const cmd = new Command('ocpp').description('OCPP protocol commands')

  cmd
    .command('authorize [hashIds...]')
    .description('Send OCPP Authorize')
    .requiredOption('--id-tag <tag>', 'RFID tag for authorization')
    .action(async (hashIds: string[], options: { idTag: string }) => {
      const payload: RequestPayload = {
        idTag: options.idTag,
        ...(hashIds.length > 0 && { hashIds }),
      }
      await runAction(program, ProcedureName.AUTHORIZE, payload)
    })

  cmd
    .command('boot-notification [hashIds...]')
    .description('Send OCPP BootNotification')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.BOOT_NOTIFICATION, payload)
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
          ...(options.vendorId != null && { vendorId: options.vendorId }),
          ...(options.messageId != null && { messageId: options.messageId }),
          ...(options.data != null && { data: options.data }),
          ...(hashIds.length > 0 && { hashIds }),
        }
        await runAction(program, ProcedureName.DATA_TRANSFER, payload)
      }
    )

  cmd
    .command('diagnostics-status-notification [hashIds...]')
    .description('Send OCPP DiagnosticsStatusNotification')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION, payload)
    })

  cmd
    .command('firmware-status-notification [hashIds...]')
    .description('Send OCPP FirmwareStatusNotification')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.FIRMWARE_STATUS_NOTIFICATION, payload)
    })

  cmd
    .command('get-15118-ev-certificate [hashIds...]')
    .description('Send OCPP Get15118EVCertificate')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.GET_15118_EV_CERTIFICATE, payload)
    })

  cmd
    .command('get-certificate-status [hashIds...]')
    .description('Send OCPP GetCertificateStatus')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.GET_CERTIFICATE_STATUS, payload)
    })

  cmd
    .command('heartbeat [hashIds...]')
    .description('Send OCPP Heartbeat')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.HEARTBEAT, payload)
    })

  cmd
    .command('log-status-notification [hashIds...]')
    .description('Send OCPP LogStatusNotification')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.LOG_STATUS_NOTIFICATION, payload)
    })

  cmd
    .command('meter-values [hashIds...]')
    .description('Send OCPP MeterValues')
    .requiredOption('--connector-id <id>', 'connector ID', parseInteger)
    .action(async (hashIds: string[], options: { connectorId: number }) => {
      const payload: RequestPayload = {
        connectorId: options.connectorId,
        ...(hashIds.length > 0 && { hashIds }),
      }
      await runAction(program, ProcedureName.METER_VALUES, payload)
    })

  cmd
    .command('notify-customer-information [hashIds...]')
    .description('Send OCPP NotifyCustomerInformation')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.NOTIFY_CUSTOMER_INFORMATION, payload)
    })

  cmd
    .command('notify-report [hashIds...]')
    .description('Send OCPP NotifyReport')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.NOTIFY_REPORT, payload)
    })

  cmd
    .command('security-event-notification [hashIds...]')
    .description('Send OCPP SecurityEventNotification')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.SECURITY_EVENT_NOTIFICATION, payload)
    })

  cmd
    .command('sign-certificate [hashIds...]')
    .description('Send OCPP SignCertificate')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.SIGN_CERTIFICATE, payload)
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
          ...(hashIds.length > 0 && { hashIds }),
        }
        await runAction(program, ProcedureName.STATUS_NOTIFICATION, payload)
      }
    )

  cmd
    .command('transaction-event [hashIds...]')
    .description('Send OCPP TransactionEvent')
    .action(async (hashIds: string[]) => {
      const payload: RequestPayload = hashIds.length > 0 ? { hashIds } : {}
      await runAction(program, ProcedureName.TRANSACTION_EVENT, payload)
    })

  return cmd
}
