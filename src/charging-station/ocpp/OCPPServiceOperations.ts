import type { BootReasonEnumType, StopTransactionReason } from '../../types/index.js'

import { type ChargingStation } from '../../charging-station/index.js'
import { OCPPError } from '../../exception/index.js'
import {
  AuthorizationStatus,
  type BootNotificationRequest,
  type ChargingStationInfo,
  ErrorType,
  OCPP20AuthorizationStatusEnumType,
  OCPP20IdTokenEnumType,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
  type StartTransactionResult,
  type StopTransactionResult,
} from '../../types/index.js'
import { generateUUID, logger } from '../../utils/index.js'
import { OCPP16ServiceUtils } from './1.6/OCPP16ServiceUtils.js'
import { OCPP20ServiceUtils } from './2.0/OCPP20ServiceUtils.js'
import { mapStopReasonToOCPP20 } from './OCPPServiceUtils.js'

/**
 * Starts a transaction on a specific connector using the appropriate OCPP version handler.
 * @param chargingStation - Target charging station
 * @param connectorId - Connector ID to start the transaction on
 * @param idTag - Optional RFID tag for authorization
 * @returns Result indicating whether the transaction was accepted
 */
export const startTransactionOnConnector = async (
  chargingStation: ChargingStation,
  connectorId: number,
  idTag?: string
): Promise<StartTransactionResult> => {
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16: {
      const response = await OCPP16ServiceUtils.startTransactionOnConnector(
        chargingStation,
        connectorId,
        idTag
      )
      return { accepted: response.idTagInfo.status === AuthorizationStatus.ACCEPTED }
    }
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201: {
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      let transactionId = connectorStatus?.transactionId as string | undefined
      if (transactionId == null) {
        transactionId = generateUUID()
        if (connectorStatus != null) {
          connectorStatus.transactionId = transactionId
        }
        OCPP20ServiceUtils.resetTransactionSequenceNumber(chargingStation, connectorId)
      }
      const startedMeterValues = OCPP20ServiceUtils.buildTransactionStartedMeterValues(
        chargingStation,
        transactionId
      )
      const response = await OCPP20ServiceUtils.sendTransactionEvent(
        chargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId,
        {
          idToken:
            idTag != null ? { idToken: idTag, type: OCPP20IdTokenEnumType.ISO14443 } : undefined,
          ...(startedMeterValues.length > 0 && { meterValue: startedMeterValues }),
        }
      )
      return {
        accepted:
          response.idTokenInfo == null ||
          response.idTokenInfo.status === OCPP20AuthorizationStatusEnumType.Accepted,
      }
    }
    default:
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `startTransactionOnConnector: unsupported OCPP version ${chargingStation.stationInfo?.ocppVersion}`
      )
  }
}

/**
 * Stops a transaction on a specific connector using the appropriate OCPP version handler.
 * @param chargingStation - Target charging station
 * @param connectorId - Connector ID to stop the transaction on
 * @param reason - Optional reason for stopping the transaction
 * @returns Result indicating whether the stop was accepted
 */
export const stopTransactionOnConnector = async (
  chargingStation: ChargingStation,
  connectorId: number,
  reason?: StopTransactionReason
): Promise<StopTransactionResult> => {
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16: {
      const response = await OCPP16ServiceUtils.stopTransactionOnConnector(
        chargingStation,
        connectorId,
        reason
      )
      return { accepted: response.idTagInfo?.status === AuthorizationStatus.ACCEPTED }
    }
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201: {
      const evseId = chargingStation.getEvseIdByConnectorId(connectorId)
      if (evseId == null) {
        logger.warn(
          `${chargingStation.logPrefix()} stopTransactionOnConnector: cannot resolve EVSE ID for connector ${connectorId.toString()}, skipping`
        )
        return { accepted: false }
      }
      const { stoppedReason, triggerReason } = mapStopReasonToOCPP20(reason)
      const response = await OCPP20ServiceUtils.requestStopTransaction(
        chargingStation,
        connectorId,
        evseId,
        triggerReason,
        stoppedReason
      )
      return {
        accepted:
          response.idTokenInfo == null ||
          response.idTokenInfo.status === OCPP20AuthorizationStatusEnumType.Accepted,
      }
    }
    default:
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `stopTransactionOnConnector: unsupported OCPP version ${chargingStation.stationInfo?.ocppVersion}`
      )
  }
}

