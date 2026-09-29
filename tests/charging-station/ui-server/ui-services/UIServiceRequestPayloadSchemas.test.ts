/**
 * @file Tests for UI service request payload validation
 * @description Regression tests for the transport-independent payload gate in
 * `AbstractUIService.requestHandler`. The transports only guarantee the frame
 * shape, so every assertion here goes through the service dispatch point — the
 * same entry used by the WebSocket, HTTP and MCP transports.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { AbstractUIService } from '../../../../src/charging-station/ui-server/ui-services/AbstractUIService.js'
import type {
  ProcedureName as ProcedureNameType,
  ProtocolResponse,
  RequestPayload,
} from '../../../../src/types/index.js'

import { ProcedureName, ResponseStatus } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_HASH_ID, TEST_UUID } from '../UIServerTestConstants.js'
import { createProtocolRequest, createServiceContext } from '../UIServerTestUtils.js'

/**
 * Dispatch an untrusted payload the `RequestPayload` type cannot express.
 * @param service - UI service under test.
 * @param procedureName - Target procedure.
 * @param payload - Untrusted payload, bypassing `RequestPayload` typing.
 * @returns Protocol response, or `undefined` when the request is deferred.
 */
const dispatchUntrustedPayload = async (
  service: AbstractUIService,
  procedureName: ProcedureNameType,
  payload: unknown
): Promise<ProtocolResponse | undefined> =>
  await service.requestHandler([TEST_UUID, procedureName, payload as RequestPayload])

/**
 * Extract the error message of a rejection response, asserting every
 * intermediate invariant rather than returning early on it.
 * @param response - Protocol response returned by the dispatch.
 * @returns The reported error message.
 */
const failureErrorMessage = (response: ProtocolResponse | undefined): string => {
  assert.notStrictEqual(response, undefined, 'Expected a synchronous protocol response')
  if (response == null) {
    return assert.fail('Expected a synchronous protocol response')
  }
  const { errorMessage, status } = response[1]
  assert.strictEqual(status, ResponseStatus.FAILURE)
  assert.strictEqual(typeof errorMessage, 'string')
  return typeof errorMessage === 'string' ? errorMessage : assert.fail('Expected an error message')
}

/**
 * Assert that a dispatch was rejected before reaching the stations, and that it
 * described the expected violation.
 * @param response - Protocol response returned by the dispatch.
 * @param expectedViolation - Pattern the reported violation must match.
 */
const assertRejectedWith = (
  response: ProtocolResponse | undefined,
  expectedViolation: RegExp
): void => {
  assert.match(failureErrorMessage(response), expectedViolation)
}

