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
  await it('should reject the main controller pseudo-connector for a physical connector target', async () => {
    const { service } = createServiceContext(2)

    try {
      // Connector 0 is not an outlet: `ChargingStation.lockConnector` treats it
      // as a no-op and `StartTransaction` requires connectorId > 0, so both
      // procedures must refuse it rather than let each station fail.
      for (const procedureName of [ProcedureName.LOCK_CONNECTOR, ProcedureName.START_TRANSACTION]) {
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

  await it('should accept the main controller pseudo-connector as a PDU connector', async () => {
    const { service } = createServiceContext(2)

    try {
      // OCPP 1.6 §6.47: connector 0 is the Charge Point main controller, a
      // first-class target for StatusNotification (and MeterValues).
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.STATUS_NOTIFICATION, {
          connectorId: 0,
          connectorStatus: 'Available',
          hashIds: [TEST_HASH_ID],
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
})
