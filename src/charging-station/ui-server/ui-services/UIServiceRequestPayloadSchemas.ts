/**
 * @file Canonical UI request payload schemas.
 * @description Single source of truth for the shape of a UI protocol request
 * payload, keyed by `ProcedureName`, enforced once in
 * `AbstractUIService.requestHandler` so the WebSocket, HTTP and MCP transports
 * share one contract.
 *
 * Scope of validation: the fields the UI server itself interprets — station
 * targeting (`hashIds`, `connectorIds`, `connectorId`, `evseId`) and the
 * per-procedure control fields. OCPP PDU fields are deliberately NOT validated
 * here: they are merged into the outgoing request payload untouched and belong
 * to the OCPP layer, which validates them against the OCPP JSON schemas (AJV,
 * gated by `ocppStrictCompliance`) at send time. Every schema is therefore a
 * loose object, so an unlisted PDU field passes through instead of being
 * stripped or rejected.
 *
 * Relationship with `mcp/MCPToolSchemas.ts`: the MCP tool schemas describe the
 * LLM-facing *tool envelope* (`{ ocpp16Payload, ocpp20Payload }` wrappers) and
 * are consumed by the MCP SDK. The schemas here describe the *flat* payload of
 * the UI protocol, shared by all three transports. Both consume the same field
 * schemas exported below, so a field cannot mean two things.
 */

import { z } from 'zod'

import { ProcedureName } from '../../../types/index.js'

/**
 * Station hash IDs targeting the request. An absent or empty array means
 * "every station" for broadcast procedures; `AbstractUIService` rejects an
 * explicitly empty array, since it means "targeted stations" that resolve to
 * none.
 */
export const hashIdsField = z
  .array(z.string())
  .optional()
  .describe('Target station hash IDs (omit for all stations)')

export const connectorIdsField = z
  .array(z.number().int().positive())
  .optional()
  .describe('Target connector IDs')

/**
 * Connector 0 is the shared-power pseudo-connector: it carries no cable lock
 * and hosts no transaction, so it is not a valid target.
 */
export const connectorIdField = z.number().int().positive().describe('Target connector ID')

export const evseIdField = z.number().int().positive().describe('Target EVSE ID')

/** Overrides applied to charging stations created by `ADD_CHARGING_STATIONS`. */
export const chargingStationOptionsSchema = z.object({
  autoRegister: z.boolean().optional().describe('Set stations as registered at boot notification'),
  autoStart: z.boolean().optional().describe('Enable automatic start of added charging station'),
  baseName: z
    .string()
    .optional()
    .describe('Override the template base name used to derive the charging station id'),
  enableStatistics: z.boolean().optional().describe('Enable charging station statistics'),
  fixedName: z
    .boolean()
    .optional()
    .describe('Use base name verbatim as charging station id instead of appending index/suffix'),
  nameSuffix: z
    .string()
    .optional()
    .describe(
      'Suffix appended to the derived charging station id (ignored when fixed name is true)'
    ),
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
  supervisionPassword: z
    .string()
    .optional()
    .describe('CSMS basic auth password used on the supervision WebSocket'),
  supervisionUrls: z
    .union([z.url(), z.array(z.url())])
    .optional()
    .describe('OCPP server supervision URL(s)'),
  supervisionUser: z
    .string()
    .regex(/^[^:]*$/, 'must not contain ":"')
    .optional()
    .describe('CSMS basic auth user used on the supervision WebSocket'),
})

/** Fields shared by every broadcast procedure. */
const broadcastFields = { connectorIds: connectorIdsField, hashIds: hashIdsField } as const

/**
 * A broadcast procedure whose payload carries only OCPP PDU fields on top of
 * the targeting fields. Nothing else is interpreted by the UI server.
 */
const ocppBroadcastSchema = z.looseObject(broadcastFields)

/** A procedure whose payload carries no field the UI server interprets. */
const broadcastSchema = z.looseObject(broadcastFields)

/**
 * Canonical UI request payload schema per procedure.
 *
 * Typed as a total `Record` over `ProcedureName`: adding a procedure to the
 * enum without declaring its payload shape is a compile-time error.
 */
