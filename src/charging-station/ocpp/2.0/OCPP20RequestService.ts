import type { ValidateFunction } from 'ajv'

import { createSign, generateKeyPairSync } from 'node:crypto'

import type { ChargingStation } from '../../../charging-station/index.js'
import type { OCPPResponseService } from '../OCPPResponseService.js'

import { OCPPError } from '../../../exception/index.js'
import {
  type CertificateActionEnumType,
  type CertificateSigningUseEnumType,
  ErrorType,
  type FirmwareStatusEnumType,
  type JsonObject,
  type JsonType,
  type OCPP20FirmwareStatusNotificationRequest,
  type OCPP20FirmwareStatusNotificationResponse,
  type OCPP20Get15118EVCertificateRequest,
  type OCPP20Get15118EVCertificateResponse,
  type OCPP20GetCertificateStatusRequest,
  type OCPP20GetCertificateStatusResponse,
  type OCPP20LogStatusNotificationRequest,
  type OCPP20LogStatusNotificationResponse,
  type OCPP20MeterValue,
  type OCPP20MeterValuesRequest,
  type OCPP20MeterValuesResponse,
  type OCPP20NotifyCustomerInformationRequest,
  type OCPP20NotifyCustomerInformationResponse,
  OCPP20RequestCommand,
  type OCPP20SecurityEventNotificationRequest,
  type OCPP20SecurityEventNotificationResponse,
  type OCPP20SignCertificateRequest,
  type OCPP20SignCertificateResponse,
  OCPPVersion,
  type OCSPRequestDataType,
  type RequestParams,
  type UploadLogStatusEnumType,
} from '../../../types/index.js'
import { generateUUID, logger } from '../../../utils/index.js'
import { OCPPRequestService } from '../OCPPRequestService.js'
import { OCPP20Constants } from './OCPP20Constants.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'

const moduleName = 'OCPP20RequestService'

// ASN.1 DER encoding helpers for PKCS#10 CSR generation (RFC 2986)

/** Encode DER length in short or long form. */
function derLength (length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length])
  }
  if (length < 0x100) {
    return Buffer.from([0x81, length])
  }
  return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff])
}

/** Wrap content in a DER SEQUENCE (tag 0x30). */
function derSequence (...items: Buffer[]): Buffer {
  const content = Buffer.concat(items)
  return Buffer.concat([Buffer.from([0x30]), derLength(content.length), content])
}

/** Wrap content in a DER SET (tag 0x31). */
function derSet (...items: Buffer[]): Buffer {
  const content = Buffer.concat(items)
  return Buffer.concat([Buffer.from([0x31]), derLength(content.length), content])
}

/** Encode a small non-negative integer in DER. */
function derInteger (value: number): Buffer {
  return Buffer.from([0x02, 0x01, value])
}

/** Encode a DER BIT STRING with zero unused bits. */
function derBitString (data: Buffer): Buffer {
  const content = Buffer.concat([Buffer.from([0x00]), data])
  return Buffer.concat([Buffer.from([0x03]), derLength(content.length), content])
}

/** Encode a DER OBJECT IDENTIFIER from pre-encoded bytes. */
function derOid (oidBytes: number[]): Buffer {
  return Buffer.concat([Buffer.from([0x06, oidBytes.length]), Buffer.from(oidBytes)])
}

/** Encode a DER UTF8String. */
function derUtf8String (str: string): Buffer {
  const strBuf = Buffer.from(str, 'utf-8')
  return Buffer.concat([Buffer.from([0x0c]), derLength(strBuf.length), strBuf])
}

/** Encode a DER context-specific constructed tag [tagNumber]. */
function derContextTag (tagNumber: number, content: Buffer): Buffer {
  const tag = 0xa0 | tagNumber
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content])
}

