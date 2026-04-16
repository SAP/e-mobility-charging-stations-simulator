/** @file Unit tests for the SRPC WebSocket client */

import assert from 'node:assert'
import { describe, it } from 'node:test'

import type { WebSocketFactory } from '../src/client/types.js'
import type { ResponsePayload } from '../src/types/UIProtocol.js'

import { ServerFailureError, WebSocketClient } from '../src/client/WebSocketClient.js'
import {
  AuthenticationType,
  ProcedureName,
  Protocol,
  ProtocolVersion,
  ResponseStatus,
} from '../src/types/UIProtocol.js'
import { createMockWebSocketLike } from './mocks.js'

await describe('WebSocketClient', async () => {
  await it('should connect successfully', async () => {
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise
  })

  await it('should build protocol-basic-auth credentials correctly', async () => {
    const mockWs = createMockWebSocketLike()
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
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise
    assert.ok(Array.isArray(capturedProtocols))
    assert.strictEqual(capturedProtocols[0], 'ui0.0.1')
    assert.strictEqual(capturedProtocols[1], 'authorization.basic.YWRtaW46YWRtaW4')
  })

  await it('should send SRPC formatted request', async () => {
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
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
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
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
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
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

  await it('should create ServerFailureError without station count when hashIdsFailed is absent', () => {
    const payload = { status: ResponseStatus.FAILURE } as ResponsePayload
    const err = new ServerFailureError(payload)
    assert.strictEqual(err.message, 'Server returned failure status')
    assert.strictEqual(err.payload, payload)
  })

  await it('should handle connection errors', async () => {
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
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
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
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
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
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
    const mockWs = createMockWebSocketLike()
    let capturedUrl = ''
    const factory: WebSocketFactory = url => {
      capturedUrl = url
      return mockWs
    }
    const client = new WebSocketClient(factory, {
      host: 'example.com',
      port: 443,
      protocol: Protocol.UI,
      secure: true,
      version: ProtocolVersion['0.0.1'],
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise
    assert.strictEqual(capturedUrl, 'wss://example.com:443')
  })

  await it('should ignore malformed messages', async () => {
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
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
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
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
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
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

  await it('should respect explicit short timeout on sendRequest', async () => {
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    const startTime = Date.now()
    const requestPromise = client.sendRequest(ProcedureName.SIMULATOR_STATE, {}, 50)

    // Don't send a response — let it timeout
    await assert.rejects(
      async () => {
        await requestPromise
      },
      (error: unknown) => {
        const elapsed = Date.now() - startTime
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes('timed out'))
        assert.ok(error.message.includes('50ms'))
        // Should timeout around 50ms, definitely not 60s
        assert.ok(elapsed < 500, `Expected timeout within 500ms, got ${elapsed.toString()}ms`)
        return true
      }
    )
  })

  await it('should reject sendRequest with timeoutMs = 0', async () => {
    const mockWs = createMockWebSocketLike()
    const client = new WebSocketClient(
      () => mockWs,
      {
        host: 'localhost',
        port: 8080,
        protocol: Protocol.UI,
        version: ProtocolVersion['0.0.1'],
      },
      5000
    )
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    await assert.rejects(
      async () => {
        await client.sendRequest(ProcedureName.SIMULATOR_STATE, {}, 0)
      },
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes('Invalid timeout'))
        assert.ok(error.message.includes('0ms'))
        return true
      }
    )
  })

  await it('should reject sendRequest with timeoutMs = -1', async () => {
    const mockWs = createMockWebSocketLike()
    const client = new WebSocketClient(
      () => mockWs,
      {
        host: 'localhost',
        port: 8080,
        protocol: Protocol.UI,
        version: ProtocolVersion['0.0.1'],
      },
      5000
    )
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    await assert.rejects(
      async () => {
        await client.sendRequest(ProcedureName.SIMULATOR_STATE, {}, -1)
      },
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes('Invalid timeout'))
        assert.ok(error.message.includes('-1ms'))
        return true
      }
    )
  })

  await it('should reject sendRequest with NaN timeout', async () => {
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
    })
    setTimeout(() => {
      mockWs.triggerOpen()
    }, 0)
    await client.connect()
    await assert.rejects(
      client.sendRequest(ProcedureName.LIST_CHARGING_STATIONS, {}, Number.NaN),
      (error: Error) => {
        assert.ok(error.message.includes('Invalid timeout'))
        assert.ok(error.message.includes('NaN'))
        return true
      }
    )
    client.disconnect()
  })

  await it('should reject sendRequest with Infinity timeout', async () => {
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
    })
    setTimeout(() => {
      mockWs.triggerOpen()
    }, 0)
    await client.connect()
    await assert.rejects(
      client.sendRequest(ProcedureName.LIST_CHARGING_STATIONS, {}, Number.POSITIVE_INFINITY),
      (error: Error) => {
        assert.ok(error.message.includes('Invalid timeout'))
        assert.ok(error.message.includes('Infinity'))
        return true
      }
    )
    client.disconnect()
  })

  await it('should reject pending requests when post-connect error occurs', async () => {
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(factory, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
    })
    setTimeout(() => {
      mockWs.triggerOpen()
    }, 0)
    await client.connect()

    const requestPromise = client.sendRequest(ProcedureName.LIST_CHARGING_STATIONS, {})
    mockWs.triggerError('connection lost')

    await assert.rejects(requestPromise, (error: Error) => {
      assert.ok(error.message.includes('connection lost'))
      return true
    })
  })

  await it('should fire onNotification for 1-element server notification', async () => {
    const notifications: unknown[][] = []
    const mockWs = createMockWebSocketLike()
    const client = new WebSocketClient(
      () => mockWs,
      { host: 'localhost', port: 8080, protocol: Protocol.UI, version: ProtocolVersion['0.0.1'] },
      undefined,
      notification => {
        notifications.push(notification)
      }
    )
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    mockWs.triggerMessage('["refresh"]')

    assert.strictEqual(notifications.length, 1)
    assert.deepStrictEqual(notifications[0], ['refresh'])
    client.disconnect()
  })

  await it('should NOT fire onNotification for 2-element response', async () => {
    const notifications: unknown[][] = []
    const mockWs = createMockWebSocketLike()
    const factory: WebSocketFactory = () => mockWs
    const client = new WebSocketClient(
      factory,
      { host: 'localhost', port: 8080, protocol: Protocol.UI, version: ProtocolVersion['0.0.1'] },
      undefined,
      notification => {
        notifications.push(notification)
      }
    )
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    const requestPromise = client.sendRequest(ProcedureName.SIMULATOR_STATE, {})
    const uuid = (JSON.parse(mockWs.sentMessages[0]) as unknown[])[0] as string
    mockWs.triggerMessage(JSON.stringify([uuid, { status: ResponseStatus.SUCCESS }]))
    await requestPromise

    assert.strictEqual(notifications.length, 0)
    client.disconnect()
  })

  await it('should NOT fire onNotification when callback is undefined', async () => {
    const mockWs = createMockWebSocketLike()
    const client = new WebSocketClient(() => mockWs, {
      host: 'localhost',
      port: 8080,
      protocol: Protocol.UI,
      version: ProtocolVersion['0.0.1'],
    })
    const connectPromise = client.connect()
    mockWs.triggerOpen()
    await connectPromise

    // Should not throw when no callback registered
    assert.doesNotThrow(() => {
      mockWs.triggerMessage('["refresh"]')
    })
    client.disconnect()
  })
})
