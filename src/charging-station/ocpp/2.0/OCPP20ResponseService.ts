import type { ValidateFunction } from 'ajv'

import {
  addConfigurationKey,
  buildConfigKey,
  type ChargingStation,
} from '../../../charging-station/index.js'
import {
  ChargingStationEvents,
  ConnectorStatusEnum,
  type JsonType,
  OCPP20AuthorizationStatusEnumType,
  type OCPP20AuthorizeResponse,
  type OCPP20BootNotificationResponse,
  OCPP20ComponentName,
  type OCPP20DataTransferResponse,
  type OCPP20FirmwareStatusNotificationResponse,
  type OCPP20Get15118EVCertificateResponse,
  type OCPP20GetCertificateStatusResponse,
  type OCPP20HeartbeatResponse,
  type OCPP20IncomingRequestCommand,
  type OCPP20LogStatusNotificationResponse,
  type OCPP20MeterValuesResponse,
  type OCPP20NotifyCustomerInformationResponse,
  type OCPP20NotifyReportResponse,
  OCPP20OptionalVariableName,
  OCPP20RequestCommand,
  type OCPP20SecurityEventNotificationResponse,
  type OCPP20SignCertificateResponse,
  type OCPP20StatusNotificationRequest,
  type OCPP20StatusNotificationResponse,
  OCPP20TransactionEventEnumType,
  type OCPP20TransactionEventRequest,
  type OCPP20TransactionEventResponse,
  OCPPVersion,
  RegistrationStatusEnumType,
  type RequestCommand,
  type ResponseHandler,
} from '../../../types/index.js'
import { convertToDate, logger } from '../../../utils/index.js'
import { mapOCPP20TokenType, OCPPAuthServiceFactory } from '../auth/index.js'
import { OCPPResponseService } from '../OCPPResponseService.js'
import { sendAndSetConnectorStatus } from '../OCPPServiceUtils.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'
const moduleName = 'OCPP20ResponseService'

/**
 * OCPP 2.0+ Response Service - handles and processes all outgoing request responses
 * from the Charging Station to the Central System Management System (CSMS) using OCPP 2.0+ protocol.
 *
 * This service class is responsible for:
 * - **Response Reception**: Receiving responses to requests sent from the Charging Station
 * - **Payload Validation**: Validating response payloads against OCPP 2.0+ JSON schemas
 * - **Response Processing**: Processing CSMS responses and updating station state
 * - **Variable Management**: Handling variable-based configuration responses
 * - **Enhanced State Management**: Managing OCPP 2.0+ advanced state and feature coordination
 *
 * Supported OCPP 2.0+ Response Types:
 * - **Authentication**: Authorize responses with enhanced authorization mechanisms
 * - **Transaction Management**: TransactionEvent responses for flexible transaction handling
 * - **Status Updates**: BootNotification, StatusNotification, NotifyReport responses
 * - **Variable Operations**: Responses to GetVariables, SetVariables operations
 * - **Security**: Responses to security-related operations and certificate management
 * - **Heartbeat**: Enhanced heartbeat response processing with additional metadata
 *
 * Key OCPP 2.0+ Features:
 * - **Variable Model Integration**: Seamless integration with OCPP 2.0+ variable system
 * - **Enhanced Transaction Model**: Support for flexible transaction event handling
 * - **Security Framework**: Advanced security response processing and validation
 * - **Rich Data Model**: Support for complex data structures and enhanced messaging
 * - **Backward Compatibility**: Maintains compatibility concepts while extending functionality
 *
 * Architecture Pattern:
 * This class extends OCPPResponseService and implements OCPP 2.0+-specific response
 * processing logic. It works closely with OCPP20VariableManager and other OCPP 2.0+
 * components to provide comprehensive protocol support with enhanced features.
 *
 * Response Validation Workflow:
 * 1. Response received from CSMS for previously sent request
 * 2. Response payload validated against OCPP 2.0+ JSON schema
 * 3. Response routed to appropriate handler based on original request type
 * 4. Charging station state and variable model updated based on response content
 * 5. Enhanced follow-up actions triggered based on OCPP 2.0+ capabilities
 * @see {@link validateResponsePayload} Response payload validation method
 * @see {@link handleResponse} Response processing methods
 * @see {@link OCPP20VariableManager} Variable management integration
 */

