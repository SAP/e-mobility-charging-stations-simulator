/**
 * @file Tests for OCPPServiceUtils connector status management
 * @description Verifies sendAndSetConnectorStatus and restoreConnectorStatus functions
 *
 * Covers:
 * - sendAndSetConnectorStatus — sends StatusNotification + updates connector + emits event
 * - restoreConnectorStatus — restores Reserved or Available based on reservation state
 */

import { expect } from '@std/expect'
import { afterEach, describe, it, mock } from 'node:test'

import type { Reservation } from '../../../src/types/index.js'

import {
  restoreConnectorStatus,
  sendAndSetConnectorStatus,
} from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import { ConnectorStatusEnum, OCPPVersion } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../ChargingStationTestUtils.js'

await describe('OCPPServiceUtils — connector status management', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('sendAndSetConnectorStatus', async () => {
    await it('should send StatusNotification and update connector status', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
      })

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Occupied)

      expect(requestHandler.mock.calls.length).toBe(1)
      expect(station.getConnectorStatus(1)?.status).toBe(ConnectorStatusEnum.Occupied)
    })

    await it('should return early when connector does not exist', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
      })

      await sendAndSetConnectorStatus(station, 99, ConnectorStatusEnum.Occupied)

      expect(requestHandler.mock.calls.length).toBe(0)
    })

    await it('should skip sending when options.send is false', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
      })

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Occupied, undefined, {
        send: false,
      })

      expect(requestHandler.mock.calls.length).toBe(0)
      expect(station.getConnectorStatus(1)?.status).toBe(ConnectorStatusEnum.Occupied)
    })

    await it('should update connector status even when send is true', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
      })

      expect(station.getConnectorStatus(1)?.status).toBe(ConnectorStatusEnum.Available)

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Unavailable)

      expect(station.getConnectorStatus(1)?.status).toBe(ConnectorStatusEnum.Unavailable)
    })

    await it('should call emitChargingStationEvent with connectorStatusChanged', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const emitMock = mock.fn()
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
      })

      const stationWithEmit = station as unknown as {
        emitChargingStationEvent: (...args: unknown[]) => void
      }
      stationWithEmit.emitChargingStationEvent = emitMock

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Occupied)

      expect(emitMock.mock.calls.length).toBe(1)
    })

    await it('should pass evseId to buildStatusNotificationRequest for OCPP 2.0', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
        ocppVersion: OCPPVersion.VERSION_20,
      })

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Occupied, 1)

      expect(requestHandler.mock.calls.length).toBe(1)
      expect(station.getConnectorStatus(1)?.status).toBe(ConnectorStatusEnum.Occupied)
    })

    await it('should default options.send to true when options not provided', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
      })

      await sendAndSetConnectorStatus(station, 1, ConnectorStatusEnum.Occupied)

      expect(requestHandler.mock.calls.length).toBe(1)
    })
  })

  await describe('restoreConnectorStatus', async () => {
    await it('should restore to Reserved when connector has reservation and is not Reserved', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
      })

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

      expect(station.getConnectorStatus(1)?.status).toBe(ConnectorStatusEnum.Reserved)
    })

    await it('should restore to Available when connector has no reservation and is not Available', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
      })

      const connector = station.getConnectorStatus(1)
      if (connector != null) {
        connector.status = ConnectorStatusEnum.Occupied
      }

      await restoreConnectorStatus(station, 1, connector)

      expect(station.getConnectorStatus(1)?.status).toBe(ConnectorStatusEnum.Available)
    })

    await it('should not change status when connector is already Available with no reservation', async () => {
      const requestHandler = mock.fn(() => Promise.resolve({}))
      const { station } = createMockChargingStation({
        ocppRequestService: { requestHandler },
      })

      const connector = station.getConnectorStatus(1)
      if (connector != null) {
        connector.status = ConnectorStatusEnum.Available
      }

      await restoreConnectorStatus(station, 1, connector)

      expect(requestHandler.mock.calls.length).toBe(0)
      expect(station.getConnectorStatus(1)?.status).toBe(ConnectorStatusEnum.Available)
    })
  })
})
