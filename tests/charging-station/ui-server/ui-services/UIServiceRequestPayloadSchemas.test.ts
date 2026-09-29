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

import { ProcedureName, ProtocolVersion, ResponseStatus } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_HASH_ID, TEST_HASH_ID_2, TEST_UUID } from '../UIServerTestConstants.js'
import {
  createMockChargingStationData,
  createMockUIServerConfiguration,
  createProtocolRequest,
  TestableUIWebSocketServer,
} from '../UIServerTestUtils.js'

/**
 * Build a service context with two live stations, so a request that degrades to
 * a broadcast is observable through the outstanding responder count.
 * @returns Server and registered UI service.
 */
const createServiceContext = (): {
  readonly server: TestableUIWebSocketServer
  readonly service: AbstractUIService
} => {
  const server = new TestableUIWebSocketServer(createMockUIServerConfiguration())
  server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])
  server.setChargingStationData(TEST_HASH_ID, createMockChargingStationData(TEST_HASH_ID))
  server.setChargingStationData(TEST_HASH_ID_2, createMockChargingStationData(TEST_HASH_ID_2))
  const service = server.getUIService(ProtocolVersion['0.0.1'])
  if (service == null) {
    assert.fail('Expected UI service to be registered')
  }
  return { server, service }
}

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
 * Assert that a dispatch was rejected before reaching the stations, and that it
 * described the expected violation.
 * @param response - Protocol response returned by the dispatch.
 * @param expectedViolation - Pattern the reported violation must match.
 */
const assertRejectedWith = (
  response: ProtocolResponse | undefined,
  expectedViolation: RegExp
): void => {
  assert.notStrictEqual(response, undefined)
  if (response == null) return
  const [, responsePayload] = response
  assert.strictEqual(responsePayload.status, ResponseStatus.FAILURE)
  const { errorMessage } = responsePayload
  assert.strictEqual(typeof errorMessage, 'string')
  if (typeof errorMessage !== 'string') return
  assert.match(errorMessage, expectedViolation)
}

await describe('AbstractUIService request payload validation', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should not broadcast to every station when hashIds is not an array', async () => {
    const { service } = createServiceContext()

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
    const { service } = createServiceContext()

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
    const { service } = createServiceContext()

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
    const { service } = createServiceContext()

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
    const { service } = createServiceContext()

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
    const { service } = createServiceContext()

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
    const { service } = createServiceContext()

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

  await it('should keep reporting an unknown procedure as unimplemented', async () => {
    const { service } = createServiceContext()

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
})