// Well-known OID encodings
// 1.2.840.113549.1.1.11 — sha256WithRSAEncryption
const OID_SHA256_WITH_RSA = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]
// 2.5.4.3 — commonName
const OID_COMMON_NAME = [0x55, 0x04, 0x03]
// 2.5.4.10 — organizationName
const OID_ORGANIZATION = [0x55, 0x04, 0x0a]

/**
 * Build an X.501 Name (Subject DN) with CN and O attributes.
 * Structure: SEQUENCE { SET { SEQUENCE { OID, UTF8String } }, ... }
 */
function buildSubjectDn (cn: string, org: string): Buffer {
  const cnRdn = derSet(derSequence(derOid(OID_COMMON_NAME), derUtf8String(cn)))
  const orgRdn = derSet(derSequence(derOid(OID_ORGANIZATION), derUtf8String(org)))
  return derSequence(cnRdn, orgRdn)
}

/**
 * Generate a PKCS#10 Certificate Signing Request (RFC 2986) using node:crypto.
 *
 * Builds a proper ASN.1 DER-encoded CSR with:
 * - RSA 2048-bit key pair
 * - SHA-256 with RSA signature
 * - Subject DN containing CN={stationId} and O={orgName}
 * @param cn - Common Name (charging station identifier)
 * @param org - Organization name
 * @returns PEM-encoded CSR string with BEGIN/END CERTIFICATE REQUEST markers
 */
