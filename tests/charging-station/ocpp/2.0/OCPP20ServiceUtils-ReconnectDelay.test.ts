/**
 * @file Tests for OCPP20ServiceUtils.computeReconnectDelay
 * @description Verifies OCPP 2.0.1 §8.1-§8.3 RetryBackOff reconnection delay computation,
 * including default values, variable-configured values, and retry capping.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { buildConfigKey } from '../../../../src/charging-station/index.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  OCPP20ComponentName,
  OCPP20OptionalVariableName,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { upsertConfigurationKey } from './OCPP20TestUtils.js'

const DEFAULT_WAIT_MINIMUM_S = 30
const DEFAULT_RANDOM_RANGE_S = 10
const DEFAULT_REPEAT_TIMES = 5

const MS_PER_SECOND = 1000

/**
 * @param station - target station
 * @param waitMinimum - RetryBackOffWaitMinimum in seconds
 * @param randomRange - RetryBackOffRandomRange in seconds
 * @param repeatTimes - RetryBackOffRepeatTimes count
 */
function setRetryBackOffVariables (
  station: ChargingStation,
  waitMinimum: number,
  randomRange: number,
  repeatTimes: number
): void {
  upsertConfigurationKey(
    station,
    buildConfigKey(
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.RetryBackOffWaitMinimum
    ),
    waitMinimum.toString()
  )
  upsertConfigurationKey(
    station,
    buildConfigKey(
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.RetryBackOffRandomRange
    ),
    randomRange.toString()
  )
  upsertConfigurationKey(
    station,
    buildConfigKey(
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.RetryBackOffRepeatTimes
    ),
    repeatTimes.toString()
  )
}

await describe('OCPP20ServiceUtils.computeReconnectDelay', async () => {
  let station: ChargingStation

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        chargingStationId: TEST_CHARGING_STATION_BASE_NAME,
        ocppVersion: OCPPVersion.VERSION_201,
      },
    })
    station = mockStation
  })

  afterEach(() => {
    OCPP20VariableManager.getInstance().resetRuntimeOverrides()
    standardCleanup()
  })

  await it('should compute delay using RetryBackOff variables', () => {
    // Arrange
    const configuredWaitMinimum = 20
    const configuredRandomRange = 5
    const configuredRepeatTimes = 3
    setRetryBackOffVariables(
      station,
      configuredWaitMinimum,
      configuredRandomRange,
      configuredRepeatTimes
    )
    const retryCount = 2

    // Act
    const delay = OCPP20ServiceUtils.computeReconnectDelay(station, retryCount)

    // Assert — delay = waitMinimum * 2^(retryCount-1) + jitter ∈ [0, randomRange)
    const expectedBaseDelayMs = configuredWaitMinimum * MS_PER_SECOND * 2 ** (retryCount - 1)
    const maxJitterMs = configuredRandomRange * MS_PER_SECOND
    assert.ok(delay >= expectedBaseDelayMs, 'delay should be >= base')
    assert.ok(delay < expectedBaseDelayMs + maxJitterMs, 'delay should be < base + jitter')
  })

  await it('should use default values when variables not configured', () => {
    const retryCount = 1

    // Act
    const delay = OCPP20ServiceUtils.computeReconnectDelay(station, retryCount)

    // Assert — retryCount=1 → effectiveRetry=0 → baseDelay = 30s * 2^0 = 30000ms
    const expectedBaseDelayMs = DEFAULT_WAIT_MINIMUM_S * MS_PER_SECOND
    const maxJitterMs = DEFAULT_RANDOM_RANGE_S * MS_PER_SECOND
    assert.ok(delay >= expectedBaseDelayMs, 'delay should be >= default base')
    assert.ok(delay < expectedBaseDelayMs + maxJitterMs, 'delay should be < default base + jitter')
  })

  await it('should cap retry doubling at RetryBackOffRepeatTimes', () => {
    const retryCountBeyondCap = 20
    const retryCountAtCap = DEFAULT_REPEAT_TIMES + 1

    // Act
    const delayBeyondCap = OCPP20ServiceUtils.computeReconnectDelay(station, retryCountBeyondCap)
    const delayAtCap = OCPP20ServiceUtils.computeReconnectDelay(station, retryCountAtCap)

    // Assert — both capped: effectiveRetry = min(retryCount-1, repeatTimes) = 5
    // baseDelay = 30s * 2^5 = 960000ms
    const cappedBaseDelayMs = DEFAULT_WAIT_MINIMUM_S * MS_PER_SECOND * 2 ** DEFAULT_REPEAT_TIMES
    const maxJitterMs = DEFAULT_RANDOM_RANGE_S * MS_PER_SECOND
    assert.ok(delayBeyondCap >= cappedBaseDelayMs, 'beyond-cap delay should be >= capped base')
    assert.ok(
      delayBeyondCap < cappedBaseDelayMs + maxJitterMs,
      'beyond-cap delay should be < capped base + jitter'
    )
    assert.ok(delayAtCap >= cappedBaseDelayMs, 'at-cap delay should be >= capped base')
    assert.ok(
      delayAtCap < cappedBaseDelayMs + maxJitterMs,
      'at-cap delay should be < capped base + jitter'
    )
  })
})
