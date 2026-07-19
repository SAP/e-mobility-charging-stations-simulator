import type { ValidateFunction } from 'ajv'

import type { ChargingStation } from '../../../charging-station/index.js'
import type { OCPPResponseService } from '../OCPPResponseService.js'

import { getConfigurationKey } from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  type CertificateSigningUseEnumType,
  ErrorType,
  type JsonObject,
  type JsonType,
  OCPP20ComponentName,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  type OCPP20SignCertificateRequest,
  type OCPP20TransactionEventOptions,
  OCPPVersion,
  type StatusNotificationOptions,
} from '../../../types/index.js'
import { getErrorMessage, logger } from '../../../utils/index.js'
import { OCPPRequestService } from '../OCPPRequestService.js'
import { createPayloadValidatorMap } from '../OCPPServiceUtils.js'
import { generatePkcs10Csr } from './Asn1DerUtils.js'
import { OCPP20Constants } from './OCPP20Constants.js'
import { buildTransactionEvent, OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'

const moduleName = 'OCPP20RequestService'

interface SignCertificateOptions extends JsonObject {
  certificateType?: CertificateSigningUseEnumType
}

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
    super(OCPPVersion.VERSION_201, ocppResponseService, moduleName)
    this.payloadValidatorFunctions = createPayloadValidatorMap(
      OCPP20ServiceUtils.createRequestPayloadConfigs(),
      OCPP20ServiceUtils.createPayloadOptions(moduleName, 'constructor'),
      this.ajv
    )
  }

  protected buildRequestPayload (
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: JsonType
  ): JsonType {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building '${commandName}' payload`
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
        return commandParams ?? OCPP20Constants.OCPP_REQUEST_EMPTY
      case OCPP20RequestCommand.HEARTBEAT:
        return OCPP20Constants.OCPP_REQUEST_EMPTY
      case OCPP20RequestCommand.SIGN_CERTIFICATE: {
        let csr: string
        try {
          const configKey = getConfigurationKey(
            chargingStation,
            `${OCPP20ComponentName.SecurityCtrlr}.${OCPP20RequiredVariableName.OrganizationName}`
          )
          const orgName = configKey?.value ?? 'Unknown'
          const stationId = chargingStation.stationInfo?.chargingStationId ?? 'Unknown'

          csr = generatePkcs10Csr(stationId, orgName)
        } catch (error) {
          const errorMsg = `Failed to generate CSR: ${getErrorMessage(error)}`
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: ${errorMsg}`
          )
          throw new OCPPError(
            ErrorType.INTERNAL_ERROR,
            errorMsg,
            OCPP20RequestCommand.SIGN_CERTIFICATE
          )
        }

        const certificateType = (commandParams as SignCertificateOptions | undefined)
          ?.certificateType

        const requestPayload: OCPP20SignCertificateRequest = {
          csr,
          ...(certificateType != null && { certificateType }),
        }

        return requestPayload
      }
      case OCPP20RequestCommand.STATUS_NOTIFICATION:
        return OCPP20ServiceUtils.buildStatusNotificationRequest(
          chargingStation,
          commandParams as StatusNotificationOptions
        )
      case OCPP20RequestCommand.TRANSACTION_EVENT:
        return buildTransactionEvent(
          chargingStation,
          commandParams as OCPP20TransactionEventOptions
        )
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
