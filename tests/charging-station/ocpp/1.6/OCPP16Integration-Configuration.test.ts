/**
 * @file Tests for OCPP16 Integration — Configuration Management
 * @see OCPP 1.6 — §5.4 ChangeConfiguration, §5.8 GetConfiguration
 * @description Multi-step integration tests verifying ChangeConfiguration → GetConfiguration
 *   roundtrips for OCPP 1.6 configuration management flows
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  ChangeConfigurationRequest,
  GetConfigurationRequest,
} from '../../../../src/types/index.js'

import {
  OCPP16ConfigurationStatus,
  OCPP16StandardParametersKey,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  type OCPP16IncomingRequestTestContext,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

await describe('OCPP16 Integration — Configuration Management', async () => {
  let testContext: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    testContext = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  // ---------------------------------------------------------------------------
  // 1. Change → Get roundtrip
  // ---------------------------------------------------------------------------

  await it('should reflect changed value when retrieving a mutable key after ChangeConfiguration', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(station, OCPP16StandardParametersKey.MeterValueSampleInterval, '60')
    const changeRequest: ChangeConfigurationRequest = {
      key: OCPP16StandardParametersKey.MeterValueSampleInterval,
      value: '15',
    }

    // Act — Change
    const changeResponse = testableService.handleRequestChangeConfiguration(station, changeRequest)

    // Assert — Change accepted
    assert.strictEqual(changeResponse.status, OCPP16ConfigurationStatus.ACCEPTED)

    // Act — Get
    const getRequest: GetConfigurationRequest = {
      key: [OCPP16StandardParametersKey.MeterValueSampleInterval],
    }
    const getResponse = testableService.handleRequestGetConfiguration(station, getRequest)

    // Assert — Value matches what was set
    assert.strictEqual(getResponse.configurationKey.length, 1)
    assert.strictEqual(
      getResponse.configurationKey[0].key,
      OCPP16StandardParametersKey.MeterValueSampleInterval
    )
    assert.strictEqual(getResponse.configurationKey[0].value, '15')
    assert.strictEqual(getResponse.unknownKey.length, 0)
  })

  // ---------------------------------------------------------------------------
  // 2. Multiple key changes → GetConfiguration (all)
  // ---------------------------------------------------------------------------

  await it('should reflect all changed values when getting configuration after multiple changes', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(station, OCPP16StandardParametersKey.MeterValueSampleInterval, '60')
    upsertConfigurationKey(station, OCPP16StandardParametersKey.WebSocketPingInterval, '30')
    upsertConfigurationKey(station, OCPP16StandardParametersKey.ConnectionTimeOut, '120')

    // Act — Change multiple keys
    const change1 = testableService.handleRequestChangeConfiguration(station, {
      key: OCPP16StandardParametersKey.MeterValueSampleInterval,
      value: '10',
    })
    const change2 = testableService.handleRequestChangeConfiguration(station, {
      key: OCPP16StandardParametersKey.WebSocketPingInterval,
      value: '5',
    })
    const change3 = testableService.handleRequestChangeConfiguration(station, {
      key: OCPP16StandardParametersKey.ConnectionTimeOut,
      value: '60',
    })

    // Assert — All changes accepted
    assert.strictEqual(change1.status, OCPP16ConfigurationStatus.ACCEPTED)
    assert.strictEqual(change2.status, OCPP16ConfigurationStatus.ACCEPTED)
    assert.strictEqual(change3.status, OCPP16ConfigurationStatus.ACCEPTED)

    // Act — Get all keys
    const getResponse = testableService.handleRequestGetConfiguration(station, {})

    // Assert — All changed values reflected
    const meterKey = getResponse.configurationKey.find(
      k => k.key === (OCPP16StandardParametersKey.MeterValueSampleInterval as string)
    )
    const wsKey = getResponse.configurationKey.find(
      k => k.key === (OCPP16StandardParametersKey.WebSocketPingInterval as string)
    )
    const connKey = getResponse.configurationKey.find(
      k => k.key === (OCPP16StandardParametersKey.ConnectionTimeOut as string)
    )
    assert.notStrictEqual(meterKey, undefined)
    assert.strictEqual(meterKey?.value, '10')
    assert.notStrictEqual(wsKey, undefined)
    assert.strictEqual(wsKey?.value, '5')
    assert.notStrictEqual(connKey, undefined)
    assert.strictEqual(connKey?.value, '60')
  })

  // ---------------------------------------------------------------------------
  // 3. Readonly key protection
  // ---------------------------------------------------------------------------

  await it('should reject changing a readonly key and preserve original value on retrieval', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(station, OCPP16StandardParametersKey.HeartbeatInterval, '60', true)

    // Act — Attempt to change readonly key
    const changeRequest: ChangeConfigurationRequest = {
      key: OCPP16StandardParametersKey.HeartbeatInterval,
      value: '999',
    }
    const changeResponse = testableService.handleRequestChangeConfiguration(station, changeRequest)

    // Assert — Rejected
    assert.strictEqual(changeResponse.status, OCPP16ConfigurationStatus.REJECTED)

    // Act — Verify value unchanged via GetConfiguration
    const getResponse = testableService.handleRequestGetConfiguration(station, {
      key: [OCPP16StandardParametersKey.HeartbeatInterval],
    })

    // Assert — Original value preserved
    assert.strictEqual(getResponse.configurationKey.length, 1)
    assert.strictEqual(getResponse.configurationKey[0].value, '60')
    assert.strictEqual(getResponse.configurationKey[0].readonly, true)
  })

  // ---------------------------------------------------------------------------
  // 4. RebootRequired key
  // ---------------------------------------------------------------------------

  await it('should return RebootRequired and update value for a key with reboot flag', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(station, 'RebootRequiredKey', 'oldValue')
    const configKey = station.ocppConfiguration?.configurationKey?.find(
      k => k.key === 'RebootRequiredKey'
    )
    if (configKey != null) {
      configKey.reboot = true
    }

    // Act — Change the reboot-requiring key
    const changeResponse = testableService.handleRequestChangeConfiguration(station, {
      key: 'RebootRequiredKey',
      value: 'newValue',
    })

    // Assert — RebootRequired returned
    assert.strictEqual(changeResponse.status, OCPP16ConfigurationStatus.REBOOT_REQUIRED)

    // Act — Verify value was actually updated despite reboot being needed
    const getResponse = testableService.handleRequestGetConfiguration(station, {
      key: ['RebootRequiredKey'],
    })

    // Assert — Value updated
    assert.strictEqual(getResponse.configurationKey.length, 1)
    assert.strictEqual(getResponse.configurationKey[0].key, 'RebootRequiredKey')
    assert.strictEqual(getResponse.configurationKey[0].value, 'newValue')
  })

  // ---------------------------------------------------------------------------
  // 5. Unknown key
  // ---------------------------------------------------------------------------

  await it('should return NotSupported for unknown key and not add it to configuration', () => {
    // Arrange
    const { station, testableService } = testContext

    // Act — Attempt to change a key that does not exist in configuration
    const changeResponse = testableService.handleRequestChangeConfiguration(station, {
      key: 'CompletelyUnknownConfigKey',
      value: 'someValue',
    })

    // Assert — NotSupported
    assert.strictEqual(changeResponse.status, OCPP16ConfigurationStatus.NOT_SUPPORTED)

    // Act — Verify key is not in configuration
    const getResponse = testableService.handleRequestGetConfiguration(station, {
      key: ['CompletelyUnknownConfigKey'],
    })

    // Assert — Key appears in unknownKey list, not in configurationKey
    assert.strictEqual(getResponse.configurationKey.length, 0)
    assert.strictEqual(getResponse.unknownKey.length, 1)
    assert.strictEqual(getResponse.unknownKey[0], 'CompletelyUnknownConfigKey')
  })

  // ---------------------------------------------------------------------------
  // 6. Get all keys after multiple changes
  // ---------------------------------------------------------------------------

  await it('should return all visible keys including changed ones when getting all configuration', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(station, OCPP16StandardParametersKey.HeartbeatInterval, '30')
    upsertConfigurationKey(station, OCPP16StandardParametersKey.MeterValueSampleInterval, '60')
    upsertConfigurationKey(station, 'VendorCustomKey', 'initial')

    // Act — Change some keys
    testableService.handleRequestChangeConfiguration(station, {
      key: OCPP16StandardParametersKey.MeterValueSampleInterval,
      value: '20',
    })
    testableService.handleRequestChangeConfiguration(station, {
      key: 'VendorCustomKey',
      value: 'updated',
    })

    // Act — Get all keys (no filter)
    const getResponse = testableService.handleRequestGetConfiguration(station, {})

    // Assert — All visible keys returned with correct values
    assert.ok(
      getResponse.configurationKey.length >= 3,
      'should return at least 3 configuration keys'
    )
    assert.strictEqual(getResponse.unknownKey.length, 0)

    const heartbeat = getResponse.configurationKey.find(
      k => k.key === (OCPP16StandardParametersKey.HeartbeatInterval as string)
    )
    const meterInterval = getResponse.configurationKey.find(
      k => k.key === (OCPP16StandardParametersKey.MeterValueSampleInterval as string)
    )
    const vendorKey = getResponse.configurationKey.find(k => k.key === 'VendorCustomKey')

    assert.notStrictEqual(heartbeat, undefined)
    assert.strictEqual(heartbeat?.value, '30')
    assert.notStrictEqual(meterInterval, undefined)
    assert.strictEqual(meterInterval?.value, '20')
    assert.notStrictEqual(vendorKey, undefined)
    assert.strictEqual(vendorKey?.value, 'updated')
  })
})