await describe('UIServiceRequestPayloadSchemas', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should not broadcast to every station when hashIds is not an array', async () => {
    const { service } = createServiceContext(2)

    try {
      // A targeted request whose selector has the wrong type must fail, never
      // silently degrade into a broadcast over both registered stations.
      const response = await dispatchUntrustedPayload(
        service,
        ProcedureName.STOP_CHARGING_STATION,
        {
          hashIds: TEST_HASH_ID,
        }
      )

      assertRejectedWith(response, /hashIds: Invalid input: expected array/)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should target only the listed station when hashIds is a valid array', async () => {
    const { service } = createServiceContext(2)

    try {
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.STOP_CHARGING_STATION, {
          hashIds: [TEST_HASH_ID],
        })
      )

      // A broadcast is deferred: no synchronous response, and exactly the
      // explicitly targeted station is tracked as an expected responder.
      assert.strictEqual(response, undefined)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
    } finally {
      service.stop()
    }
  })

  await it('should reject a payload that is not an object', async () => {
    const { service } = createServiceContext(2)

    try {
      // The HTTP transport only JSON-parses the body, so a scalar or an array
      // reaches the service without ever being an object.
      for (const payload of [42, 'text', null, []]) {
        assertRejectedWith(
          await dispatchUntrustedPayload(service, ProcedureName.LIST_TEMPLATES, payload),
          /Invalid input: expected object/
        )
      }
    } finally {
      service.stop()
    }
  })

  await it('should reject a mistyped control field', async () => {
    const { service } = createServiceContext(2)

    try {
      const response = await dispatchUntrustedPayload(service, ProcedureName.LOCK_CONNECTOR, {
        connectorId: 'one',
        hashIds: [TEST_HASH_ID],
      })

      assertRejectedWith(response, /connectorId: Invalid input: expected number/)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should reject a missing required control field', async () => {
    const { service } = createServiceContext(2)

    try {
      const response = await dispatchUntrustedPayload(service, ProcedureName.CHANGE_CONFIGURATION, {
        hashIds: [TEST_HASH_ID],
        value: '120',
      })

      assertRejectedWith(response, /key: Invalid input: expected string/)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should reject a non-boolean deleteConfiguration instead of coercing it', async () => {
    const { service } = createServiceContext(2)

    try {
      // Previously forwarded to the worker as an unchecked `as boolean` cast,
      // where any truthy value deleted the persisted configuration.
      const response = await dispatchUntrustedPayload(
        service,
        ProcedureName.DELETE_CHARGING_STATIONS,
        {
          deleteConfiguration: 'no',
          hashIds: [TEST_HASH_ID],
        }
      )

      assertRejectedWith(response, /deleteConfiguration: Invalid input: expected boolean/)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should forward unlisted OCPP PDU fields untouched', async () => {
    const { service } = createServiceContext(2)

    try {
      // The OCPP layer owns PDU validation against the OCPP JSON schemas. The UI
      // payload gate must not reject, strip or rewrite those fields.
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.START_TRANSACTION, {
          connectorId: 1,
          hashIds: [TEST_HASH_ID],
          idTag: 'id-tag',
          meterStart: 1_700_000_000_000,
          ocppSequenceNumber: 7,
        })
      )

      assert.strictEqual(response, undefined)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
    } finally {
      service.stop()
    }
  })

  await it('should require a connector target for startTransaction', async () => {
    const { service } = createServiceContext(2)

    try {
      // `handleStartTransaction` requires connectorId; the gate must reject it
      // once instead of letting a per-station failure surface the omission.
      assertRejectedWith(
        await dispatchUntrustedPayload(service, ProcedureName.START_TRANSACTION, {
          hashIds: [TEST_HASH_ID],
        }),
        /connectorId/
      )
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should require a connector target for statusNotification', async () => {
    const { service } = createServiceContext(2)

    try {
      // `handleStatusNotification` requires connectorId for the same reason.
      assertRejectedWith(
        await dispatchUntrustedPayload(service, ProcedureName.STATUS_NOTIFICATION, {
          hashIds: [TEST_HASH_ID],
          status: 'Available',
        }),
        /connectorId/
      )
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should reject a non-URL supervision url like the MCP tool contract does', async () => {
    const { service } = createServiceContext(2)

    try {
      // The MCP schema has always required a real URL. Without the same rule
      // here, WebSocket and HTTP accepted values the tool contract rejects.
      assertRejectedWith(
        await dispatchUntrustedPayload(service, ProcedureName.SET_SUPERVISION_URL, {
          hashIds: [TEST_HASH_ID],
          url: 'not-a-url',
        }),
        /url/
      )
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should accept a websocket supervision url', async () => {
    const { service } = createServiceContext(2)

    try {
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.SET_SUPERVISION_URL, {
          hashIds: [TEST_HASH_ID],
          url: 'ws://localhost:9999/OCPP16',
        })
      )

      assert.strictEqual(response, undefined)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
    } finally {
      service.stop()
    }
  })

  await it('should require a transactionId for stopTransaction', async () => {
    const { service } = createServiceContext(2)

    try {
      // `handleStopTransaction` resolves the connector from the transaction, so
      // transactionId is the required field, not connectorId.
      assertRejectedWith(
        await dispatchUntrustedPayload(service, ProcedureName.STOP_TRANSACTION, {
          hashIds: [TEST_HASH_ID],
        }),
        /transactionId/
      )
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should keep reporting an unknown procedure as unimplemented', async () => {
    const { service } = createServiceContext(2)

    try {
      // Validation must not shadow the "not implemented" branch: an unknown
      // procedure has no schema to check against.
      const response = await dispatchUntrustedPayload(
        service,
        'UnknownProcedure' as ProcedureNameType,
        { hashIds: 'not-an-array' }
      )

      assertRejectedWith(response, /is not implemented/)
    } finally {
      service.stop()
    }
  })
  await it('should reject connector 0 where OCPP 1.6 mandates a strictly positive connector', async () => {
    const { service } = createServiceContext(2)

    try {
      // §6.45 (StartTransaction) and §6.53 (UnlockConnector) both declare
      // `connectorId > 0` with cardinality 1..1, so these two must refuse the
      // main controller pseudo-connector rather than let each station fail.
      for (const procedureName of [
        ProcedureName.START_TRANSACTION,
        ProcedureName.UNLOCK_CONNECTOR,
      ]) {
        assertRejectedWith(
          await dispatchUntrustedPayload(service, procedureName, {
            connectorId: 0,
            hashIds: [TEST_HASH_ID],
          }),
          /connectorId/
        )
      }
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should accept connector 0 for lockConnector, absent any specification bound', async () => {
    const { service } = createServiceContext(2)

    try {
      // LockConnector is an OCA addendum: it is absent from the OCPP 1.6 core
      // document and ships no JSON schema, so nothing mandates a positive bound.
      // `ChargingStation.lockConnector` handles 0 as a logged no-op, and the
      // gate must not narrow the accepted set beyond what the project already
      // accepted.
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.LOCK_CONNECTOR, {
          connectorId: 0,
          hashIds: [TEST_HASH_ID],
        })
      )

      assert.strictEqual(response, undefined)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
    } finally {
      service.stop()
    }
  })

  await it('should bound connectorIds only where the worker reads it', async () => {
    const { service } = createServiceContext(2)

    try {
      // `ChargingStationWorkerBroadcastChannel.cleanRequestPayload` strips
      // `connectorIds` from every command except the two automatic transaction
      // generator ones, so the gate must type it only there: bounding it
      // elsewhere would reject a payload the server already accepted and then
      // discarded.
      assertRejectedWith(
        await dispatchUntrustedPayload(
          service,
          ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
          {
            connectorIds: [0],
          }
        ),
        /connectorIds/
      )

      for (const procedureName of [ProcedureName.BOOT_NOTIFICATION, ProcedureName.HEARTBEAT]) {
        const response = await service.requestHandler(
          createProtocolRequest(TEST_UUID, procedureName, {
            connectorIds: [0],
            hashIds: [TEST_HASH_ID],
          })
        )

        assert.strictEqual(response, undefined)
      }
    } finally {
      service.stop()
    }
  })

  await it('should accept a colon-bearing supervision user in a station option', async () => {
    const { service } = createServiceContext(2)

    try {
      // `TemplateSchema` accepts any string and `openWSConnection` degrades a
      // colon-bearing user to a warning with the auth omitted. Bounding the
      // option more strictly than the template would make one configuration
      // value load from a file but be rejected over the API.
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.ADD_CHARGING_STATIONS, {
          numberOfStations: 1,
          options: { supervisionUser: 'dom:admin' },
          template: 'test.station-template',
        })
      )

      assert.notStrictEqual(response, undefined)
      if (response == null) return
      const [, responsePayload] = response
      const { errorMessage } = responsePayload
      if (typeof errorMessage !== 'string') {
        assert.fail('Expected a string errorMessage')
      }
      // The station does not exist in this context, so the request still
      // fails downstream; what matters is that it fails for that reason and
      // not on the colon rule.
      assert.doesNotMatch(
        errorMessage,
        /supervisionUser/,
        'the colon rule must not apply to a station option'
      )
    } finally {
      service.stop()
    }
  })

  await it('should accept the main controller pseudo-connector as a PDU connector', async () => {
    const { service } = createServiceContext(2)

    try {
      // OCPP 1.6 §6.47: connector 0 is the Charge Point main controller, a
      // first-class target for StatusNotification (and MeterValues).
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.STATUS_NOTIFICATION, {
          connectorId: 0,
          hashIds: [TEST_HASH_ID],
          status: 'Available',
        })
      )

      assert.strictEqual(response, undefined)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
    } finally {
      service.stop()
    }
  })

  await it('should reject a connector id that is neither positive nor integral', async () => {
    const { service } = createServiceContext(2)

    try {
      for (const connectorId of [-1, 1.5]) {
        assertRejectedWith(
          await dispatchUntrustedPayload(service, ProcedureName.STATUS_NOTIFICATION, {
            connectorId,
            hashIds: [TEST_HASH_ID],
            status: 'Available',
          }),
          /connectorId/
        )
      }
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should reject an empty configuration key', async () => {
    const { service } = createServiceContext(2)

    try {
      // An empty key names no configuration item; it must not be forwarded as
      // a valid target.
      assertRejectedWith(
        await dispatchUntrustedPayload(service, ProcedureName.CHANGE_CONFIGURATION, {
          hashIds: [TEST_HASH_ID],
          key: '',
          value: '120',
        }),
        /key/
      )
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should require an integer transactionId for stopTransaction', async () => {
    const { service } = createServiceContext(2)

    try {
      // OCPP 1.6 StopTransaction.req types transactionId as an integer, and
      // `handleStopTransaction` only dispatches to 1.6 stations.
      for (const transactionId of ['42', 4.2]) {
        assertRejectedWith(
          await dispatchUntrustedPayload(service, ProcedureName.STOP_TRANSACTION, {
            hashIds: [TEST_HASH_ID],
            transactionId,
          }),
          /transactionId/
        )
      }
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should reject a mistyped or out-of-range addChargingStations payload', async () => {
    const { service } = createServiceContext(2)

    try {
      // The gate now owns these checks, replacing the equivalent inline
      // validation removed from `handleAddChargingStations`.
      for (const payload of [
        { numberOfStations: 1, template: 42 },
        { numberOfStations: 0, template: 'template' },
        { numberOfStations: 1.5, template: 'template' },
      ]) {
        assertRejectedWith(
          await dispatchUntrustedPayload(service, ProcedureName.ADD_CHARGING_STATIONS, payload),
          /numberOfStations|template/
        )
      }
    } finally {
      service.stop()
    }
  })

  await it('should reject meter value containers that are not arrays', async () => {
    const { service } = createServiceContext(2)

    try {
      for (const meterValue of [{ sampledValue: [{ value: '1' }] }, { sampledValue: '1' }]) {
        assertRejectedWith(
          await dispatchUntrustedPayload(service, ProcedureName.METER_VALUES, {
            connectorId: 1,
            hashIds: [TEST_HASH_ID],
            meterValue,
          }),
          /meterValue/
        )
      }
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should accept a meterValues entry without sampledValue', async () => {
    const { service } = createServiceContext(2)

    try {
      // `sampledValue` is OPTIONAL at the gate, unlike its OCPP JSON schema:
      // the entry passes here and the worker rejects it per station
      // (`ChargingStationWorkerBroadcastChannel.handleMeterValues` throws
      // `meterValue.sampledValue must be an array` when the member is not an
      // array, including when it is absent). Requiring it here would change
      // the reported failure from a per-station one to a whole-request
      // rejection, and a request may also legitimately omit `meterValue` and
      // ask the station for its current values.
      const response = await dispatchUntrustedPayload(service, ProcedureName.METER_VALUES, {
        connectorId: 1,
        hashIds: [TEST_HASH_ID],
        meterValue: [{}],
      })

      assert.strictEqual(response, undefined)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
    } finally {
      service.stop()
    }
  })

  await it('should accept evseId zero on meterValues', async () => {
    const { service } = createServiceContext(2)

    try {
      // OCPP 2.0.1 MeterValuesRequest: evseId 0 designates the main power meter.
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.METER_VALUES, {
          evseId: 0,
          hashIds: [TEST_HASH_ID],
          meterValue: [{ sampledValue: [{ value: '1' }] }],
        })
      )

      assert.strictEqual(response, undefined)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
    } finally {
      service.stop()
    }
  })

  await it('should require a connector or EVSE target on meterValues', async () => {
    const { service } = createServiceContext(2)

    try {
      // `{ hashIds: [...] }` and `{}` used to pass the gate, then the worker
      // threw `Missing connectorId or evseId` once per station. OCPP 1.6
      // requires `connectorId` and OCPP 2.0.1 requires `evseId`, with no
      // common mandatory member, so the gate enforces their union.
      for (const payload of [{ hashIds: [TEST_HASH_ID] }, {}]) {
        assertRejectedWith(
          await dispatchUntrustedPayload(service, ProcedureName.METER_VALUES, payload),
          /at least one of "connectorId" or "evseId" is required/
        )
      }
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should accept each meterValues target form alone and target one station', async () => {
    const { service } = createServiceContext(2)

    try {
      for (const payload of [{ connectorId: 0 }, { connectorId: 1 }, { evseId: 1 }]) {
        const response = await service.requestHandler(
          createProtocolRequest(TEST_UUID, ProcedureName.METER_VALUES, {
            ...payload,
            hashIds: [TEST_HASH_ID],
            meterValue: [{ sampledValue: [{ value: '1' }] }],
          })
        )

        assert.strictEqual(response, undefined)
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
      }
    } finally {
      service.stop()
    }
  })

  await it('should accept a startTransaction payload without idTag', async () => {
    const { service } = createServiceContext(2)

    try {
      // `OCPP16RequestService` fills `idTag` with the default `00000000`, so the
      // produced PDU is valid without it. Requiring it here would additionally
      // break the shipped Web UI, which sends `{ connectorId }` alone.
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.START_TRANSACTION, {
          connectorId: 1,
          hashIds: [TEST_HASH_ID],
        })
      )

      assert.strictEqual(response, undefined)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
    } finally {
      service.stop()
    }
  })

  await it('should require a connector status on statusNotification', async () => {
    const { service } = createServiceContext(2)

    try {
      // Neither 1.6 `connectorStatus` nor 2.0.x `status` is present: the
      // `.refine` branch must reject instead of letting the station fail.
      assertRejectedWith(
        await dispatchUntrustedPayload(service, ProcedureName.STATUS_NOTIFICATION, {
          connectorId: 1,
          hashIds: [TEST_HASH_ID],
        }),
        /at least one of "connectorStatus" or "status" is required/
      )
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should accept statusNotification without errorCode and reject a mistyped one', async () => {
    const { service } = createServiceContext(2)

    try {
      // `errorCode` is mandatory in OCPP 1.6 §6.47 but absent from the OCPP
      // 2.0.1 request, and the gate is version-blind, so it stays optional.
      for (const payload of [
        { connectorId: 1, hashIds: [TEST_HASH_ID], status: 'Available' },
        { connectorId: 1, errorCode: 'NoError', hashIds: [TEST_HASH_ID], status: 'Available' },
      ]) {
        const response = await dispatchUntrustedPayload(
          service,
          ProcedureName.STATUS_NOTIFICATION,
          payload
        )

        assert.strictEqual(response, undefined)
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
      }
      assertRejectedWith(
        await dispatchUntrustedPayload(service, ProcedureName.STATUS_NOTIFICATION, {
          connectorId: 1,
          errorCode: 42,
          hashIds: [TEST_HASH_ID],
          status: 'Available',
        }),
        /errorCode/
      )
    } finally {
      service.stop()
    }
  })

  await it('should ignore a foreign evseId on stopTransaction instead of rejecting it', async () => {
    const { service } = createServiceContext(2)

    try {
      // The worker resolves the connector from the transaction and never reads
      // an EVSE identifier, so the field is neither required nor interpreted.
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.STOP_TRANSACTION, {
          evseId: 'foo',
          hashIds: [TEST_HASH_ID],
          transactionId: 1,
        })
      )

      assert.strictEqual(response, undefined)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
    } finally {
      service.stop()
    }
  })

  await it('should reject a supervision user containing a colon', async () => {
    const { service } = createServiceContext(2)

    try {
      // A colon would make the `user:password` credential of RFC 7617 ambiguous.
      assertRejectedWith(
        await dispatchUntrustedPayload(service, ProcedureName.SET_SUPERVISION_URL, {
          hashIds: [TEST_HASH_ID],
          supervisionUser: 'a:b',
          url: 'ws://localhost:1/',
        }),
        /supervisionUser: must not contain ":"/
      )
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should name every violated sub-field of a nested object', async () => {
    const { service } = createServiceContext(2)

    try {
      // Grouping by top-level field alone made `options` atomic: one entry was
      // rendered, twelve of the thirteen violations stayed invisible, and the
      // rendered path belonged to the first issue only.
      const response = await dispatchUntrustedPayload(
        service,
        ProcedureName.ADD_CHARGING_STATIONS,
        {
          numberOfStations: 1,
          options: {
            autoRegister: 'yes',
            autoStart: 'yes',
            baseName: 1,
            enableStatistics: 'yes',
            fixedName: 'yes',
            nameSuffix: 1,
            ocppStrictCompliance: 'yes',
            persistentConfiguration: 'yes',
            stopTransactionsOnStopped: 'yes',
            supervisionPassword: 1,
            supervisionUrls: 1,
            supervisionUser: 1,
          },
          template: 42,
        }
      )
      const message = failureErrorMessage(response)

      assert.match(message, /template: /)
      for (const subField of [
        'autoRegister',
        'autoStart',
        'baseName',
        'enableStatistics',
        'fixedName',
        'nameSuffix',
        'ocppStrictCompliance',
        'persistentConfiguration',
        'stopTransactionsOnStopped',
        'supervisionPassword',
        'supervisionUrls',
        'supervisionUser',
      ]) {
        assert.match(
          message,
          new RegExp(`options\\.${subField}: `),
          `Missing an entry naming options.${subField}`
        )
      }
      // One entry per violated field, so the report stays bounded by the
      // declared fields rather than by the number of issues.
      assert.strictEqual(message.split('; ').length, 13)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should render one entry per violated field path', async () => {
    const { service } = createServiceContext(2)

    try {
      // Two distinct violated paths must yield two entries, each carrying its
      // own path rather than the one of the first issue seen.
      const message = failureErrorMessage(
        await dispatchUntrustedPayload(service, ProcedureName.CHANGE_CONFIGURATION, {
          hashIds: [TEST_HASH_ID],
          key: '',
          value: 42,
        })
      )

      assert.match(message, /key: /)
      assert.match(message, /value: /)
      assert.strictEqual(message.split('; ').length, 2)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should bound the report when a station targeting array is entirely invalid', async () => {
    const { service } = createServiceContext(2)

    try {
      // 20 000 invalid hashIds emit 20 000 issue paths but a single field: the
      // report must stay one entry, not grow with the payload.
      const message = failureErrorMessage(
        await dispatchUntrustedPayload(service, ProcedureName.HEARTBEAT, {
          hashIds: new Array<unknown>(20000).fill(42),
        })
      )

      assert.match(message, /hashIds: /)
      assert.match(message, /\+19999 more issue\(s\)/)
    } finally {
      service.stop()
    }
  })
})