export class OCPP20ResponseService extends OCPPResponseService {
  public incomingRequestResponsePayloadValidateFunctions: Map<
    OCPP20IncomingRequestCommand,
    ValidateFunction<JsonType>
  >

  protected readonly bootNotificationRequestCommand = OCPP20RequestCommand.BOOT_NOTIFICATION
  protected readonly csmsName = 'CSMS'
  protected readonly moduleName = moduleName

  protected payloadValidatorFunctions: Map<OCPP20RequestCommand, ValidateFunction<JsonType>>

  protected readonly responseHandlers: Map<RequestCommand, ResponseHandler>

  public constructor () {
    super(OCPPVersion.VERSION_201)
    this.responseHandlers = new Map<RequestCommand, ResponseHandler>([
      [OCPP20RequestCommand.AUTHORIZE, this.handleResponseAuthorize.bind(this) as ResponseHandler],
      [
        OCPP20RequestCommand.BOOT_NOTIFICATION,
        this.handleResponseBootNotification.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.DATA_TRANSFER,
        this.handleResponseDataTransfer.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
        this.handleResponseFirmwareStatusNotification.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.GET_15118_EV_CERTIFICATE,
        this.handleResponseGet15118EVCertificate.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.GET_CERTIFICATE_STATUS,
        this.handleResponseGetCertificateStatus.bind(this) as ResponseHandler,
      ],
      [OCPP20RequestCommand.HEARTBEAT, this.handleResponseHeartbeat.bind(this) as ResponseHandler],
      [
        OCPP20RequestCommand.LOG_STATUS_NOTIFICATION,
        this.handleResponseLogStatusNotification.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.METER_VALUES,
        this.handleResponseMeterValues.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.NOTIFY_CUSTOMER_INFORMATION,
        this.handleResponseNotifyCustomerInformation.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.NOTIFY_REPORT,
        this.handleResponseNotifyReport.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION,
        this.handleResponseSecurityEventNotification.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.SIGN_CERTIFICATE,
        this.handleResponseSignCertificate.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        this.handleResponseStatusNotification.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.TRANSACTION_EVENT,
        this.handleResponseTransactionEvent.bind(this) as ResponseHandler,
      ],
    ])
    this.payloadValidatorFunctions = OCPP20ServiceUtils.createPayloadValidatorMap(
      OCPP20ServiceUtils.createResponsePayloadConfigs(),
      OCPP20ServiceUtils.createPayloadOptions(moduleName, 'constructor'),
      this.ajv
    )
    this.incomingRequestResponsePayloadValidateFunctions =
      OCPP20ServiceUtils.createPayloadValidatorMap(
        OCPP20ServiceUtils.createIncomingRequestResponsePayloadConfigs(),
        OCPP20ServiceUtils.createPayloadOptions(moduleName, 'constructor'),
        this.ajvIncomingRequest
      )
  }

  protected isRequestCommandSupported (
    chargingStation: ChargingStation,
    commandName: RequestCommand
  ): boolean {
    return OCPP20ServiceUtils.isRequestCommandSupported(
      chargingStation,
      commandName as OCPP20RequestCommand
    )
  }

