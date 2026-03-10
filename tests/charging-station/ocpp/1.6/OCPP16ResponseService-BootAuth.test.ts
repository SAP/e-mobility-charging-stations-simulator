/**
 * @file Tests for OCPP16ResponseService BootNotification and Authorize response handlers
 * @description Verifies correct handling of BootNotification (§4.1) and Authorize (§4.2) responses
 *
 * Covers:
 * - §4.1 BootNotificationResponse: Accepted/Pending/Rejected status handling
 * - §4.1 HeartbeatInterval configuration key update from response interval
 * - §4.2 AuthorizeResponse: Accepted idTagInfo sets idTagAuthorized=true
 * - §4.2 AuthorizeResponse: Non-accepted idTagInfo sets idTagAuthorized=false
 * - §4.2 AuthorizeResponse: No matching connector leaves state unchanged
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { OCPP16AuthorizeRequest, OCPP16AuthorizeResponse } from '../../../../src/types/ocpp/1.6/Transaction.js'

import { OCPP16ResponseService } from '../../../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import {
  ChargingStationEvents,
  OCPP16AuthorizationStatus,
  type OCPP16BootNotificationResponse,
  OCPP16RequestCommand,
  OCPP16StandardParametersKey,
  RegistrationStatusEnumType,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16ResponseTestContext,
  type OCPP16ResponseTestContext,
} from './OCPP16TestUtils.js'

await describe('OCPP16ResponseService — BootNotification and Authorize', async () => {
  let ctx: OCPP16ResponseTestContext

  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
    ctx = createOCPP16ResponseTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  /**
   * Helper to dispatch a BootNotificationResponse through the public responseHandler.
   * @param payload - The BootNotificationResponse payload to dispatch
   */
  async function dispatchBootNotification (payload: OCPP16BootNotificationResponse): Promise<void> {
    await ctx.responseService.responseHandler(
      ctx.station,
      OCPP16RequestCommand.BOOT_NOTIFICATION,
      payload as unknown as Parameters<OCPP16ResponseService['responseHandler']>[2],
      {} as Parameters<OCPP16ResponseService['responseHandler']>[3]
    )
  }

  /**
   * Helper to dispatch an AuthorizeResponse through the public responseHandler.
   * @param payload - The AuthorizeResponse payload to dispatch
   * @param requestPayload - The original AuthorizeRequest (contains idTag)
   */
  async function dispatchAuthorize (
    payload: OCPP16AuthorizeResponse,
    requestPayload: OCPP16AuthorizeRequest
  ): Promise<void> {
    await ctx.responseService.responseHandler(
      ctx.station,
      OCPP16RequestCommand.AUTHORIZE,
      payload as unknown as Parameters<OCPP16ResponseService['responseHandler']>[2],
      requestPayload as unknown as Parameters<OCPP16ResponseService['responseHandler']>[3]
    )
  }

  // ============================================================================
  // §4.1 — BootNotification Response
  // ============================================================================

  // @spec §4.1 — TC_001_CS
  await it('should store response and emit accepted event for Accepted status', async () => {
    const emitSpy = mock.method(ctx.station, 'emitChargingStationEvent')
    const payload: OCPP16BootNotificationResponse = {
      currentTime: new Date(),
      interval: 60,
      status: RegistrationStatusEnumType.ACCEPTED,
    }

    await dispatchBootNotification(payload)

    expect(ctx.station.bootNotificationResponse).toBe(payload)
    expect(ctx.station.inAcceptedState()).toBe(true)
    expect(emitSpy.mock.calls.length).toBe(1)
    expect(emitSpy.mock.calls[0].arguments[0]).toBe(ChargingStationEvents.accepted)
  })

  // @spec §4.1 — TC_002_CS
  await it('should store response and emit pending event for Pending status', async () => {
    const emitSpy = mock.method(ctx.station, 'emitChargingStationEvent')
    const payload: OCPP16BootNotificationResponse = {
      currentTime: new Date(),
      interval: 30,
      status: RegistrationStatusEnumType.PENDING,
    }

    await dispatchBootNotification(payload)

    expect(ctx.station.bootNotificationResponse).toBe(payload)
    expect(ctx.station.inPendingState()).toBe(true)
    expect(ctx.station.inAcceptedState()).toBe(false)
    expect(emitSpy.mock.calls.length).toBe(1)
    expect(emitSpy.mock.calls[0].arguments[0]).toBe(ChargingStationEvents.pending)
  })

  await it('should store response and emit rejected event for Rejected status', async () => {
    const emitSpy = mock.method(ctx.station, 'emitChargingStationEvent')
    const payload: OCPP16BootNotificationResponse = {
      currentTime: new Date(),
      interval: 0,
      status: RegistrationStatusEnumType.REJECTED,
    }

    await dispatchBootNotification(payload)

    expect(ctx.station.bootNotificationResponse).toBe(payload)
    expect(ctx.station.inRejectedState()).toBe(true)
    expect(ctx.station.inAcceptedState()).toBe(false)
    expect(emitSpy.mock.calls.length).toBe(1)
    expect(emitSpy.mock.calls[0].arguments[0]).toBe(ChargingStationEvents.rejected)
  })

  await it('should update HeartbeatInterval configuration key from response interval', async () => {
    const payload: OCPP16BootNotificationResponse = {
      currentTime: new Date(),
      interval: 120,
      status: RegistrationStatusEnumType.ACCEPTED,
    }

    await dispatchBootNotification(payload)

    const configKeys = ctx.station.ocppConfiguration?.configurationKey
    expect(configKeys).toBeDefined()

    const heartbeatKey = configKeys?.find(
      k => k.key === (OCPP16StandardParametersKey.HeartbeatInterval as string)
    )
    expect(heartbeatKey).toBeDefined()
    expect(heartbeatKey?.value).toBe('120')

    // Handler also sets the variant HeartBeatInterval (hidden)
    const heartBeatKey = configKeys?.find(
      k => k.key === (OCPP16StandardParametersKey.HeartBeatInterval as string)
    )
    expect(heartBeatKey).toBeDefined()
    expect(heartBeatKey?.value).toBe('120')
  })

  // ============================================================================
  // §4.2 — Authorize Response
  // ============================================================================

  // @spec §4.2 — TC_003_CS
  await it('should set idTagAuthorized to true when idTagInfo status is Accepted', async () => {
    // Arrange — set authorizeIdTag on connector 1
    const connectorStatus = ctx.station.getConnectorStatus(1)
    expect(connectorStatus).toBeDefined()
    if (connectorStatus != null) {
      connectorStatus.authorizeIdTag = 'TEST_TAG'
    }

    // Act
    await dispatchAuthorize(
      { idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } },
      { idTag: 'TEST_TAG' }
    )

    // Assert
    expect(connectorStatus?.idTagAuthorized).toBe(true)
    expect(connectorStatus?.authorizeIdTag).toBe('TEST_TAG')
  })

  // @spec §4.2 — TC_010_CS
  await it('should set idTagAuthorized to false and clear authorizeIdTag for non-Accepted status', async () => {
    // Arrange — set authorizeIdTag on connector 1
    const connectorStatus = ctx.station.getConnectorStatus(1)
    expect(connectorStatus).toBeDefined()
    if (connectorStatus != null) {
      connectorStatus.authorizeIdTag = 'TEST_TAG'
    }

    // Act — Blocked status
    await dispatchAuthorize(
      { idTagInfo: { status: OCPP16AuthorizationStatus.BLOCKED } },
      { idTag: 'TEST_TAG' }
    )

    // Assert
    expect(connectorStatus?.idTagAuthorized).toBe(false)
    expect(connectorStatus?.authorizeIdTag).toBeUndefined()
  })

  await it('should not change connector state when no connector matches authorizeIdTag', async () => {
    // Arrange — connector 1 has no authorizeIdTag matching the request
    const connectorStatus = ctx.station.getConnectorStatus(1)
    expect(connectorStatus).toBeDefined()
    const originalIdTagAuthorized = connectorStatus?.idTagAuthorized

    // Act — no connector has authorizeIdTag === 'UNKNOWN_TAG'
    await dispatchAuthorize(
      { idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED } },
      { idTag: 'UNKNOWN_TAG' }
    )

    // Assert — no state change
    expect(connectorStatus?.idTagAuthorized).toBe(originalIdTagAuthorized)
    expect(connectorStatus?.authorizeIdTag).toBeUndefined()
  })
})
