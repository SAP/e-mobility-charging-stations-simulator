import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  ChangeAvailabilityStatusEnumType,
  OCPPVersion,
  OperationalStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('ChangeAvailability - Handler', async () => {
  afterEach(() => {
    standardCleanup()
  })

  let station: ChargingStation
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      ocppRequestService: {
        requestHandler: async () => await Promise.resolve({}),
      },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = mockStation
    const incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  await it('G03.FR.01: EVSE level, no ongoing transaction, set Inoperative → Accepted', () => {
    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 1 },
      operationalStatus: OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Accepted)
    const evseStatus = station.getEvseStatus(1)
    assert.strictEqual(evseStatus?.availability, OperationalStatusEnumType.Inoperative)
  })

  await it('G03.FR.02: CS level, no ongoing transaction, set Inoperative → Accepted', () => {
    const response = testableService.handleRequestChangeAvailability(station, {
      operationalStatus: OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Accepted)
    for (const [evseId, evseStatus] of station.evses) {
      if (evseId > 0) {
        assert.strictEqual(
          evseStatus.availability,
          OperationalStatusEnumType.Inoperative,
          `EVSE ${String(evseId)} should be Inoperative`
        )
      }
    }
  })

  await it('G03.FR.03: EVSE level, ongoing transaction, set Inoperative → Scheduled', () => {
    setupConnectorWithTransaction(station, 1, {
      transactionId: 100,
    })

    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 1 },
      operationalStatus: OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Scheduled)
  })

  await it('G03.FR.04: CS level, some EVSEs with transactions, set Inoperative → Scheduled', () => {
    setupConnectorWithTransaction(station, 2, {
      transactionId: 200,
    })

    const response = testableService.handleRequestChangeAvailability(station, {
      operationalStatus: OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Scheduled)
  })

  await it('should reject when EVSE does not exist', () => {
    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 999 },
      operationalStatus: OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Rejected)
    assert.notStrictEqual(response.statusInfo, undefined)
    assert.strictEqual(response.statusInfo?.reasonCode, 'UnknownEvse')
  })

  await it('should accept when already in requested state (idempotent)', () => {
    const evseStatus = station.getEvseStatus(1)
    if (evseStatus != null) {
      evseStatus.availability = OperationalStatusEnumType.Operative
    }

    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 1 },
      operationalStatus: OperationalStatusEnumType.Operative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Accepted)
    assert.strictEqual(evseStatus?.availability, OperationalStatusEnumType.Operative)
  })

  await it('should set Operative after Inoperative, connectors return to Available', () => {
    const evseStatus = station.getEvseStatus(1)
    if (evseStatus != null) {
      evseStatus.availability = OperationalStatusEnumType.Inoperative
    }

    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 1 },
      operationalStatus: OperationalStatusEnumType.Operative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Accepted)
    assert.strictEqual(evseStatus?.availability, OperationalStatusEnumType.Operative)
  })

  await it('should accept CS-level change with evse.id === 0', () => {
    const response = testableService.handleRequestChangeAvailability(station, {
      evse: { id: 0 },
      operationalStatus: OperationalStatusEnumType.Inoperative,
    })

    assert.strictEqual(response.status, ChangeAvailabilityStatusEnumType.Accepted)
    for (const [evseId, evseStatus] of station.evses) {
      if (evseId > 0) {
        assert.strictEqual(evseStatus.availability, OperationalStatusEnumType.Inoperative)
      }
    }
  })
})
