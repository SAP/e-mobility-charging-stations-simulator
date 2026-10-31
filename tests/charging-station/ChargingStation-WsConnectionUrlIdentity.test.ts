/**
 * @file Tests that the station identity is percent-encoded when appended to the supervision URL.
 * @description `ChargingStation.wsConnectionUrl` appends the station identity
 * to the supervision URL as one path segment. OCPP-J 1.6 section 3.1.1
 * requires that identity to be percent-encoded (RFC 3986), otherwise a
 * reserved character in it becomes URL syntax: `FRESH#1` turns into a fragment
 * the WebSocket client refuses, `A?B` into a query, `A/B` into two segments.
 * The raw identity is preserved everywhere else.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { WebSocket, WebSocketServer } from 'ws'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { getConfigurationKey } from '../../src/charging-station/ConfigurationKeyUtils.js'
import { flushMicrotasks, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { TEST_SUPERVISION_URL } from '../utils/TestNetworkConstants.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './ChargingStationTestConstants.js'
import {
  cleanupStationTemplates,
  copyStationTemplate,
  createStationFromTemplate,
} from './helpers/StationHelpers.realStation.js'

// Shipped templates use this custom key instead of the default ConnectionUrl.
const OCPP_SUPERVISION_URL_KEY = 'ocppcentraladdress'
const RESERVED_IDENTITIES: Record<string, string> = {
  'CS 1': 'CS%201',
  'CS%1': 'CS%251',
  'CS/1': 'CS%2F1',
  'CS?1': 'CS%3F1',
  'FRESH#1': 'FRESH%231',
}

const SUPERVISION_URL = `${TEST_SUPERVISION_URL}/OCPP16`

// Every station created by a test, deleted in afterEach before its template
// is removed, so no station keeps its BroadcastChannel open after the suite.
let stations: ChargingStation[] = []

const track = (station: ChargingStation): ChargingStation => {
  stations.push(station)
  return station
}

const createStationNamed = (baseName: string, supervisionUrl = SUPERVISION_URL) => {
  const station = track(
    createStationFromTemplate(copyStationTemplate(), {
      baseName,
      fixedName: true,
      persistentConfiguration: false,
    })
  )
  // The template ships its own supervision URL; pin the one under test.
  station.setSupervisionUrl(supervisionUrl)
  return station
}

await describe('ChargingStation wsConnectionUrl identity encoding', async () => {
  beforeEach(() => {
    stations = []
  })

  afterEach(async () => {
    try {
      for (const station of stations) {
        await station.delete(false)
      }
      await flushMicrotasks()
    } finally {
      standardCleanup()
      cleanupStationTemplates()
    }
  })

  await it('should leave an ordinary identity unchanged', () => {
    const station = createStationNamed(TEST_CHARGING_STATION_BASE_NAME)
    assert.strictEqual(station.stationInfo?.chargingStationId, TEST_CHARGING_STATION_BASE_NAME)
    assert.strictEqual(
      station.wsConnectionUrl.href,
      `${SUPERVISION_URL}/${TEST_CHARGING_STATION_BASE_NAME}`
    )
  })

  await it('should percent-encode reserved characters of the identity as one path segment', () => {
    for (const [identity, encoded] of Object.entries(RESERVED_IDENTITIES)) {
      const station = createStationNamed(identity)
      const url = station.wsConnectionUrl
      assert.strictEqual(station.stationInfo?.chargingStationId, identity, identity)
      assert.strictEqual(url.href, `${SUPERVISION_URL}/${encoded}`, identity)
      assert.strictEqual(url.pathname, `/OCPP16/${encoded}`, identity)
      assert.strictEqual(url.search, '', identity)
      assert.strictEqual(url.hash, '', identity)
      assert.strictEqual(decodeURIComponent(url.pathname.split('/').at(-1) ?? ''), identity)
    }
  })

  await it('should encode the identity on the OCPP configuration key branch too', () => {
    // The key carries the base URL without going through setSupervisionUrl
    // (template Configuration, or an OCPP ChangeConfiguration); the getter is
    // the only place that appends the identity to it.
    const station = track(
      createStationFromTemplate(
        copyStationTemplate({
          Configuration: {
            configurationKey: [
              { key: OCPP_SUPERVISION_URL_KEY, readonly: false, value: SUPERVISION_URL },
            ],
          },
          supervisionUrlOcppConfiguration: true,
          supervisionUrlOcppKey: OCPP_SUPERVISION_URL_KEY,
        }),
        { baseName: 'FRESH#1', fixedName: true, persistentConfiguration: false }
      )
    )
    assert.strictEqual(
      getConfigurationKey(station, OCPP_SUPERVISION_URL_KEY)?.value,
      SUPERVISION_URL
    )
    assert.strictEqual(station.stationInfo?.chargingStationId, 'FRESH#1')
    assert.strictEqual(station.wsConnectionUrl.href, `${SUPERVISION_URL}/FRESH%231`)
  })

  for (const transport of ['tcp', 'unix'] as const) {
    // Unix domain sockets are not a filesystem path on Windows (`listen EACCES`); only
    // the Unix transport case is skipped there, the TCP case runs everywhere.
    const skip = transport === 'unix' && process.platform === 'win32'
    await it(
      `should let a real ${transport} WebSocket server receive one encoded identity segment`,
      { skip },
      async () => {
        const server = createServer()
        const wss = new WebSocketServer({ server })
        const seen: string[] = []
        wss.on('connection', (socket, request) => {
          seen.push(request.url ?? '')
          socket.close()
        })
        const socketPath = join(tmpdir(), `sim-${String(process.pid)}-${String(Date.now())}.sock`)
        await new Promise<void>(resolve => {
          if (transport === 'unix') {
            server.listen(socketPath, resolve)
          } else {
            server.listen(0, '127.0.0.1', resolve)
          }
        })
        try {
          const address = server.address()
          const supervisionUrl =
            transport === 'unix' || address == null || typeof address === 'string'
              ? `ws+unix://${socketPath}:/OCPP16`
              : `ws://127.0.0.1:${String(address.port)}/OCPP16`
          for (const identity of Object.keys(RESERVED_IDENTITIES)) {
            const station = createStationNamed(identity, supervisionUrl)
            const ws = new WebSocket(station.wsConnectionUrl)
            await new Promise<void>((resolve, reject) => {
              ws.once('open', resolve)
              ws.once('error', reject)
            })
            ws.terminate()
            assert.strictEqual(seen.at(-1), `/OCPP16/${RESERVED_IDENTITIES[identity]}`, identity)
          }
        } finally {
          wss.close()
          await new Promise<void>(resolve => {
            server.close(() => {
              resolve()
            })
          })
        }
      }
    )
  }
})
