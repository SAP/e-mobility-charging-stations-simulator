import type { StopTransactionReason } from '../../types/index.js'

import { type ChargingStation } from '../../charging-station/index.js'
import { OCPPError } from '../../exception/index.js'
import {
  AuthorizationStatus,
  ErrorType,
  OCPPVersion,
  type StartTransactionResult,
  type StopTransactionResult,
} from '../../types/index.js'
import { logger, truncateId } from '../../utils/index.js'
import { OCPP16ServiceUtils } from './1.6/OCPP16ServiceUtils.js'
import { mapStopReasonToOCPP20 } from './2.0/OCPP20RequestBuilders.js'
import { OCPP20ServiceUtils } from './2.0/OCPP20ServiceUtils.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus as AuthStatus,
  IdentifierType,
  OCPPAuthServiceFactory,
} from './auth/index.js'

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
    case OCPPVersion.VERSION_201:
      return OCPP20ServiceUtils.startTransactionOnConnector(chargingStation, connectorId, idTag)
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
    case OCPPVersion.VERSION_201:
      return OCPP20ServiceUtils.stopTransactionOnConnector(chargingStation, connectorId, reason)
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

export const isIdTagAuthorized = async (
  chargingStation: ChargingStation,
  connectorId: number,
  idTag: string,
  context?: AuthContext
): Promise<boolean> => {
  try {
    logger.debug(
      `${chargingStation.logPrefix()} Authorizing idTag '${truncateId(idTag)}' on connector ${connectorId.toString()}`
    )

    const authService = OCPPAuthServiceFactory.getInstance(chargingStation)

    const authResult = await authService.authorize({
      allowOffline: false,
      connectorId,
      context: context ?? AuthContext.TRANSACTION_START,
      identifier: {
        type: IdentifierType.ID_TAG,
        value: idTag,
      },
      timestamp: new Date(),
    })

    logger.debug(
      `${chargingStation.logPrefix()} Authorization result for idTag '${truncateId(idTag)}': ${authResult.status} using ${authResult.method} method`
    )

    if (authResult.status === AuthStatus.ACCEPTED) {
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      if (connectorStatus != null) {
        switch (authResult.method) {
          case AuthenticationMethod.CACHE:
          case AuthenticationMethod.LOCAL_LIST:
          case AuthenticationMethod.OFFLINE_FALLBACK:
            connectorStatus.localAuthorizeIdTag = idTag
            connectorStatus.idTagLocalAuthorized = true
            break
          case AuthenticationMethod.CERTIFICATE_BASED:
          case AuthenticationMethod.NONE:
          case AuthenticationMethod.REMOTE_AUTHORIZATION:
            break
        }
      }
      return true
    }

    return false
  } catch (error) {
    logger.error(`${chargingStation.logPrefix()} Authorization failed`, error)
    return false
  }
}