export const uiServiceRequestPayloadSchemas: Readonly<Record<ProcedureName, z.ZodType>> = {
  [ProcedureName.ADD_CHARGING_STATIONS]: z.looseObject({
    numberOfStations: z.number().int().positive(),
    options: chargingStationOptionsSchema.optional(),
    template: z.string(),
  }),
  [ProcedureName.AUTHORIZE]: ocppBroadcastSchema,
  [ProcedureName.BOOT_NOTIFICATION]: ocppBroadcastSchema,
  [ProcedureName.CHANGE_CONFIGURATION]: z.looseObject({
    ...broadcastFields,
    key: z.string().min(1),
    value: z.string(),
  }),
  [ProcedureName.CLOSE_CONNECTION]: broadcastSchema,
  [ProcedureName.DATA_TRANSFER]: ocppBroadcastSchema,
  [ProcedureName.DELETE_CHARGING_STATIONS]: z.looseObject({
    ...broadcastFields,
    deleteConfiguration: z.boolean().optional(),
  }),
  [ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION]: ocppBroadcastSchema,
  [ProcedureName.FIRMWARE_STATUS_NOTIFICATION]: ocppBroadcastSchema,
  [ProcedureName.GET_15118_EV_CERTIFICATE]: ocppBroadcastSchema,
  [ProcedureName.GET_CERTIFICATE_STATUS]: ocppBroadcastSchema,
  [ProcedureName.HEARTBEAT]: broadcastSchema,
  [ProcedureName.LIST_CHARGING_STATIONS]: z.looseObject({}),
  [ProcedureName.LIST_TEMPLATES]: z.looseObject({}),
  [ProcedureName.LOCK_CONNECTOR]: z.looseObject({
    ...broadcastFields,
    connectorId: connectorIdField,
  }),
  [ProcedureName.LOG_STATUS_NOTIFICATION]: ocppBroadcastSchema,
  [ProcedureName.METER_VALUES]: z.looseObject({
    ...broadcastFields,
    connectorId: connectorIdField.optional(),
    evseId: evseIdField.optional(),
    meterValue: z.array(z.unknown()).optional(),
  }),
  [ProcedureName.NOTIFY_CUSTOMER_INFORMATION]: ocppBroadcastSchema,
  [ProcedureName.NOTIFY_REPORT]: ocppBroadcastSchema,
  [ProcedureName.OPEN_CONNECTION]: broadcastSchema,
  [ProcedureName.PERFORMANCE_STATISTICS]: z.looseObject({}),
  [ProcedureName.SECURITY_EVENT_NOTIFICATION]: ocppBroadcastSchema,
  [ProcedureName.SET_SUPERVISION_URL]: z.looseObject({
    ...broadcastFields,
    supervisionPassword: z.string().optional(),
    supervisionUser: z.string().optional(),
    url: z.string().min(1),
  }),
  [ProcedureName.SIGN_CERTIFICATE]: ocppBroadcastSchema,
  [ProcedureName.SIMULATOR_STATE]: z.looseObject({}),
  [ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR]: z.looseObject(broadcastFields),
  [ProcedureName.START_CHARGING_STATION]: broadcastSchema,
  [ProcedureName.START_SIMULATOR]: z.looseObject({}),
  [ProcedureName.START_TRANSACTION]: ocppBroadcastSchema,
  [ProcedureName.STATUS_NOTIFICATION]: ocppBroadcastSchema,
  [ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR]: z.looseObject(broadcastFields),
  [ProcedureName.STOP_CHARGING_STATION]: broadcastSchema,
  [ProcedureName.STOP_SIMULATOR]: z.looseObject({}),
  // OCPP 1.6 requires an integer transactionId; 2.0.x uses a string. The value
  // is forwarded to the OCPP layer unchanged, which owns that distinction.
  [ProcedureName.STOP_TRANSACTION]: z.looseObject({
    ...broadcastFields,
    connectorId: connectorIdField.optional(),
    evseId: evseIdField.optional(),
    transactionId: z.union([z.number().int(), z.string()]).optional(),
  }),
  [ProcedureName.TRANSACTION_EVENT]: ocppBroadcastSchema,
  [ProcedureName.UNLOCK_CONNECTOR]: z.looseObject({
    ...broadcastFields,
    connectorId: connectorIdField,
  }),
}

/**
 * Renders Zod issues as a single-line, log-safe description.
 * @param issues - Zod validation issues.
 * @returns Semicolon-separated `path: message` pairs.
 */
const formatIssues = (issues: readonly z.core.$ZodIssue[]): string =>
  issues
    .map(issue => {
      const path = issue.path.length === 0 ? '<root>' : issue.path.join('.')
      return `${path}: ${issue.message}`
    })
    .join('; ')

/**
 * Validates a UI protocol request payload against the canonical schema of its
 * procedure.
 *
 * Validation is a gate, not a transformation: the caller must dispatch the
 * original payload. Parsing would rebuild the object and drop `undefined`
 * members, which several handlers rely on to distinguish "absent" from
 * "present but empty".
 * @param procedureName - Procedure the payload is destined for.
 * @param requestPayload - Untrusted payload, as received from the transport.
 * @returns `undefined` when the payload is valid, otherwise a single-line
 * description of every violation.
 */
export const getRequestPayloadValidationError = (
  procedureName: ProcedureName,
  requestPayload: unknown
): string | undefined => {
  const result = uiServiceRequestPayloadSchemas[procedureName].safeParse(requestPayload)
  return result.success ? undefined : formatIssues(result.error.issues)
}
