// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import { secondsToMilliseconds } from 'date-fns'

import {
  addConfigurationKey,
  type ChargingStation,
  getConfigurationKey,
  hasReservationExpired,
  resetConnectorStatus,
} from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  ChargingStationEvents,
  ErrorType,
  type JsonType,
  OCPP16AuthorizationStatus,
  type OCPP16AuthorizeRequest,
  type OCPP16AuthorizeResponse,
  type OCPP16BootNotificationResponse,
  OCPP16ChargePointStatus,
  OCPP16IncomingRequestCommand,
  type OCPP16MeterValue,
  type OCPP16MeterValuesRequest,
  type OCPP16MeterValuesResponse,
  OCPP16RequestCommand,
  OCPP16StandardParametersKey,
  type OCPP16StartTransactionRequest,
  type OCPP16StartTransactionResponse,
  type OCPP16StopTransactionRequest,
  type OCPP16StopTransactionResponse,
  OCPPVersion,
  RegistrationStatusEnumType,
  ReservationTerminationReason,
  type ResponseHandler,
} from '../../../types/index.js'
import { Constants, convertToInt, isAsyncFunction, logger } from '../../../utils/index.js'
import { OCPPResponseService } from '../OCPPResponseService.js'
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
 * 1. Response received from Central System for previously sent request
 * 2. Response payload validated against OCPP 1.6 JSON schema
 * 3. Response routed to appropriate handler based on original request type
 * 4. Charging station state updated based on response content
 * 5. Any follow-up actions triggered (transactions, status changes, etc.)
 * @see {@link validatePayload} Response payload validation method
 * @see {@link handleResponse} Response processing methods
 */

export class OCPP16ResponseService extends OCPPResponseService {
  public incomingRequestResponsePayloadValidateFunctions: Map<
    OCPP16IncomingRequestCommand,
    ValidateFunction<JsonType>
  >

  protected payloadValidatorFunctions: Map<OCPP16RequestCommand, ValidateFunction<JsonType>>
  private readonly responseHandlers: Map<OCPP16RequestCommand, ResponseHandler>

