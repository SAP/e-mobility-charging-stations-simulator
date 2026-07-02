// Copyright Jerome Benoit. 2021-2026. All Rights Reserved.

/**
 * @file Reservation lifecycle helpers.
 * @description Extracted from {@link ./Helpers} as the first slice of the
 *   issue #1936 (item f) file split. The `Helpers.ts` barrel re-exports
 *   every symbol so external callers keep their existing import path
 *   (`import { hasReservationExpired, ... } from './Helpers.js'`).
 */

import { isPast } from 'date-fns'

import type { ChargingStation } from './ChargingStation.js'

import {
  type ConnectorStatus,
  type Reservation,
  ReservationTerminationReason,
} from '../types/index.js'
import { logger } from '../utils/index.js'

const moduleName = 'HelpersReservation'

/**
 * Determines whether a reservation's `expiryDate` is in the past.
 * @param reservation - The reservation to check.
 * @returns `true` when the reservation has expired.
 */
export const hasReservationExpired = (reservation: Reservation): boolean => {
  return isPast(reservation.expiryDate)
}

/**
 * Checks if a connector has a pending (non-expired) reservation.
 * @param connectorStatus - The connector status to check.
 * @returns `true` if the connector has a pending reservation, `false` otherwise.
 */
export const hasPendingReservation = (connectorStatus: ConnectorStatus): boolean => {
  return connectorStatus.reservation != null && !hasReservationExpired(connectorStatus.reservation)
}

/**
 * Checks if a charging station has any pending (non-expired) reservations.
 * @param chargingStation - The charging station to check.
 * @returns `true` if any connector has a pending reservation, `false` otherwise.
 */
export const hasPendingReservations = (chargingStation: ChargingStation): boolean => {
  for (const { connectorStatus } of chargingStation.iterateConnectors()) {
    if (hasPendingReservation(connectorStatus)) {
      return true
    }
  }
  return false
}

/**
 * Removes every expired reservation currently attached to the station's
 * connectors. Failures are logged per-reservation and aggregated into a
 * single error log at the end so a partial-failure batch is still
 * observable.
 * @param chargingStation - The charging station whose expired reservations should be cleared.
 */
export const removeExpiredReservations = async (
  chargingStation: ChargingStation
): Promise<void> => {
  const reservations: Reservation[] = []
  for (const { connectorStatus } of chargingStation.iterateConnectors()) {
    if (connectorStatus.reservation != null && hasReservationExpired(connectorStatus.reservation)) {
      reservations.push(connectorStatus.reservation)
    }
  }
  const results = await Promise.allSettled(
    reservations.map(reservation =>
      chargingStation.removeReservation(reservation, ReservationTerminationReason.EXPIRED)
    )
  )
  let failureCount = 0
  for (const result of results) {
    if (result.status === 'rejected') {
      ++failureCount
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.removeExpiredReservations: reservation removal failed: ${String(result.reason)}`
      )
    }
  }
  if (failureCount > 0) {
    logger.error(
      `${chargingStation.logPrefix()} ${moduleName}.removeExpiredReservations: ${failureCount.toString()}/${reservations.length.toString()} expired reservation removal(s) failed`
    )
  }
}
