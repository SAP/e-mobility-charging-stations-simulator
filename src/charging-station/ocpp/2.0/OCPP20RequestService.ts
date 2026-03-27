import type { ValidateFunction } from 'ajv'

import type { ChargingStation } from '../../../charging-station/index.js'
import type { CertificateSigningUseEnumType } from '../../../types/index.js'
import type { OCPPResponseService } from '../OCPPResponseService.js'

import { OCPPError } from '../../../exception/index.js'
import {
  ErrorType,
  type JsonObject,
  type JsonType,
  OCPP20RequestCommand,
  type OCPP20SignCertificateRequest,
  type OCPP20StatusNotificationRequest,
  type OCPP20TransactionEventOptions,
  OCPPVersion,
  type RequestParams,
} from '../../../types/index.js'
import { generateUUID, logger } from '../../../utils/index.js'
import { OCPPRequestService } from '../OCPPRequestService.js'
import { buildStatusNotificationRequest } from '../OCPPServiceUtils.js'
import { generatePkcs10Csr } from './Asn1DerUtils.js'
import { OCPP20Constants } from './OCPP20Constants.js'
import { buildTransactionEvent, OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'

const moduleName = 'OCPP20RequestService'

/**
 * OCPP 2.0.1 Request Service
 *
 * Handles outgoing OCPP 2.0.1 requests from the charging station to the charging station management system (CSMS).
 * This service is responsible for:
 * - Building and validating request payloads according to OCPP 2.0.1 specification
 * - Managing request-response cycles with enhanced error handling and status reporting
 * - Ensuring message integrity through comprehensive JSON schema validation
 * - Providing type-safe interfaces for all supported OCPP 2.0.1 commands
 * - Supporting advanced OCPP 2.0.1 features like variables, components, and enhanced transaction management
 *
 * Key architectural improvements over OCPP 1.6:
 * - Enhanced variable and component model support
 * - Improved transaction lifecycle management with UUIDs
 * - Advanced authorization capabilities with IdTokens
 * - Comprehensive EVSE and connector state management
 * - Extended security and certificate handling
 * OCPPRequestService - Base class providing common OCPP functionality
 */
export class OCPP20RequestService extends OCPPRequestService {
  protected payloadValidatorFunctions: Map<OCPP20RequestCommand, ValidateFunction<JsonType>>

  /**
   * Constructs an OCPP 2.0.1 Request Service instance
   *
   * Initializes the service with OCPP 2.0.1-specific configurations including:
   * - JSON schema validators for all supported OCPP 2.0.1 request commands
   * - Enhanced payload validation with stricter type checking
   * - Response service integration for comprehensive response handling
   * - AJV validation setup optimized for OCPP 2.0.1's expanded message set
   * - Support for advanced OCPP 2.0.1 features like variable management and enhanced security
   * @param ocppResponseService - The response service instance for handling OCPP 2.0.1 responses
   */
  public constructor (ocppResponseService: OCPPResponseService) {
    super(OCPPVersion.VERSION_201, ocppResponseService)
    this.payloadValidatorFunctions = OCPP20ServiceUtils.createPayloadValidatorMap(
      OCPP20ServiceUtils.createRequestPayloadConfigs(),
      OCPP20ServiceUtils.createPayloadOptions(moduleName, 'constructor'),
      this.ajv
    )
    this.buildRequestPayload = this.buildRequestPayload.bind(this)
  }

  /**
   * Handles OCPP 2.0.1 request processing with enhanced validation and comprehensive error handling
   *
   * This method serves as the main entry point for all outgoing OCPP 2.0.1 requests to the CSMS.
   * It performs advanced operations including:
   * - Validates that the requested command is supported by the charging station configuration
   * - Builds and validates request payloads according to strict OCPP 2.0.1 schemas
   * - Handles OCPP 2.0.1-specific features like component/variable management and enhanced security
   * - Sends requests with comprehensive error handling and detailed logging
   * - Processes responses with full support for OCPP 2.0.1's enhanced status reporting
   * - Manages advanced OCPP 2.0.1 concepts like EVSE management and transaction UUIDs
   *
   * The method ensures full compliance with OCPP 2.0.1 specification while providing
   * enhanced type safety and detailed error reporting for debugging and monitoring.
   * @template RequestType - The expected type of the request parameters
   * @template ResponseType - The expected type of the response from the CSMS
   * @param chargingStation - The charging station instance making the request
   * @param commandName - The OCPP 2.0.1 command to execute (e.g., 'Authorize', 'TransactionEvent')
   * @param commandParams - Optional parameters specific to the command being executed
   * @param params - Optional request parameters for controlling request behavior
   * @returns Promise resolving to the typed response from the CSMS
   * @throws {OCPPError} When the command is not supported, validation fails, or CSMS returns an error
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async requestHandler<RequestType extends JsonType, ResponseType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: RequestType,
    params?: RequestParams
  ): Promise<ResponseType> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Processing '${commandName}' request`
    )
    if (OCPP20ServiceUtils.isRequestCommandSupported(chargingStation, commandName)) {
      try {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Building request payload for '${commandName}'`
        )
        const requestPayload =
          params?.rawPayload === true
            ? (commandParams as RequestType)
            : this.buildRequestPayload<RequestType>(chargingStation, commandName, commandParams)
        const messageId = generateUUID()
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Sending '${commandName}' request with message ID '${messageId}'`
        )
        const response = (await this.sendMessage(
          chargingStation,
          messageId,
          requestPayload,
          commandName,
          params
        )) as ResponseType
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: '${commandName}' request completed successfully`
        )
        return response
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Error processing '${commandName}' request:`,
          error
        )
        throw error
      }
    }
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    const errorMsg = `Unsupported OCPP command ${commandName}`
    logger.error(`${chargingStation.logPrefix()} ${moduleName}.requestHandler: ${errorMsg}`)
    throw new OCPPError(ErrorType.NOT_SUPPORTED, errorMsg, commandName, commandParams)
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  private buildRequestPayload<Request extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: JsonType
  ): Request {
    commandParams = commandParams as JsonObject
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${commandName} payload`
    )
    switch (commandName) {
      case OCPP20RequestCommand.AUTHORIZE:
      case OCPP20RequestCommand.BOOT_NOTIFICATION:
      case OCPP20RequestCommand.DATA_TRANSFER:
      case OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION:
      case OCPP20RequestCommand.GET_15118_EV_CERTIFICATE:
      case OCPP20RequestCommand.GET_CERTIFICATE_STATUS:
      case OCPP20RequestCommand.LOG_STATUS_NOTIFICATION:
      case OCPP20RequestCommand.METER_VALUES:
      case OCPP20RequestCommand.NOTIFY_CUSTOMER_INFORMATION:
      case OCPP20RequestCommand.NOTIFY_REPORT:
      case OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION:
        return commandParams as unknown as Request
      case OCPP20RequestCommand.HEARTBEAT:
        return OCPP20Constants.OCPP_RESPONSE_EMPTY as unknown as Request
      case OCPP20RequestCommand.SIGN_CERTIFICATE: {
        let csr: string
        try {
          const configKey = chargingStation.ocppConfiguration?.configurationKey?.find(
            key => key.key === 'SecurityCtrlr.OrganizationName'
          )
          const orgName = configKey?.value ?? 'Unknown'
          const stationId = chargingStation.stationInfo?.chargingStationId ?? 'Unknown'

          csr = generatePkcs10Csr(stationId, orgName)
        } catch (error) {
          const errorMsg = `Failed to generate CSR: ${error instanceof Error ? error.message : 'Unknown error'}`
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: ${errorMsg}`
          )
          throw new OCPPError(
            ErrorType.INTERNAL_ERROR,
            errorMsg,
            OCPP20RequestCommand.SIGN_CERTIFICATE
          )
        }

        const certificateType = (commandParams as JsonObject | undefined)?.certificateType as
          | CertificateSigningUseEnumType
          | undefined

        const requestPayload: OCPP20SignCertificateRequest = {
          csr,
          ...(certificateType != null && { certificateType }),
        }

        return requestPayload as unknown as Request
      }
      case OCPP20RequestCommand.STATUS_NOTIFICATION:
        return buildStatusNotificationRequest(
          chargingStation,
          commandParams as unknown as OCPP20StatusNotificationRequest
        ) as unknown as Request
      case OCPP20RequestCommand.TRANSACTION_EVENT:
        return buildTransactionEvent(
          chargingStation,
          commandParams as unknown as OCPP20TransactionEventOptions
        ) as unknown as Request
      default: {
        // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
        const errorMsg = `Unsupported OCPP command ${commandName as string} for payload building`
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: ${errorMsg}`
        )
        throw new OCPPError(ErrorType.NOT_SUPPORTED, errorMsg, commandName, commandParams)
      }
    }
  }
}
