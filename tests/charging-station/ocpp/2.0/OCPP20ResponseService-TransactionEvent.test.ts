/**
 * @file Tests for OCPP20ResponseService TransactionEvent response handling
 * @description Unit tests for OCPP 2.0 TransactionEvent response processing (E01-E04)
 *
 * Covers:
 * - E01-E04 TransactionEventResponse handler branch coverage
 * - Empty response (no optional fields) — baseline
 * - totalCost logging branch
 * - chargingPriority logging branch
 * - idTokenInfo.Accepted logging branch
 * - idTokenInfo.Invalid logging branch
 * - updatedPersonalMessage logging branch
 * - All fields together
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { MockChargingStation } from '../../ChargingStationTestUtils.js'

import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import { OCPP20RequestCommand, OCPPVersion } from '../../../../src/types/index.js'
import {
  OCPP20AuthorizationStatusEnumType,
  type OCPP20MessageContentType,
  OCPP20MessageFormatEnumType,
  type OCPP20TransactionEventResponse,
} from '../../../../src/types/ocpp/2.0/Transaction.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

/**
 * Create a mock station suitable for TransactionEvent response tests.
 * Uses ocppStrictCompliance: false to bypass AJV validation so the
 * handler logic can be tested in isolation.
 */
function createTransactionEventStation (): MockChargingStation {
  const { station } = createMockChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 1,
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      // Bypass AJV schema validation — tests focus on handler logic
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })
  return station as MockChargingStation
}

await describe('E01-E04 - TransactionEventResponse handler', async () => {
  let responseService: OCPP20ResponseService
  let mockStation: MockChargingStation

  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
    responseService = new OCPP20ResponseService()
    mockStation = createTransactionEventStation()
  })

  afterEach(() => {
    standardCleanup()
  })

  /**
   * Helper to dispatch a TransactionEventResponse through the public responseHandler.
   * The station is in Accepted state by default (RegistrationStatusEnumType.ACCEPTED).
   * @param payload
   */
  async function dispatch (payload: OCPP20TransactionEventResponse): Promise<void> {
    await responseService.responseHandler(
      mockStation,
      OCPP20RequestCommand.TRANSACTION_EVENT,
      payload as unknown as Parameters<typeof responseService.responseHandler>[2],
      {} as Parameters<typeof responseService.responseHandler>[3]
    )
  }

  await it('should handle empty TransactionEvent response without throwing', async () => {
    const payload: OCPP20TransactionEventResponse = {}
    await expect(dispatch(payload)).resolves.toBeUndefined()
  })

  await it('should handle totalCost field without throwing', async () => {
    const payload: OCPP20TransactionEventResponse = { totalCost: 12.5 }
    await expect(dispatch(payload)).resolves.toBeUndefined()
  })

  await it('should handle chargingPriority field without throwing', async () => {
    const payload: OCPP20TransactionEventResponse = { chargingPriority: 1 }
    await expect(dispatch(payload)).resolves.toBeUndefined()
  })

  await it('should handle idTokenInfo with Accepted status without throwing', async () => {
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Accepted,
      },
    }
    await expect(dispatch(payload)).resolves.toBeUndefined()
  })

  await it('should handle idTokenInfo with Invalid status without throwing', async () => {
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Invalid,
      },
    }
    await expect(dispatch(payload)).resolves.toBeUndefined()
  })

  await it('should handle updatedPersonalMessage field without throwing', async () => {
    const message: OCPP20MessageContentType = {
      content: 'Thank you for charging!',
      format: OCPP20MessageFormatEnumType.UTF8,
    }
    const payload: OCPP20TransactionEventResponse = { updatedPersonalMessage: message }
    await expect(dispatch(payload)).resolves.toBeUndefined()
  })

  await it('should handle all optional fields present simultaneously without throwing', async () => {
    const message: OCPP20MessageContentType = {
      content: '<b>Session complete</b>',
      format: OCPP20MessageFormatEnumType.HTML,
    }
    const payload: OCPP20TransactionEventResponse = {
      chargingPriority: 2,
      idTokenInfo: {
        chargingPriority: 3,
        status: OCPP20AuthorizationStatusEnumType.Accepted,
      },
      totalCost: 9.99,
      updatedPersonalMessage: message,
    }
    await expect(dispatch(payload)).resolves.toBeUndefined()
  })
})
