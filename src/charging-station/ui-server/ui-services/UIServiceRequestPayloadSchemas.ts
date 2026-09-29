/**
 * @file Canonical UI request payload schemas.
 * @description Single source of truth for the shape of a UI protocol request
 * payload, keyed by `ProcedureName`, enforced once in
 * `AbstractUIService.requestHandler` so the WebSocket, HTTP and MCP transports
 * share one contract.
 *
 * Scope of validation: the station targeting fields (`hashIds`, `connectorIds`,
 * `connectorId`, `evseId`) and the per-procedure control fields the UI server
 * itself interprets. The remaining OCPP PDU fields are deliberately NOT
 * validated here: they are merged into the outgoing request payload untouched
 * and belong to the OCPP layer, which validates them against the OCPP JSON
 * schemas (AJV, gated by `ocppStrictCompliance`) at send time. Every schema is
 * therefore a loose object, so an unlisted PDU field passes through instead of
 * being stripped or rejected. A field the UI server does interpret is declared
 * with a permissive-but-typed shape (e.g. `meterValue[].sampledValue` is
 * checked to be an array, its members stay unknown) so a mistyped container is
 * rejected once at the gate instead of failing per station.
 *
 * Relationship with `mcp/MCPToolSchemas.ts`: the MCP tool schemas describe the
 * LLM-facing *tool envelope* (`{ ocpp16Payload, ocpp20Payload }` wrappers) and
 * are consumed by the MCP SDK. `UIMCPServer` spreads the supplied OCPP payload
 * into the flat UI payload before the gate runs, so both transports see the same
 * flat fields. Both modules consume the same field schemas, so a field cannot
 * mean two things.
 */

import { z } from 'zod'

import { ProcedureName } from '../../../types/index.js'
import { isEmpty } from '../../../utils/index.js'

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

/**
 * OCPP PDU connector identifier, as used by the procedures whose OCPP message
 * requires it.
 *
 * Spec ambiguity, flagged for the next maintainer: OCPP 1.6 edition 2
 * declares FIELD TYPE `connectorId >= 0` but its DESCRIPTION reads "a number
 * (>0) ... '0' designates the main power meter", and
 * `docs/ocpp16/schemas/json/MeterValues.json` declares `{"type":"integer"}`
 * with no minimum. The code follows the prose and accepts 0.
 */
const connectorIdField = z
  .number()
  .int()
  .nonnegative()
  .describe('OCPP connector ID (0 designates the charge point main controller/meter)')

/**
 * OCPP PDU EVSE identifier, OCPP 2.0.x counterpart of {@link connectorIdField}.
 * Zero designates the main power meter, hence the non-negative bound.
 */
const evseIdField = z
  .number()
  .int()
  .nonnegative()
  .describe('OCPP EVSE ID (0 designates the main power meter)')

/**
 * Physical connector identifier: an actual cable outlet. Connector 0 is the
 * main controller / main meter pseudo-connector — it carries no cable lock and
 * hosts no transaction — so procedures addressing a physical connector
 * (`ChangeConfiguration` aside, `LockConnector`, `UnlockConnector`,
 * `StartTransaction`: OCPP 1.6 §6.45 `connectorId > 0`) must reject it.
 */
export const physicalConnectorIdField = z
  .number()
  .int()
  .positive()
  .describe('Physical connector ID (must be greater than zero)')

/** Physical connector IDs, each subject to {@link physicalConnectorIdField}. */
export const connectorIdsField = z
  .array(physicalConnectorIdField)
  .optional()
  .describe('Target physical connector IDs')

/**
 * OCPP WebSocket URL, as accepted by the supervision endpoints.
 */
export const urlField = z.url()

/** Supervision URL(s) of a charging station, single or array form. */
const supervisionUrlsField = z.union([urlField, z.array(urlField)])

/**
 * Basic-auth user for the supervision WebSocket. A colon would be ambiguous in
 * the `user:password` credential (RFC 7617) and is refused, the same rule the
 * UI server applies to its own authentication username.
 */
export const supervisionUserField = z
  .string()
  .regex(/^[^:]*$/, 'must not contain ":"')
  .describe('CSMS basic auth user used on the supervision WebSocket')

