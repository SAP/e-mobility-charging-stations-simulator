/**
 * @file Tests for UIMCPServer
 * @description Unit tests for MCP-based UI server transport and Promise bridge
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { IncomingMessage } from 'node:http'

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ProtocolResponse, RequestPayload, ResponsePayload } from '../../../src/types/index.js'

import { mcpToolSchemas } from '../../../src/charging-station/ui-server/mcp/index.js'
import { UIMCPServer } from '../../../src/charging-station/ui-server/UIMCPServer.js'
import { DEFAULT_MAX_PAYLOAD_SIZE } from '../../../src/charging-station/ui-server/UIServerSecurity.js'
import { BaseError } from '../../../src/exception/index.js'
import {
  ApplicationProtocol,
  OCPPVersion,
  ProcedureName,
  ResponseStatus,
} from '../../../src/types/index.js'
import { logger } from '../../../src/utils/Logger.js'
import {
  createLoggerMocks,
  standardCleanup,
  withMockTimers,
} from '../../helpers/TestLifecycleHelpers.js'
import { TEST_HASH_ID, TEST_HASH_ID_2, TEST_UUID, TEST_UUID_2 } from './UIServerTestConstants.js'
import {
  createMockChargingStationDataWithVersion,
  createMockUIServerConfiguration,
} from './UIServerTestUtils.js'

class TestableUIMCPServer extends UIMCPServer {
  public callCheckVersionCompatibility (
    hashIds: string[] | undefined,
    ocpp16Payload: Record<string, unknown> | undefined,
    ocpp20Payload: Record<string, unknown> | undefined,
    procedureName: ProcedureName
  ): CallToolResult | undefined {
    return (
      Reflect.get(this, 'checkVersionCompatibility') as (
        hashIds: string[] | undefined,
        ocpp16Payload: Record<string, unknown> | undefined,
        ocpp20Payload: Record<string, unknown> | undefined,
        procedureName: ProcedureName
      ) => CallToolResult | undefined
    ).call(this, hashIds, ocpp16Payload, ocpp20Payload, procedureName)
  }

  public callInvokeProcedure (
    procedureName: ProcedureName,
    input: RequestPayload,
    service?: { requestHandler: (request: unknown) => Promise<ProtocolResponse | undefined> }
  ): Promise<CallToolResult> {
    return (
      Reflect.get(this, 'invokeProcedure') as (
        procedureName: ProcedureName,
        input: RequestPayload,
        service:
          | undefined
          | { requestHandler: (request: unknown) => Promise<ProtocolResponse | undefined> }
      ) => Promise<CallToolResult>
    ).call(this, procedureName, input, service)
  }

  public callLoadOcppSchemas (): Map<string, { ocpp16?: unknown; ocpp20?: unknown }> {
    return (
      Reflect.get(this, 'loadOcppSchemas') as () => Map<
        string,
        { ocpp16?: unknown; ocpp20?: unknown }
      >
    ).call(this)
  }

  public callReadRequestBody (req: IncomingMessage): Promise<unknown> {
    return (
      Reflect.get(this, 'readRequestBody') as (req: IncomingMessage) => Promise<unknown>
    ).call(this, req)
  }

  public getPendingMcpRequest (uuid: string):
    | undefined
    | {
      reject: (error: Error) => void
      resolve: (payload: ResponsePayload) => void
      timeout: ReturnType<typeof setTimeout>
    } {
    return (
      Reflect.get(this, 'pendingMcpRequests') as Map<
        string,
        {
          reject: (error: Error) => void
          resolve: (payload: ResponsePayload) => void
          timeout: ReturnType<typeof setTimeout>
        }
      >
    ).get(uuid)
  }

  public getPendingMcpRequestsMap (): Map<
    string,
    {
      reject: (error: Error) => void
      resolve: (payload: ResponsePayload) => void
      timeout: ReturnType<typeof setTimeout>
    }
  > {
    return Reflect.get(this, 'pendingMcpRequests') as Map<
      string,
      {
        reject: (error: Error) => void
        resolve: (payload: ResponsePayload) => void
        timeout: ReturnType<typeof setTimeout>
      }
    >
  }

  public getPendingMcpRequestsSize (): number {
    return (Reflect.get(this, 'pendingMcpRequests') as Map<string, unknown>).size
  }
}

const createMcpServerConfig = () =>
  createMockUIServerConfiguration({ type: ApplicationProtocol.MCP })

/**
 * Assert that a CallToolResult is an error containing the expected substring.
 * @param result - MCP tool result to validate
 * @param expectedSubstring - Text expected in the error message
 */
