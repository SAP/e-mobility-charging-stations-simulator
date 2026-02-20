import type { ValidateFunction } from 'ajv'

import { addConfigurationKey, type ChargingStation } from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  ChargingStationEvents,
  ErrorType,
  type JsonType,
  type OCPP20BootNotificationResponse,
  type OCPP20HeartbeatResponse,
  OCPP20IncomingRequestCommand,
  type OCPP20NotifyReportResponse,
  OCPP20OptionalVariableName,
  OCPP20RequestCommand,
  type OCPP20StatusNotificationResponse,
  OCPPVersion,
  RegistrationStatusEnumType,
  type ResponseHandler,
} from '../../../types/index.js'
import { isAsyncFunction, logger } from '../../../utils/index.js'
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
 * @see {@link validatePayload} Response payload validation method
 * @see {@link handleResponse} Response processing methods
 * @see {@link OCPP20VariableManager} Variable management integration
 */

export class OCPP20ResponseService extends OCPPResponseService {
  public incomingRequestResponsePayloadValidateFunctions: Map<
    OCPP20IncomingRequestCommand,
    ValidateFunction<JsonType>
  >

  protected payloadValidatorFunctions: Map<OCPP20RequestCommand, ValidateFunction<JsonType>>
  private readonly responseHandlers: Map<OCPP20RequestCommand, ResponseHandler>

  public constructor () {
    super(OCPPVersion.VERSION_201)
    this.responseHandlers = new Map<OCPP20RequestCommand, ResponseHandler>([
      [
        OCPP20RequestCommand.BOOT_NOTIFICATION,
        this.handleResponseBootNotification.bind(this) as ResponseHandler,
      ],
      [OCPP20RequestCommand.HEARTBEAT, this.handleResponseHeartbeat.bind(this) as ResponseHandler],
      [
        OCPP20RequestCommand.NOTIFY_REPORT,
        this.handleResponseNotifyReport.bind(this) as ResponseHandler,
      ],
      [
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        this.handleResponseStatusNotification.bind(this) as ResponseHandler,
      ],
    ])
    this.payloadValidatorFunctions = OCPP20ServiceUtils.createPayloadValidatorMap(
      OCPP20ServiceUtils.createResponsePayloadConfigs(),
      OCPP20ServiceUtils.createResponsePayloadOptions(moduleName, 'constructor'),
      this.ajv
    )
    this.incomingRequestResponsePayloadValidateFunctions =
      OCPP20ServiceUtils.createPayloadValidatorMap(
        OCPP20ServiceUtils.createIncomingRequestResponsePayloadConfigs(),
        OCPP20ServiceUtils.createIncomingRequestResponsePayloadOptions(moduleName, 'constructor'),
        this.ajvIncomingRequest
      )
    this.validatePayload = this.validatePayload.bind(this)
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async responseHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    payload: ResType,
    requestPayload: ReqType
  ): Promise<void> {
    if (
      chargingStation.inAcceptedState() ||
      ((chargingStation.inUnknownState() || chargingStation.inPendingState()) &&
        commandName === OCPP20RequestCommand.BOOT_NOTIFICATION) ||
      (chargingStation.stationInfo?.ocppStrictCompliance === false &&
        (chargingStation.inUnknownState() || chargingStation.inPendingState()))
    ) {
      if (
        this.responseHandlers.has(commandName) &&
        OCPP20ServiceUtils.isRequestCommandSupported(chargingStation, commandName)
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
        )} while the charging station is not registered on the CSMS`,
        commandName,
        payload
      )
    }
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

  private handleResponseHeartbeat (
    chargingStation: ChargingStation,
    payload: OCPP20HeartbeatResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseHeartbeat: Heartbeat response received at ${payload.currentTime.toISOString()}`
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

  private handleResponseStatusNotification (
    chargingStation: ChargingStation,
    payload: OCPP20StatusNotificationResponse
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleResponseStatusNotification: StatusNotification response received successfully`
    )
  }

  /**
   * Validates incoming OCPP 2.0 response payload against JSON schema
   * @param chargingStation - The charging station instance receiving the response
   * @param commandName - OCPP 2.0 command name to validate against
   * @param payload - JSON response payload to validate
   * @returns True if payload validation succeeds, false otherwise
   */
  private validatePayload (
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
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
