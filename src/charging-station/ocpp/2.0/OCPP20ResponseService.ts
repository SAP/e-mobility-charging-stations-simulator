import type { ValidateFunction } from 'ajv'

import type { OCPP20IncomingRequestCommand } from '../../../types/index.js'

import { addConfigurationKey, type ChargingStation } from '../../../charging-station/index.js'
import {
  ChargingStationEvents,
  type JsonType,
  type OCPP20BootNotificationResponse,
  type OCPP20FirmwareStatusNotificationResponse,
  type OCPP20HeartbeatResponse,
  type OCPP20LogStatusNotificationResponse,
  type OCPP20MeterValuesResponse,
  type OCPP20NotifyCustomerInformationResponse,
  type OCPP20NotifyReportResponse,
  OCPP20OptionalVariableName,
  OCPP20RequestCommand,
  type OCPP20SecurityEventNotificationResponse,
  type OCPP20StatusNotificationResponse,
  type OCPP20TransactionEventRequest,
  type OCPP20TransactionEventResponse,
  OCPPVersion,
  RegistrationStatusEnumType,
  type RequestCommand,
  type ResponseHandler,
} from '../../../types/index.js'
import { OCPP20AuthorizationStatusEnumType } from '../../../types/ocpp/2.0/Transaction.js'
import { logger } from '../../../utils/index.js'
import { OCPPResponseService } from '../OCPPResponseService.js'
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

  protected payloadValidatorFunctions: Map<OCPP20RequestCommand, ValidateFunction<JsonType>>

  protected readonly responseHandlers: Map<RequestCommand, ResponseHandler>

  public constructor () {
    super(OCPPVersion.VERSION_201)
    this.responseHandlers = new Map<RequestCommand, ResponseHandler>([
      [
        OCPP20RequestCommand.BOOT_NOTIFICATION,
        this.handleResponseBootNotification.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
        this.handleResponseFirmwareStatusNotification.bind(this) as ResponseHandler,
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
          OCPP20OptionalVariableName.HeartbeatInterval,
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

  private handleResponseFirmwareStatusNotification (
    chargingStation: ChargingStation,
    payload: OCPP20FirmwareStatusNotificationResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseFirmwareStatusNotification: FirmwareStatusNotification response received successfully`
    )
  }

  private handleResponseHeartbeat (
    chargingStation: ChargingStation,
    payload: OCPP20HeartbeatResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseHeartbeat: Heartbeat response received at ${payload.currentTime.toISOString()}`
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
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: TransactionEvent response received`
    )
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
      // D01/D05: Stop transaction when idToken authorization is rejected by CSMS
      const rejectedStatuses = new Set<OCPP20AuthorizationStatusEnumType>([
        OCPP20AuthorizationStatusEnumType.Blocked,
        OCPP20AuthorizationStatusEnumType.Expired,
        OCPP20AuthorizationStatusEnumType.Invalid,
        OCPP20AuthorizationStatusEnumType.NoCredit,
      ])
      if (rejectedStatuses.has(payload.idTokenInfo.status)) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: IdToken authorization rejected with status '${payload.idTokenInfo.status}', stopping active transaction per OCPP 2.0.1 spec (D01/D05)`
        )
        // Find the specific connector for this transaction
        const connectorId = chargingStation.getConnectorIdByTransactionId(
          requestPayload.transactionInfo.transactionId
        )
        const evseId = chargingStation.getEvseIdByTransactionId(
          requestPayload.transactionInfo.transactionId
        )
        if (connectorId != null && evseId != null) {
          logger.info(
            `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Stopping transaction ${requestPayload.transactionInfo.transactionId} on EVSE ${evseId.toString()}, connector ${connectorId.toString()} due to rejected idToken`
          )
          OCPP20ServiceUtils.requestStopTransaction(chargingStation, connectorId, evseId).catch(
            (error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Error stopping transaction ${requestPayload.transactionInfo.transactionId} on connector ${connectorId.toString()}:`,
                error
              )
            }
          )
        } else {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Could not find connector for transaction ${requestPayload.transactionInfo.transactionId}, cannot stop transaction`
          )
        }
      }
    }
    if (payload.updatedPersonalMessage != null) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleResponseTransactionEvent: Updated personal message format: ${payload.updatedPersonalMessage.format}, content: ${payload.updatedPersonalMessage.content}`
      )
    }
  }
}
