/**
 * @file Canonical UI request payload schemas.
 * @description Shared flat-payload gate for targeting and UI/worker control
 * fields, enforced by `AbstractUIService.requestHandler` before dispatch.
 *
 * The OCPP layer owns version-specific PDU validation. Unlisted PDU fields
 * pass through unchanged. MCP validates its envelope before flattening;
 * each layer declares its own required fields while sharing field types.
 */

import { z } from 'zod'

import { ProcedureName } from '../../../types/index.js'
import { isEmpty } from '../../../utils/index.js'

/**
 * Omit to broadcast. An explicit empty array targets no station and is rejected
 * by `AbstractUIService` rather than expanded into a broadcast.
 */
export const hashIdsField = z
  .array(z.string())
  .optional()
  .describe('Target station hash IDs (omit for all stations)')

/**
 * Allows station-level targets: OCPP 1.6 MeterValues uses 0 for the main power
 * meter (§6.31), and StatusNotification uses 0 for the main controller (§6.47).
 */
const connectorIdField = z
  .number()
  .int()
  .nonnegative()
  .describe('OCPP connector ID (0 designates the charge point main controller/meter)')

/**
 * OCPP PDU EVSE identifier, OCPP 2.0.x counterpart of {@link connectorIdField}.
 *
 * Physical EVSE IDs start at 1. For station reporting, EVSE ID 0 is reserved
 * for the main controller (OCPP 2.0.1 Part 1 §7.1). `MeterValuesRequest`
 * specifically uses 0 for the main power meter (Part 2 §1.32.1).
 * The shared UI field retains a non-negative bound; this does not establish
 * which zero targets are valid for every OCPP message.
 */
const evseIdField = z
  .number()
  .int()
  .nonnegative()
  .describe('OCPP EVSE ID (0: reporting main controller; MeterValues main power meter)')

/**
 * OCPP 1.6 StartTransaction (§6.45) and UnlockConnector (§6.53) require a positive
 * connector ID. Do not apply this bound to LockConnector: the simulator accepts
 * its controller target 0 as a logged no-op.
 */
export const physicalConnectorIdField = z
  .number()
  .int()
  .positive()
  .describe('Connector ID required to be > 0 by OCPP 1.6 §6.45 / §6.53')

/** Physical connector IDs, each subject to {@link physicalConnectorIdField}. */
export const connectorIdsField = z
  .array(physicalConnectorIdField)
  .optional()
  .describe('Target physical connector IDs')

/**
 * Validate URL syntax here; the supervision transport checks scheme support
 * at connection time. Avoid throwing refinements so malformed URLs remain
 * validation failures rather than exceptions.
 */
export const urlField = z.url()

/** Supervision URL(s) of a charging station, single or array form. */
const supervisionUrlsField = z.union([urlField, z.array(urlField)])

/**
 * Match template semantics: `openWSConnection` accepts a colon-bearing user
 * but omits authentication with a warning. The stricter `supervisionUserField`
 * would reject configurations accepted by templates.
 */
const supervisionUserOptionField = z
  .string()
  .describe('CSMS basic auth user used on the supervision WebSocket')

/**
 * Basic-auth user typed explicitly by an operator through
 * `SET_SUPERVISION_URL`. A colon would be ambiguous in the `user:password`
 * credential (RFC 7617) and is refused here rather than silently downgraded to
 * an unauthenticated connection.
 */
export const supervisionUserField = z
  .string()
  .regex(/^[^:]*$/, 'must not contain ":"')
  .describe('CSMS basic auth user used on the supervision WebSocket')

/** Basic-auth password for the supervision WebSocket. */
export const supervisionPasswordField = z
  .string()
  .describe('CSMS basic auth password used on the supervision WebSocket')

/**
 * Station overrides. Unknown keys are accepted but omitted from parsed output:
 * this gate retains the original payload, while the MCP SDK uses parsed output.
 */
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
  supervisionUser: supervisionUserOptionField.optional(),
})

/**
 * Only ATG procedures interpret `connectorIds`; other workers discard it.
 * Declaring it here would reject otherwise ignored values.
 */
const broadcastFields = { hashIds: hashIdsField } as const

