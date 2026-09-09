/**
 * @file Tests the reconnect decision made when a charging station's WebSocket closes.
 * @description The station reconnects after any close it did not itself request
 * (a server-initiated drop, clean or abnormal) while still started, and stays
 * disconnected after a requested close.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { WebSocket } from 'ws'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import {
  ChargingStationEvents,
  OCPP20RequestCommand,
  WebSocketCloseEventStatusCode,
} from '../../src/types/index.js'
import { logger } from '../../src/utils/index.js'
import {
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../helpers/TestLifecycleHelpers.js'
import {
  cleanupStationTemplates,
  copyStationTemplate,
  createStationFromTemplate,
} from './helpers/StationHelpers.realStation.js'

interface StationInternals {
  acknowledgedBufferedMessages: Set<string>
  getReconnectDelay: () => number
  initialize: () => void
  messageQueue: string[]
  onClose: (wsConnection: WebSocket, code: WebSocketCloseEventStatusCode, reason: Buffer) => void
  onError: (wsConnection: WebSocket, error: Error) => void
  openWSConnection: () => void
  reconnect: () => Promise<void>
  start: () => void
  started: boolean
  stop: () => Promise<void>
  stopping: boolean
  wsConnection: null | WebSocket
  wsPingSetInterval?: NodeJS.Timeout
}

const createOpenSocket = (): WebSocket => {
  const socket: { close: () => void; readyState: number } = {
    close: () => {
      socket.readyState = WebSocket.CLOSING
    },
    readyState: WebSocket.OPEN,
  }
  return socket as unknown as WebSocket
}

const makeStation = (): {
  reconnectCount: () => number
  socket: WebSocket
  station: ChargingStation
} => {
  const station = createStationFromTemplate(copyStationTemplate())
  const socket = createOpenSocket()
  let reconnects = 0
  const internals = station as unknown as StationInternals
  internals.reconnect = () => {
    reconnects++
    return Promise.resolve()
  }
  internals.started = true
  internals.wsConnection = socket
  return { reconnectCount: () => reconnects, socket, station }
}

await describe('ChargingStation reconnect decision on WebSocket close', async () => {
  afterEach(() => {
    standardCleanup()
    cleanupStationTemplates()
  })

  await it('should reconnect after a server-initiated normal close while started', () => {
    const { reconnectCount, socket, station } = makeStation()

    ;(station as unknown as StationInternals).onClose(
      socket,
      WebSocketCloseEventStatusCode.CLOSE_NORMAL,
      Buffer.from('')
    )

    assert.strictEqual(reconnectCount(), 1)
    assert.strictEqual(station.wsConnection, null)
  })

  await it('restores acknowledged buffered calls when their socket closes', () => {
    const { socket, station } = makeStation()
    const internals = station as unknown as StationInternals
    const message = '[2,"replay-after-close","Heartbeat",{}]'
    let suspendedTimeouts = 0
    internals.acknowledgedBufferedMessages.add(message)
    station.requests.set('replay-after-close', [
      () => undefined,
      () => undefined,
      OCPP20RequestCommand.HEARTBEAT,
      {},
      undefined,
      undefined,
      () => {
        suspendedTimeouts++
      },
    ])

    internals.onClose(socket, WebSocketCloseEventStatusCode.CLOSE_NORMAL, Buffer.from(''))

    assert.deepStrictEqual(internals.messageQueue, [message])
    assert.strictEqual(internals.acknowledgedBufferedMessages.size, 0)
    assert.strictEqual(suspendedTimeouts, 1)
  })

  await it('should stay disconnected after a requested close', () => {
    const { reconnectCount, socket, station } = makeStation()
    const internals = station as unknown as StationInternals

    station.closeWSConnection({ byRequest: true })
    internals.onClose(socket, WebSocketCloseEventStatusCode.CLOSE_NORMAL, Buffer.from(''))

    assert.strictEqual(reconnectCount(), 0)
  })

  await it('should not reconnect when the socket closes while stopping', () => {
    const { reconnectCount, socket, station } = makeStation()
    const internals = station as unknown as StationInternals
    internals.stopping = true

    internals.onClose(socket, WebSocketCloseEventStatusCode.CLOSE_NORMAL, Buffer.from(''))

    assert.strictEqual(reconnectCount(), 0)
  })

  await it('should ignore an error emitted by a replaced socket', t => {
    const { socket: oldSocket, station } = makeStation()
    const internals = station as unknown as StationInternals
    const currentSocket = createOpenSocket()
    internals.wsConnection = currentSocket
    const errorSpy = t.mock.method(logger, 'error', () => undefined)

    internals.onError(oldSocket, new Error('stale socket error'))
    assert.strictEqual(errorSpy.mock.callCount(), 0)

    internals.onError(currentSocket, new Error('current socket error'))
    assert.strictEqual(errorSpy.mock.callCount(), 1)
  })

  await it('should ignore a delayed requested close from before a zero-time reset', async t => {
    await withMockTimers(t, ['setInterval', 'setTimeout'], async () => {
      const { reconnectCount, socket: oldSocket, station } = makeStation()
      const internals = station as unknown as StationInternals
      const replacementSocket = createOpenSocket()
      let automaticTransactionGeneratorStarted = true
      station.automaticTransactionGenerator = {
        get started () {
          return automaticTransactionGeneratorStarted
        },
        stop: () => {
          automaticTransactionGeneratorStarted = false
        },
      } as unknown as NonNullable<ChargingStation['automaticTransactionGenerator']>
      station.heartbeatSetInterval = setInterval(() => undefined, 1_000)
      internals.wsPingSetInterval = setInterval(() => undefined, 1_000)
      const heartbeatSetInterval = station.heartbeatSetInterval
      const wsPingSetInterval = internals.wsPingSetInterval
      let disconnectedEvents = 0
      station.on(ChargingStationEvents.disconnected, () => {
        disconnectedEvents++
      })
      if (station.stationInfo != null) {
        station.stationInfo.resetTime = 0
      }
      t.mock.method(internals, 'stop', () => {
        station.closeWSConnection({ byRequest: true })
        station.started = false
        return Promise.resolve()
      })
      t.mock.method(internals, 'initialize', () => undefined)
      t.mock.method(internals, 'start', () => {
        internals.wsConnection = replacementSocket
        station.started = true
      })

      const resetPromise = station.reset()
      await flushMicrotasks()
      t.mock.timers.tick(0)
      await resetPromise

      // Requesting a close on the replacement before the old close arrives proves
      // the old event cannot consume the replacement socket's close intent.
      station.closeWSConnection({ byRequest: true })
      internals.onClose(
        oldSocket,
        WebSocketCloseEventStatusCode.CLOSE_NORMAL,
        Buffer.from('delayed old close')
      )

      assert.strictEqual(station.wsConnection, replacementSocket)
      assert.strictEqual(station.heartbeatSetInterval, heartbeatSetInterval)
      assert.strictEqual(internals.wsPingSetInterval, wsPingSetInterval)
      assert.strictEqual(automaticTransactionGeneratorStarted, true)
      assert.strictEqual(disconnectedEvents, 0)
      assert.strictEqual(reconnectCount(), 0)

      internals.onClose(
        replacementSocket,
        WebSocketCloseEventStatusCode.CLOSE_NORMAL,
        Buffer.from('requested current close')
      )
      assert.strictEqual(reconnectCount(), 0)
      assert.strictEqual(disconnectedEvents, 1)
      assert.strictEqual(automaticTransactionGeneratorStarted, false)
    })
  })

  await it('should not open a socket when stop begins during the reconnect delay', async t => {
    const station = createStationFromTemplate(copyStationTemplate())
    const internals = station as unknown as StationInternals
    internals.started = true
    let openCalls = 0
    internals.getReconnectDelay = () => 1000
    internals.openWSConnection = () => {
      openCalls++
    }
    if (station.stationInfo != null) {
      station.stationInfo.autoReconnectMaxRetries = -1
    }

    await withMockTimers(t, ['setTimeout'], async () => {
      const reconnectPromise = internals.reconnect()
      internals.stopping = true
      t.mock.timers.tick(1000)
      await reconnectPromise
    })

    assert.strictEqual(openCalls, 0)
  })
})
