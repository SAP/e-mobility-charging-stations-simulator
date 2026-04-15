import assert from 'node:assert'
import { describe, it } from 'node:test'

import type { WebSocketFactory, WebSocketLike } from '../src/client/types.js'
import type { ResponsePayload } from '../src/types/UIProtocol.js'

import { ServerFailureError, WebSocketClient } from '../src/client/WebSocketClient.js'
import { AuthenticationType, ProcedureName, ResponseStatus } from '../src/types/UIProtocol.js'

/**
 * @returns Mock WebSocket with trigger methods for testing.
 */
function createMockWS (): WebSocketLike & {
  sentMessages: string[]
  triggerClose: () => void
  triggerError: (message: string) => void
  triggerMessage: (data: string) => void
  triggerOpen: () => void
} {
  let oncloseFn: ((event: { code: number; reason: string }) => void) | null = null
  let onerrorFn: ((event: { error: unknown; message: string }) => void) | null = null
  let onmessageFn: ((event: { data: string }) => void) | null = null
  let onopenFn: (() => void) | null = null
  const sentMessages: string[] = []
  let readyState: 0 | 1 | 2 | 3 = 1

  return {
    close () {
      readyState = 3
      oncloseFn?.({ code: 1000, reason: '' })
    },
    get onclose () {
      return oncloseFn
    },
    set onclose (l: ((event: { code: number; reason: string }) => void) | null) {
      oncloseFn = l
    },
    get onerror () {
      return onerrorFn
    },
    set onerror (l: ((event: { error: unknown; message: string }) => void) | null) {
      onerrorFn = l
    },
    get onmessage () {
      return onmessageFn
    },
    set onmessage (l: ((event: { data: string }) => void) | null) {
      onmessageFn = l
    },
    get onopen () {
      return onopenFn
    },
    set onopen (l: (() => void) | null) {
      onopenFn = l
    },
    get readyState () {
      return readyState
    },
    send (data) {
      sentMessages.push(data)
    },
    sentMessages,
    triggerClose () {
      readyState = 3
      oncloseFn?.({ code: 1000, reason: '' })
    },
    triggerError (message) {
      onerrorFn?.({ error: new Error(message), message })
    },
    triggerMessage (data) {
      onmessageFn?.({ data })
    },
    triggerOpen () {
      onopenFn?.()
    },
  }
}

