/**
 * @file Tests for OCPP20CertSigningRetryManager
 * @description Verifies certificate signing retry lifecycle per OCPP 2.0.1 A02.FR.17-19
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { buildConfigKey } from '../../../../src/charging-station/ConfigurationKeyUtils.js'
import { OCPP20CertSigningRetryManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20CertSigningRetryManager.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  GenericStatus,
  OCPP20ComponentName,
  OCPP20OptionalVariableName,
  OCPP20RequestCommand,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import { upsertConfigurationKey } from './OCPP20TestUtils.js'

await describe('OCPP20CertSigningRetryManager', async () => {
  let station: ChargingStation
  let manager: OCPP20CertSigningRetryManager
  let requestHandlerMock: ReturnType<typeof mock.fn<(...args: unknown[]) => Promise<unknown>>>

  beforeEach(() => {
    requestHandlerMock = mock.fn<(...args: unknown[]) => Promise<unknown>>(() =>
      Promise.resolve({
        status: GenericStatus.Accepted,
      })
    )

    const { station: newStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      ocppRequestService: {
        requestHandler: requestHandlerMock,
      },
      stationInfo: {
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = newStation

    upsertConfigurationKey(
      station,
      buildConfigKey(
        OCPP20ComponentName.SecurityCtrlr,
        OCPP20OptionalVariableName.CertSigningWaitMinimum
      ),
      '5'
    )
    upsertConfigurationKey(
      station,
      buildConfigKey(
        OCPP20ComponentName.SecurityCtrlr,
        OCPP20OptionalVariableName.CertSigningRepeatTimes
      ),
      '3'
    )

    manager = new OCPP20CertSigningRetryManager(station)
  })

  afterEach(() => {
    manager.cancelRetryTimer()
    standardCleanup()
    OCPP20VariableManager.getInstance().resetRuntimeOverrides()
    OCPP20VariableManager.getInstance().invalidateMappingsCache()
  })

  await describe('startRetryTimer', async () => {
    await it('should schedule first retry after CertSigningWaitMinimum seconds', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        // Arrange
        const WAIT_MINIMUM_MS = 5000

        // Act
        manager.startRetryTimer()

        // Assert
        assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
        // retryNumber=0 → delay = baseDelay * 2^0 = 5000ms
        t.mock.timers.tick(WAIT_MINIMUM_MS)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      })
    })

    await it('should not start when CertSigningWaitMinimum is not configured', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        upsertConfigurationKey(
          station,
          buildConfigKey(
            OCPP20ComponentName.SecurityCtrlr,
            OCPP20OptionalVariableName.CertSigningWaitMinimum
          ),
          '0'
        )

        // Act
        manager.startRetryTimer()
        t.mock.timers.tick(60000)
        await flushMicrotasks()

        // Assert
        assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
      })
    })

    await it('should not retry when CertSigningRepeatTimes is zero', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        upsertConfigurationKey(
          station,
          buildConfigKey(
            OCPP20ComponentName.SecurityCtrlr,
            OCPP20OptionalVariableName.CertSigningRepeatTimes
          ),
          '0'
        )

        manager.startRetryTimer()
        t.mock.timers.tick(60000)
        await flushMicrotasks()

        assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
      })
    })

    await it('should cancel existing timer before starting new one', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        // Arrange
        manager.startRetryTimer()

        // Act
        manager.startRetryTimer()
        t.mock.timers.tick(5000)
        await flushMicrotasks()

        // Assert
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      })
    })
  })

  await describe('cancelRetryTimer', async () => {
    await it('should clear pending timer', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        // Arrange
        manager.startRetryTimer()

        // Act
        manager.cancelRetryTimer()
        t.mock.timers.tick(60000)
        await flushMicrotasks()

        // Assert
        assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
      })
    })

    await it('should set retryAborted flag to prevent in-flight callbacks', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        // Arrange
        let resolveHandler: ((value: { status: GenericStatus }) => void) | undefined
        requestHandlerMock.mock.mockImplementation(
          () =>
            new Promise<{ status: GenericStatus }>(resolve => {
              resolveHandler = resolve
            })
        )
        manager.startRetryTimer()
        t.mock.timers.tick(5000)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)

        // Act
        manager.cancelRetryTimer()
        assert.notStrictEqual(resolveHandler, undefined)
        resolveHandler?.({ status: GenericStatus.Accepted })
        await flushMicrotasks()

        // Assert — no further retry despite Accepted response
        t.mock.timers.tick(60000)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      })
    })
  })

  await describe('retry lifecycle', async () => {
    await it('A02.FR.17 - should send SignCertificateRequest on retry', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        manager.startRetryTimer()
        t.mock.timers.tick(5000)
        await flushMicrotasks()

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        const call = requestHandlerMock.mock.calls[0]
        assert.strictEqual(call.arguments[1], OCPP20RequestCommand.SIGN_CERTIFICATE)
      })
    })

    await it('A02.FR.18 - should double backoff on each retry', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        // Exponential backoff: delay = 5000 * 2^retryNumber
        // Retry 0: 5000ms, Retry 1: 10000ms, Retry 2: 20000ms
        manager.startRetryTimer()

        t.mock.timers.tick(5000)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)

        t.mock.timers.tick(10000)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)

        t.mock.timers.tick(20000)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 3)
      })
    })

    await it('A02.FR.19 - should stop after CertSigningRepeatTimes retries', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        // Arrange
        upsertConfigurationKey(
          station,
          buildConfigKey(
            OCPP20ComponentName.SecurityCtrlr,
            OCPP20OptionalVariableName.CertSigningRepeatTimes
          ),
          '2'
        )
        OCPP20VariableManager.getInstance().invalidateMappingsCache()

        // Act
        manager.startRetryTimer()
        t.mock.timers.tick(5000)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)

        t.mock.timers.tick(10000)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)

        // Assert — no third retry, max reached
        t.mock.timers.tick(60000)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
      })
    })

    await it('should propagate certificateType to retry requests', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        manager.startRetryTimer('V2GCertificate')
        t.mock.timers.tick(5000)
        await flushMicrotasks()

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        const call = requestHandlerMock.mock.calls[0]
        assert.strictEqual(call.arguments[1], OCPP20RequestCommand.SIGN_CERTIFICATE)
        const payload = call.arguments[2] as Record<string, unknown>
        assert.strictEqual(payload.certificateType, 'V2GCertificate')
      })
    })

    await it('should send empty payload when certificateType is not specified', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        manager.startRetryTimer()
        t.mock.timers.tick(5000)
        await flushMicrotasks()

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        const call = requestHandlerMock.mock.calls[0]
        const payload = call.arguments[2] as Record<string, unknown>
        assert.deepStrictEqual(payload, {})
      })
    })

    await it('should stop retries when CSMS rejects SignCertificate', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        // Arrange
        requestHandlerMock.mock.mockImplementation(async () =>
          Promise.resolve({ status: GenericStatus.Rejected })
        )

        // Act
        manager.startRetryTimer()
        t.mock.timers.tick(5000)
        await flushMicrotasks()

        // Assert
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        t.mock.timers.tick(60000)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      })
    })

    await it('should reschedule retry on request failure', async t => {
      await withMockTimers(t, ['setTimeout'], async () => {
        // Arrange
        let callNumber = 0
        requestHandlerMock.mock.mockImplementation(async () => {
          callNumber++
          if (callNumber === 1) {
            return Promise.reject(new Error('Network error'))
          }
          return Promise.resolve({ status: GenericStatus.Accepted })
        })

        // Act
        manager.startRetryTimer()
        t.mock.timers.tick(5000)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)

        // Assert — error handler reschedules with exponential backoff
        t.mock.timers.tick(10000)
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
      })
    })
  })
})
