/**
 * @file Tests for OCPPConnectorStatusOperations
 * @description Verifies sendAndSetConnectorStatus and restoreConnectorStatus functions
 *
 * Covers:
 * - sendAndSetConnectorStatus — sends StatusNotification + updates connector + emits event
 * - restoreConnectorStatus — restores Reserved or Available based on reservation state
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'

import type { Reservation } from '../../../src/types/index.js'

import {
  restoreConnectorStatus,
  sendAndSetConnectorStatus,
} from '../../../src/charging-station/ocpp/OCPPConnectorStatusOperations.js'
import {
  ConnectorStatusEnum,
  type OCPP16StatusNotificationRequest,
  type OCPP20StatusNotificationRequest,
  OCPPVersion,
} from '../../../src/types/index.js'
import {
  createStationWithRequestHandler,
  standardCleanup,
} from '../../helpers/TestLifecycleHelpers.js'

await describe('OCPPConnectorStatusOperations', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('sendAndSetConnectorStatus', async () => {
    await it('should send StatusNotification and update connector status', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()

      await sendAndSetConnectorStatus(station, {
        connectorId: 1,
        status: ConnectorStatusEnum.Occupied,
      } as unknown as OCPP16StatusNotificationRequest)

      assert.strictEqual(requestHandler.mock.calls.length, 1)
      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Occupied)
    })

    await it('should return early when connector does not exist', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()

      await sendAndSetConnectorStatus(station, {
        connectorId: 99,
        status: ConnectorStatusEnum.Occupied,
      } as unknown as OCPP16StatusNotificationRequest)

      assert.strictEqual(requestHandler.mock.calls.length, 0)
    })

    await it('should skip sending when options.send is false', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()

      await sendAndSetConnectorStatus(
        station,
        {
          connectorId: 1,
          status: ConnectorStatusEnum.Occupied,
        } as unknown as OCPP16StatusNotificationRequest,
        {
          send: false,
        }
      )

      assert.strictEqual(requestHandler.mock.calls.length, 0)
      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Occupied)
    })

    await it('should update connector status even when send is true', async () => {
      const { station } = createStationWithRequestHandler()

      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Available)

      await sendAndSetConnectorStatus(station, {
        connectorId: 1,
        status: ConnectorStatusEnum.Unavailable,
      } as unknown as OCPP16StatusNotificationRequest)

      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Unavailable)
    })

    await it('should call emitChargingStationEvent with connectorStatusChanged', async () => {
      const { station } = createStationWithRequestHandler()
      const stationObj = station as unknown as { emitChargingStationEvent: () => void }
      const emitSpy = mock.method(stationObj, 'emitChargingStationEvent')

      await sendAndSetConnectorStatus(station, {
        connectorId: 1,
        status: ConnectorStatusEnum.Occupied,
      } as unknown as OCPP16StatusNotificationRequest)

      assert.strictEqual(emitSpy.mock.calls.length, 1)
    })

    await it('should pass evseId to buildStatusNotificationRequest for OCPP 2.0', async () => {
      const { requestHandler, station } = createStationWithRequestHandler({
        ocppVersion: OCPPVersion.VERSION_20,
      })

      await sendAndSetConnectorStatus(station, {
        connectorId: 1,
        connectorStatus: ConnectorStatusEnum.Occupied,
        evseId: 1,
      } as unknown as OCPP20StatusNotificationRequest)

      assert.strictEqual(requestHandler.mock.calls.length, 1)
      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Occupied)
    })

    await it('should default options.send to true when options not provided', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()

      await sendAndSetConnectorStatus(station, {
        connectorId: 1,
        status: ConnectorStatusEnum.Occupied,
      } as unknown as OCPP16StatusNotificationRequest)

      assert.strictEqual(requestHandler.mock.calls.length, 1)
    })
  })

  await describe('restoreConnectorStatus', async () => {
    await it('should restore to Reserved when connector has reservation and is not Reserved', async () => {
      const { station } = createStationWithRequestHandler()

      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.reservation = {
          connectorId: 1,
          expiryDate: new Date().toISOString(),
          idTag: 'TEST-TAG',
          reservationId: 1,
        } as unknown as Reservation
        connectorStatus.status = ConnectorStatusEnum.Occupied
      }

      await restoreConnectorStatus(station, 1, connectorStatus)

      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Reserved)
    })

    await it('should restore to Available when connector has no reservation and is not Available', async () => {
      const { station } = createStationWithRequestHandler()

      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.status = ConnectorStatusEnum.Occupied
      }

      await restoreConnectorStatus(station, 1, connectorStatus)

      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Available)
    })

    await it('should not change status when connector is already Available with no reservation', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()

      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.status = ConnectorStatusEnum.Available
      }

      await restoreConnectorStatus(station, 1, connectorStatus)

      assert.strictEqual(requestHandler.mock.calls.length, 0)
      assert.strictEqual(station.getConnectorStatus(1)?.status, ConnectorStatusEnum.Available)
    })
  })
})
