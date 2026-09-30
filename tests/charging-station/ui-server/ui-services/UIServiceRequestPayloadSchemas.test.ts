/**
 * @file Tests for UI service request payload validation
 * @description Exercises the shared flat-payload gate through the service
 * dispatch point used by HTTP, WebSocket and MCP after transport validation.
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
 * Returns the rejection message, asserting a synchronous failure response.
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
 * Asserts a failure response describing the expected violation.
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
      // A truthy non-boolean must not authorize deleting persisted configuration.
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
      // OCPP 1.6 §6.45 and §6.53 require physical connector IDs (> 0).
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
      // The worker treats controller target 0 as a logged no-op; the flat gate
      // must preserve that accepted target.
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
      // Workers discard connectorIds outside ATG, so only ATG validates it.
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
      // Template-compatible options must not inherit the stricter URL-edit rule.
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
      // OCPP 1.6 §6.47 reserves connector 0 for the charge point main controller.
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
      // sampledValue remains a worker-level requirement, so its absence yields
      // a per-station failure rather than rejecting the entire broadcast.
      // Omitting meterValue itself requests the station's current values.
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
      // MeterValues requires connectorId in 1.6 or evseId in 2.0.1; this
      // version-blind gate requires at least one.
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
      // Neither the 1.6 status nor the 2.0.x connectorStatus is supplied.
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

  await it('should redact credentials from a rejected frozen supervision update without mutating it', async () => {
    // Arrange
    const { server, service } = createServiceContext()
    const hashIds = Object.freeze([TEST_HASH_ID])
    const diagnostic = Object.freeze({ source: 'operator' })
    const payload = Object.freeze({
      diagnostic,
      hashIds,
      supervisionPassword: 'synthetic-password-top',
      supervisionUser: 'synthetic:user-top',
      url: 'ws://localhost:1/',
    })

    try {
      // Act
      const response = await dispatchUntrustedPayload(
        service,
        ProcedureName.SET_SUPERVISION_URL,
        payload
      )

      // Assert
      assertRejectedWith(response, /supervisionUser:/)
      assert.ok(response)
      assert.strictEqual(response[0], TEST_UUID)
      assert.deepStrictEqual(response[1].requestPayload, { diagnostic, hashIds, url: payload.url })
      assert.deepStrictEqual(payload, {
        diagnostic: { source: 'operator' },
        hashIds: [TEST_HASH_ID],
        supervisionPassword: 'synthetic-password-top',
        supervisionUser: 'synthetic:user-top',
        url: 'ws://localhost:1/',
      })
      const serialized = JSON.stringify(response)
      assert.ok(!serialized.includes(payload.supervisionUser))
      assert.ok(!serialized.includes(payload.supervisionPassword))
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      server.stop()
    }
  })

  await it('should redact rejected station option credentials while preserving the original options', async () => {
    const { server, service } = createServiceContext()
    const payload = {
      numberOfStations: 0,
      options: {
        autoStart: true,
        diagnostic: { source: 'operator' },
        supervisionPassword: 'synthetic-password-options',
        supervisionUser: 'synthetic-user-options',
      },
      template: 'test.station-template',
    }

    try {
      const response = await dispatchUntrustedPayload(
        service,
        ProcedureName.ADD_CHARGING_STATIONS,
        payload
      )

      assertRejectedWith(response, /numberOfStations:/)
      assert.ok(response)
      assert.strictEqual(response[0], TEST_UUID)
      assert.deepStrictEqual(response[1].requestPayload, {
        numberOfStations: 0,
        options: { autoStart: true, diagnostic: { source: 'operator' } },
        template: 'test.station-template',
      })
      assert.deepStrictEqual(payload, {
        numberOfStations: 0,
        options: {
          autoStart: true,
          diagnostic: { source: 'operator' },
          supervisionPassword: 'synthetic-password-options',
          supervisionUser: 'synthetic-user-options',
        },
        template: 'test.station-template',
      })
      const serialized = JSON.stringify(response)
      assert.ok(!serialized.includes('synthetic-user-options'))
      assert.ok(!serialized.includes('synthetic-password-options'))
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      server.stop()
    }
  })

  await it('should preserve invalid option shapes while redacting malformed top-level credentials', async () => {
    for (const options of [null, 'invalid-options', ['invalid-options']]) {
      // Arrange
      const { server, service } = createServiceContext()
      const supervisionPassword = Object.freeze({ value: 'synthetic-password-object' })
      const supervisionUser = Object.freeze(['synthetic-user-array'])
      const payload = Object.freeze({
        numberOfStations: 0,
        options,
        supervisionPassword,
        supervisionUser,
      })

      try {
        // Act
        const response = await dispatchUntrustedPayload(
          service,
          ProcedureName.ADD_CHARGING_STATIONS,
          payload
        )

        // Assert
        assertRejectedWith(response, /options:/)
        assert.ok(response)
        assert.deepStrictEqual(response[1].requestPayload, { numberOfStations: 0, options })
        assert.deepStrictEqual(payload, {
          numberOfStations: 0,
          options,
          supervisionPassword: { value: 'synthetic-password-object' },
          supervisionUser: ['synthetic-user-array'],
        })
        const serialized = JSON.stringify(response)
        assert.ok(!serialized.includes('synthetic-password-object'))
        assert.ok(!serialized.includes('synthetic-user-array'))
      } finally {
        server.stop()
      }
    }
  })

  await it('should name every violated sub-field of a nested object', async () => {
    const { service } = createServiceContext(2)

    try {
      // Distinct nested fields must not collapse into a single options entry.
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
      // Large invalid arrays must not produce one report entry per element.
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
