/**
 * @file Tests for OCPP16 Integration — Configuration Management
 * @see OCPP 1.6 — §5.4 ChangeConfiguration, §5.8 GetConfiguration
 * @description Multi-step integration tests verifying ChangeConfiguration → GetConfiguration
 *   roundtrips for OCPP 1.6 configuration management flows
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  ChangeConfigurationRequest,
  GetConfigurationRequest,
} from '../../../../src/types/index.js'

import { OCPP16StandardParametersKey } from '../../../../src/types/index.js'
import { OCPP16ConfigurationStatus } from '../../../../src/types/ocpp/1.6/Responses.js'
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
    upsertConfigurationKey(
      station,
      OCPP16StandardParametersKey.MeterValueSampleInterval,
      '60'
    )
    const changeRequest: ChangeConfigurationRequest = {
      key: OCPP16StandardParametersKey.MeterValueSampleInterval,
      value: '15',
    }

    // Act — Change
    const changeResponse = testableService.handleRequestChangeConfiguration(station, changeRequest)

    // Assert — Change accepted
    expect(changeResponse.status).toBe(OCPP16ConfigurationStatus.ACCEPTED)

    // Act — Get
    const getRequest: GetConfigurationRequest = {
      key: [OCPP16StandardParametersKey.MeterValueSampleInterval],
    }
    const getResponse = testableService.handleRequestGetConfiguration(station, getRequest)

    // Assert — Value matches what was set
    expect(getResponse.configurationKey.length).toBe(1)
    expect(getResponse.configurationKey[0].key).toBe(
      OCPP16StandardParametersKey.MeterValueSampleInterval
    )
    expect(getResponse.configurationKey[0].value).toBe('15')
    expect(getResponse.unknownKey.length).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // 2. Multiple key changes → GetConfiguration (all)
  // ---------------------------------------------------------------------------

  await it('should reflect all changed values when getting configuration after multiple changes', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(
      station,
      OCPP16StandardParametersKey.MeterValueSampleInterval,
      '60'
    )
    upsertConfigurationKey(
      station,
      OCPP16StandardParametersKey.WebSocketPingInterval,
      '30'
    )
    upsertConfigurationKey(
      station,
      OCPP16StandardParametersKey.ConnectionTimeOut,
      '120'
    )

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
    expect(change1.status).toBe(OCPP16ConfigurationStatus.ACCEPTED)
    expect(change2.status).toBe(OCPP16ConfigurationStatus.ACCEPTED)
    expect(change3.status).toBe(OCPP16ConfigurationStatus.ACCEPTED)

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
    expect(meterKey).toBeDefined()
    expect(meterKey?.value).toBe('10')
    expect(wsKey).toBeDefined()
    expect(wsKey?.value).toBe('5')
    expect(connKey).toBeDefined()
    expect(connKey?.value).toBe('60')
  })

  // ---------------------------------------------------------------------------
  // 3. Readonly key protection
  // ---------------------------------------------------------------------------

  await it('should reject changing a readonly key and preserve original value on retrieval', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(
      station,
      OCPP16StandardParametersKey.HeartbeatInterval,
      '60',
      true
    )

    // Act — Attempt to change readonly key
    const changeRequest: ChangeConfigurationRequest = {
      key: OCPP16StandardParametersKey.HeartbeatInterval,
      value: '999',
    }
    const changeResponse = testableService.handleRequestChangeConfiguration(station, changeRequest)

    // Assert — Rejected
    expect(changeResponse.status).toBe(OCPP16ConfigurationStatus.REJECTED)

    // Act — Verify value unchanged via GetConfiguration
    const getResponse = testableService.handleRequestGetConfiguration(station, {
      key: [OCPP16StandardParametersKey.HeartbeatInterval],
    })

    // Assert — Original value preserved
    expect(getResponse.configurationKey.length).toBe(1)
    expect(getResponse.configurationKey[0].value).toBe('60')
    expect(getResponse.configurationKey[0].readonly).toBe(true)
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
    expect(changeResponse.status).toBe(OCPP16ConfigurationStatus.REBOOT_REQUIRED)

    // Act — Verify value was actually updated despite reboot being needed
    const getResponse = testableService.handleRequestGetConfiguration(station, {
      key: ['RebootRequiredKey'],
    })

    // Assert — Value updated
    expect(getResponse.configurationKey.length).toBe(1)
    expect(getResponse.configurationKey[0].key).toBe('RebootRequiredKey')
    expect(getResponse.configurationKey[0].value).toBe('newValue')
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
    expect(changeResponse.status).toBe(OCPP16ConfigurationStatus.NOT_SUPPORTED)

    // Act — Verify key is not in configuration
    const getResponse = testableService.handleRequestGetConfiguration(station, {
      key: ['CompletelyUnknownConfigKey'],
    })

    // Assert — Key appears in unknownKey list, not in configurationKey
    expect(getResponse.configurationKey.length).toBe(0)
    expect(getResponse.unknownKey.length).toBe(1)
    expect(getResponse.unknownKey[0]).toBe('CompletelyUnknownConfigKey')
  })

  // ---------------------------------------------------------------------------
  // 6. Get all keys after multiple changes
  // ---------------------------------------------------------------------------

  await it('should return all visible keys including changed ones when getting all configuration', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(
      station,
      OCPP16StandardParametersKey.HeartbeatInterval,
      '30'
    )
    upsertConfigurationKey(
      station,
      OCPP16StandardParametersKey.MeterValueSampleInterval,
      '60'
    )
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
    expect(getResponse.configurationKey.length >= 3).toBe(true)
    expect(getResponse.unknownKey.length).toBe(0)

    const heartbeat = getResponse.configurationKey.find(
      k => k.key === (OCPP16StandardParametersKey.HeartbeatInterval as string)
    )
    const meterInterval = getResponse.configurationKey.find(
      k => k.key === (OCPP16StandardParametersKey.MeterValueSampleInterval as string)
    )
    const vendorKey = getResponse.configurationKey.find(
      k => k.key === 'VendorCustomKey'
    )

    expect(heartbeat).toBeDefined()
    expect(heartbeat?.value).toBe('30')
    expect(meterInterval).toBeDefined()
    expect(meterInterval?.value).toBe('20')
    expect(vendorKey).toBeDefined()
    expect(vendorKey?.value).toBe('updated')
  })
})
