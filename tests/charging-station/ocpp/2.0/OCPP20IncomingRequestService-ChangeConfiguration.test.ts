/**
 * @file Tests for OCPP20IncomingRequestService changeConfiguration (local Web UI seam)
 * @description Unit tests for the generic configuration-change seam that resolves a flat
 *   configuration key name and routes it through the OCPP 2.0.1 SetVariables spec logic.
 */

import { millisecondsToSeconds } from 'date-fns'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  buildConfigKey,
  type ChargingStation,
  getConfigurationKey,
} from '../../../../src/charging-station/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  ConfigurationStatus,
  OCPP20ComponentName,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'

await describe('OCPP20IncomingRequestService — changeConfiguration seam', async () => {
  let station: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService

  beforeEach(() => {
    const mock = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = mock.station
    incomingRequestService = new OCPP20IncomingRequestService()
  })

  afterEach(() => {
    standardCleanup()
    OCPP20VariableManager.getInstance().resetRuntimeOverrides()
  })

  await it('should resolve a persisted composite key name back to its component/variable tuple', () => {
    const name = buildConfigKey(
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.HeartbeatInterval
    )

    const resolved = OCPP20VariableManager.getInstance().resolveConfigurationKeyName(name)

    assert.deepStrictEqual(resolved, {
      component: OCPP20ComponentName.OCPPCommCtrlr,
      instance: undefined,
      variable: OCPP20OptionalVariableName.HeartbeatInterval,
    })
  })

  await it('should return undefined when resolving a non-registry key name', () => {
    assert.strictEqual(
      OCPP20VariableManager.getInstance().resolveConfigurationKeyName('Not.A.RegistryKey'),
      undefined
    )
  })

  await it('should accept a writable key routed through SetVariables', () => {
    const name = buildConfigKey(
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.HeartbeatInterval
    )

    const status = incomingRequestService.changeConfiguration(
      station,
      name,
      (millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL_MS) + 1).toString()
    )

    assert.strictEqual(status, ConfigurationStatus.ACCEPTED)
  })

  await it('should reject a read-only registry variable', () => {
    const name = buildConfigKey(OCPP20ComponentName.ChargingStation, 'Available')

    const status = incomingRequestService.changeConfiguration(station, name, 'false')

    assert.strictEqual(status, ConfigurationStatus.REJECTED)
  })

  await it('should return RebootRequired for a reboot-required registry variable', () => {
    const name = buildConfigKey(
      OCPP20ComponentName.SecurityCtrlr,
      OCPP20RequiredVariableName.OrganizationName
    )

    const status = incomingRequestService.changeConfiguration(station, name, 'Acme Corporation')

    assert.strictEqual(status, ConfigurationStatus.REBOOT_REQUIRED)
  })

  await it('should resolve, accept and persist an instance-scoped registry variable', () => {
    // TariffCostCtrlr.Enabled has instance 'Cost' (ReadWrite/Persistent): the flat key
    // must round-trip through the component-scoped instance and persist the new value.
    const name = buildConfigKey(
      OCPP20ComponentName.TariffCostCtrlr,
      OCPP20RequiredVariableName.Enabled,
      'Cost'
    )

    const status = incomingRequestService.changeConfiguration(station, name, 'true')

    assert.strictEqual(status, ConfigurationStatus.ACCEPTED)
    assert.strictEqual(getConfigurationKey(station, name)?.value, 'true')
  })

  await it('should return NotSupported for a key that does not resolve to a registry variable', () => {
    const status = incomingRequestService.changeConfiguration(station, 'Not.A.RegistryKey', '42')

    assert.strictEqual(status, ConfigurationStatus.NOT_SUPPORTED)
  })
})
