/**
 * @file Tests for UIMCPServer
 * @description Unit tests for MCP-based UI server transport and Promise bridge
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ResponsePayload } from '../../../src/types/index.js'

import { mcpToolSchemas } from '../../../src/charging-station/ui-server/mcp/index.js'
import { UIMCPServer } from '../../../src/charging-station/ui-server/UIMCPServer.js'
import { ApplicationProtocol, ProcedureName, ResponseStatus } from '../../../src/types/index.js'
import { logger } from '../../../src/utils/Logger.js'
import { createLoggerMocks, standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { TEST_UUID, TEST_UUID_2 } from './UIServerTestConstants.js'
import { createMockUIServerConfiguration } from './UIServerTestUtils.js'

class TestableUIMCPServer extends UIMCPServer {
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
})
