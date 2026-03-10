/**
 * @file Tests for OCPP16IncomingRequestService Configuration
 * @description Unit tests for OCPP 1.6 ChangeConfiguration (§5.4) and GetConfiguration (§5.8)
 *   incoming request handlers
 */

import assert from 'node:assert/strict'
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

await describe('OCPP16IncomingRequestService — Configuration', async () => {
  let testContext: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    testContext = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  // ---------------------------------------------------------------------------
  // ChangeConfiguration (§5.4)
  // ---------------------------------------------------------------------------

  // @spec §5.4 — TC_030_CS: Change a mutable key → Accepted
  await it('should accept changing a mutable configuration key', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(station, OCPP16StandardParametersKey.MeterValueSampleInterval, '60')
    const request: ChangeConfigurationRequest = {
      key: OCPP16StandardParametersKey.MeterValueSampleInterval,
      value: '30',
    }

    // Act
    const response = testableService.handleRequestChangeConfiguration(station, request)

    // Assert
    assert.strictEqual(response.status, OCPP16ConfigurationStatus.ACCEPTED)
  })

  // @spec §5.4 — TC_031_CS: Change a readonly key → Rejected
  await it('should reject changing a readonly configuration key', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(station, OCPP16StandardParametersKey.HeartbeatInterval, '60', true)
    const request: ChangeConfigurationRequest = {
      key: OCPP16StandardParametersKey.HeartbeatInterval,
      value: '30',
    }

    // Act
    const response = testableService.handleRequestChangeConfiguration(station, request)

    // Assert
    assert.strictEqual(response.status, OCPP16ConfigurationStatus.REJECTED)
  })

  // @spec §5.4 — TC_032_CS: Change key with reboot: true → RebootRequired
  await it('should return RebootRequired when changing a key that requires reboot', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(station, 'RebootKey', 'oldValue')
    // Manually set reboot flag since upsertConfigurationKey doesn't support it
    const configKey = station.ocppConfiguration?.configurationKey?.find(k => k.key === 'RebootKey')
    if (configKey != null) {
      configKey.reboot = true
    }
    const request: ChangeConfigurationRequest = {
      key: 'RebootKey',
      value: 'newValue',
    }

    // Act
    const response = testableService.handleRequestChangeConfiguration(station, request)

    // Assert
    assert.strictEqual(response.status, OCPP16ConfigurationStatus.REBOOT_REQUIRED)
  })

  // @spec §5.4 — TC_033_CS: Change unknown key → NotSupported
  await it('should return NotSupported for an unknown configuration key', () => {
    // Arrange
    const { station, testableService } = testContext
    const request: ChangeConfigurationRequest = {
      key: 'NonExistentKey',
      value: 'anyValue',
    }

    // Act
    const response = testableService.handleRequestChangeConfiguration(station, request)

    // Assert
    assert.strictEqual(response.status, OCPP16ConfigurationStatus.NOT_SUPPORTED)
  })

  // ---------------------------------------------------------------------------
  // GetConfiguration (§5.8)
  // ---------------------------------------------------------------------------

  // @spec §5.8 — TC_030_CS: Get all keys (no filter) → returns all visible keys
  await it('should return all visible keys when no key filter is provided', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(station, OCPP16StandardParametersKey.HeartbeatInterval, '60')
    upsertConfigurationKey(station, OCPP16StandardParametersKey.MeterValueSampleInterval, '30')
    const request: GetConfigurationRequest = {}

    // Act
    const response = testableService.handleRequestGetConfiguration(station, request)

    // Assert
    assert.notStrictEqual(response.configurationKey, undefined)
    assert.notStrictEqual(response.unknownKey, undefined)
    assert.ok(response.configurationKey.length >= 2)
    const heartbeatKey = response.configurationKey.find(
      k => k.key === (OCPP16StandardParametersKey.HeartbeatInterval as string)
    )
    assert.notStrictEqual(heartbeatKey, undefined)
    assert.strictEqual(heartbeatKey?.value, '60')
  })

  // @spec §5.8 — TC_031_CS: Get specific existing key → returns matching key
  await it('should return a specific existing configuration key', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(station, OCPP16StandardParametersKey.WebSocketPingInterval, '10')
    const request: GetConfigurationRequest = {
      key: [OCPP16StandardParametersKey.WebSocketPingInterval],
    }

    // Act
    const response = testableService.handleRequestGetConfiguration(station, request)

    // Assert
    assert.strictEqual(response.configurationKey.length, 1)
    assert.strictEqual(
      response.configurationKey[0].key,
      OCPP16StandardParametersKey.WebSocketPingInterval
    )
    assert.strictEqual(response.configurationKey[0].value, '10')
    assert.strictEqual(response.unknownKey.length, 0)
  })

  // @spec §5.8 — TC_032_CS: Get non-existent key → appears in unknownKey list
  await it('should report a non-existent key in the unknownKey list', () => {
    // Arrange
    const { station, testableService } = testContext
    const request: GetConfigurationRequest = {
      key: ['CompletelyUnknownKey'],
    }

    // Act
    const response = testableService.handleRequestGetConfiguration(station, request)

    // Assert
    assert.strictEqual(response.configurationKey.length, 0)
    assert.strictEqual(response.unknownKey.length, 1)
    assert.strictEqual(response.unknownKey[0], 'CompletelyUnknownKey')
  })

  // @spec §5.8 — TC_033_CS: Get mix of existing and non-existent keys
  await it('should return both configurationKey and unknownKey for mixed requests', () => {
    // Arrange
    const { station, testableService } = testContext
    upsertConfigurationKey(station, OCPP16StandardParametersKey.HeartbeatInterval, '45')
    const request: GetConfigurationRequest = {
      key: [OCPP16StandardParametersKey.HeartbeatInterval, 'DoesNotExistKey'],
    }

    // Act
    const response = testableService.handleRequestGetConfiguration(station, request)

    // Assert
    assert.strictEqual(response.configurationKey.length, 1)
    assert.strictEqual(
      response.configurationKey[0].key,
      OCPP16StandardParametersKey.HeartbeatInterval
    )
    assert.strictEqual(response.configurationKey[0].value, '45')
    assert.strictEqual(response.unknownKey.length, 1)
    assert.strictEqual(response.unknownKey[0], 'DoesNotExistKey')
  })
})