/**
 * Stops all running transactions on all connectors of a charging station.
 * @param chargingStation - Target charging station
 * @param reason - Optional reason for stopping the transactions
 */
export const stopRunningTransactions = async (
  chargingStation: ChargingStation,
  reason?: StopTransactionReason
): Promise<void> => {
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16: {
      for (const { connectorId, connectorStatus } of chargingStation.iterateConnectors(true)) {
        if (connectorStatus.transactionStarted === true) {
          await OCPP16ServiceUtils.stopTransactionOnConnector(chargingStation, connectorId, reason)
        }
      }
      break
    }
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201: {
      const { stoppedReason, triggerReason } = mapStopReasonToOCPP20(reason)
      await OCPP20ServiceUtils.stopAllTransactions(chargingStation, triggerReason, stoppedReason)
      break
    }
    default:
      logger.warn(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${chargingStation.logPrefix()} stopRunningTransactions: unsupported OCPP version ${chargingStation.stationInfo?.ocppVersion}, no transactions stopped`
      )
  }
}

/**
 * Starts periodic meter value updates for a connector during an active transaction.
 * @param chargingStation - Target charging station
 * @param connectorId - Connector ID to start meter value updates for
 * @param interval - Meter value sampling interval in milliseconds
 */
export const startUpdatedMeterValues = (
  chargingStation: ChargingStation,
  connectorId: number,
  interval: number
): void => {
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      OCPP16ServiceUtils.startUpdatedMeterValues(chargingStation, connectorId, interval)
      break
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      OCPP20ServiceUtils.startUpdatedMeterValues(chargingStation, connectorId, interval)
      break
    default:
      logger.error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${chargingStation.logPrefix()} startUpdatedMeterValues: unsupported OCPP version ${chargingStation.stationInfo?.ocppVersion}`
      )
  }
}

/**
 * Stops periodic meter value updates for a connector.
 * @param chargingStation - Target charging station
 * @param connectorId - Connector ID to stop meter value updates for
 */
export const stopUpdatedMeterValues = (
  chargingStation: ChargingStation,
  connectorId: number
): void => {
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      OCPP16ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId)
      break
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      OCPP20ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId)
      break
    default:
      break
  }
}

/**
 * Flushes queued transaction event messages for all connectors on an OCPP 2.0 charging station.
 * @param chargingStation - Target charging station
 */
export const flushQueuedTransactionMessages = async (
  chargingStation: ChargingStation
): Promise<void> => {
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      break
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      for (const { connectorId, connectorStatus } of chargingStation.iterateConnectors()) {
        if ((connectorStatus.transactionEventQueue?.length ?? 0) > 0) {
          await OCPP20ServiceUtils.sendQueuedTransactionEvents(chargingStation, connectorId).catch(
            (error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} flushQueuedTransactionMessages: Error flushing queued TransactionEvents:`,
                error
              )
            }
          )
        }
      }
      break
    default:
      break
  }
}

/**
 * Builds an OCPP BootNotification request using the appropriate version-specific handler.
 * @param stationInfo - Charging station information
 * @param bootReason - Optional boot reason (OCPP 2.0 only)
 * @returns The BootNotification request payload, or undefined if the OCPP version is unsupported
 */
export const buildBootNotificationRequest = (
  stationInfo: ChargingStationInfo,
  bootReason?: BootReasonEnumType
): BootNotificationRequest | undefined => {
  switch (stationInfo.ocppVersion) {
    case OCPPVersion.VERSION_16:
      return OCPP16ServiceUtils.buildBootNotificationRequest(stationInfo)
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      return OCPP20ServiceUtils.buildBootNotificationRequest(stationInfo, bootReason)
    default:
      return undefined
  }
}
