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

import { WebSocketCloseEventStatusCode } from '../../src/types/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  cleanupStationTemplates,
  copyStationTemplate,
  createStationFromTemplate,
} from './helpers/StationHelpers.realStation.js'

// onClose and reconnect are private; the tests drive onClose directly with a
// spied reconnect to observe the reconnect decision without opening a socket.
interface StationInternals {
  onClose: (code: WebSocketCloseEventStatusCode, reason: Buffer) => void
  reconnect: () => Promise<void>
  started: boolean
  wsConnection: unknown
}

// Build a started station whose reconnect() is replaced by a counter.
const makeStation = (): { reconnectCount: () => number; station: ChargingStation } => {
  const station = createStationFromTemplate(copyStationTemplate())
  let reconnects = 0
  const internals = station as unknown as StationInternals
  internals.reconnect = () => {
    reconnects++
    return Promise.resolve()
  }
  internals.started = true
  return { reconnectCount: () => reconnects, station }
}

await describe('ChargingStation reconnect decision on WebSocket close', async () => {
  afterEach(() => {
    standardCleanup()
    cleanupStationTemplates()
  })

  await it('should reconnect after a server-initiated normal close while started', () => {
    const { reconnectCount, station } = makeStation()

    ;(station as unknown as StationInternals).onClose(
      WebSocketCloseEventStatusCode.CLOSE_NORMAL,
      Buffer.from('')
    )

    assert.strictEqual(reconnectCount(), 1)
  })

  await it('should stay disconnected after a requested close', () => {
    const { reconnectCount, station } = makeStation()
    const internals = station as unknown as StationInternals
    // An open socket lets closeWSConnection record the request before onClose runs.
    internals.wsConnection = { close: () => undefined, readyState: WebSocket.OPEN }

    station.closeWSConnection({ byRequest: true })
    internals.onClose(WebSocketCloseEventStatusCode.CLOSE_NORMAL, Buffer.from(''))

    assert.strictEqual(reconnectCount(), 0)
  })
})