  public constructor () {
    // if (new.target.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target.name} instances directly`)
    // }
    super(OCPPVersion.VERSION_16)
    this.responseHandlers = new Map<OCPP16RequestCommand, ResponseHandler>([
      [OCPP16RequestCommand.AUTHORIZE, this.handleResponseAuthorize.bind(this) as ResponseHandler],
      [
        OCPP16RequestCommand.BOOT_NOTIFICATION,
        this.handleResponseBootNotification.bind(this) as ResponseHandler,
      ],
      [OCPP16RequestCommand.DATA_TRANSFER, this.emptyResponseHandler],
      [
        OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        this.emptyResponseHandler.bind(this) as ResponseHandler,
      ],
      [OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, this.emptyResponseHandler],
      [OCPP16RequestCommand.HEARTBEAT, this.emptyResponseHandler],
      [OCPP16RequestCommand.METER_VALUES, this.emptyResponseHandler],
      [
        OCPP16RequestCommand.START_TRANSACTION,
        this.handleResponseStartTransaction.bind(this) as ResponseHandler,
      ],
      [
        OCPP16RequestCommand.STATUS_NOTIFICATION,
        this.emptyResponseHandler.bind(this) as ResponseHandler,
      ],
      [
        OCPP16RequestCommand.STOP_TRANSACTION,
        this.handleResponseStopTransaction.bind(this) as ResponseHandler,
      ],
    ])
    this.payloadValidatorFunctions = OCPP16ServiceUtils.createPayloadValidatorMap(
      OCPP16ServiceUtils.createResponsePayloadConfigs(),
      OCPP16ServiceUtils.createResponseFactoryOptions(moduleName, 'constructor'),
      this.ajv
    )
    this.incomingRequestResponsePayloadValidateFunctions =
      OCPP16ServiceUtils.createPayloadValidatorMap(
        OCPP16ServiceUtils.createIncomingRequestResponsePayloadConfigs(),
        OCPP16ServiceUtils.createIncomingRequestResponseFactoryOptions(moduleName, 'constructor'),
        this.ajvIncomingRequest
      )
    this.validatePayload = this.validatePayload.bind(this)
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async responseHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    payload: ResType,
    requestPayload: ReqType
  ): Promise<void> {
    if (
      chargingStation.inAcceptedState() ||
      ((chargingStation.inUnknownState() || chargingStation.inPendingState()) &&
        commandName === OCPP16RequestCommand.BOOT_NOTIFICATION) ||
      (chargingStation.stationInfo?.ocppStrictCompliance === false &&
        (chargingStation.inUnknownState() || chargingStation.inPendingState()))
    ) {
      if (
        this.responseHandlers.has(commandName) &&
        OCPP16ServiceUtils.isRequestCommandSupported(chargingStation, commandName)
      ) {
        try {
          this.validatePayload(chargingStation, commandName, payload)
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.responseHandler: Handling '${commandName}' response`
          )
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const responseHandler = this.responseHandlers.get(commandName)!
          if (isAsyncFunction(responseHandler)) {
            await responseHandler(chargingStation, payload, requestPayload)
          } else {
            ;(
              responseHandler as (
                chargingStation: ChargingStation,
                payload: JsonType,
                requestPayload?: JsonType
              ) => void
            )(chargingStation, payload, requestPayload)
          }
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.responseHandler: '${commandName}' response processed successfully`
          )
        } catch (error) {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.responseHandler: Handle '${commandName}' response error:`,
            error
          )
          throw error
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle response PDU ${JSON.stringify(
            payload,
            undefined,
            2
          )}`,
          commandName,
          payload
        )
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle response PDU ${JSON.stringify(
          payload,
          undefined,
          2
        )} while the charging station is not registered on the central server`,
        commandName,
        payload
      )
    }
  }

  private handleResponseAuthorize (
    chargingStation: ChargingStation,
    payload: OCPP16AuthorizeResponse,
    requestPayload: OCPP16AuthorizeRequest
  ): void {
    let authorizeConnectorId: number | undefined
    if (chargingStation.hasEvses) {
      for (const [evseId, evseStatus] of chargingStation.evses) {
        if (evseId > 0) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            if (connectorStatus.authorizeIdTag === requestPayload.idTag) {
              authorizeConnectorId = connectorId
              break
            }
          }
        }
      }
    } else {
      for (const connectorId of chargingStation.connectors.keys()) {
        if (
          connectorId > 0 &&
          chargingStation.getConnectorStatus(connectorId)?.authorizeIdTag === requestPayload.idTag
        ) {
          authorizeConnectorId = connectorId
          break
        }
      }
    }
    if (authorizeConnectorId != null) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const authorizeConnectorStatus = chargingStation.getConnectorStatus(authorizeConnectorId)!
      if (payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
        authorizeConnectorStatus.idTagAuthorized = true
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseAuthorize: idTag '${
            requestPayload.idTag
          }' accepted on connector id ${authorizeConnectorId.toString()}`
        )
      } else {
        authorizeConnectorStatus.idTagAuthorized = false
        delete authorizeConnectorStatus.authorizeIdTag
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseAuthorize: idTag '${
            requestPayload.idTag
          }' rejected with status '${payload.idTagInfo.status}'`
        )
      }
    } else {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseAuthorize: idTag '${
          requestPayload.idTag
        }' has no authorize request pending`
      )
    }
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
      }' state on the central server`
      payload.status === RegistrationStatusEnumType.REJECTED
        ? logger.warn(logMsg)
        : logger.info(logMsg)
    } else {
      delete chargingStation.bootNotificationResponse
      logger.error(
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
      logger.error(
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
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction with a not local authorized idTag ${
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          connectorStatus.localAuthorizeIdTag
        } on connector id ${connectorId.toString()}`
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
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction with a not authorized idTag ${
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          connectorStatus.authorizeIdTag
        } on connector id ${connectorId.toString()}`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
      return
    }
    if (
      connectorStatus?.idTagAuthorized === true &&
      connectorStatus.authorizeIdTag != null &&
      connectorStatus.authorizeIdTag !== requestPayload.idTag
    ) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction with an idTag ${
          requestPayload.idTag
        } different from the authorize request one ${
          connectorStatus.authorizeIdTag
        } on connector id ${connectorId.toString()}`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
      return
    }
    if (
      connectorStatus?.idTagLocalAuthorized === true &&
      connectorStatus.localAuthorizeIdTag != null &&
      connectorStatus.localAuthorizeIdTag !== requestPayload.idTag
    ) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction with an idTag ${
          requestPayload.idTag
        } different from the local authorized one ${
          connectorStatus.localAuthorizeIdTag
        } on connector id ${connectorId.toString()}`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
      return
    }
    if (connectorStatus?.transactionStarted === true) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction on an already used connector id ${connectorId.toString()} by idTag ${
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          connectorStatus.transactionIdTag
        }`
      )
      return
    }
    if (chargingStation.hasEvses) {
      for (const [evseId, evseStatus] of chargingStation.evses) {
        if (evseStatus.connectors.size > 1) {
          for (const [id, status] of evseStatus.connectors) {
            if (id !== connectorId && status.transactionStarted === true) {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Trying to start a transaction on an already used evse id ${evseId.toString()} by connector id ${id.toString()} with idTag ${
                  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                  status.transactionIdTag
                }`
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
      logger.error(
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
              `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Reserved transaction ${payload.transactionId.toString()} started with a different idTag ${
                requestPayload.idTag
              } than the reservation one ${reservation.idTag}`
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
      await OCPP16ServiceUtils.sendAndSetConnectorStatus(
        chargingStation,
        connectorId,
        OCPP16ChargePointStatus.Charging
      )
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseStartTransaction: Transaction with id ${payload.transactionId.toString()} STARTED on ${
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          chargingStation.stationInfo?.chargingStationId
        }#${connectorId.toString()} for idTag '${requestPayload.idTag}'`
      )
      if (chargingStation.stationInfo?.powerSharedByConnectors === true) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ++chargingStation.powerDivider!
      }
      const configuredMeterValueSampleInterval = getConfigurationKey(
        chargingStation,
        OCPP16StandardParametersKey.MeterValueSampleInterval
      )
      chargingStation.startMeterValues(
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
        }#${connectorId.toString()} with status '${payload.idTagInfo.status}', idTag '${
          requestPayload.idTag
        }'${
          OCPP16ServiceUtils.hasReservation(chargingStation, connectorId, requestPayload.idTag)
            ? // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `, reservationId '${requestPayload.reservationId?.toString()}'`
            : ''
        }`
      )
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId)
    }
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
      logger.error(
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
          ) as OCPP16MeterValue,
        ],
        transactionId: requestPayload.transactionId,
      }))
    if (
      !chargingStation.isChargingStationAvailable() ||
      !chargingStation.isConnectorAvailable(transactionConnectorId)
    ) {
      await OCPP16ServiceUtils.sendAndSetConnectorStatus(
        chargingStation,
        transactionConnectorId,
        OCPP16ChargePointStatus.Unavailable
      )
    } else {
      await OCPP16ServiceUtils.sendAndSetConnectorStatus(
        chargingStation,
        transactionConnectorId,
        OCPP16ChargePointStatus.Available
      )
    }
    if (chargingStation.stationInfo?.powerSharedByConnectors === true) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      chargingStation.powerDivider!--
    }
    resetConnectorStatus(chargingStation.getConnectorStatus(transactionConnectorId))
    chargingStation.stopMeterValues(transactionConnectorId)
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
  }

  private async resetConnectorOnStartTransactionError (
    chargingStation: ChargingStation,
    connectorId: number
  ): Promise<void> {
    chargingStation.stopMeterValues(connectorId)
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    resetConnectorStatus(connectorStatus)
    await OCPP16ServiceUtils.restoreConnectorStatus(chargingStation, connectorId, connectorStatus)
  }

  /**
   * Validates incoming OCPP 1.6 response payload against JSON schema
   * @param chargingStation - The charging station instance receiving the response
   * @param commandName - OCPP 1.6 command name to validate against
   * @param payload - JSON response payload to validate
   * @returns True if payload validation succeeds, false otherwise
   */
  private validatePayload (
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    payload: JsonType
  ): boolean {
    if (this.payloadValidatorFunctions.has(commandName)) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.validatePayload: Validating '${commandName}' response payload`
      )
      const isValid = this.validateResponsePayload(chargingStation, commandName, payload)
      if (!isValid) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.validatePayload: '${commandName}' response payload validation failed`
        )
      } else {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.validatePayload: '${commandName}' response payload validation successful`
        )
      }
      return isValid
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema validation function found for command '${commandName}' PDU validation`
    )
    return false
  }
}
