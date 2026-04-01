import type { ValidateFunction } from 'ajv'

import { secondsToMilliseconds } from 'date-fns'

import type { OCPP16IncomingRequestCommand } from '../../../types/index.js'

import {
  addConfigurationKey,
  type ChargingStation,
  getConfigurationKey,
  hasReservationExpired,
  resetConnectorStatus,
} from '../../../charging-station/index.js'
import {
  ChargingStationEvents,
  type JsonType,
  OCPP16AuthorizationStatus,
  type OCPP16AuthorizeRequest,
  type OCPP16AuthorizeResponse,
  type OCPP16BootNotificationResponse,
  OCPP16ChargePointStatus,
  type OCPP16MeterValuesRequest,
  type OCPP16MeterValuesResponse,
  OCPP16RequestCommand,
  OCPP16StandardParametersKey,
  type OCPP16StartTransactionRequest,
  type OCPP16StartTransactionResponse,
  type OCPP16StatusNotificationRequest,
  type OCPP16StopTransactionRequest,
  type OCPP16StopTransactionResponse,
  OCPPVersion,
  RegistrationStatusEnumType,
  type RequestCommand,
  ReservationTerminationReason,
  type ResponseHandler,
} from '../../../types/index.js'
import { Constants, convertToInt, logger, truncateId } from '../../../utils/index.js'
import {
  restoreConnectorStatus,
  sendAndSetConnectorStatus,
} from '../OCPPConnectorStatusOperations.js'
import { OCPPResponseService } from '../OCPPResponseService.js'
import { createPayloadValidatorMap, isRequestCommandSupported } from '../OCPPServiceUtils.js'
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils.js'

const moduleName = 'OCPP16ResponseService'

/**
 * OCPP 1.6 Response Service - handles and processes all outgoing request responses
 * from the Charging Station (CP) to the Central System (CS) using OCPP 1.6 protocol.
 *
 * This service class is responsible for:
 * - **Response Reception**: Receiving responses to requests sent from the Charging Station
 * - **Payload Validation**: Validating response payloads against OCPP 1.6 JSON schemas
 * - **Response Processing**: Processing Central System responses and updating station state
 * - **Error Handling**: Managing response errors and protocol-level exceptions
 * - **State Synchronization**: Ensuring charging station state reflects Central System responses
 *
 * Supported OCPP 1.6 Response Types:
 * - **Authentication**: Authorize responses with authorization status updates
 * - **Transaction Management**: StartTransaction, StopTransaction response handling
 * - **Status Updates**: BootNotification, StatusNotification, MeterValues responses
 * - **Configuration**: Responses to configuration queries and updates
 * - **Heartbeat**: Heartbeat response processing for connection maintenance
 * - **Data Transfer**: Custom data transfer response handling
 *
 * Architecture Pattern:
 * This class extends OCPPResponseService and implements OCPP 1.6-specific response
 * processing logic. It follows a handler mapping pattern where each response type
 * is processed by dedicated handler methods that manage charging station state updates.
 *
 * Response Validation Workflow:
 * 1. Response received from Central System for the corresponding request
 * 2. Response payload validated against OCPP 1.6 JSON schema
 * 3. Response routed to appropriate handler based on original request type
 * 4. Charging station state updated based on response content
 * 5. Any follow-up actions triggered (transactions, status changes, etc.)
 * @see {@link validateResponsePayload} Response payload validation method
 * @see {@link handleResponse} Response processing methods
 */

export class OCPP16ResponseService extends OCPPResponseService {
  public incomingRequestResponsePayloadValidateFunctions: Map<
    OCPP16IncomingRequestCommand,
    ValidateFunction<JsonType>
  >

  protected readonly bootNotificationRequestCommand = OCPP16RequestCommand.BOOT_NOTIFICATION
  protected readonly csmsName = 'central system'
  protected readonly moduleName = moduleName

  protected payloadValidatorFunctions: Map<OCPP16RequestCommand, ValidateFunction<JsonType>>

  protected readonly responseHandlers: Map<RequestCommand, ResponseHandler>

