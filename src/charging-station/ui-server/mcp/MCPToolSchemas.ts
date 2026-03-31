import { z } from 'zod'

import { ProcedureName } from '../../../types/index.js'

export interface MCPToolSchema {
  description: string
  inputSchema: z.ZodObject
}

const hashIds = z
  .array(z.string())
  .optional()
  .describe('Target station hash IDs (omit for all stations)')

const connectorIds = z
  .array(z.number().int().positive())
  .optional()
  .describe('Target connector IDs')

const broadcastInputSchema = z.object({
  connectorIds,
  hashIds,
})

const connectorInputSchema = z.object({
  connectorId: z.number().int().positive().describe('Target connector ID'),
  hashIds,
})

const emptyInputSchema = z.object({})

const chargingStationOptionsSchema = z.object({
  autoRegister: z.boolean().optional().describe('Set stations as registered at boot notification'),
  autoStart: z.boolean().optional().describe('Enable automatic start of added charging station'),
  enableStatistics: z.boolean().optional().describe('Enable charging station statistics'),
  ocppStrictCompliance: z
    .boolean()
    .optional()
    .describe('Enable strict OCPP specifications adherence'),
  persistentConfiguration: z
    .boolean()
    .optional()
    .describe('Enable persistent OCPP parameters storage'),
  stopTransactionsOnStopped: z
    .boolean()
    .optional()
    .describe('Enable stop transactions on station stop'),
  supervisionUrls: z
    .union([z.url(), z.array(z.url())])
    .optional()
    .describe('OCPP server supervision URL(s)'),
})

/** Maps ProcedureName to OCPP JSON Schema file base names per version */
export const ocppSchemaMapping = new Map<ProcedureName, { ocpp16?: string; ocpp20?: string }>([
  [ProcedureName.AUTHORIZE, { ocpp16: 'Authorize', ocpp20: 'AuthorizeRequest' }],
  [
    ProcedureName.BOOT_NOTIFICATION,
    { ocpp16: 'BootNotification', ocpp20: 'BootNotificationRequest' },
  ],
  [ProcedureName.DATA_TRANSFER, { ocpp16: 'DataTransfer', ocpp20: 'DataTransferRequest' }],
  [ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION, { ocpp16: 'DiagnosticsStatusNotification' }],
  [
    ProcedureName.FIRMWARE_STATUS_NOTIFICATION,
    { ocpp16: 'FirmwareStatusNotification', ocpp20: 'FirmwareStatusNotificationRequest' },
  ],
  [ProcedureName.GET_15118_EV_CERTIFICATE, { ocpp20: 'Get15118EVCertificateRequest' }],
  [ProcedureName.GET_CERTIFICATE_STATUS, { ocpp20: 'GetCertificateStatusRequest' }],
  [ProcedureName.LOG_STATUS_NOTIFICATION, { ocpp20: 'LogStatusNotificationRequest' }],
  [ProcedureName.METER_VALUES, { ocpp16: 'MeterValues', ocpp20: 'MeterValuesRequest' }],
  [ProcedureName.NOTIFY_CUSTOMER_INFORMATION, { ocpp20: 'NotifyCustomerInformationRequest' }],
  [ProcedureName.NOTIFY_REPORT, { ocpp20: 'NotifyReportRequest' }],
  [ProcedureName.SECURITY_EVENT_NOTIFICATION, { ocpp20: 'SecurityEventNotificationRequest' }],
  [ProcedureName.SIGN_CERTIFICATE, { ocpp20: 'SignCertificateRequest' }],
  [ProcedureName.START_TRANSACTION, { ocpp16: 'StartTransaction' }],
  [
    ProcedureName.STATUS_NOTIFICATION,
    { ocpp16: 'StatusNotification', ocpp20: 'StatusNotificationRequest' },
  ],
  [ProcedureName.STOP_TRANSACTION, { ocpp16: 'StopTransaction' }],
  [ProcedureName.TRANSACTION_EVENT, { ocpp20: 'TransactionEventRequest' }],
])

const ocpp16PayloadField = z
  .record(z.string(), z.unknown())
  .optional()
  .describe('OCPP 1.6 request payload')

const ocpp20PayloadField = z
  .record(z.string(), z.unknown())
  .optional()
  .describe('OCPP 2.0.1 request payload')

const buildOcppInputSchema = (mapping: {
  ocpp16?: string
  ocpp20?: string
}): z.ZodObject => {
  const fields: Record<string, z.ZodType> = { connectorIds, hashIds }
  if (mapping.ocpp16 != null) {
    fields.ocpp16Payload = ocpp16PayloadField
  }
  if (mapping.ocpp20 != null) {
    fields.ocpp20Payload = ocpp20PayloadField
  }
  return z.object(fields)
}