const assertToolError = (result: CallToolResult, expectedSubstring: string): void => {
  assert.strictEqual(result.isError, true)
  const text = result.content[0]
  assert.ok('text' in text)
  assert.ok(text.text.includes(expectedSubstring))
}

await describe('UIMCPServer', async () => {
  let server: TestableUIMCPServer

  beforeEach(() => {
    server = new TestableUIMCPServer(createMcpServerConfig())
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('Construction and type', async () => {
    await it('should have uiServerType of UI MCP Server', () => {
      assert.strictEqual(Reflect.get(server, 'uiServerType'), 'UI MCP Server')
    })

    await it('should create HTTP server', () => {
      assert.notStrictEqual(Reflect.get(server, 'httpServer'), undefined)
    })
  })

  await describe('Tool schema registration', async () => {
    await it('should have a tool schema for every ProcedureName', () => {
      assert.strictEqual(mcpToolSchemas.size, Object.keys(ProcedureName).length)
    })
  })

  await describe('hasResponseHandler override', async () => {
    await it('should return false when no handler registered', () => {
      assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
    })

    await it('should return true when response handler registered via base class', () => {
      // eslint-disable-next-line @typescript-eslint/dot-notation
      server['responseHandlers'].set(TEST_UUID, {} as never)
      assert.strictEqual(server.hasResponseHandler(TEST_UUID), true)
      // eslint-disable-next-line @typescript-eslint/dot-notation
      server['responseHandlers'].delete(TEST_UUID)
    })

    await it('should return true when uuid is in pendingMcpRequests', () => {
      const timeout = setTimeout(() => undefined, 30000)
      const pendingMap = server.getPendingMcpRequestsMap()
      pendingMap.set(TEST_UUID, {
        reject: (_error: Error) => undefined,
        resolve: (_payload?: ResponsePayload) => undefined,
        timeout,
      })

      assert.strictEqual(server.hasResponseHandler(TEST_UUID), true)

      clearTimeout(timeout)
      pendingMap.delete(TEST_UUID)
    })
  })

  await describe('sendResponse Promise bridge', async () => {
    await it('should resolve pending Promise when sendResponse called with matching UUID', () => {
      let resolvedPayload: ResponsePayload | undefined
      const timeout = setTimeout(() => undefined, 30000)
      const pendingMap = server.getPendingMcpRequestsMap()
      pendingMap.set(TEST_UUID, {
        reject: (_error: Error) => undefined,
        resolve: (payload: ResponsePayload) => {
          resolvedPayload = payload
        },
        timeout,
      })

      const expectedPayload: ResponsePayload = { status: ResponseStatus.SUCCESS }
      server.sendResponse([TEST_UUID, expectedPayload])

      assert.ok(resolvedPayload != null, 'resolvedPayload should be defined')
      assert.deepStrictEqual(resolvedPayload, expectedPayload)
    })

    await it('should clear timeout when resolving pending request', t => {
      const clearTimeoutMock = t.mock.method(globalThis, 'clearTimeout')

      const timeout = setTimeout(() => undefined, 30000)
      const pendingMap = server.getPendingMcpRequestsMap()
      pendingMap.set(TEST_UUID, {
        reject: (_error: Error) => undefined,
        resolve: (_payload?: ResponsePayload) => undefined,
        timeout,
      })

      server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

      assert.ok(clearTimeoutMock.mock.calls.length > 0)
    })

    await it('should delete pending entry after resolve', () => {
      const timeout = setTimeout(() => undefined, 30000)
      const pendingMap = server.getPendingMcpRequestsMap()
      pendingMap.set(TEST_UUID, {
        reject: (_error: Error) => undefined,
        resolve: (_payload?: ResponsePayload) => undefined,
        timeout,
      })

      assert.strictEqual(server.getPendingMcpRequestsSize(), 1)

      server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

      assert.strictEqual(server.getPendingMcpRequestsSize(), 0)
    })

    await it('should log error when sendResponse called for unknown UUID', t => {
      const { errorMock } = createLoggerMocks(t, logger)

      server.sendResponse([TEST_UUID, { status: ResponseStatus.SUCCESS }])

      assert.strictEqual(errorMock.mock.calls.length, 1)
    })
  })

  await describe('sendRequest warning', async () => {
    await it('should log warning when sendRequest is called in stateless mode', t => {
      const { warnMock } = createLoggerMocks(t, logger)

      server.sendRequest([TEST_UUID, ProcedureName.LIST_CHARGING_STATIONS, {}])

      assert.strictEqual(warnMock.mock.calls.length, 1)
    })
  })

  await describe('stop cleanup', async () => {
    await it('should reject all pending requests on stop', () => {
      const rejectedErrors: Error[] = []
      const timeout1 = setTimeout(() => undefined, 30000)
      const timeout2 = setTimeout(() => undefined, 30000)
      const pendingMap = server.getPendingMcpRequestsMap()

      pendingMap.set(TEST_UUID, {
        reject: (error: Error) => {
          rejectedErrors.push(error)
        },
        resolve: (_payload?: ResponsePayload) => undefined,
        timeout: timeout1,
      })
      pendingMap.set(TEST_UUID_2, {
        reject: (error: Error) => {
          rejectedErrors.push(error)
        },
        resolve: (_payload?: ResponsePayload) => undefined,
        timeout: timeout2,
      })

      assert.strictEqual(server.getPendingMcpRequestsSize(), 2)

      server.stop()

      assert.strictEqual(rejectedErrors.length, 2)
      assert.ok(rejectedErrors[0] instanceof Error)
      assert.ok(rejectedErrors[1] instanceof Error)
      assert.strictEqual(rejectedErrors[0].message, 'Server stopping')
      assert.strictEqual(rejectedErrors[1].message, 'Server stopping')
    })

    await it('should clear all timeouts on stop', t => {
      const clearTimeoutMock = t.mock.method(globalThis, 'clearTimeout')

      const timeout1 = setTimeout(() => undefined, 30000)
      const timeout2 = setTimeout(() => undefined, 30000)
      const pendingMap = server.getPendingMcpRequestsMap()

      pendingMap.set(TEST_UUID, {
        reject: (_error: Error) => undefined,
        resolve: (_payload?: ResponsePayload) => undefined,
        timeout: timeout1,
      })
      pendingMap.set(TEST_UUID_2, {
        reject: (_error: Error) => undefined,
        resolve: (_payload?: ResponsePayload) => undefined,
        timeout: timeout2,
      })

      server.stop()

      assert.ok(clearTimeoutMock.mock.calls.length >= 2)
    })

    await it('should clear pending map on stop', () => {
      const timeout = setTimeout(() => undefined, 30000)
      const pendingMap = server.getPendingMcpRequestsMap()

      pendingMap.set(TEST_UUID, {
        reject: (_error: Error) => undefined,
        resolve: (_payload?: ResponsePayload) => undefined,
        timeout,
      })

      assert.strictEqual(server.getPendingMcpRequestsSize(), 1)

      server.stop()

      assert.strictEqual(server.getPendingMcpRequestsSize(), 0)
    })
  })

  await describe('invokeProcedure', async () => {
    await it('should return error response when service is null', async () => {
      const result = await server.callInvokeProcedure(
        ProcedureName.LIST_CHARGING_STATIONS,
        {},
        undefined
      )

      assertToolError(result, 'UI service not available')
    })

    await it('should return error response when both ocpp16Payload and ocpp20Payload are provided', async () => {
      const mockService = {
        requestHandler: () => Promise.resolve(undefined),
      }
      const input = {
        ocpp16Payload: { idTag: 'TAG1' },
        ocpp20Payload: { idToken: {} },
      } as unknown as RequestPayload

      const result = await server.callInvokeProcedure(ProcedureName.AUTHORIZE, input, mockService)

      assertToolError(result, 'Cannot provide both')
    })

    await it('should return error response when version compatibility check fails', async () => {
      // Arrange - station is OCPP 2.0, but sending ocpp16Payload
      server.setChargingStationData(
        TEST_HASH_ID,
        createMockChargingStationDataWithVersion(TEST_HASH_ID, OCPPVersion.VERSION_20)
      )
      const mockService = {
        requestHandler: () => Promise.resolve(undefined),
      }
      const input = {
        hashIds: [TEST_HASH_ID],
        ocpp16Payload: { idTag: 'TAG1' },
      } as unknown as RequestPayload

      // Act
      const result = await server.callInvokeProcedure(ProcedureName.AUTHORIZE, input, mockService)

      // Assert
      assertToolError(result, TEST_HASH_ID)
    })

    await it('should resolve with direct response when service returns immediately', async () => {
      const directPayload: ResponsePayload = {
        hashIdsSucceeded: ['station-1'],
        status: ResponseStatus.SUCCESS,
      }
      const mockService = {
        requestHandler: (request: unknown) => {
          const [uuid] = request as [string, string, unknown]
          return Promise.resolve([uuid, directPayload] as ProtocolResponse)
        },
      }

      const result = await server.callInvokeProcedure(
        ProcedureName.LIST_CHARGING_STATIONS,
        {},
        mockService
      )

      assert.strictEqual(result.isError, undefined)
      const text = result.content[0]
      assert.ok('text' in text)
      const parsed = JSON.parse(text.text) as ResponsePayload
      assert.strictEqual(parsed.status, ResponseStatus.SUCCESS)
      assert.deepStrictEqual(parsed.hashIdsSucceeded, ['station-1'])
    })

    await it('should return error response when service throws', async () => {
      const mockService = {
        requestHandler: () => Promise.reject(new Error('Service failure')),
      }

      const result = await server.callInvokeProcedure(
        ProcedureName.LIST_CHARGING_STATIONS,
        {},
        mockService
      )

      assertToolError(result, 'Service failure')
    })

    await it('should return timeout error after MCP_TOOL_TIMEOUT_MS', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        // Arrange - service returns undefined (broadcast/async) and never resolves
        const mockService = {
          requestHandler: () => Promise.resolve(undefined),
        }

        // Act
        const resultPromise = server.callInvokeProcedure(
          ProcedureName.START_CHARGING_STATION,
          {},
          mockService
        )

        // Allow the service.requestHandler microtask to complete
        await Promise.resolve()
        await Promise.resolve()

        // Tick past the 30s timeout
        t.mock.timers.tick(30_000)

        const result = await resultPromise

        // Assert
        assertToolError(result, 'timed out')
      })
    })
  })

  await describe('checkVersionCompatibility', async () => {
    await it('should return undefined when both payloads are undefined', () => {
      const result = server.callCheckVersionCompatibility(
        undefined,
        undefined,
        undefined,
        ProcedureName.AUTHORIZE
      )

      assert.strictEqual(result, undefined)
    })

    await it('should return undefined when ocpp16Payload matches 1.6 station', () => {
      server.setChargingStationData(
        TEST_HASH_ID,
        createMockChargingStationDataWithVersion(TEST_HASH_ID, OCPPVersion.VERSION_16)
      )

      const result = server.callCheckVersionCompatibility(
        [TEST_HASH_ID],
        { idTag: 'TAG1' },
        undefined,
        ProcedureName.AUTHORIZE
      )

      assert.strictEqual(result, undefined)
    })

    await it('should return undefined when ocpp20Payload matches 2.0 station', () => {
      server.setChargingStationData(
        TEST_HASH_ID,
        createMockChargingStationDataWithVersion(TEST_HASH_ID, OCPPVersion.VERSION_20)
      )

      const result = server.callCheckVersionCompatibility(
        [TEST_HASH_ID],
        undefined,
        { idToken: {} },
        ProcedureName.AUTHORIZE
      )

      assert.strictEqual(result, undefined)
    })

    await it('should return undefined when ocpp20Payload matches 2.0.1 station', () => {
      server.setChargingStationData(
        TEST_HASH_ID,
        createMockChargingStationDataWithVersion(TEST_HASH_ID, OCPPVersion.VERSION_201)
      )

      const result = server.callCheckVersionCompatibility(
        [TEST_HASH_ID],
        undefined,
        { idToken: {} },
        ProcedureName.AUTHORIZE
      )

      assert.strictEqual(result, undefined)
    })

    await it('should return error when ocpp16Payload sent to 2.0 station', () => {
      server.setChargingStationData(
        TEST_HASH_ID,
        createMockChargingStationDataWithVersion(TEST_HASH_ID, OCPPVersion.VERSION_20)
      )

      const result = server.callCheckVersionCompatibility(
        [TEST_HASH_ID],
        { idTag: 'TAG1' },
        undefined,
        ProcedureName.AUTHORIZE
      )

      assert.ok(result != null, 'Expected error result')
      assertToolError(result, TEST_HASH_ID)
      const text = result.content[0]
      assert.ok('text' in text)
      assert.ok(text.text.includes('ocpp20Payload'))
    })

    await it('should return error when ocpp20Payload sent to 1.6 station', () => {
      server.setChargingStationData(
        TEST_HASH_ID,
        createMockChargingStationDataWithVersion(TEST_HASH_ID, OCPPVersion.VERSION_16)
      )

      const result = server.callCheckVersionCompatibility(
        [TEST_HASH_ID],
        undefined,
        { idToken: {} },
        ProcedureName.AUTHORIZE
      )

      assert.ok(result != null, 'Expected error result')
      assertToolError(result, TEST_HASH_ID)
      const text = result.content[0]
      assert.ok('text' in text)
      assert.ok(text.text.includes('ocpp16Payload'))
    })

    await it('should check only specified hashIds when provided', () => {
      server.setChargingStationData(
        TEST_HASH_ID,
        createMockChargingStationDataWithVersion(TEST_HASH_ID, OCPPVersion.VERSION_16)
      )
      server.setChargingStationData(
        TEST_HASH_ID_2,
        createMockChargingStationDataWithVersion(TEST_HASH_ID_2, OCPPVersion.VERSION_20)
      )

      const result = server.callCheckVersionCompatibility(
        [TEST_HASH_ID],
        { idTag: 'TAG1' },
        undefined,
        ProcedureName.AUTHORIZE
      )

      assert.strictEqual(result, undefined)
    })

    await it('should check all stations when hashIds is undefined', () => {
      server.setChargingStationData(
        TEST_HASH_ID,
        createMockChargingStationDataWithVersion(TEST_HASH_ID, OCPPVersion.VERSION_16)
      )
      server.setChargingStationData(
        TEST_HASH_ID_2,
        createMockChargingStationDataWithVersion(TEST_HASH_ID_2, OCPPVersion.VERSION_20)
      )

      const result = server.callCheckVersionCompatibility(
        undefined,
        { idTag: 'TAG1' },
        undefined,
        ProcedureName.AUTHORIZE
      )

      assert.ok(result != null, 'Expected error result')
      assertToolError(result, TEST_HASH_ID_2)
    })
  })

  await describe('readRequestBody', async () => {
    await it('should resolve with parsed JSON on valid body', async () => {
      const mockReq = new EventEmitter()
      const expected = { jsonrpc: '2.0', method: 'tools/list' }

      const resultPromise = server.callReadRequestBody(mockReq as unknown as IncomingMessage)
      mockReq.emit('data', Buffer.from(JSON.stringify(expected)))
      mockReq.emit('end')

      const result = await resultPromise
      assert.deepStrictEqual(result, expected)
    })

    await it('should reject with BaseError when payload too large', async () => {
      const mockReq = new EventEmitter()
      let destroyed = false
      Object.defineProperty(mockReq, 'destroy', {
        value: () => {
          destroyed = true
        },
      })

      const resultPromise = server.callReadRequestBody(mockReq as unknown as IncomingMessage)
      const oversizedChunk = Buffer.alloc(DEFAULT_MAX_PAYLOAD_SIZE + 1)
      mockReq.emit('data', oversizedChunk)

      await assert.rejects(resultPromise, (error: Error) => {
        assert.ok(error instanceof BaseError)
        assert.ok(error.message.includes('Payload too large'))
        return true
      })
      assert.strictEqual(destroyed, true)
    })

    await it('should reject with error on invalid JSON', async () => {
      const mockReq = new EventEmitter()

      const resultPromise = server.callReadRequestBody(mockReq as unknown as IncomingMessage)
      mockReq.emit('data', Buffer.from('not valid json {{{'))
      mockReq.emit('end')

      await assert.rejects(resultPromise)
    })

    await it('should reject with error on stream error', async () => {
      const mockReq = new EventEmitter()
      const streamError = new Error('Connection reset')

      const resultPromise = server.callReadRequestBody(mockReq as unknown as IncomingMessage)
      mockReq.emit('error', streamError)

      await assert.rejects(resultPromise, (error: Error) => {
        assert.strictEqual(error.message, 'Connection reset')
        return true
      })
    })
  })

  await describe('loadOcppSchemas', async () => {
    await it('should load and cache OCPP schemas from disk', () => {
      const cache = server.callLoadOcppSchemas()

      assert.ok(cache.size > 0, 'Schema cache should not be empty')
      const authorizeSchemas = cache.get(ProcedureName.AUTHORIZE)
      assert.ok(authorizeSchemas != null, 'Should have schemas for authorize')
      assert.ok(authorizeSchemas.ocpp16 != null, 'Should have OCPP 1.6 schema for authorize')
      assert.ok(authorizeSchemas.ocpp20 != null, 'Should have OCPP 2.0 schema for authorize')
    })

    await it('should only cache entries that have at least one schema loaded', () => {
      const cache = server.callLoadOcppSchemas()

      for (const [, entry] of cache) {
        assert.ok(
          entry.ocpp16 != null || entry.ocpp20 != null,
          'Cached entry should have at least one schema'
        )
      }
    })
  })
})
