/**
 * @file Tests for OCPPServiceUtils authorization wrapper functions
 * @description Verifies isIdTagAuthorized and isIdTagAuthorizedUnified functions
 *
 * Covers:
 * - isIdTagAuthorized — OCPP 1.6 legacy authorization (local auth list + remote authorization)
 * - isIdTagAuthorizedUnified — OCPP 2.0+ unified auth system with fallback
 *
 * Note: The unified auth subsystem (OCPPAuthService, strategies, adapters) has its own
 * dedicated test suite in tests/charging-station/ocpp/auth/. These tests verify the
 * wrapper/dispatch layer only — no overlap.
 */

import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import { getIdTagsFile } from '../../../src/charging-station/Helpers.js'
import {
  isIdTagAuthorized,
  isIdTagAuthorizedUnified,
} from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import { AuthorizationStatus, OCPPVersion } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../ChargingStationTestUtils.js'

interface StationLocalAuthOverrides {
  getLocalAuthListEnabled: () => boolean
  hasIdTags: () => boolean
}

/**
 * Configures local authorization on a mock station with the given id tags.
 * @param station - The mock station to configure
 * @param mocks - The mock infrastructure (for idTagsCache injection)
 * @param tags - Array of id tags to register in the local auth list
 */
function setupLocalAuth (
  station: ReturnType<typeof createMockChargingStation>['station'],
  mocks: ReturnType<typeof createMockChargingStation>['mocks'],
  tags: string[]
): void {
  const stationOverrides = station as unknown as StationLocalAuthOverrides
  stationOverrides.getLocalAuthListEnabled = () => true
  stationOverrides.hasIdTags = () => true
  const stationInfo = station.stationInfo
  if (stationInfo != null) {
    const resolvedPath = getIdTagsFile(stationInfo)
    if (resolvedPath != null) {
      mocks.idTagsCache.setIdTags(resolvedPath, tags)
    }
  }
}

await describe('OCPPServiceUtils — authorization wrappers', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('isIdTagAuthorized (OCPP 1.6 legacy)', async () => {
    await it('should return false when local and remote auth are both disabled', async () => {
      const { station } = createMockChargingStation({
        stationInfo: { remoteAuthorization: false },
      })
      const result = await isIdTagAuthorized(station, 1, 'TAG-001')
      expect(result).toBe(false)
    })

    await it('should authorize locally when tag is in local auth list', async () => {
      const { mocks, station } = createMockChargingStation({
        stationInfo: { idTagsFile: 'test-idtags.json' },
      })
      setupLocalAuth(station, mocks, ['TAG-001', 'TAG-002'])

      const result = await isIdTagAuthorized(station, 1, 'TAG-001')
      expect(result).toBe(true)
    })

    await it('should set localAuthorizeIdTag and idTagLocalAuthorized on local auth success', async () => {
      const { mocks, station } = createMockChargingStation({
        stationInfo: { idTagsFile: 'test-idtags.json' },
      })
      setupLocalAuth(station, mocks, ['TAG-001'])

      await isIdTagAuthorized(station, 1, 'TAG-001')

      const connectorStatus = station.getConnectorStatus(1)
      expect(connectorStatus?.localAuthorizeIdTag).toBe('TAG-001')
      expect(connectorStatus?.idTagLocalAuthorized).toBe(true)
    })

    await it('should authorize remotely when local auth is disabled and remote returns accepted', async () => {
      const { station } = createMockChargingStation({
        ocppRequestService: {
          requestHandler: () =>
            Promise.resolve({
              idTagInfo: { status: AuthorizationStatus.ACCEPTED },
            }),
        },
        stationInfo: { remoteAuthorization: true },
      })

      const result = await isIdTagAuthorized(station, 1, 'TAG-001')
      expect(result).toBe(true)
    })

    await it('should return false when remote authorization rejects the tag', async () => {
      const { station } = createMockChargingStation({
        ocppRequestService: {
          requestHandler: () =>
            Promise.resolve({
              idTagInfo: { status: AuthorizationStatus.BLOCKED },
            }),
        },
        stationInfo: { remoteAuthorization: true },
      })

      const result = await isIdTagAuthorized(station, 1, 'TAG-999')
      expect(result).toBe(false)
    })

    await it('should return false for non-existent connector even with local auth enabled', async () => {
      const { mocks, station } = createMockChargingStation({
        stationInfo: { idTagsFile: 'test-idtags.json', remoteAuthorization: false },
      })
      setupLocalAuth(station, mocks, ['TAG-001'])

      const result = await isIdTagAuthorized(station, 99, 'TAG-001')
      expect(result).toBe(false)
    })
  })

  await describe('isIdTagAuthorizedUnified', async () => {
    await it('should fall back to legacy auth for OCPP 1.6 station', async () => {
      const { mocks, station } = createMockChargingStation({
        stationInfo: { idTagsFile: 'test-idtags.json' },
      })
      setupLocalAuth(station, mocks, ['TAG-001'])

      const result = await isIdTagAuthorizedUnified(station, 1, 'TAG-001')
      expect(result).toBe(true)
    })

    await it('should return false on auth error for OCPP 2.0 station', async () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_20,
      })

      const result = await isIdTagAuthorizedUnified(station, 1, 'TAG-001')
      expect(result).toBe(false)
    })

    await it('should attempt unified auth service for OCPP 2.0.1 station', async () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_201,
      })

      const result = await isIdTagAuthorizedUnified(station, 1, 'TAG-001')
      expect(result).toBe(false)
    })
  })
})