  /**
   * Constructs an OCPP 1.6 Response Service instance with response handlers and validators.
   */
  public constructor () {
    super(OCPPVersion.VERSION_16)
    this.responseHandlers = new Map<RequestCommand, ResponseHandler>([
      [
        OCPP16RequestCommand.AUTHORIZE,
        this.toResponseHandler(this.handleResponseAuthorize.bind(this)),
      ],
      [
        OCPP16RequestCommand.BOOT_NOTIFICATION,
        this.toResponseHandler(this.handleResponseBootNotification.bind(this)),
      ],
      [OCPP16RequestCommand.DATA_TRANSFER, this.emptyResponseHandler],
      [
        OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        this.toResponseHandler(this.emptyResponseHandler.bind(this)),
      ],
      [OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, this.emptyResponseHandler],
      [OCPP16RequestCommand.HEARTBEAT, this.emptyResponseHandler],
      [OCPP16RequestCommand.METER_VALUES, this.emptyResponseHandler],
      [
        OCPP16RequestCommand.START_TRANSACTION,
        this.toResponseHandler(this.handleResponseStartTransaction.bind(this)),
      ],
      [
        OCPP16RequestCommand.STATUS_NOTIFICATION,
        this.toResponseHandler(this.emptyResponseHandler.bind(this)),
      ],
      [
        OCPP16RequestCommand.STOP_TRANSACTION,
        this.toResponseHandler(this.handleResponseStopTransaction.bind(this)),
      ],
    ])
    this.payloadValidatorFunctions = createPayloadValidatorMap(
      OCPP16ServiceUtils.createResponsePayloadConfigs(),
      OCPP16ServiceUtils.createPayloadOptions(moduleName, 'constructor'),
      this.ajv
    )
    this.incomingRequestResponsePayloadValidateFunctions = createPayloadValidatorMap(
      OCPP16ServiceUtils.createIncomingRequestResponsePayloadConfigs(),
      OCPP16ServiceUtils.createPayloadOptions(moduleName, 'constructor'),
      this.ajvIncomingRequest
    )
  }

  /**
   * Checks whether the given request command is supported by the charging station.
   * @param chargingStation - Target charging station
   * @param commandName - Request command to check
   * @returns Whether the command is supported
   */
  protected isRequestCommandSupported (
    chargingStation: ChargingStation,
    commandName: RequestCommand
  ): boolean {
    return isRequestCommandSupported(chargingStation, commandName as OCPP16RequestCommand)
  }

