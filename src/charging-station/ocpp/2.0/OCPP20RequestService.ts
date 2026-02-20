// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import { generateKeyPairSync } from 'node:crypto'

import type { ChargingStation } from '../../../charging-station/index.js'
import type { OCPPResponseService } from '../OCPPResponseService.js'

import { OCPPError } from '../../../exception/index.js'
import {
  type CertificateSigningUseEnumType,
  ErrorType,
  type JsonObject,
  type JsonType,
  OCPP20RequestCommand,
  type OCPP20SignCertificateRequest,
  type OCPP20SignCertificateResponse,
  OCPPVersion,
  type RequestParams,
} from '../../../types/index.js'
import { generateUUID, logger } from '../../../utils/index.js'
import { OCPPRequestService } from '../OCPPRequestService.js'
import { OCPP20Constants } from './OCPP20Constants.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'

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
      OCPP20ServiceUtils.createRequestPayloadOptions(moduleName, 'constructor'),
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
        const requestPayload = this.buildRequestPayload<RequestType>(
          chargingStation,
          commandName,
          commandParams
        )
        const messageId = generateUUID()
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Sending '${commandName}' request with message ID '${messageId}'`
        )
        // TODO: pre request actions hook
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

  /**
   * Request certificate signing from the CSMS.
   *
   * Generates a Certificate Signing Request (CSR) using the charging station's
   * certificate manager and sends it to the CSMS for signing. Supports both
   * ChargingStationCertificate and V2GCertificate types.
   *
   * IMPORTANT: This implementation generates a MOCK CSR for simulator testing purposes.
   * It is NOT a cryptographically valid PKCS#10 CSR and MUST NOT be used in production.
   * The generated CSR structure is simplified (JSON-based) for OCPP message testing only.
   * Real CSMS expecting valid PKCS#10 CSR will reject this format.
   *
   * @param chargingStation - The charging station requesting the certificate
   * @param certificateType - Optional certificate type (ChargingStationCertificate or V2GCertificate)
   * @returns Promise resolving to the CSMS response with Accepted or Rejected status
   * @throws {OCPPError} When certificate manager is unavailable or CSR generation fails
   */
  public async requestSignCertificate (
    chargingStation: ChargingStation,
    certificateType?: CertificateSigningUseEnumType
  ): Promise<OCPP20SignCertificateResponse> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestSignCertificate: Requesting certificate signing`
    )

    let csr: string
    try {
      const { publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
        publicKeyEncoding: { format: 'pem', type: 'spki' },
      })

      const configKey = chargingStation.ocppConfiguration?.configurationKey?.find(
        (key) => key.key === 'SecurityCtrlr.OrganizationName'
      )
      const orgName = configKey?.value ?? 'Unknown'
      const stationId = chargingStation.stationInfo?.chargingStationId ?? 'Unknown'
      const subject = `CN=${stationId},O=${orgName}`

      // Generate simplified mock CSR for simulator testing
      // WARNING: This is NOT a cryptographically valid PKCS#10 CSR
      // Structure: JSON with subject, publicKey, timestamp (NOT ASN.1 DER)
      const mockCsrData = {
        algorithm: 'RSA-SHA256',
        keySize: 2048,
        publicKey: publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, ''),
        subject,
        timestamp: new Date().toISOString(),
      }

      const csrBase64 = Buffer.from(JSON.stringify(mockCsrData)).toString('base64')
      csr = `-----BEGIN CERTIFICATE REQUEST-----\n${csrBase64}\n-----END CERTIFICATE REQUEST-----`
    } catch (error) {
      const errorMsg = `Failed to generate CSR: ${error instanceof Error ? error.message : 'Unknown error'}`
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.requestSignCertificate: ${errorMsg}`
      )
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        errorMsg,
        OCPP20RequestCommand.SIGN_CERTIFICATE
      )
    }

    // Build request payload
    const requestPayload: OCPP20SignCertificateRequest = {
      csr,
    }

    // Add certificate type if specified
    if (certificateType != null) {
      requestPayload.certificateType = certificateType
    }

    const messageId = generateUUID()
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestSignCertificate: Sending SignCertificate request with message ID '${messageId}'`
    )

    const response = (await this.sendMessage(
      chargingStation,
      messageId,
      requestPayload,
      OCPP20RequestCommand.SIGN_CERTIFICATE
    )) as OCPP20SignCertificateResponse

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestSignCertificate: Received response with status '${response.status}'`
    )

    return response
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
      case OCPP20RequestCommand.BOOT_NOTIFICATION:
        return commandParams as unknown as Request
      case OCPP20RequestCommand.HEARTBEAT:
        return OCPP20Constants.OCPP_RESPONSE_EMPTY as unknown as Request
      case OCPP20RequestCommand.NOTIFY_REPORT:
        return {
          ...commandParams,
        } as unknown as Request
      case OCPP20RequestCommand.STATUS_NOTIFICATION:
        return {
          timestamp: new Date(),
          ...commandParams,
        } as unknown as Request
      case OCPP20RequestCommand.TRANSACTION_EVENT:
        return {
          timestamp: new Date(),
          ...commandParams,
        } as unknown as Request
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