/** Basic-auth password for the supervision WebSocket. */
export const supervisionPasswordField = z
  .string()
  .describe('CSMS basic auth password used on the supervision WebSocket')

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
  supervisionPassword: supervisionPasswordField.optional(),
  supervisionUrls: supervisionUrlsField.optional().describe('OCPP server supervision URL(s)'),
  supervisionUser: supervisionUserField.optional(),
})

/** Fields shared by every broadcast procedure. */
const broadcastFields = { connectorIds: connectorIdsField, hashIds: hashIdsField } as const

/**
 * Every broadcast procedure shares this shape: only the station targeting
 * fields are interpreted by the UI server, whatever OCPP PDU fields the caller
 * adds. A single schema serves both the OCPP-carrying procedures
 * (`AUTHORIZE`, `BOOT_NOTIFICATION`, ...) and the transport-only ones
 * (`CLOSE_CONNECTION`, `HEARTBEAT`, `OPEN_CONNECTION`, `START_CHARGING_STATION`,
 * `STOP_CHARGING_STATION`): the loose object makes the distinction a naming
 * concern, not a behavioral one.
 */
const broadcastSchema = z.looseObject(broadcastFields)

/**
 * Canonical UI request payload schema per procedure.
 *
 * Typed as a total `Record` over `ProcedureName`: adding a procedure to the
 * enum without declaring its payload shape is a compile-time error.
 */
const uiServiceRequestPayloadSchemas: Readonly<Record<ProcedureName, z.ZodType>> = {
  [ProcedureName.ADD_CHARGING_STATIONS]: z.looseObject({
    numberOfStations: z.number().int().positive(),
    options: chargingStationOptionsSchema.optional(),
    template: z.string(),
  }),
  [ProcedureName.AUTHORIZE]: broadcastSchema,
  [ProcedureName.BOOT_NOTIFICATION]: broadcastSchema,
  [ProcedureName.CHANGE_CONFIGURATION]: z.looseObject({
    ...broadcastFields,
    key: z.string().min(1),
    value: z.string(),
  }),
  [ProcedureName.CLOSE_CONNECTION]: broadcastSchema,
  [ProcedureName.DATA_TRANSFER]: broadcastSchema,
  [ProcedureName.DELETE_CHARGING_STATIONS]: z.looseObject({
    ...broadcastFields,
    deleteConfiguration: z.boolean().optional(),
  }),
  [ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION]: broadcastSchema,
  [ProcedureName.FIRMWARE_STATUS_NOTIFICATION]: broadcastSchema,
  [ProcedureName.GET_15118_EV_CERTIFICATE]: broadcastSchema,
  [ProcedureName.GET_CERTIFICATE_STATUS]: broadcastSchema,
  [ProcedureName.HEARTBEAT]: broadcastSchema,
  [ProcedureName.LIST_CHARGING_STATIONS]: z.looseObject({}),
  [ProcedureName.LIST_TEMPLATES]: z.looseObject({}),
  [ProcedureName.LOCK_CONNECTOR]: z.looseObject({
    ...broadcastFields,
    connectorId: physicalConnectorIdField,
  }),
  [ProcedureName.LOG_STATUS_NOTIFICATION]: broadcastSchema,
  // `meterValue` and its `sampledValue` entries are forwarded to the OCPP layer;
  // only their container types are checked, so a scalar instead of a list is
  // rejected once at the gate rather than per station.
  [ProcedureName.METER_VALUES]: z.looseObject({
    ...broadcastFields,
    connectorId: connectorIdField.optional(),
    evseId: evseIdField.optional(),
    meterValue: z
      .array(z.looseObject({ sampledValue: z.array(z.unknown()).optional() }))
      .optional(),
  }),
  [ProcedureName.NOTIFY_CUSTOMER_INFORMATION]: broadcastSchema,
  [ProcedureName.NOTIFY_REPORT]: broadcastSchema,
  [ProcedureName.OPEN_CONNECTION]: broadcastSchema,
  [ProcedureName.PERFORMANCE_STATISTICS]: z.looseObject({}),
  [ProcedureName.SECURITY_EVENT_NOTIFICATION]: broadcastSchema,
  [ProcedureName.SET_SUPERVISION_URL]: z.looseObject({
    ...broadcastFields,
    supervisionPassword: supervisionPasswordField.optional(),
    supervisionUser: supervisionUserField.optional(),
    url: urlField,
  }),
  [ProcedureName.SIGN_CERTIFICATE]: broadcastSchema,
  [ProcedureName.SIMULATOR_STATE]: z.looseObject({}),
  [ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR]: z.looseObject(broadcastFields),
  [ProcedureName.START_CHARGING_STATION]: broadcastSchema,
  [ProcedureName.START_SIMULATOR]: z.looseObject({}),
  [ProcedureName.START_TRANSACTION]: z.looseObject({
    ...broadcastFields,
    connectorId: physicalConnectorIdField,
    idTag: z.string().optional(),
  }),
  // `evseId` is the EVSE identifier introduced by OCPP 2.0.x; `connectorId`
  // stays required in both versions. The gate is version-blind because
  // `UIMCPServer` spreads a single flat PDU, so the shared 1.6/2.0.x member is
  // enforced and the version-specific one is merely passed through.
  [ProcedureName.STATUS_NOTIFICATION]: z
    .looseObject({
      ...broadcastFields,
      connectorId: connectorIdField,
      connectorStatus: z.string().optional(),
      // OCPP 1.6 §6.47 requires `errorCode`, OCPP 2.0.1
      // `StatusNotificationRequest.json` does not: the gate is version-blind,
      // so it must stay optional or a valid 2.0.x client would be rejected.
      errorCode: z.string().optional(),
      evseId: evseIdField.optional(),
      status: z.string().optional(),
    })
    .refine(payload => payload.connectorStatus != null || payload.status != null, {
      message: 'at least one of "connectorStatus" or "status" is required',
      path: [],
    }),
  [ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR]: z.looseObject(broadcastFields),
  [ProcedureName.STOP_CHARGING_STATION]: broadcastSchema,
  [ProcedureName.STOP_SIMULATOR]: z.looseObject({}),
  // OCPP 1.6 `StopTransaction.req` requires an integer transactionId, and
  // `handleStopTransaction` only ever dispatches to 1.6 stations. The connector
  // is resolved from the transaction, so neither a connector nor an EVSE
  // identifier is a request field: the worker never reads one and an unlisted
  // PDU field merely passes through this loose object.
  [ProcedureName.STOP_TRANSACTION]: z.looseObject({
    ...broadcastFields,
    transactionId: z.number().int(),
  }),
  [ProcedureName.TRANSACTION_EVENT]: broadcastSchema,
  [ProcedureName.UNLOCK_CONNECTOR]: z.looseObject({
    ...broadcastFields,
    connectorId: physicalConnectorIdField,
  }),
}

