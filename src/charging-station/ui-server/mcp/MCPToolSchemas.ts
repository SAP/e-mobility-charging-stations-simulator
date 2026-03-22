import { z } from 'zod'

import { ProcedureName } from '../../../types/index.js'

export interface MCPToolSchema {
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
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
      description: 'Send an Authorize request to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.BOOT_NOTIFICATION,
    {
      description: 'Send a BootNotification request to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
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
      description: 'Send a DataTransfer request to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
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
      description: 'Send a DiagnosticsStatusNotification to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.FIRMWARE_STATUS_NOTIFICATION,
    {
      description: 'Send a FirmwareStatusNotification to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.GET_15118_EV_CERTIFICATE,
    {
      description: 'Request an ISO 15118 EV certificate from the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.GET_CERTIFICATE_STATUS,
    {
      description: 'Get the certificate status from the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.HEARTBEAT,
    {
      description: 'Send a Heartbeat request to the OCPP server for charging stations',
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
    ProcedureName.LOG_STATUS_NOTIFICATION,
    {
      description: 'Send a LogStatusNotification to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.METER_VALUES,
    {
      description: 'Send MeterValues to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.NOTIFY_CUSTOMER_INFORMATION,
    {
      description:
        'Send a NotifyCustomerInformation message to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.NOTIFY_REPORT,
    {
      description: 'Send a NotifyReport message to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
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
      description: 'Send a SecurityEventNotification to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.SET_SUPERVISION_URL,
    {
      description: 'Set the OCPP server supervision URL for one or more charging stations',
      inputSchema: z.object({
        hashIds,
        supervisionUrl: z.url().describe('The OCPP server supervision URL to set'),
      }),
    },
  ],
  [
    ProcedureName.SIGN_CERTIFICATE,
    {
      description: 'Send a SignCertificate request to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
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
      description: 'Start a charging transaction on one or more charging stations',
      inputSchema: broadcastInputSchema,
    },
  ],
  [
    ProcedureName.STATUS_NOTIFICATION,
    {
      description: 'Send a StatusNotification to the OCPP server for charging stations',
      inputSchema: broadcastInputSchema,
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
      description: 'Stop a charging transaction on one or more charging stations',
      inputSchema: z.object({
        hashIds,
        transactionIds: z.array(z.string()).optional().describe('Transaction IDs to stop'),
      }),
    },
  ],
  [
    ProcedureName.TRANSACTION_EVENT,
    {
      description:
        'Send a TransactionEvent notification to the OCPP server for charging stations (OCPP 2.0.x)',
      inputSchema: broadcastInputSchema,
    },
  ],
])
