// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 SAP SE

import type { ChargingStation } from '../../../ChargingStation.js'
import type { AuthStrategy, OCPPAuthAdapter } from '../interfaces/OCPPAuthService.js'
import type {
  AuthConfiguration,
  AuthorizationResult,
  AuthRequest,
  UnifiedIdentifier,
} from '../types/AuthTypes.js'

import { OCPPVersion } from '../../../../types/index.js'
import { isNotEmptyString } from '../../../../utils/index.js'
import { logger } from '../../../../utils/Logger.js'
import { AuthenticationMethod, AuthorizationStatus, IdentifierType } from '../types/AuthTypes.js'

/**
 * Certificate-based authentication strategy for OCPP 2.0+
 *
 * This strategy handles PKI-based authentication using X.509 certificates.
 * It's primarily designed for OCPP 2.0 where certificate-based authentication
 * is supported and can provide higher security than traditional ID token auth.
 *
 * Priority: 3 (lowest - used as fallback or for high-security scenarios)
 */
export class CertificateAuthStrategy implements AuthStrategy {
  public readonly name = 'CertificateAuthStrategy'
  public readonly priority = 3

  private readonly adapters: Map<OCPPVersion, OCPPAuthAdapter>
  private readonly chargingStation: ChargingStation
  private isInitialized = false
  private stats = {
    averageResponseTime: 0,
    failedAuths: 0,
    lastUsed: null as Date | null,
    successfulAuths: 0,
    totalRequests: 0,
  }

  constructor (chargingStation: ChargingStation, adapters: Map<OCPPVersion, OCPPAuthAdapter>) {
    this.chargingStation = chargingStation
    this.adapters = adapters
  }

  /**
   * Execute certificate-based authorization
   * @param request
   * @param config
   */
  async authenticate (
    request: AuthRequest,
    config: AuthConfiguration
  ): Promise<AuthorizationResult | undefined> {
    const startTime = Date.now()
    this.stats.totalRequests++
    this.stats.lastUsed = new Date()

    try {
      // Validate certificate data
      const certValidation = this.validateCertificateData(request.identifier)
      if (!certValidation.isValid) {
        logger.warn(
          `${this.chargingStation.logPrefix()} Certificate validation failed: ${String(certValidation.reason)}`
        )
        return this.createFailureResult(
          AuthorizationStatus.INVALID,
          certValidation.reason ?? 'Certificate validation failed',
          request.identifier,
          startTime
        )
      }

      // Get the appropriate adapter
      const adapter = this.adapters.get(request.identifier.ocppVersion)
      if (!adapter) {
        return this.createFailureResult(
          AuthorizationStatus.INVALID,
          `No adapter available for OCPP ${request.identifier.ocppVersion}`,
          request.identifier,
          startTime
        )
      }

      // For OCPP 2.0, we can use certificate-based validation
      if (request.identifier.ocppVersion === OCPPVersion.VERSION_20) {
        const result = await this.validateCertificateWithOCPP20(request, adapter, config)
        this.updateStatistics(result, startTime)
        return result
      }

      // Should not reach here due to canHandle check, but handle gracefully
      return this.createFailureResult(
        AuthorizationStatus.INVALID,
        `Certificate authentication not supported for OCPP ${request.identifier.ocppVersion}`,
        request.identifier,
        startTime
      )
    } catch (error) {
      logger.error(`${this.chargingStation.logPrefix()} Certificate authorization error:`, error)
      return this.createFailureResult(
        AuthorizationStatus.INVALID,
        'Certificate authorization failed',
        request.identifier,
        startTime
      )
    }
  }

  /**
   * Check if this strategy can handle the given request
   * @param request
   * @param config
   */
  canHandle (request: AuthRequest, config: AuthConfiguration): boolean {
    // Only handle certificate-based authentication
    if (request.identifier.type !== IdentifierType.CERTIFICATE) {
      return false
    }

    // Only supported in OCPP 2.0+
    if (request.identifier.ocppVersion === OCPPVersion.VERSION_16) {
      return false
    }

    // Must have an adapter for this OCPP version
    const hasAdapter = this.adapters.has(request.identifier.ocppVersion)

    // Certificate authentication must be enabled
    const certAuthEnabled = config.certificateAuthEnabled

    // Must have certificate data in the identifier
    const hasCertificateData = this.hasCertificateData(request.identifier)

    return hasAdapter && certAuthEnabled && hasCertificateData && this.isInitialized
  }