/** Targeting fields of the two automatic transaction generator procedures. */
const atgTargetFields = { connectorIds: connectorIdsField, hashIds: hashIdsField } as const

/**
 * For procedures without additional UI control fields, validate only station
 * targeting and leave OCPP PDU fields to the protocol layer.
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
    connectorId: connectorIdField,
  }),
  [ProcedureName.LOG_STATUS_NOTIFICATION]: broadcastSchema,
  // Supplied meter values require sampled-value arrays; contents stay OCPP-owned.
  // The target is a union, not an intersection: OCPP 1.6 MeterValues requires
  // `connectorId` while OCPP 2.0.1 requires `evseId`, and the two enumerations
  // share no mandatory member, so no single field can be required here. The
  // rule below is the same condition `handleMeterValues` applies per station
  // (`ChargingStationWorkerBroadcastChannel` throws `Missing connectorId or
  // evseId`), so it rejects nothing the worker would have accepted: a payload
  // with neither now fails once at the gate instead of once per station.
  [ProcedureName.METER_VALUES]: z
    .looseObject({
      ...broadcastFields,
      connectorId: connectorIdField.optional(),
      evseId: evseIdField.optional(),
      meterValue: z.array(z.looseObject({ sampledValue: z.array(z.unknown()) })).optional(),
    })
    .refine(payload => payload.connectorId != null || payload.evseId != null, {
      message: 'at least one of "connectorId" or "evseId" is required',
      path: ['connectorId'],
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
  [ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR]: z.looseObject(atgTargetFields),
  [ProcedureName.START_CHARGING_STATION]: broadcastSchema,
  [ProcedureName.START_SIMULATOR]: z.looseObject({}),
  [ProcedureName.START_TRANSACTION]: z.looseObject({
    ...broadcastFields,
    connectorId: physicalConnectorIdField,
    idTag: z.string().optional(),
  }),
  // connectorId is shared by both versions; evseId belongs to OCPP 2.0.x and
  // remains optional at this version-blind gate.
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
  [ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR]: z.looseObject(atgTargetFields),
  [ProcedureName.STOP_CHARGING_STATION]: broadcastSchema,
  [ProcedureName.STOP_SIMULATOR]: z.looseObject({}),
  // The 1.6-only worker resolves the connector from transactionId, so connector
  // and EVSE identifiers are neither required nor interpreted here.
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
 * Renders a single `path -> message -> occurrence count` group.
 * @param path - Normalized dotted path the issues belong to.
 * @param messages - Distinct messages of the group, with their occurrence count.
 * @returns `path: message` for a lone issue, `path: message (+N more issue(s))`
 * for repeated occurrences of one message, `path: msg1 / msg2 (N issue(s))` for
 * several distinct messages.
 */
const renderIssueGroup = (path: string, messages: ReadonlyMap<string, number>): string => {
  // Groups are nonempty because they are created for an issue.
  const entries = [...messages]
  const [firstMessage, firstCount] = entries[0]
  if (messages.size === 1) {
    return firstCount > 1
      ? `${path}: ${firstMessage} (+${(firstCount - 1).toString()} more issue(s))`
      : `${path}: ${firstMessage}`
  }
  const occurrences = entries.reduce((sum, [, count]) => sum + count, 0)
  return `${path}: ${entries.map(([message]) => message).join(' / ')} (${occurrences.toString()} issue(s))`
}

/**
 * Groups issues by full field path, without array indices, to bound report
 * entries for large arrays while retaining distinct nested-field violations.
 * @param issues - Zod validation issues.
 * @returns Semicolon-separated groups (see {@link renderIssueGroup}), in
 * first-seen field order.
 */
const formatIssues = (issues: readonly z.core.$ZodIssue[]): string => {
  const groups = new Map<string, Map<string, number>>()
  for (const issue of issues) {
    const path = renderIssuePath(issue.path)
    const messages = groups.get(path) ?? new Map<string, number>()
    messages.set(issue.message, (messages.get(issue.message) ?? 0) + 1)
    groups.set(path, messages)
  }
  return [...groups].map(([path, messages]) => renderIssueGroup(path, messages)).join('; ')
}

/**
 * Validates the procedure payload without transforming it: handlers rely on
 * optional-field presence and unlisted PDU fields remaining unchanged.
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
