/**
 * @file Tests for OCPP20IncomingRequestService ChangeAvailability
 * @description Unit tests for OCPP 2.0.1 ChangeAvailability command handling (G03)
 */

import type { mock } from 'node:test'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  ChangeAvailabilityStatusEnumType,
  ConnectorStatusEnum,
  OCPP20OperationalStatusEnumType,
  OCPP20RequestCommand,
  ReasonCodeEnumType,
} from '../../../../src/types/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createConnectorStatus } from '../../helpers/StationHelpers.js'
import { createOCPP20ListenerStation } from './OCPP20TestUtils.js'

await describe('G03 - ChangeAvailability', async () => {
  let station: ChargingStation
  let requestHandlerMock: ReturnType<typeof mock.fn>
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    ;({ requestHandlerMock, station } = createOCPP20ListenerStation(
      TEST_CHARGING_STATION_BASE_NAME
    ))
    const incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  afterEach(() => {
    standardCleanup()
  })

  // FR: G03.FR.01
  await it('should accept EVSE-level Inoperative when no ongoing transaction', async () => {
    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 1 },
      operationalStatus: OCPP20OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Accepted)
    const evseStatus = station.getEvseStatus(1)
    assert.strictEqual(evseStatus?.availability, OCPP20OperationalStatusEnumType.Inoperative)
    await flushMicrotasks()
    assert.ok(
      requestHandlerMock.mock.callCount() >= 1,
      'request handler should have been called at least once'
    )
    const args = requestHandlerMock.mock.calls[0].arguments as [unknown, string]
    assert.strictEqual(args[1], OCPP20RequestCommand.STATUS_NOTIFICATION)
  })

  await it('should target the exact EVSE when connector identifiers are reused', async () => {
    const evse1 = station.getEvseStatus(1)
    const evse2 = station.getEvseStatus(2)
    assert.ok(evse1 != null)
    assert.ok(evse2 != null)
    const evse1Connector = evse1.connectors.get(1)
    assert.ok(evse1Connector != null)
    const evse2Connector = createConnectorStatus(1, { status: ConnectorStatusEnum.Available })
    evse2.connectors.clear()
    evse2.connectors.set(1, evse2Connector)

    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { connectorId: 1, id: 2 },
      operationalStatus: OCPP20OperationalStatusEnumType.Inoperative,
    })
    await flushMicrotasks()

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Accepted)
    assert.strictEqual(evse1Connector.availability, OCPP20OperationalStatusEnumType.Operative)
    assert.strictEqual(evse1Connector.status, ConnectorStatusEnum.Available)
    assert.strictEqual(evse2Connector.availability, OCPP20OperationalStatusEnumType.Inoperative)
    assert.strictEqual(evse2Connector.status, ConnectorStatusEnum.Unavailable)
    const statusNotification = requestHandlerMock.mock.calls.find(
      call => call.arguments[1] === OCPP20RequestCommand.STATUS_NOTIFICATION
    )
    assert.deepStrictEqual(statusNotification?.arguments[2], {
      connectorId: 1,
      connectorStatus: ConnectorStatusEnum.Unavailable,
      evseId: 2,
    })
  })

  await it('should snapshot only the connector targeted by connector-level changes', async () => {
    const evse = station.getEvseStatus(1)
    assert.ok(evse != null)
    const connector1 = evse.connectors.get(1)
    assert.ok(connector1 != null)
    const connector2 = createConnectorStatus(2, { status: ConnectorStatusEnum.Available })
    evse.connectors.set(2, connector2)

    testableService.handleRequestChangeAvailability(station, {
      evse: { connectorId: 1, id: 1 },
      operationalStatus: OCPP20OperationalStatusEnumType.Inoperative,
    })
    await flushMicrotasks()
    connector2.status = ConnectorStatusEnum.Faulted
    testableService.handleRequestChangeAvailability(station, {
      evse: { connectorId: 2, id: 1 },
      operationalStatus: OCPP20OperationalStatusEnumType.Inoperative,
    })
    await flushMicrotasks()
    testableService.handleRequestChangeAvailability(station, {
      evse: { connectorId: 2, id: 1 },
      operationalStatus: OCPP20OperationalStatusEnumType.Operative,
    })
    await flushMicrotasks()
    testableService.handleRequestChangeAvailability(station, {
      evse: { connectorId: 1, id: 1 },
      operationalStatus: OCPP20OperationalStatusEnumType.Operative,
    })
    await flushMicrotasks()

    assert.strictEqual(connector1.status, ConnectorStatusEnum.Available)
    assert.strictEqual(connector2.status, ConnectorStatusEnum.Faulted)
  })

  await it('should restore distinct statuses for reused connector identifiers', async () => {
    const evse1 = station.getEvseStatus(1)
    const evse2 = station.getEvseStatus(2)
    assert.ok(evse1 != null)
    assert.ok(evse2 != null)
    const evse1Connector = evse1.connectors.get(1)
    assert.ok(evse1Connector != null)
    evse1Connector.status = ConnectorStatusEnum.Faulted
    const evse2Connector = createConnectorStatus(1, { status: ConnectorStatusEnum.Reserved })
    evse2.connectors.clear()
    evse2.connectors.set(1, evse2Connector)

    testableService.handleRequestChangeAvailability(station, {
      operationalStatus: OCPP20OperationalStatusEnumType.Inoperative,
    })
    await flushMicrotasks()
    assert.strictEqual(evse1Connector.status, ConnectorStatusEnum.Unavailable)
    assert.strictEqual(evse2Connector.status, ConnectorStatusEnum.Unavailable)

    testableService.handleRequestChangeAvailability(station, {
      operationalStatus: OCPP20OperationalStatusEnumType.Operative,
    })
    await flushMicrotasks()

    assert.strictEqual(evse1Connector.status, ConnectorStatusEnum.Faulted)
    assert.strictEqual(evse2Connector.status, ConnectorStatusEnum.Reserved)
  })

  // FR: G03.FR.02
  await it('should accept CS-level Inoperative when no ongoing transaction', () => {
    const response = testableService.handleRequestChangeAvailability(station, {
      operationalStatus: OCPP20OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Accepted)
    for (const { evseId, evseStatus } of station.iterateEvses(true)) {
      assert.strictEqual(
        evseStatus.availability,
        OCPP20OperationalStatusEnumType.Inoperative,
        `EVSE ${String(evseId)} should be Inoperative`
      )
    }
  })

  // FR: G03.FR.03
  await it('should schedule EVSE-level Inoperative when ongoing transaction exists', () => {
    setupConnectorWithTransaction(station, 1, {
      transactionId: 100,
    })

    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 1 },
      operationalStatus: OCPP20OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Scheduled)
  })

  // FR: G03.FR.04
  await it('should schedule CS-level Inoperative when some EVSEs have transactions', () => {
    setupConnectorWithTransaction(station, 2, {
      transactionId: 200,
    })

    const response = testableService.handleRequestChangeAvailability(station, {
      operationalStatus: OCPP20OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Scheduled)
  })

  await it('should reject when EVSE does not exist', async () => {
    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 999 },
      operationalStatus: OCPP20OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Rejected)
    assert.notStrictEqual(response.statusInfo, undefined)
    assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.UnknownEvse)
    await flushMicrotasks()
    assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
  })

  await it('should accept when already in requested state (idempotent)', () => {
    const evseStatus = station.getEvseStatus(1)
    if (evseStatus != null) {
      evseStatus.availability = OCPP20OperationalStatusEnumType.Operative
    }

    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 1 },
      operationalStatus: OCPP20OperationalStatusEnumType.Operative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Accepted)
    assert.strictEqual(evseStatus?.availability, OCPP20OperationalStatusEnumType.Operative)
  })

  await it('should set Operative after Inoperative, connectors return to Available', () => {
    const evseStatus = station.getEvseStatus(1)
    if (evseStatus != null) {
      evseStatus.availability = OCPP20OperationalStatusEnumType.Inoperative
    }

    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 1 },
      operationalStatus: OCPP20OperationalStatusEnumType.Operative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Accepted)
    assert.strictEqual(evseStatus?.availability, OCPP20OperationalStatusEnumType.Operative)
  })

  await it('should accept CS-level change with evse.id === 0', () => {
    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 0 },
      operationalStatus: OCPP20OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Accepted)
    for (const { evseStatus } of station.iterateEvses(true)) {
      assert.strictEqual(evseStatus.availability, OCPP20OperationalStatusEnumType.Inoperative)
    }
  })
})