const buildVersionAffinity = (mapping: { ocpp16?: string; ocpp20?: string }): string => {
  if (mapping.ocpp16 != null && mapping.ocpp20 != null) return '(OCPP 1.6 & 2.0.x)'
  if (mapping.ocpp16 != null) return '(OCPP 1.6 only)'
  return '(OCPP 2.0.x only)'
}

const getMapping = (name: ProcedureName): { ocpp16?: string; ocpp20?: string } =>
  ocppSchemaMapping.get(name) ?? {}

const ocppDescription = (base: string, name: ProcedureName): string => {
  const mapping = getMapping(name)
  const affinity = buildVersionAffinity(mapping)
  const hint =
    mapping.ocpp16 != null && mapping.ocpp20 != null
      ? '. Provide ocpp16Payload for 1.6 stations, ocpp20Payload for 2.0 stations.'
      : ''
  return `${base} ${affinity}${hint}`
}

const ocppInputSchema = (name: ProcedureName): z.ZodObject =>
  buildOcppInputSchema(getMapping(name))

export const mcpToolSchemas = new Map<ProcedureName, MCPToolSchema>([
  [
    ProcedureName.ADD_CHARGING_STATIONS,
    {
      description: 'Add new charging stations from a configuration template',
      inputSchema: z.object({
        numberOfStations: z
          .number()
          .int()
          .positive()
          .describe('Number of charging stations to add'),
        options: chargingStationOptionsSchema
          .optional()
          .describe('Configuration overrides for the new stations'),
        template: z.string().describe('Name of the charging station template to use'),
      }),
    },
  ],
  [
    ProcedureName.AUTHORIZE,
    {
      description: ocppDescription('Send an Authorize request', ProcedureName.AUTHORIZE),
      inputSchema: ocppInputSchema(ProcedureName.AUTHORIZE),
    },
  ],
  [
    ProcedureName.BOOT_NOTIFICATION,
    {
      description: ocppDescription(
        'Send a BootNotification request',
        ProcedureName.BOOT_NOTIFICATION
      ),
      inputSchema: ocppInputSchema(ProcedureName.BOOT_NOTIFICATION),
    },
  ],
  [
    ProcedureName.CLOSE_CONNECTION,
    {
      description:
        'Close the WebSocket connection to the OCPP server for one or more charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.DATA_TRANSFER,
    {
      description: ocppDescription('Send a DataTransfer request', ProcedureName.DATA_TRANSFER),
      inputSchema: ocppInputSchema(ProcedureName.DATA_TRANSFER),
    },
  ],
  [
    ProcedureName.DELETE_CHARGING_STATIONS,
    {
      description: 'Delete one or more charging stations from the simulator',
      inputSchema: z.object({
        deleteConfiguration: z
          .boolean()
          .optional()
          .describe('Whether to delete persistent configuration files'),
        hashIds,
      }),
    },
  ],
  [
    ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION,
    {
      description: ocppDescription(
        'Send a DiagnosticsStatusNotification',
        ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION
      ),
      inputSchema: ocppInputSchema(ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION),
    },
  ],
  [
    ProcedureName.FIRMWARE_STATUS_NOTIFICATION,
    {
      description: ocppDescription(
        'Send a FirmwareStatusNotification',
        ProcedureName.FIRMWARE_STATUS_NOTIFICATION
      ),
      inputSchema: ocppInputSchema(ProcedureName.FIRMWARE_STATUS_NOTIFICATION),
    },
  ],
  [
    ProcedureName.GET_15118_EV_CERTIFICATE,
    {
      description: ocppDescription(
        'Request an ISO 15118 EV certificate',
        ProcedureName.GET_15118_EV_CERTIFICATE
      ),
      inputSchema: ocppInputSchema(ProcedureName.GET_15118_EV_CERTIFICATE),
    },
  ],
  [
    ProcedureName.GET_CERTIFICATE_STATUS,
    {
      description: ocppDescription(
        'Get the certificate status',
        ProcedureName.GET_CERTIFICATE_STATUS
      ),
      inputSchema: ocppInputSchema(ProcedureName.GET_CERTIFICATE_STATUS),
    },
  ],
  [
    ProcedureName.HEARTBEAT,
    {
      description: 'Send a Heartbeat request (OCPP 1.6 & 2.0.x)',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.LIST_CHARGING_STATIONS,
    {
      description: 'List all charging stations with their current data and connection status',
      inputSchema: emptyInputSchema,
    },
  ],
  [
    ProcedureName.LIST_TEMPLATES,
    {
      description: 'List available charging station configuration templates',
      inputSchema: emptyInputSchema,
    },
  ],
  [
    ProcedureName.LOCK_CONNECTOR,
    {
      description: 'Engage the cable retention lock on a connector',
      inputSchema: connectorInputSchema,
    },
  ],
  [
    ProcedureName.LOG_STATUS_NOTIFICATION,
    {
      description: ocppDescription(
        'Send a LogStatusNotification',
        ProcedureName.LOG_STATUS_NOTIFICATION
      ),
      inputSchema: ocppInputSchema(ProcedureName.LOG_STATUS_NOTIFICATION),
    },
  ],
  [
    ProcedureName.METER_VALUES,
    {
      description: ocppDescription('Send MeterValues', ProcedureName.METER_VALUES),
      inputSchema: ocppInputSchema(ProcedureName.METER_VALUES),
    },
  ],
  [
    ProcedureName.NOTIFY_CUSTOMER_INFORMATION,
    {
      description: ocppDescription(
        'Send a NotifyCustomerInformation',
        ProcedureName.NOTIFY_CUSTOMER_INFORMATION
      ),
      inputSchema: ocppInputSchema(ProcedureName.NOTIFY_CUSTOMER_INFORMATION),
    },
  ],
  [
    ProcedureName.NOTIFY_REPORT,
    {
      description: ocppDescription('Send a NotifyReport', ProcedureName.NOTIFY_REPORT),
      inputSchema: ocppInputSchema(ProcedureName.NOTIFY_REPORT),
    },
  ],
  [
    ProcedureName.OPEN_CONNECTION,
    {
      description:
        'Open the WebSocket connection to the OCPP server for one or more charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.PERFORMANCE_STATISTICS,
    {
      description:
        'Get performance statistics of the charging stations simulator when storage is enabled',
      inputSchema: emptyInputSchema,
    },
  ],
  [
    ProcedureName.SECURITY_EVENT_NOTIFICATION,
    {
      description: ocppDescription(
        'Send a SecurityEventNotification',
        ProcedureName.SECURITY_EVENT_NOTIFICATION
      ),
      inputSchema: ocppInputSchema(ProcedureName.SECURITY_EVENT_NOTIFICATION),
    },
  ],
  [
    ProcedureName.SET_SUPERVISION_URL,
    {
      description: 'Set the OCPP server supervision URL for one or more charging stations',
      inputSchema: z.object({
        hashIds,
        url: z.url().describe('The OCPP server supervision URL to set'),
      }),
    },
  ],
  [
    ProcedureName.SIGN_CERTIFICATE,
    {
      description: ocppDescription(
        'Send a SignCertificate request',
        ProcedureName.SIGN_CERTIFICATE
      ),
      inputSchema: ocppInputSchema(ProcedureName.SIGN_CERTIFICATE),
    },
  ],
  [
    ProcedureName.SIMULATOR_STATE,
    {
      description:
        'Get the current state of the simulator including version, configuration, started status, and template statistics',
      inputSchema: emptyInputSchema,
    },
  ],
  [
    ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
    {
      description: 'Start the automatic transaction generator on one or more charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.START_CHARGING_STATION,
    {
      description: 'Start one or more charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.START_SIMULATOR,
    {
      description: 'Start the charging stations simulator',
      inputSchema: emptyInputSchema,
    },
  ],
  [
    ProcedureName.START_TRANSACTION,
    {
      description: ocppDescription('Start a charging transaction', ProcedureName.START_TRANSACTION),
      inputSchema: ocppInputSchema(ProcedureName.START_TRANSACTION),
    },
  ],
  [
    ProcedureName.STATUS_NOTIFICATION,
    {
      description: ocppDescription('Send a StatusNotification', ProcedureName.STATUS_NOTIFICATION),
      inputSchema: ocppInputSchema(ProcedureName.STATUS_NOTIFICATION),
    },
  ],
  [
    ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
    {
      description: 'Stop the automatic transaction generator on one or more charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.STOP_CHARGING_STATION,
    {
      description: 'Stop one or more charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.STOP_SIMULATOR,
    {
      description: 'Stop the charging stations simulator',
      inputSchema: emptyInputSchema,
    },
  ],
  [
    ProcedureName.STOP_TRANSACTION,
    {
      description: ocppDescription('Stop a charging transaction', ProcedureName.STOP_TRANSACTION),
      inputSchema: z.object({
        hashIds,
        ocpp16Payload: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('OCPP 1.6 StopTransaction payload'),
        transactionId: z.number().int().optional().describe('Transaction ID to stop'),
      }),
    },
  ],
  [
    ProcedureName.TRANSACTION_EVENT,
    {
      description: ocppDescription('Send a TransactionEvent', ProcedureName.TRANSACTION_EVENT),
      inputSchema: ocppInputSchema(ProcedureName.TRANSACTION_EVENT),
    },
  ],
  [
    ProcedureName.UNLOCK_CONNECTOR,
    {
      description: 'Release the cable retention lock on a connector',
      inputSchema: connectorInputSchema,
    },
  ],
])