  private handleResponseAuthorize (
    chargingStation: ChargingStation,
    payload: OCPP16AuthorizeResponse,
    requestPayload: OCPP16AuthorizeRequest
  ): void {
    let authorizeConnectorId: number | undefined
    for (const { connectorId, connectorStatus } of chargingStation.iterateConnectors(true)) {
      if (connectorStatus.authorizeIdTag === requestPayload.idTag) {
        authorizeConnectorId = connectorId
        break
      }
    }
    if (authorizeConnectorId != null) {
      const authorizeConnectorStatus = chargingStation.getConnectorStatus(authorizeConnectorId)
      if (authorizeConnectorStatus != null) {
        if (payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
          authorizeConnectorStatus.idTagAuthorized = true
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.handleResponseAuthorize: idTag '${truncateId(
              requestPayload.idTag
            )}' accepted on connector id ${authorizeConnectorId.toString()}`
          )
        } else {
          authorizeConnectorStatus.idTagAuthorized = false
          delete authorizeConnectorStatus.authorizeIdTag
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.handleResponseAuthorize: idTag '${truncateId(
              requestPayload.idTag
            )}' rejected with status '${payload.idTagInfo.status}'`
          )
        }
      }
    } else {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseAuthorize: idTag '${truncateId(
          requestPayload.idTag
        )}' has no authorize request pending`
      )
    }
    OCPP16ServiceUtils.updateAuthorizationCache(
      chargingStation,
      requestPayload.idTag,
      payload.idTagInfo
    )
  }

  private handleResponseBootNotification (
    chargingStation: ChargingStation,
    payload: OCPP16BootNotificationResponse
  ): void {
    if (Object.values(RegistrationStatusEnumType).includes(payload.status)) {
      chargingStation.bootNotificationResponse = payload
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (payload.interval != null) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Setting HeartbeatInterval to ${payload.interval.toString()}s`
        )
        addConfigurationKey(
          chargingStation,
          OCPP16StandardParametersKey.HeartbeatInterval,
          payload.interval.toString(),
          {},
          { overwrite: true, save: true }
        )
        addConfigurationKey(
          chargingStation,
          OCPP16StandardParametersKey.HeartBeatInterval,
          payload.interval.toString(),
          { visible: false },
          { overwrite: true, save: true }
        )
      }
      if (chargingStation.inAcceptedState()) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Emitting '${RegistrationStatusEnumType.ACCEPTED}' event`
        )
        chargingStation.emitChargingStationEvent(ChargingStationEvents.accepted)
      } else if (chargingStation.inPendingState()) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Emitting '${RegistrationStatusEnumType.PENDING}' event`
        )
        chargingStation.emitChargingStationEvent(ChargingStationEvents.pending)
      } else if (chargingStation.inRejectedState()) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Emitting '${RegistrationStatusEnumType.REJECTED}' event`
        )
        chargingStation.emitChargingStationEvent(ChargingStationEvents.rejected)
      }
      const logMsg = `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Charging station in '${
        payload.status
      }' state on the central system`
      payload.status === RegistrationStatusEnumType.REJECTED
        ? logger.warn(logMsg)
        : logger.info(logMsg)
    } else {
      delete chargingStation.bootNotificationResponse
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseBootNotification: Charging station boot notification response received: %j with undefined registration status`,
        payload
      )
    }
  }

  private async handleResponseStartTransaction (
    chargingStation: ChargingStation,
    payload: OCPP16StartTransactionResponse,
    requestPayload: OCPP16StartTransactionRequest
  ): Promise<void> {
    const { connectorId } = requestPayload
    if (connectorId === 0 || !chargingStation.hasConnector(connectorId)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction on a non existing connector id ${connectorId.toString()}`
      )
      return
    }
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (
      connectorStatus?.transactionRemoteStarted === true &&
      chargingStation.getAuthorizeRemoteTxRequests() &&
      chargingStation.getLocalAuthListEnabled() &&
      chargingStation.hasIdTags() &&
      connectorStatus.idTagLocalAuthorized === false
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction with a not local authorized idTag '${truncateId(
          connectorStatus.localAuthorizeIdTag ?? ''
        )}' on connector id ${connectorId.toString()}`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
      return
    }
    if (
      connectorStatus?.transactionRemoteStarted === true &&
      chargingStation.getAuthorizeRemoteTxRequests() &&
      chargingStation.stationInfo?.remoteAuthorization === true &&
      connectorStatus.idTagLocalAuthorized === false &&
      connectorStatus.idTagAuthorized === false
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction with a not authorized idTag '${truncateId(
          connectorStatus.authorizeIdTag ?? ''
        )}' on connector id ${connectorId.toString()}`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
      return
    }
    if (
      connectorStatus?.idTagAuthorized === true &&
      connectorStatus.authorizeIdTag != null &&
      connectorStatus.authorizeIdTag !== requestPayload.idTag
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction with an idTag '${truncateId(
          requestPayload.idTag
        )}' different from the authorize request one '${truncateId(
          connectorStatus.authorizeIdTag ?? ''
        )}' on connector id ${connectorId.toString()}`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
      return
    }
    if (
      connectorStatus?.idTagLocalAuthorized === true &&
      connectorStatus.localAuthorizeIdTag != null &&
      connectorStatus.localAuthorizeIdTag !== requestPayload.idTag
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction with an idTag '${truncateId(
          requestPayload.idTag
        )}' different from the local authorized one '${truncateId(
          connectorStatus.localAuthorizeIdTag ?? ''
        )}' on connector id ${connectorId.toString()}`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
      return
    }
    if (connectorStatus?.transactionStarted === true) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction on an already used connector id ${connectorId.toString()} by idTag '${truncateId(
          connectorStatus.transactionIdTag ?? ''
        )}'`
      )
      return
    }
    if (chargingStation.hasEvses) {
      for (const { evseId, evseStatus } of chargingStation.iterateEvses()) {
        if (evseStatus.connectors.size > 1) {
          for (const [id, status] of evseStatus.connectors) {
            if (id !== connectorId && status.transactionStarted === true) {
              logger.warn(
                `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction on an already used evse id ${evseId.toString()} by connector id ${id.toString()} with idTag '${truncateId(
                  status.transactionIdTag ?? ''
                )}'`
              )
              await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
              return
            }
          }
        }
      }
    }
    if (
      connectorStatus?.status !== OCPP16ChargePointStatus.Available &&
      connectorStatus?.status !== OCPP16ChargePointStatus.Preparing
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction on connector id ${connectorId.toString()} with status ${
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          connectorStatus?.status
        }`
      )
      return
    }
    if (!Number.isSafeInteger(payload.transactionId)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction on connector id ${connectorId.toString()} with a non integer transaction id ${payload.transactionId.toString()}, converting to integer`
      )
      payload.transactionId = convertToInt(payload.transactionId)
    }

    if (payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
      connectorStatus.transactionStarted = true
      connectorStatus.transactionStart = requestPayload.timestamp
      connectorStatus.transactionId = payload.transactionId
      connectorStatus.transactionIdTag = requestPayload.idTag
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.locked = true
      connectorStatus.transactionBeginMeterValue =
        OCPP16ServiceUtils.buildTransactionBeginMeterValue(
          chargingStation,
          connectorId,
          requestPayload.meterStart
        )
      if (requestPayload.reservationId != null) {
        const reservation = chargingStation.getReservationBy(
          'reservationId',
          requestPayload.reservationId
        )
        if (reservation != null) {
          if (reservation.idTag !== requestPayload.idTag) {
            logger.warn(
              `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Reserved transaction ${payload.transactionId.toString()} started with a different idTag '${truncateId(
                requestPayload.idTag
              )}' than the reservation one '${truncateId(reservation.idTag)}'`
            )
          }
          if (hasReservationExpired(reservation)) {
            logger.warn(
              `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Reserved transaction ${payload.transactionId.toString()} started with expired reservation ${requestPayload.reservationId.toString()} (expiry date: ${reservation.expiryDate.toISOString()}))`
            )
          }
          await chargingStation.removeReservation(
            reservation,
            ReservationTerminationReason.TRANSACTION_STARTED
          )
        } else {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Reserved transaction ${payload.transactionId.toString()} started with unknown reservation ${requestPayload.reservationId.toString()}`
          )
        }
      }
      chargingStation.stationInfo?.beginEndMeterValues === true &&
        (await chargingStation.ocppRequestService.requestHandler<
          OCPP16MeterValuesRequest,
          OCPP16MeterValuesResponse
        >(chargingStation, OCPP16RequestCommand.METER_VALUES, {
          connectorId,
          meterValue: [connectorStatus.transactionBeginMeterValue],
          transactionId: payload.transactionId,
        } satisfies OCPP16MeterValuesRequest))
      await sendAndSetConnectorStatus(chargingStation, {
        connectorId,
        status: OCPP16ChargePointStatus.Charging,
      } as OCPP16StatusNotificationRequest)
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Transaction with id ${payload.transactionId.toString()} STARTED on ${
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          chargingStation.stationInfo?.chargingStationId
        }#${connectorId.toString()} for idTag '${truncateId(requestPayload.idTag)}'`
      )
      if (chargingStation.stationInfo?.powerSharedByConnectors === true) {
        if (chargingStation.powerDivider != null) {
          ++chargingStation.powerDivider
        } else {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: powerDivider is undefined, cannot increment`
          )
        }
      }
      const configuredMeterValueSampleInterval = getConfigurationKey(
        chargingStation,
        OCPP16StandardParametersKey.MeterValueSampleInterval
      )
      OCPP16ServiceUtils.startUpdatedMeterValues(
        chargingStation,
        connectorId,
        configuredMeterValueSampleInterval != null
          ? secondsToMilliseconds(convertToInt(configuredMeterValueSampleInterval.value))
          : Constants.DEFAULT_METER_VALUES_INTERVAL
      )
    } else {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Starting transaction with id ${payload.transactionId.toString()} REJECTED on ${
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          chargingStation.stationInfo?.chargingStationId
        }#${connectorId.toString()} with status '${payload.idTagInfo.status}', idTag '${truncateId(
          requestPayload.idTag
        )}'${
          OCPP16ServiceUtils.hasReservation(chargingStation, connectorId, requestPayload.idTag)
            ? // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `, reservationId '${requestPayload.reservationId?.toString()}'`
            : ''
        }`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
    }
    OCPP16ServiceUtils.updateAuthorizationCache(
      chargingStation,
      requestPayload.idTag,
      payload.idTagInfo
    )
  }

  private async handleResponseStopTransaction (
    chargingStation: ChargingStation,
    payload: OCPP16StopTransactionResponse,
    requestPayload: OCPP16StopTransactionRequest
  ): Promise<void> {
    const transactionConnectorId = chargingStation.getConnectorIdByTransactionId(
      requestPayload.transactionId
    )
    if (transactionConnectorId == null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStopTransaction: Trying to stop a non existing transaction with id ${requestPayload.transactionId.toString()}`
      )
      return
    }
    chargingStation.stationInfo?.beginEndMeterValues === true &&
      chargingStation.stationInfo.ocppStrictCompliance === false &&
      chargingStation.stationInfo.outOfOrderEndMeterValues === true &&
      (await chargingStation.ocppRequestService.requestHandler<
        OCPP16MeterValuesRequest,
        OCPP16MeterValuesResponse
      >(chargingStation, OCPP16RequestCommand.METER_VALUES, {
        connectorId: transactionConnectorId,
        meterValue: [
          OCPP16ServiceUtils.buildTransactionEndMeterValue(
            chargingStation,
            transactionConnectorId,
            requestPayload.meterStop
          ),
        ],
        transactionId: requestPayload.transactionId,
      }))
    if (
      !chargingStation.isChargingStationAvailable() ||
      !chargingStation.isConnectorAvailable(transactionConnectorId)
    ) {
      await sendAndSetConnectorStatus(chargingStation, {
        connectorId: transactionConnectorId,
        status: OCPP16ChargePointStatus.Unavailable,
      } as OCPP16StatusNotificationRequest)
    } else {
      await sendAndSetConnectorStatus(chargingStation, {
        connectorId: transactionConnectorId,
        status: OCPP16ChargePointStatus.Available,
      } as OCPP16StatusNotificationRequest)
    }
    if (chargingStation.stationInfo?.powerSharedByConnectors === true) {
      if (chargingStation.powerDivider != null && chargingStation.powerDivider > 0) {
        --chargingStation.powerDivider
      } else {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseStopTransaction: powerDivider is ${
            chargingStation.powerDivider?.toString() ?? 'undefined'
          }, cannot decrement`
        )
      }
    }
    const transactionConnectorStatus = chargingStation.getConnectorStatus(transactionConnectorId)
    const transactionIdTag = requestPayload.idTag ?? transactionConnectorStatus?.transactionIdTag
    resetConnectorStatus(transactionConnectorStatus)
    if (
      transactionConnectorStatus != null &&
      (payload.idTagInfo == null || payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED)
    ) {
      transactionConnectorStatus.locked = false
    }
    OCPP16ServiceUtils.stopUpdatedMeterValues(chargingStation, transactionConnectorId)
    const logMsg = `${chargingStation.logPrefix()} ${moduleName}.handleResponseStopTransaction: Transaction with id ${requestPayload.transactionId.toString()} STOPPED on ${
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      chargingStation.stationInfo?.chargingStationId
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    }#${transactionConnectorId.toString()} with status '${payload.idTagInfo?.status}'`
    if (
      payload.idTagInfo == null ||
      payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED
    ) {
      logger.info(logMsg)
    } else {
      logger.warn(logMsg)
    }
    if (payload.idTagInfo != null && transactionIdTag != null) {
      OCPP16ServiceUtils.updateAuthorizationCache(
        chargingStation,
        transactionIdTag,
        payload.idTagInfo
      )
    }
  }

  private async resetConnectorOnStartTransactionError (
    chargingStation: ChargingStation,
    connectorId: number
  ): Promise<void> {
    OCPP16ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId)
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    resetConnectorStatus(connectorStatus)
    await restoreConnectorStatus(chargingStation, connectorId, connectorStatus)
  }
}
