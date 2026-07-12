import { type ChargingStation } from '../../charging-station/index.js'
import { OCPPError } from '../../exception/index.js'
import {
  ChargingStationEvents,
  type ConnectorStatus,
  ConnectorStatusEnum,
  ErrorType,
  OCPPVersion,
  RequestCommand,
  type StatusNotificationOptions,
  type StatusNotificationResponse,
} from '../../types/index.js'
import { logger } from '../../utils/index.js'
import { OCPP16Constants } from './1.6/OCPP16Constants.js'
import { OCPP20Constants } from './2.0/OCPP20Constants.js'

/**
 * Sends a StatusNotification request and updates the connector status locally.
 * @param chargingStation - Target charging station
 * @param commandParams - Cross-version StatusNotification input; `connectorStatus` (OCPP 2.0.1) takes precedence over `status` (OCPP 1.6)
 * @param options - Optional settings to control whether the request is actually sent
 * @param options.send - Whether to actually send the status notification
 */
export const sendAndSetConnectorStatus = async (
  chargingStation: ChargingStation,
  commandParams: StatusNotificationOptions,
  options?: { send: boolean }
): Promise<void> => {
  options = { send: true, ...options }
  const { connectorId, errorCode } = commandParams
  const status = commandParams.connectorStatus ?? commandParams.status
  const connectorStatus = chargingStation.getConnectorStatus(connectorId)
  if (connectorStatus == null) {
    return
  }
  if (options.send) {
    checkConnectorStatusTransition(chargingStation, connectorId, status)
    await chargingStation.ocppRequestService.requestHandler<
      StatusNotificationOptions,
      StatusNotificationResponse
    >(chargingStation, RequestCommand.STATUS_NOTIFICATION, commandParams)
  }
  connectorStatus.status = status
  connectorStatus.errorCode = errorCode
  chargingStation.emitChargingStationEvent(ChargingStationEvents.connectorStatusChanged, {
    connectorId,
    ...connectorStatus,
  })
}

/**
 * Sends Available or Unavailable connector status after a transaction ends.
 * Re-evaluates station and connector availability to determine the target status.
 * @param chargingStation - Target charging station
 * @param connectorId - Connector ID to transition
 */
export const sendPostTransactionStatus = async (
  chargingStation: ChargingStation,
  connectorId: number
): Promise<void> => {
  const status =
    chargingStation.isChargingStationAvailable() &&
    chargingStation.isConnectorAvailable(connectorId)
      ? ConnectorStatusEnum.Available
      : ConnectorStatusEnum.Unavailable
  await sendAndSetConnectorStatus(chargingStation, {
    connectorId,
    connectorStatus: status,
    status,
  })
}

/**
 * Restores a connector status to Reserved or Available based on its current state.
 * @param chargingStation - Target charging station
 * @param connectorId - Connector ID to restore
 * @param connectorStatus - Current connector status to evaluate
 */
export const restoreConnectorStatus = async (
  chargingStation: ChargingStation,
  connectorId: number,
  connectorStatus: ConnectorStatus | undefined
): Promise<void> => {
  if (
    connectorStatus?.reservation != null &&
    connectorStatus.status !== ConnectorStatusEnum.Reserved
  ) {
    await sendAndSetConnectorStatus(chargingStation, {
      connectorId,
      status: ConnectorStatusEnum.Reserved,
    })
  } else if (connectorStatus?.status !== ConnectorStatusEnum.Available) {
    await sendAndSetConnectorStatus(chargingStation, {
      connectorId,
      status: ConnectorStatusEnum.Available,
    })
  }
}

const checkConnectorStatusTransition = (
  chargingStation: ChargingStation,
  connectorId: number,
  status: ConnectorStatusEnum | undefined
): boolean => {
  const fromStatus = chargingStation.getConnectorStatus(connectorId)?.status
  let chargingStationTransitions: readonly { from?: ConnectorStatusEnum; to: ConnectorStatusEnum }[]
  let connectorTransitions: readonly { from?: ConnectorStatusEnum; to: ConnectorStatusEnum }[]
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      chargingStationTransitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      connectorTransitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      break
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      chargingStationTransitions = OCPP20Constants.ChargingStationStatusTransitions
      connectorTransitions = OCPP20Constants.ConnectorStatusTransitions
      break
    default:
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot check connector status transition: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`,
        RequestCommand.STATUS_NOTIFICATION
      )
  }
  const transitions = connectorId === 0 ? chargingStationTransitions : connectorTransitions
  const transitionAllowed = transitions.some(
    transition => transition.from === fromStatus && transition.to === status
  )
  if (!transitionAllowed) {
    logger.warn(
      `${chargingStation.logPrefix()} OCPP ${
        chargingStation.stationInfo.ocppVersion
      } connector id ${connectorId.toString()} status transition from '${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        chargingStation.getConnectorStatus(connectorId)?.status
      }' to '${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        status
      }' is not allowed`
    )
  }
  return transitionAllowed
}