await describe('WebSocketClient', async () => {
  await it('should connect successfully', async () => {
    const mockWs = createMockWS()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise
  })

  await it('should build protocol-basic-auth credentials correctly', async () => {
    const mockWs = createMockWS()
    let capturedProtocols: string | string[] = ''
    const factory: WebSocketFactory = (_url, protocols) => {
      capturedProtocols = protocols
      return mockWs
    }
    const client = new WebSocketClient(factory, {
      authentication: {
        enabled: true,
        password: 'admin',
        type: AuthenticationType.PROTOCOL_BASIC_AUTH,
        username: 'admin',
      },
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise
    assert.ok(Array.isArray(capturedProtocols))
    assert.strictEqual(capturedProtocols[0], 'ui0.0.1')
    assert.strictEqual(capturedProtocols[1], 'authorization.basic.YWRtaW46YWRtaW4')
  })

  await it('should send SRPC formatted request', async () => {
    const mockWs = createMockWS()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    const requestPromise = client.sendRequest(ProcedureName.SIMULATOR_STATE, {})

    assert.strictEqual(mockWs.sentMessages.length, 1)
    const msg = JSON.parse(mockWs.sentMessages[0]) as unknown[]
    assert.strictEqual(msg.length, 3)
    assert.strictEqual(typeof msg[0], 'string')
    assert.strictEqual(msg[1], ProcedureName.SIMULATOR_STATE)
    assert.deepStrictEqual(msg[2], {})

    const responsePayload: ResponsePayload = { status: ResponseStatus.SUCCESS }
    mockWs.triggerMessage(JSON.stringify([msg[0], responsePayload]))
    const result = await requestPromise
    assert.strictEqual(result.status, ResponseStatus.SUCCESS)
  })

  await it('should correlate responses by UUID', async () => {
    const mockWs = createMockWS()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    const p1 = client.sendRequest(ProcedureName.START_SIMULATOR, {})
    const p2 = client.sendRequest(ProcedureName.STOP_SIMULATOR, {})

    const uuid1 = (JSON.parse(mockWs.sentMessages[0]) as unknown[])[0] as string
    const uuid2 = (JSON.parse(mockWs.sentMessages[1]) as unknown[])[0] as string
    assert.notStrictEqual(uuid1, uuid2)

    mockWs.triggerMessage(JSON.stringify([uuid2, { status: ResponseStatus.SUCCESS }]))
    mockWs.triggerMessage(JSON.stringify([uuid1, { status: ResponseStatus.FAILURE }]))

    const r2 = await p2
    assert.strictEqual(r2.status, ResponseStatus.SUCCESS)
    await assert.rejects(async () => {
      await p1
    })
  })

  await it('should reject with ServerFailureError containing the payload', async () => {
    const mockWs = createMockWS()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    const request = client.sendRequest(ProcedureName.START_SIMULATOR, {})
    const uuid = (JSON.parse(mockWs.sentMessages[0]) as unknown[])[0] as string
    const failurePayload: ResponsePayload = {
      hashIdsFailed: ['station-1', 'station-2'],
      status: ResponseStatus.FAILURE,
    }
    mockWs.triggerMessage(JSON.stringify([uuid, failurePayload]))

    await assert.rejects(
      async () => {
        await request
      },
      (error: unknown) => {
        assert.ok(error instanceof ServerFailureError)
        assert.ok(error instanceof Error)
        assert.strictEqual(error.name, 'ServerFailureError')
        assert.strictEqual(error.message, 'Server returned failure status: 2 station(s) failed')
        assert.strictEqual(error.payload.status, ResponseStatus.FAILURE)
        assert.deepStrictEqual(error.payload.hashIdsFailed, ['station-1', 'station-2'])
        return true
      }
    )
  })

  await it('should handle connection errors', async () => {
    const mockWs = createMockWS()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    mockWs.triggerError('Connection refused')
    await assert.rejects(
      async () => {
        await connectPromise
      },
      { message: 'Connection refused' }
    )
  })

  await it('should reject pending requests on disconnect', async () => {
    const mockWs = createMockWS()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    const pendingRequest = client.sendRequest(ProcedureName.LIST_CHARGING_STATIONS, {})
    client.disconnect()
    await assert.rejects(async () => {
      await pendingRequest
    })
  })

  await it('should reject request when WebSocket is not open', async () => {
    const mockWs = createMockWS()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    client.disconnect()
    await assert.rejects(
      async () => {
        await client.sendRequest(ProcedureName.SIMULATOR_STATE, {})
      },
      { message: 'WebSocket is not open' }
    )
  })

  await it('should build wss URL when secure is true', async () => {
    const mockWs = createMockWS()
    let capturedUrl = ''
    const factory: WebSocketFactory = url => {
      capturedUrl = url
      return mockWs
    }
    const client = new WebSocketClient(factory, {
      host: 'example.com',
      port: 443,
      protocol: 'ui',
      secure: true,
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise
    assert.strictEqual(capturedUrl, 'wss://example.com:443')
  })

  await it('should ignore malformed messages', async () => {
    const mockWs = createMockWS()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    mockWs.triggerMessage('not json')
    mockWs.triggerMessage(JSON.stringify({ not: 'an array' }))
    mockWs.triggerMessage(JSON.stringify([1, 2, 3]))
    mockWs.triggerMessage(JSON.stringify(['not-a-uuid', {}]))
  })

  await it('should reject on malformed response payload with matching UUID', async () => {
    const mockWs = createMockWS()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    const requestPromise = client.sendRequest(ProcedureName.SIMULATOR_STATE, {})
    const uuid = (JSON.parse(mockWs.sentMessages[0]) as unknown[])[0] as string

    mockWs.triggerMessage(JSON.stringify([uuid, null]))
    await assert.rejects(async () => requestPromise, {
      message: 'Server sent malformed response payload',
    })
  })

  await it('should reject connect if socket closes before open', async () => {
    const mockWs = createMockWS()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: 'ui',
      version: '0.0.1',
    })
    const connectPromise = client.connect()
    // Close without opening — simulates handshake rejection
    mockWs.triggerClose()
    await assert.rejects(
      async () => {
        await connectPromise
      },
      { message: 'WebSocket closed before connection established (code: 1000)' }
    )
  })
})