  cleanup (): Promise<void> {
    this.isInitialized = false
    logger.debug(
      `${this.chargingStation.logPrefix()} Certificate authentication strategy cleaned up`
    )
    return Promise.resolve()
  }

  getStats (): Promise<Record<string, unknown>> {
    return Promise.resolve({
      ...this.stats,
      isInitialized: this.isInitialized,
    })
  }

  initialize (config: AuthConfiguration): Promise<void> {
    if (!config.certificateAuthEnabled) {
      logger.info(`${this.chargingStation.logPrefix()} Certificate authentication disabled`)
      return Promise.resolve()
    }

    logger.info(
      `${this.chargingStation.logPrefix()} Certificate authentication strategy initialized`
    )
    this.isInitialized = true
    return Promise.resolve()
  }

  /**
   * Calculate certificate expiry information
   * @param identifier
   */
  private calculateCertificateExpiry (identifier: UnifiedIdentifier): Date | undefined {
    // In a real implementation, this would parse the actual certificate
    // and extract the notAfter field. For simulation, we'll use a placeholder.

    const certData = identifier.certificateHashData
    if (!certData) return undefined

    // Simulate certificate expiry (1 year from now for test certificates)
    if (certData.serialNumber.startsWith('TEST_')) {
      const expiryDate = new Date()
      expiryDate.setFullYear(expiryDate.getFullYear() + 1)
      return expiryDate
    }

    return undefined
  }

  /**
   * Create a failure result with consistent format
   * @param status
   * @param reason
   * @param identifier
   * @param startTime
   */
  private createFailureResult (
    status: AuthorizationStatus,
    reason: string,
    identifier: UnifiedIdentifier,
    startTime: number
  ): AuthorizationResult {
    const result: AuthorizationResult = {
      additionalInfo: {
        errorMessage: reason,
        responseTimeMs: Date.now() - startTime,
        source: this.name,
      },
      isOffline: false,
      method: AuthenticationMethod.CERTIFICATE_BASED,
      status,
      timestamp: new Date(),
    }

    this.stats.failedAuths++
    return result
  }

  /**
   * Check if the identifier contains certificate data
   * @param identifier
   */
  private hasCertificateData (identifier: UnifiedIdentifier): boolean {
    const certData = identifier.certificateHashData
    if (!certData) return false

    return (
      isNotEmptyString(certData.hashAlgorithm) &&
      isNotEmptyString(certData.issuerNameHash) &&
      isNotEmptyString(certData.issuerKeyHash) &&
      isNotEmptyString(certData.serialNumber)
    )
  }

  /**
   * Simulate certificate validation (in real implementation, this would involve crypto operations)
   * @param request
   * @param config
   */
  private async simulateCertificateValidation (
    request: AuthRequest,
    config: AuthConfiguration
  ): Promise<boolean> {
    // Simulate validation delay
    await new Promise(resolve => setTimeout(resolve, 100))

    // In a real implementation, this would:
    // 1. Load trusted CA certificates from configuration
    // 2. Verify certificate signature chain
    // 3. Check certificate validity period
    // 4. Verify certificate hasn't been revoked
    // 5. Check certificate against whitelist/blacklist

    // For simulation, we'll accept certificates with valid structure
    // and certain test certificate serial numbers
    const certData = request.identifier.certificateHashData
    if (!certData) return false

    // Reject certificates with specific patterns (for testing rejection)
    if (certData.serialNumber.includes('INVALID') || certData.serialNumber.includes('REVOKED')) {
      return false
    }

    // Accept test certificates with valid hash format
    const testCertificateSerials = ['TEST_CERT_001', 'TEST_CERT_002', 'DEMO_CERTIFICATE']
    if (testCertificateSerials.includes(certData.serialNumber)) {
      return true
    }

    // Accept any certificate with valid hex hash format (for testing)
    const hexRegex = /^[a-fA-F0-9]+$/
    if (
      hexRegex.test(certData.issuerNameHash) &&
      hexRegex.test(certData.issuerKeyHash) &&
      certData.hashAlgorithm === 'SHA256'
    ) {
      return true
    }

    // Default behavior based on configuration
    return config.certificateValidationStrict !== true
  }

