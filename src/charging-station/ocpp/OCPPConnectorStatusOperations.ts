import { type ChargingStation } from '../../charging-station/index.js'
import { OCPPError } from '../../exception/index.js'
import {
  ChargingStationEvents,
  type ConnectorStatus,
  ConnectorStatusEnum,
  ErrorType,
  OCPPVersion,
  RequestCommand,
  type StatusNotificationRequest,
  type StatusNotificationResponse,
} from '../../types/index.js'
import { logger } from '../../utils/index.js'
import { OCPP16Constants } from './1.6/OCPP16Constants.js'
import { OCPP20Constants } from './2.0/OCPP20Constants.js'

/**
 * Sends a StatusNotification request and updates the connector status locally.
 * @param chargingStation - Target charging station
 * @param commandParams - Status notification parameters including connector ID and status
 * @param options - Optional settings to control whether the request is actually sent
 * @param options.send - Whether to actually send the status notification
 */
export const sendAndSetConnectorStatus = async (
  chargingStation: ChargingStation,
  commandParams: StatusNotificationRequest,
  options?: { send: boolean }
): Promise<void> => {
  options = { send: true, ...options }
  const params = commandParams as Record<string, unknown>
  const connectorId = params.connectorId as number
  const status = (params.connectorStatus ?? params.status) as ConnectorStatusEnum
  const connectorStatus = chargingStation.getConnectorStatus(connectorId)
  if (connectorStatus == null) {
    return
  }
  if (options.send) {
    checkConnectorStatusTransition(chargingStation, connectorId, status)
    await chargingStation.ocppRequestService.requestHandler<
      StatusNotificationRequest,
      StatusNotificationResponse
    >(chargingStation, RequestCommand.STATUS_NOTIFICATION, commandParams)
  }
  connectorStatus.status = status
  chargingStation.emitChargingStationEvent(ChargingStationEvents.connectorStatusChanged, {
    connectorId,
    ...connectorStatus,
  })
}

/**
 * Restores a connector status to Reserved or Available based on its current state.
 * @param chargingStation - Target charging station
 * @param connectorId - Connector ID to restore
 * @param connectorStatus - Current connector status to evaluate
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
  } as unknown as StatusNotificationRequest)
}

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
    } as unknown as StatusNotificationRequest)
  } else if (connectorStatus?.status !== ConnectorStatusEnum.Available) {
    await sendAndSetConnectorStatus(chargingStation, {
      connectorId,
      status: ConnectorStatusEnum.Available,
    } as unknown as StatusNotificationRequest)
  }
}

const checkConnectorStatusTransition = (
  chargingStation: ChargingStation,
  connectorId: number,
  status: ConnectorStatusEnum
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
      }' to '${status}' is not allowed`
    )
  }
  return transitionAllowed
}