/**
 * Renders a Zod issue path as a log-safe dotted path, dropping array indices:
 * `['hashIds', 3]` renders as `hashIds`, a path made of indices only as `[]`.
 * @param issuePath - Zod issue path segments.
 * @returns `<root>` for an empty path, otherwise the normalized dotted path.
 */
const renderIssuePath = (issuePath: readonly PropertyKey[]): string => {
  if (isEmpty(issuePath)) {
    return '<root>'
  }
  const properties = issuePath.filter(segment => typeof segment !== 'number')
  return isEmpty(properties) ? '[]' : properties.map(segment => segment.toString()).join('.')
}

/**
 * Renders Zod issues as a single-line, log-safe description, grouped by
 * top-level field.
 *
 * Grouping by the first path segment keeps the report bounded whatever the
 * number of issues: the schemas are not recursive, so a payload yields at most
 * one group per top-level field, each rendering the full path and message of
 * its first violation plus a count of the others. A flat list truncated at a
 * fixed number of issues instead hides whole fields, since an invalid array of
 * 60 000 entries emits 60 000 paths and starves every field declared after it.
 * @param issues - Zod validation issues.
 * @returns Semicolon-separated `path: message (+N more issue(s))` groups, in
 * first-seen field order.
 */
const formatIssues = (issues: readonly z.core.$ZodIssue[]): string => {
  const groups = new Map<string, { count: number; message: string; path: string }>()
  for (const issue of issues) {
    // An empty path (`.refine` on the root) has no first segment, hence the
    // `<root>` group.
    const field = renderIssuePath(issue.path.slice(0, 1))
    const group = groups.get(field)
    if (group) {
      group.count++
    } else {
      groups.set(field, { count: 1, message: issue.message, path: renderIssuePath(issue.path) })
    }
  }
  return [...groups.values()]
    .map(({ count, message, path }) =>
      count > 1
        ? `${path}: ${message} (+${(count - 1).toString()} more issue(s))`
        : `${path}: ${message}`
    )
    .join('; ')
}

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