  private handleResponseAuthorize (
    chargingStation: ChargingStation,
    payload: OCPP20AuthorizeResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseAuthorize: Authorize response received, status: ${payload.idTokenInfo.status}`
    )
  }

  private handleResponseBootNotification (
    chargingStation: ChargingStation,
    payload: OCPP20BootNotificationResponse
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
          buildConfigKey(
            OCPP20ComponentName.OCPPCommCtrlr,
            OCPP20OptionalVariableName.HeartbeatInterval
          ),
          payload.interval.toString(),
          {},
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
      }' state on the CSMS`
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

  private handleResponseDataTransfer (
    chargingStation: ChargingStation,
    payload: OCPP20DataTransferResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseDataTransfer: DataTransfer response received, status: ${payload.status}`
    )
  }

  private handleResponseFirmwareStatusNotification (
    chargingStation: ChargingStation,
    payload: OCPP20FirmwareStatusNotificationResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseFirmwareStatusNotification: FirmwareStatusNotification response received successfully`
    )
  }

  private handleResponseGet15118EVCertificate (
    chargingStation: ChargingStation,
    payload: OCPP20Get15118EVCertificateResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseGet15118EVCertificate: Get15118EVCertificate response received, status: ${payload.status}`
    )
  }

  private handleResponseGetCertificateStatus (
    chargingStation: ChargingStation,
    payload: OCPP20GetCertificateStatusResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseGetCertificateStatus: GetCertificateStatus response received, status: ${payload.status}`
    )
  }

  private handleResponseHeartbeat (
    chargingStation: ChargingStation,
    payload: OCPP20HeartbeatResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseHeartbeat: Heartbeat response received at ${convertToDate(payload.currentTime)?.toISOString() ?? 'unknown'}`
    )
  }

  private handleResponseLogStatusNotification (
    chargingStation: ChargingStation,
    payload: OCPP20LogStatusNotificationResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseLogStatusNotification: LogStatusNotification response received successfully`
    )
  }

  private handleResponseMeterValues (
    chargingStation: ChargingStation,
    payload: OCPP20MeterValuesResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseMeterValues: MeterValues response received successfully`
    )
  }

  private handleResponseNotifyCustomerInformation (
    chargingStation: ChargingStation,
    payload: OCPP20NotifyCustomerInformationResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseNotifyCustomerInformation: NotifyCustomerInformation response received successfully`
    )
  }

  private handleResponseNotifyReport (
    chargingStation: ChargingStation,
    payload: OCPP20NotifyReportResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseNotifyReport: NotifyReport response received successfully`
    )
  }

  private handleResponseSecurityEventNotification (
    chargingStation: ChargingStation,
    payload: OCPP20SecurityEventNotificationResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseSecurityEventNotification: SecurityEventNotification response received successfully`
    )
  }

  private handleResponseSignCertificate (
    chargingStation: ChargingStation,
    payload: OCPP20SignCertificateResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseSignCertificate: SignCertificate response received, status: ${payload.status}`
    )
  }

  private handleResponseStatusNotification (
    chargingStation: ChargingStation,
    payload: OCPP20StatusNotificationResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseStatusNotification: StatusNotification response received successfully`
    )
  }

  /**
   * Handles TransactionEvent response from CSMS.
   *
   * Per OCPP 2.0.1 spec (D01, D05): If the Charging Station started a transaction based on
   * local authorization, but receives an Invalid, Blocked, Expired, or NoCredit status in the
   * TransactionEventResponse idTokenInfo, the Charging Station SHALL stop the transaction.
   * @param chargingStation - The charging station instance
   * @param payload - The TransactionEvent response payload from CSMS
   * @param requestPayload - The original TransactionEvent request payload
   */
  private handleResponseTransactionEvent (
    chargingStation: ChargingStation,
    payload: OCPP20TransactionEventResponse,
    requestPayload: OCPP20TransactionEventRequest
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: TransactionEvent(${requestPayload.eventType}) response received`
    )
    const connectorId =
      requestPayload.evse?.connectorId ??
      requestPayload.evse?.id ??
      chargingStation.getConnectorIdByTransactionId(requestPayload.transactionInfo.transactionId)
    const connectorStatus =
      connectorId != null ? chargingStation.getConnectorStatus(connectorId) : undefined

    switch (requestPayload.eventType) {
      case OCPP20TransactionEventEnumType.Ended:
        if (connectorId != null) {
          logger.info(
            `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Transaction ${requestPayload.transactionInfo.transactionId} ENDED on connector ${connectorId.toString()}`
          )
        }
        break
      case OCPP20TransactionEventEnumType.Started:
        if (connectorStatus != null) {
          connectorStatus.transactionStarted = true
          connectorStatus.transactionPending = false
          connectorStatus.transactionId ??= requestPayload.transactionInfo.transactionId
          connectorStatus.transactionIdTag ??= requestPayload.idToken?.idToken
          connectorStatus.transactionStart ??= new Date()
          connectorStatus.transactionEnergyActiveImportRegisterValue ??= 0
          const isIdTokenAccepted =
            payload.idTokenInfo == null ||
            payload.idTokenInfo.status === OCPP20AuthorizationStatusEnumType.Accepted
          if (isIdTokenAccepted) {
            connectorStatus.locked = true
          }
          if (connectorId != null && isIdTokenAccepted) {
            sendAndSetConnectorStatus(chargingStation, {
              connectorId,
              connectorStatus: ConnectorStatusEnum.Occupied,
            } as unknown as OCPP20StatusNotificationRequest).catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Error sending StatusNotification(Occupied):`,
                error
              )
            })
            const txUpdatedInterval = OCPP20ServiceUtils.getTxUpdatedInterval(chargingStation)
            OCPP20ServiceUtils.startPeriodicMeterValues(
              chargingStation,
              connectorId,
              txUpdatedInterval
            )
          }
          logger.info(
            `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Transaction ${requestPayload.transactionInfo.transactionId} STARTED on connector ${String(connectorId)}`
          )
        }
        break
    }
    if (payload.totalCost != null) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Total cost: ${payload.totalCost.toString()}`
      )
    }
    if (payload.chargingPriority != null) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Charging priority: ${payload.chargingPriority.toString()}`
      )
    }
    if (payload.idTokenInfo != null) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: IdToken info status: ${payload.idTokenInfo.status}`
      )
      // E05.FR.09/FR.10 + E06.FR.04: Deauthorize transaction when idToken is not accepted by CSMS
      if (payload.idTokenInfo.status !== OCPP20AuthorizationStatusEnumType.Accepted) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: IdToken authorization rejected with status '${payload.idTokenInfo.status}', de-authorizing transaction per E05.FR.09/E05.FR.10/E06.FR.04`
        )
        const txConnectorId = chargingStation.getConnectorIdByTransactionId(
          requestPayload.transactionInfo.transactionId
        )
        const txEvseId = chargingStation.getEvseIdByTransactionId(
          requestPayload.transactionInfo.transactionId
        )
        if (txConnectorId != null && txEvseId != null) {
          OCPP20ServiceUtils.requestDeauthorizeTransaction(
            chargingStation,
            txConnectorId,
            txEvseId
          ).catch((error: unknown) => {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Error de-authorizing transaction ${requestPayload.transactionInfo.transactionId} on connector ${txConnectorId.toString()}:`,
              error
            )
          })
        } else {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Could not find connector for transaction ${requestPayload.transactionInfo.transactionId}, cannot de-authorize`
          )
        }
      }
      // C10.FR.01/04/05: Update auth cache with idTokenInfo from response
      if (requestPayload.idToken != null) {
        const idTokenValue = requestPayload.idToken.idToken
        const idTokenInfo = payload.idTokenInfo
        const identifierType = mapOCPP20TokenType(requestPayload.idToken.type)
        OCPPAuthServiceFactory.getInstance(chargingStation)
          .then(authService => {
            authService.updateCacheEntry(idTokenValue, idTokenInfo, identifierType)
            return undefined
          })
          .catch((error: unknown) => {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Error updating auth cache:`,
              error
            )
          })
      }
    }
    if (payload.updatedPersonalMessage != null) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Updated personal message format: ${payload.updatedPersonalMessage.format}, content: ${payload.updatedPersonalMessage.content}`
      )
    }
  }
}
