/**
 * @file Tests for OCPPServiceUtils connector status management
 * @description Verifies sendAndSetConnectorStatus and restoreConnectorStatus functions
 *
 * Covers:
 * - sendAndSetConnectorStatus — sends StatusNotification + updates connector + emits event
 * - restoreConnectorStatus — restores Reserved or Available based on reservation state
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/index.js'
import type { Reservation } from '../../../src/types/index.js'
import type { MockChargingStationOptions } from '../helpers/StationHelpers.js'

import {
  restoreConnectorStatus,
  sendAndSetConnectorStatus,
} from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import { ConnectorStatusEnum, OCPPVersion } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../ChargingStationTestUtils.js'

/**
 * Creates a mock station with a spied requestHandler for verifying OCPP requests.
 * @param opts - Additional mock station options to merge
 * @returns The station and its requestHandler spy
 */
function createStationWithRequestHandler (opts?: Partial<MockChargingStationOptions>): {
  requestHandler: ReturnType<typeof mock.fn>
  station: ChargingStation
} {
  const requestHandler = mock.fn(() => Promise.resolve({}))
  const { station } = createMockChargingStation({
    ocppRequestService: { requestHandler },
    ...opts,
  })
  return { requestHandler, station }
}

await describe('OCPPServiceUtils — connector status management', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('sendAndSetConnectorStatus', async () => {
    await it('should send StatusNotification and update connector status', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Occupied)

      assert.strictEqual(requestHandler.mock.calls.length, 1)
      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Occupied)
    })

    await it('should return early when connector does not exist', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()

      await sendAndSetConnectorStatus(station, 99, ConnectorStatusEnum.Occupied)

      assert.strictEqual(requestHandler.mock.calls.length, 0)
    })

    await it('should skip sending when options.send is false', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Occupied, undefined, {
        send: false,
      })

      assert.strictEqual(requestHandler.mock.calls.length, 0)
      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Occupied)
    })

    await it('should update connector status even when send is true', async () => {
      const { station } = createStationWithRequestHandler()

      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Available)

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Unavailable)

      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Unavailable)
    })

    await it('should call emitChargingStationEvent with connectorStatusChanged', async () => {
      const { station } = createStationWithRequestHandler()
      const stationObj = station as unknown as { emitChargingStationEvent: () => void }
      const emitSpy = mock.method(stationObj, 'emitChargingStationEvent')

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Occupied)

      assert.strictEqual(emitSpy.mock.calls.length, 1)
    })

    await it('should pass evseId to buildStatusNotificationRequest for OCPP 2.0', async () => {
      const { requestHandler, station } = createStationWithRequestHandler({
        ocppVersion: OCPPVersion.VERSION_20,
      })

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Occupied, 1)

      assert.strictEqual(requestHandler.mock.calls.length, 1)
      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Occupied)
    })

    await it('should default options.send to true when options not provided', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Occupied)

      assert.strictEqual(requestHandler.mock.calls.length, 1)
    })
  })

  await describe('restoreConnectorStatus', async () => {
    await it('should restore to Reserved when connector has reservation and is not Reserved', async () => {
      const { station } = createStationWithRequestHandler()

      const connector = station.getConnectorStatus(1)
      if (connector != null) {
        connector.reservation = {
          connectorId: 1,
          expiryDate: new Date().toISOString(),
          idTag: 'TEST-TAG',
          reservationId: 1,
        } as unknown as Reservation
        connector.status = ConnectorStatusEnum.Occupied
      }

      await restoreConnectorStatus(station, 1, connector)

      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Reserved)
    })

    await it('should restore to Available when connector has no reservation and is not Available', async () => {
      const { station } = createStationWithRequestHandler()

      const connector = station.getConnectorStatus(1)
      if (connector != null) {
        connector.status = ConnectorStatusEnum.Occupied
      }

      await restoreConnectorStatus(station, 1, connector)

      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Available)
    })

    await it('should not change status when connector is already Available with no reservation', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()

      const connector = station.getConnectorStatus(1)
      if (connector != null) {
        connector.status = ConnectorStatusEnum.Available
      }

      await restoreConnectorStatus(station, 1, connector)

      assert.strictEqual(requestHandler.mock.calls.length, 0)
      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Available)
    })
  })
})
