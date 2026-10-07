/**
 * @file Tests that a charging station rejects a malformed supervision URL with a structured configuration error.
 * @description A relative or malformed supervision URL must surface a `BaseError`
 * naming the offending field and the station instead of leaking the `TypeError`
 * from `new URL()`, on every entry path: template/configuration loading,
 * `setSupervisionUrl` (both branches) and the `wsConnectionUrl` getter.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import type { ChargingStationOptions } from '../../src/types/index.js'

import { flushMicrotasks, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import {
  cleanupStationTemplates,
  copyStationTemplate,
  createStationFromTemplate,
} from './helpers/StationHelpers.realStation.js'

// OCPP configuration key used by the shipped station templates that route the
// supervision URL through the OCPP configuration (`supervisionUrlOcppConfiguration`).
const OCPP_SUPERVISION_URL_KEY = 'ocppcentraladdress'
const MALFORMED_SUPERVISION_URL = 'not a url'
// Fixed identity so the getter diagnostic (base URL plus station identity) is
// independent of the worker index.
const FIXED_STATION_NAME = 'CS-URL'

const stationInternalsOf = (
  station: ChargingStation
): { creationOptions?: ChargingStationOptions } =>
  station as unknown as { creationOptions?: ChargingStationOptions }

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
            baseName: FIXED_STATION_NAME,
            fixedName: true,
            persistentConfiguration: false,
            supervisionUrls: malformedUrl,
          }),
        {
          message: `${FIXED_STATION_NAME}: Invalid supervision url '${malformedUrl}' configured in 'supervisionUrls'`,
          name: 'BaseError',
        }
      )
    }
  })

  await it('should revert stationInfo.supervisionUrls when setSupervisionUrl rejects the URL', () => {
    const station = createStationFromTemplate(copyStationTemplate(), {
      baseName: FIXED_STATION_NAME,
      fixedName: true,
      persistentConfiguration: false,
    })
    const initialSupervisionUrls = station.stationInfo?.supervisionUrls

    assert.throws(
      () => {
        station.setSupervisionUrl(MALFORMED_SUPERVISION_URL)
      },
      {
        message: `${FIXED_STATION_NAME}: Invalid supervision url '${MALFORMED_SUPERVISION_URL}' configured in 'supervisionUrls'`,
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
      { baseName: FIXED_STATION_NAME, fixedName: true, persistentConfiguration: false }
    )
    const initialWsConnectionUrl = station.wsConnectionUrl.href

    assert.throws(
      () => {
        station.setSupervisionUrl(MALFORMED_SUPERVISION_URL)
      },
      {
        message: `${FIXED_STATION_NAME}: Invalid supervision url '${MALFORMED_SUPERVISION_URL}' configured in '${OCPP_SUPERVISION_URL_KEY}'`,
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
      { baseName: FIXED_STATION_NAME, fixedName: true, persistentConfiguration: false }
    )

    assert.throws(() => station.wsConnectionUrl, {
      message: `${FIXED_STATION_NAME}: Invalid supervision url '${MALFORMED_SUPERVISION_URL}' configured in '${OCPP_SUPERVISION_URL_KEY}'`,
      name: 'BaseError',
    })
  })

  await it('should accept a valid supervision URL on every entry path', () => {
    const station = createStationFromTemplate(copyStationTemplate(), {
      baseName: FIXED_STATION_NAME,
      fixedName: true,
      persistentConfiguration: false,
    })

    station.setSupervisionUrl('ws://localhost:8888/')
    assert.strictEqual(station.wsConnectionUrl.href, `ws://localhost:8888/${FIXED_STATION_NAME}`)
  })
})