function generatePkcs10Csr (cn: string, org: string): string {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' })

  // CertificationRequestInfo ::= SEQUENCE { version, subject, subjectPKInfo, attributes }
  const version = derInteger(0) // v1(0)
  const subject = buildSubjectDn(cn, org)
  const attributes = derContextTag(0, Buffer.alloc(0)) // empty attributes [0] IMPLICIT
  const certificationRequestInfo = derSequence(version, subject, publicKeyDer, attributes)

  // Sign the CertificationRequestInfo with SHA-256
  const signer = createSign('SHA256')
  signer.update(certificationRequestInfo)
  const signature = signer.sign(privateKey)

  // AlgorithmIdentifier ::= SEQUENCE { algorithm OID, parameters NULL }
  const signatureAlgorithm = derSequence(
    derOid(OID_SHA256_WITH_RSA),
    Buffer.from([0x05, 0x00]) // NULL
  )

  // CertificationRequest ::= SEQUENCE { info, algorithm, signature }
  const csr = derSequence(certificationRequestInfo, signatureAlgorithm, derBitString(signature))

  // PEM-encode with 64-character line wrapping
  const base64 = csr.toString('base64')
  const lines = base64.match(/.{1,64}/g) ?? []
  return `-----BEGIN CERTIFICATE REQUEST-----\n${lines.join('\n')}\n-----END CERTIFICATE REQUEST-----`
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
    super(OCPPVersion.VERSION_201, ocppResponseService)
    this.payloadValidatorFunctions = OCPP20ServiceUtils.createPayloadValidatorMap(
      OCPP20ServiceUtils.createRequestPayloadConfigs(),
      OCPP20ServiceUtils.createPayloadOptions(moduleName, 'constructor'),
      this.ajv
    )
    this.buildRequestPayload = this.buildRequestPayload.bind(this)
  }

  /**
   * Send a FirmwareStatusNotification to the CSMS.
   *
   * Notifies the CSMS about the progress of a firmware update on the charging station.
   * Per OCPP 2.0.1 use case J01, the CS sends firmware status updates during the
   * download, verification, and installation phases of a firmware update.
   * The response is an empty object — the CSMS acknowledges receipt without data.
   * @param chargingStation - The charging station reporting the firmware status
   * @param status - Current firmware update status (e.g., Downloading, Installed)
   * @param requestId - The request ID from the original UpdateFirmware request
   * @returns Promise resolving to the empty CSMS acknowledgement response
   */
  public async requestFirmwareStatusNotification (
    chargingStation: ChargingStation,
    status: FirmwareStatusEnumType,
    requestId?: number
  ): Promise<OCPP20FirmwareStatusNotificationResponse> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestFirmwareStatusNotification: Sending FirmwareStatusNotification with status '${status}'`
    )

    const requestPayload: OCPP20FirmwareStatusNotificationRequest = {
      status,
      ...(requestId !== undefined && { requestId }),
    }

    const messageId = generateUUID()
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestFirmwareStatusNotification: Sending FirmwareStatusNotification request with message ID '${messageId}'`
    )

    const response = (await this.sendMessage(
      chargingStation,
      messageId,
      requestPayload,
      OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION
    )) as OCPP20FirmwareStatusNotificationResponse

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestFirmwareStatusNotification: Received response`
    )

    return response
  }

  /**
   * Request an ISO 15118 EV certificate from the CSMS.
   *
   * Forwards an EXI-encoded certificate request from the EV to the CSMS.
   * The EXI payload is passed through unmodified (base64 string) without
   * any decoding or validation - the CSMS is responsible for processing it.
   *
   * This is used during ISO 15118 Plug & Charge flows when the EV requests
   * certificate installation or update from the Mobility Operator (MO).
   * @param chargingStation - The charging station forwarding the request
   * @param iso15118SchemaVersion - Schema version identifier (e.g., 'urn:iso:15118:2:2013:MsgDef')
   * @param action - The certificate action type (Install or Update)
   * @param exiRequest - Base64-encoded EXI request from the EV (passed through unchanged)
   * @returns Promise resolving to the CSMS response with EXI-encoded certificate data
   */
  public async requestGet15118EVCertificate (
    chargingStation: ChargingStation,
    iso15118SchemaVersion: string,
    action: CertificateActionEnumType,
    exiRequest: string
  ): Promise<OCPP20Get15118EVCertificateResponse> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestGet15118EVCertificate: Requesting ISO 15118 EV certificate`
    )

    const requestPayload: OCPP20Get15118EVCertificateRequest = {
      action,
      exiRequest,
      iso15118SchemaVersion,
    }

    const messageId = generateUUID()
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestGet15118EVCertificate: Sending Get15118EVCertificate request with message ID '${messageId}'`
    )

    const response = (await this.sendMessage(
      chargingStation,
      messageId,
      requestPayload,
      OCPP20RequestCommand.GET_15118_EV_CERTIFICATE
    )) as OCPP20Get15118EVCertificateResponse

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestGet15118EVCertificate: Received response with status '${response.status}'`
    )

    return response
  }

  /**
   * Request OCSP certificate status from the CSMS.
   *
   * Sends an OCSP (Online Certificate Status Protocol) request to the CSMS
   * to check the revocation status of a certificate. The CSMS will return
   * the OCSP response data which can be used to verify certificate validity.
   *
   * This is used to validate certificates during ISO 15118 communication
   * before accepting them for charging authorization.
   *
   * Note: This is a stub implementation for simulator testing. No real OCSP
   * network calls are made - the CSMS provides the response.
   * @param chargingStation - The charging station requesting the status
   * @param ocspRequestData - OCSP request data including certificate hash and responder URL
   * @returns Promise resolving to the CSMS response with OCSP result
   */
  public async requestGetCertificateStatus (
    chargingStation: ChargingStation,
    ocspRequestData: OCSPRequestDataType
  ): Promise<OCPP20GetCertificateStatusResponse> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestGetCertificateStatus: Requesting certificate status`
    )

    const requestPayload: OCPP20GetCertificateStatusRequest = {
      ocspRequestData,
    }

    const messageId = generateUUID()
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestGetCertificateStatus: Sending GetCertificateStatus request with message ID '${messageId}'`
    )

    const response = (await this.sendMessage(
      chargingStation,
      messageId,
      requestPayload,
      OCPP20RequestCommand.GET_CERTIFICATE_STATUS
    )) as OCPP20GetCertificateStatusResponse

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestGetCertificateStatus: Received response with status '${response.status}'`
    )

    return response
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
   * Send a LogStatusNotification to the CSMS.
   *
   * Notifies the CSMS about the progress of a log upload on the charging station.
   * Per OCPP 2.0.1 use case M04, the CS sends log upload status updates during
   * the upload process. The response is an empty object — the CSMS acknowledges
   * receipt without data.
   * @param chargingStation - The charging station reporting the log upload status
   * @param status - Current log upload status (e.g., Uploading, Uploaded)
   * @param requestId - The request ID from the original GetLog request
   * @returns Promise resolving to the empty CSMS acknowledgement response
   */
  public async requestLogStatusNotification (
    chargingStation: ChargingStation,
    status: UploadLogStatusEnumType,
    requestId?: number
  ): Promise<OCPP20LogStatusNotificationResponse> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestLogStatusNotification: Sending LogStatusNotification with status '${status}'`
    )

    const requestPayload: OCPP20LogStatusNotificationRequest = {
      status,
      ...(requestId !== undefined && { requestId }),
    }

    const messageId = generateUUID()
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestLogStatusNotification: Sending LogStatusNotification request with message ID '${messageId}'`
    )

    const response = (await this.sendMessage(
      chargingStation,
      messageId,
      requestPayload,
      OCPP20RequestCommand.LOG_STATUS_NOTIFICATION
    )) as OCPP20LogStatusNotificationResponse

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestLogStatusNotification: Received response`
    )

    return response
  }

  /**
   * Send MeterValues to the CSMS.
   *
   * Reports meter values for a specific EVSE to the CSMS outside of a transaction context.
   * Per OCPP 2.0.1, the charging station may send sampled meter values (e.g., energy, power,
   * voltage, current) at configured intervals or upon trigger. Each meter value contains
   * one or more sampled values all taken at the same point in time.
   * The response is an empty object — the CSMS acknowledges receipt without data.
   * @param chargingStation - The charging station reporting the meter values
   * @param evseId - The EVSE identifier (0 for main power meter, >0 for specific EVSE)
   * @param meterValue - Array of meter value objects, each containing timestamped sampled values
   * @returns Promise resolving to the empty CSMS acknowledgement response
   */
  public async requestMeterValues (
    chargingStation: ChargingStation,
    evseId: number,
    meterValue: OCPP20MeterValue[]
  ): Promise<OCPP20MeterValuesResponse> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestMeterValues: Sending MeterValues for EVSE ${evseId.toString()}`
    )

    const requestPayload: OCPP20MeterValuesRequest = {
      evseId,
      meterValue,
    }

    const messageId = generateUUID()
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestMeterValues: Sending MeterValues request with message ID '${messageId}'`
    )

    const response = (await this.sendMessage(
      chargingStation,
      messageId,
      requestPayload,
      OCPP20RequestCommand.METER_VALUES
    )) as OCPP20MeterValuesResponse

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestMeterValues: Received response`
    )

    return response
  }

  /**
   * Send NotifyCustomerInformation to the CSMS.
   *
   * Notifies the CSMS about customer information availability.
   * For the simulator, this sends empty customer data as no real customer
   * information is stored (GDPR compliance).
   * @param chargingStation - The charging station sending the notification
   * @param requestId - The request ID from the original CustomerInformation request
   * @param data - Customer information data (empty string for simulator)
   * @param seqNo - Sequence number for the notification
   * @param generatedAt - Timestamp when the data was generated
   * @param tbc - To be continued flag (false for simulator)
   * @returns Promise resolving when the notification is sent
   */
  public async requestNotifyCustomerInformation (
    chargingStation: ChargingStation,
    requestId: number,
    data: string,
    seqNo: number,
    generatedAt: Date,
    tbc: boolean
  ): Promise<OCPP20NotifyCustomerInformationResponse> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestNotifyCustomerInformation: Sending NotifyCustomerInformation`
    )

    const requestPayload: OCPP20NotifyCustomerInformationRequest = {
      data,
      generatedAt,
      requestId,
      seqNo,
      tbc,
    }

    const messageId = generateUUID()
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestNotifyCustomerInformation: Sending NotifyCustomerInformation request with message ID '${messageId}'`
    )

    const response = (await this.sendMessage(
      chargingStation,
      messageId,
      requestPayload,
      OCPP20RequestCommand.NOTIFY_CUSTOMER_INFORMATION
    )) as OCPP20NotifyCustomerInformationResponse

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestNotifyCustomerInformation: Received response`
    )

    return response
  }

  /**
   * Send a SecurityEventNotification to the CSMS.
   *
   * Notifies the CSMS about a security event that occurred at the charging station.
   * Per OCPP 2.0.1 use case A04, the CS sends security events (e.g., tamper detection,
   * firmware validation failure, invalid certificate) to keep the CSMS informed.
   * The response is an empty object — the CSMS acknowledges receipt without data.
   * @param chargingStation - The charging station reporting the security event
   * @param type - Type of the security event (from the Security events list, max 50 chars)
   * @param timestamp - Date and time at which the event occurred
   * @param techInfo - Optional additional technical information about the event (max 255 chars)
   * @returns Promise resolving to the empty CSMS acknowledgement response
   */
  public async requestSecurityEventNotification (
    chargingStation: ChargingStation,
    type: string,
    timestamp: Date,
    techInfo?: string
  ): Promise<OCPP20SecurityEventNotificationResponse> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestSecurityEventNotification: Sending SecurityEventNotification`
    )

    const requestPayload: OCPP20SecurityEventNotificationRequest = {
      timestamp,
      type,
      ...(techInfo !== undefined && { techInfo }),
    }

    const messageId = generateUUID()
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestSecurityEventNotification: Sending SecurityEventNotification request with message ID '${messageId}'`
    )

    const response = (await this.sendMessage(
      chargingStation,
      messageId,
      requestPayload,
      OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION
    )) as OCPP20SecurityEventNotificationResponse

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestSecurityEventNotification: Received response`
    )

    return response
  }

  /**
   * Request certificate signing from the CSMS.
   *
   * Generates a PKCS#10 Certificate Signing Request (RFC 2986) with a real RSA 2048-bit
   * key pair and SHA-256 signature, then sends it to the CSMS for signing per A02.FR.02.
   * Supports both ChargingStationCertificate and V2GCertificate types.
   * @param chargingStation - The charging station requesting the certificate
   * @param certificateType - Optional certificate type (ChargingStationCertificate or V2GCertificate)
   * @returns Promise resolving to the CSMS response with Accepted or Rejected status
   * @throws {OCPPError} When CSR generation fails
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
      const configKey = chargingStation.ocppConfiguration?.configurationKey?.find(
        key => key.key === 'SecurityCtrlr.OrganizationName'
      )
      const orgName = configKey?.value ?? 'Unknown'
      const stationId = chargingStation.stationInfo?.chargingStationId ?? 'Unknown'

      csr = generatePkcs10Csr(stationId, orgName)
    } catch (error) {
      const errorMsg = `Failed to generate CSR: ${error instanceof Error ? error.message : 'Unknown error'}`
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.requestSignCertificate: ${errorMsg}`
      )
      throw new OCPPError(ErrorType.INTERNAL_ERROR, errorMsg, OCPP20RequestCommand.SIGN_CERTIFICATE)
    }

    const requestPayload: OCPP20SignCertificateRequest = {
      csr,
    }

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
      case OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION:
      case OCPP20RequestCommand.GET_15118_EV_CERTIFICATE:
      case OCPP20RequestCommand.GET_CERTIFICATE_STATUS:
      case OCPP20RequestCommand.LOG_STATUS_NOTIFICATION:
      case OCPP20RequestCommand.METER_VALUES:
      case OCPP20RequestCommand.NOTIFY_CUSTOMER_INFORMATION:
      case OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION:
      case OCPP20RequestCommand.SIGN_CERTIFICATE:
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