  /**
   * Update statistics based on result
   * @param result
   * @param startTime
   */
  private updateStatistics (result: AuthorizationResult, startTime: number): void {
    if (result.status === AuthorizationStatus.ACCEPTED) {
      this.stats.successfulAuths++
    } else {
      this.stats.failedAuths++
    }

    // Update average response time
    const responseTime = Date.now() - startTime
    this.stats.averageResponseTime =
      (this.stats.averageResponseTime * (this.stats.totalRequests - 1) + responseTime) /
      this.stats.totalRequests
  }

  /**
   * Validate certificate data structure and content
   * @param identifier
   */
  private validateCertificateData (identifier: UnifiedIdentifier): {
    isValid: boolean
    reason?: string
  } {
    const certData = identifier.certificateHashData

    if (!certData) {
      return { isValid: false, reason: 'No certificate data provided' }
    }

    // Validate required fields
    if (!isNotEmptyString(certData.hashAlgorithm)) {
      return { isValid: false, reason: 'Missing hash algorithm' }
    }

    if (!isNotEmptyString(certData.issuerNameHash)) {
      return { isValid: false, reason: 'Missing issuer name hash' }
    }

    if (!isNotEmptyString(certData.issuerKeyHash)) {
      return { isValid: false, reason: 'Missing issuer key hash' }
    }

    if (!isNotEmptyString(certData.serialNumber)) {
      return { isValid: false, reason: 'Missing certificate serial number' }
    }

    // Validate hash algorithm (common algorithms)
    const validAlgorithms = ['SHA256', 'SHA384', 'SHA512', 'SHA1']
    if (!validAlgorithms.includes(certData.hashAlgorithm.toUpperCase())) {
      return { isValid: false, reason: `Unsupported hash algorithm: ${certData.hashAlgorithm}` }
    }

    // Basic hash format validation (should be alphanumeric for test certificates)
    // In production, this would be strict hex validation
    const alphanumericRegex = /^[a-zA-Z0-9]+$/
    if (!alphanumericRegex.test(certData.issuerNameHash)) {
      return { isValid: false, reason: 'Invalid issuer name hash format' }
    }

    if (!alphanumericRegex.test(certData.issuerKeyHash)) {
      return { isValid: false, reason: 'Invalid issuer key hash format' }
    }

    return { isValid: true }
  }

  /**
   * Validate certificate using OCPP 2.0 mechanisms
   * @param request
   * @param adapter
   * @param config
   */
  private async validateCertificateWithOCPP20 (
    request: AuthRequest,
    adapter: OCPPAuthAdapter,
    config: AuthConfiguration
  ): Promise<AuthorizationResult> {
    const startTime = Date.now()

    try {
      // In a real implementation, this would involve:
      // 1. Verifying the certificate chain against trusted CA roots
      // 2. Checking certificate revocation status (OCSP/CRL)
      // 3. Validating certificate extensions and usage
      // 4. Checking if the certificate is in the charging station's whitelist

      // For this implementation, we'll simulate the validation process
      const isValid = await this.simulateCertificateValidation(request, config)

      if (isValid) {
        const successResult: AuthorizationResult = {
          additionalInfo: {
            certificateValidation: 'passed',
            hashAlgorithm: request.identifier.certificateHashData?.hashAlgorithm,
            responseTimeMs: Date.now() - startTime,
            source: this.name,
          },
          expiryDate: this.calculateCertificateExpiry(request.identifier),
          isOffline: false,
          method: AuthenticationMethod.CERTIFICATE_BASED,
          status: AuthorizationStatus.ACCEPTED,
          timestamp: new Date(),
        }

        logger.info(
          `${this.chargingStation.logPrefix()} Certificate authorization successful for certificate ${request.identifier.certificateHashData?.serialNumber ?? 'unknown'}`
        )

        return successResult
      } else {
        return this.createFailureResult(
          AuthorizationStatus.BLOCKED,
          'Certificate validation failed',
          request.identifier,
          startTime
        )
      }
    } catch (error) {
      logger.error(
        `${this.chargingStation.logPrefix()} OCPP 2.0 certificate validation error:`,
        error
      )
      return this.createFailureResult(
        AuthorizationStatus.INVALID,
        'Certificate validation error',
        request.identifier,
        startTime
      )
    }
  }
}
