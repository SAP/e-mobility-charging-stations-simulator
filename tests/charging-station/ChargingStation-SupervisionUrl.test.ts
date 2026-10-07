/**
 * @file Tests that a charging station rejects a malformed supervision URL with a structured configuration error.
 * @description A relative or malformed supervision URL must surface a `BaseError`
 * naming the offending field and the station instead of leaking the `TypeError`
 * from `new URL()`, on every entry path: template/configuration loading,
 * `setSupervisionUrl` (both branches) and the `wsConnectionUrl` getter.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { Worker } from 'node:worker_threads'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { BaseError } from '../../src/exception/BaseError.js'
import {
  type ChargingStationConfiguration,
  type ChargingStationData,
  type ChargingStationOptions,
  type ChargingStationWorkerMessage,
  ChargingStationWorkerMessageEvents,
} from '../../src/types/index.js'
import { flushMicrotasks, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { TEST_SUPERVISION_URL_ALT_PORT } from '../utils/TestNetworkConstants.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './ChargingStationTestConstants.js'
import {
  cleanupStationTemplates,
  copyStationTemplate,
  createStationFromTemplate,
} from './helpers/StationHelpers.realStation.js'

// Shipped templates use this custom key instead of the default ConnectionUrl;
// retain it to verify diagnostics name the configured key, not the default.
const OCPP_SUPERVISION_URL_KEY = 'ocppcentraladdress'
const MALFORMED_SUPERVISION_URL = 'not a url'

const stationInternalsOf = (
  station: ChargingStation
): { creationOptions?: ChargingStationOptions } =>
  station as unknown as { creationOptions?: ChargingStationOptions }

type SupervisionUrlWorkerMessage =
  | ChargingStationWorkerMessage<ChargingStationData>
  | { data: Pick<Error, 'message' | 'stack'>; event: 'supervisionUrlFailure' }
  | { data: SupervisionUrlWorkerScenario[]; event: 'supervisionUrlResult' }

interface SupervisionUrlWorkerScenario {
  accepted: SupervisionUrlWorkerState
  persistedAfter: string
  persistedBefore: string
  rejected: SupervisionUrlWorkerState
  rejection?: Pick<Error, 'message' | 'name'>
  supervisionUrlOcppConfiguration: boolean
}

interface SupervisionUrlWorkerState {
  connectionUrl: string
  creationOptions?: ChargingStationOptions
  ocppUrl?: string
  stationInfo: Pick<
    ChargingStationOptions,
    'supervisionPassword' | 'supervisionUrls' | 'supervisionUser'
  >
}
await describe('ChargingStation supervision URL validation', async () => {
  afterEach(async () => {
    // A station built with persistence writes its configuration from an
    // AsyncLock continuation, i.e. after this synchronous teardown point.
    // Drain it so `cleanupStationTemplates()` removes every temp dir.
    await flushMicrotasks()
    standardCleanup()
    cleanupStationTemplates()
  })

  await it('should reject a malformed supervision URL with a field-naming configuration error', () => {
    // A template with a relative or malformed supervision URL must surface a
    // structured configuration error, never the bare `TypeError` from `new URL()`.
    for (const malformedUrl of ['/relative', MALFORMED_SUPERVISION_URL]) {
      assert.throws(
        () =>
          createStationFromTemplate(copyStationTemplate({ supervisionUrls: malformedUrl }), {
            baseName: TEST_CHARGING_STATION_BASE_NAME,
            fixedName: true,
            persistentConfiguration: false,
            supervisionUrls: malformedUrl,
          }),
        {
          message: `${TEST_CHARGING_STATION_BASE_NAME}: Invalid supervision url '${malformedUrl}' configured in 'supervisionUrls'`,
          name: 'BaseError',
        }
      )
    }
  })

  await it('should revert stationInfo.supervisionUrls when setSupervisionUrl rejects the URL', () => {
    const station = createStationFromTemplate(copyStationTemplate(), {
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      fixedName: true,
      persistentConfiguration: false,
    })
    const initialSupervisionUrls = station.stationInfo?.supervisionUrls

    assert.throws(
      () => {
        station.setSupervisionUrl(MALFORMED_SUPERVISION_URL)
      },
      {
        message: `${TEST_CHARGING_STATION_BASE_NAME}: Invalid supervision url '${MALFORMED_SUPERVISION_URL}' configured in 'supervisionUrls'`,
        name: 'BaseError',
      }
    )
    assert.strictEqual(station.stationInfo?.supervisionUrls, initialSupervisionUrls)
    // The retained creation options are only mirrored on success, so a rejected
    // update must not leak into the reset/template-reload path either.
    assert.strictEqual(
      stationInternalsOf(station).creationOptions?.supervisionUrls,
      initialSupervisionUrls
    )
  })

  await it('should reject a malformed URL on the OCPP-configuration supervision branch', () => {
    // This branch writes the URL into an OCPP configuration key and never calls
    // getConfiguredSupervisionUrl, so it needs its own validation: a value that
    // is not checked here would surface later as a bare TypeError from
    // wsConnectionUrl.
    const station = createStationFromTemplate(
      copyStationTemplate({
        supervisionUrlOcppConfiguration: true,
        supervisionUrlOcppKey: OCPP_SUPERVISION_URL_KEY,
      }),
      { baseName: TEST_CHARGING_STATION_BASE_NAME, fixedName: true, persistentConfiguration: false }
    )
    const initialWsConnectionUrl = station.wsConnectionUrl.href

    assert.throws(
      () => {
        station.setSupervisionUrl(MALFORMED_SUPERVISION_URL)
      },
      {
        message: `${TEST_CHARGING_STATION_BASE_NAME}: Invalid supervision url '${MALFORMED_SUPERVISION_URL}' configured in '${OCPP_SUPERVISION_URL_KEY}'`,
        name: 'BaseError',
      }
    )
    // The rejected value must not have reached the OCPP configuration key.
    assert.strictEqual(station.wsConnectionUrl.href, initialWsConnectionUrl)
  })

  await it('should reject a malformed supervision URL seeded in the OCPP configuration key', () => {
    // The OCPP configuration key can carry the supervision URL without going
    // through setSupervisionUrl (template Configuration, or an OCPP
    // ChangeConfiguration). The wsConnectionUrl getter is the only place that
    // parses it, so it must raise the structured error too.
    const station = createStationFromTemplate(
      copyStationTemplate({
        Configuration: {
          configurationKey: [
            {
              key: OCPP_SUPERVISION_URL_KEY,
              readonly: false,
              value: MALFORMED_SUPERVISION_URL,
            },
          ],
        },
        supervisionUrlOcppConfiguration: true,
        supervisionUrlOcppKey: OCPP_SUPERVISION_URL_KEY,
      }),
      { baseName: TEST_CHARGING_STATION_BASE_NAME, fixedName: true, persistentConfiguration: false }
    )

    assert.throws(() => station.wsConnectionUrl, {
      message: `${TEST_CHARGING_STATION_BASE_NAME}: Invalid supervision url '${MALFORMED_SUPERVISION_URL}' configured in '${OCPP_SUPERVISION_URL_KEY}'`,
      name: 'BaseError',
    })
  })

  await it('should normalize supervision URLs in a worker and preserve persisted state on rejection', async () => {
    // Arrange: a real worker exercises the updated event and both storage branches.
    const url = 'wss://EXAMPLE.org:443 '
    const updatedUrls: string[] = []
    const worker = new Worker(new URL('./fixtures/supervisionUrlWorker.mjs', import.meta.url), {
      execArgv: [],
      workerData: {
        key: OCPP_SUPERVISION_URL_KEY,
        stationId: TEST_CHARGING_STATION_BASE_NAME,
        url,
      },
    })
    try {
      // Act: the fixture performs a valid update, then a rejected update, and drains persistence.
      const scenarios = await new Promise<SupervisionUrlWorkerScenario[]>((resolve, reject) => {
        worker.on('message', (message: SupervisionUrlWorkerMessage) => {
          if (message.event === 'supervisionUrlResult') {
            resolve(message.data)
          } else if (message.event === 'supervisionUrlFailure') {
            const error = new BaseError(message.data.message)
            error.stack = message.data.stack
            reject(error)
          } else if (message.event === ChargingStationWorkerMessageEvents.updated) {
            updatedUrls.push(message.data.supervisionUrl)
          }
        })
        worker.once('error', reject)
        worker.once('exit', code => {
          reject(
            new BaseError(
              `Supervision URL worker exited before returning results (code ${code.toString()})`
            )
          )
        })
      })

      // Assert: successful normalization preserves raw reset options and rejected updates change nothing.
      assert.deepStrictEqual(
        scenarios.map(scenario => scenario.supervisionUrlOcppConfiguration),
        [false, true]
      )
      assert.deepStrictEqual(updatedUrls, [
        `wss://example.org/${TEST_CHARGING_STATION_BASE_NAME}`,
        `wss://example.org/${TEST_CHARGING_STATION_BASE_NAME}`,
      ])
      for (const scenario of scenarios) {
        const field = scenario.supervisionUrlOcppConfiguration
          ? OCPP_SUPERVISION_URL_KEY
          : 'supervisionUrls'
        assert.strictEqual(
          scenario.accepted.connectionUrl,
          `wss://example.org/${TEST_CHARGING_STATION_BASE_NAME}`
        )
        assert.strictEqual(scenario.accepted.creationOptions?.supervisionUrls, url)
        assert.strictEqual(scenario.accepted.creationOptions.supervisionUser, 'new-user')
        assert.strictEqual(scenario.accepted.creationOptions.supervisionPassword, '')
        assert.strictEqual(scenario.accepted.stationInfo.supervisionUser, 'new-user')
        assert.strictEqual(scenario.accepted.stationInfo.supervisionPassword, '')
        const persisted = JSON.parse(scenario.persistedBefore) as ChargingStationConfiguration
        assert.strictEqual(persisted.stationInfo?.supervisionUser, 'new-user')
        assert.strictEqual(persisted.stationInfo.supervisionPassword, '')
        if (scenario.supervisionUrlOcppConfiguration) {
          assert.strictEqual(scenario.accepted.ocppUrl, 'wss://example.org/')
          assert.strictEqual(
            persisted.configurationKey?.find(key => key.key === OCPP_SUPERVISION_URL_KEY)?.value,
            'wss://example.org/'
          )
        } else {
          assert.strictEqual(scenario.accepted.stationInfo.supervisionUrls, url)
          assert.strictEqual(persisted.stationInfo.supervisionUrls, url)
        }
        assert.deepStrictEqual(scenario.rejection, {
          message: `${TEST_CHARGING_STATION_BASE_NAME}: Invalid supervision url '${MALFORMED_SUPERVISION_URL}' configured in '${field}'`,
          name: 'BaseError',
        })
        assert.deepStrictEqual(scenario.rejected, scenario.accepted)
        assert.strictEqual(scenario.persistedAfter, scenario.persistedBefore)
      }
    } finally {
      await worker.terminate()
    }
  })
  await it('should accept a valid supervision URL on every entry path', () => {
    const station = createStationFromTemplate(copyStationTemplate(), {
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      fixedName: true,
      persistentConfiguration: false,
    })

    station.setSupervisionUrl(TEST_SUPERVISION_URL_ALT_PORT)
    assert.strictEqual(
      station.wsConnectionUrl.href,
      `${TEST_SUPERVISION_URL_ALT_PORT}/${TEST_CHARGING_STATION_BASE_NAME}`
    )
  })
})
