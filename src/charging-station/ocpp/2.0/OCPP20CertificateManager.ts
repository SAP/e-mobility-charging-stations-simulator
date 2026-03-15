// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { createHash, X509Certificate } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

import type { ChargingStation } from '../../ChargingStation.js'

import {
  type CertificateHashDataChainType,
  type CertificateHashDataType,
  CertificateSigningUseEnumType,
  DeleteCertificateStatusEnumType,
  GetCertificateIdUseEnumType,
  HashAlgorithmEnumType,
  InstallCertificateUseEnumType,
} from '../../../types/ocpp/2.0/Common.js'

/**
 * Interface for ChargingStation with certificate manager
 */
export interface ChargingStationWithCertificateManager extends ChargingStation {
  certificateManager: OCPP20CertificateManagerInterface
}

/**
 * Result type for certificate deletion operations
 */
export interface DeleteCertificateResult {
  status: DeleteCertificateStatusEnumType
}

/**
 * Result type for getting installed certificates
 */
export interface GetInstalledCertificatesResult {
  certificateHashDataChain: CertificateHashDataChainType[]
}

/**
 * Interface for OCPP 2.0 Certificate Manager operations
 * Used for type-safe access to certificate management functionality
 */
export interface OCPP20CertificateManagerInterface {
  deleteCertificate(
    stationHashId: string,
    hashData: CertificateHashDataType
  ): DeleteCertificateResult | Promise<DeleteCertificateResult>
  getInstalledCertificates(
    stationHashId: string,
    filterTypes?: InstallCertificateUseEnumType[],
    hashAlgorithm?: HashAlgorithmEnumType
  ): GetInstalledCertificatesResult | Promise<GetInstalledCertificatesResult>
  storeCertificate(
    stationHashId: string,
    certType: CertificateSigningUseEnumType | InstallCertificateUseEnumType,
    pemData: string
  ): Promise<StoreCertificateResult> | StoreCertificateResult
  validateCertificateFormat(pemData: unknown): boolean
  validateCertificateX509(pem: string): ValidateCertificateX509Result
}

/**
 * Result type for certificate storage operations
 */
export interface StoreCertificateResult {
  error?: string
  filePath?: string
  success: boolean
}

/**
 * Result type for X.509 certificate validation
 */
export interface ValidateCertificateX509Result {
  reason?: string
  valid: boolean
}

/**
 * OCPP 2.0 Certificate Manager
 *
 * Provides certificate management operations for OCPP 2.0 charging stations:
 * - Store/delete certificates
 * - Compute certificate hashes
 * - Validate certificate format
 * - Manage certificate storage paths
 */
export class OCPP20CertificateManager {
  private static readonly BASE_CERT_PATH = 'dist/assets/configurations'
  private static readonly CERT_FOLDER = 'certs'
  private static readonly PEM_BEGIN_MARKER = '-----BEGIN CERTIFICATE-----'
  private static readonly PEM_END_MARKER = '-----END CERTIFICATE-----'

  /**
   * Computes hash data for a PEM certificate per RFC 6960 §4.1.1 CertID semantics.
   *
   * Per RFC 6960, the CertID identifies a certificate by:
   * - issuerNameHash: Hash of the issuer's DN (from the subject certificate)
   * - issuerKeyHash: Hash of the issuer's public key (from the issuer certificate)
   * - serialNumber: The certificate's serial number
   * @remarks
   * **RFC 6960 §4.1.1 deviation**: Per RFC 6960, `issuerNameHash` must be the hash of the
   * DER-encoded issuer distinguished name. This implementation hashes the string DN
   * representation from `X509Certificate.issuer` as a simulation approximation. Full RFC 6960
   * compliance would require ASN.1/DER encoding of the issuer name, which is outside the scope
   * of this simulator. See also: mock CSR generation in the SignCertificate handler.
   * @param pemData - PEM-encoded certificate data
   * @param hashAlgorithm - Hash algorithm to use (default: SHA256)
   * @param issuerCertPem - Optional PEM-encoded issuer certificate for issuerKeyHash computation.
   *   If not provided, attempts to detect self-signed certificates (issuer = subject)
   *   and uses the subject certificate's public key. For non-self-signed certificates
   *   without an issuer cert, uses the subject's public key as fallback.
   * @returns Certificate hash data including issuerNameHash, issuerKeyHash, serialNumber
   * @throws {Error} If PEM format is invalid or certificate cannot be parsed
   */
  public computeCertificateHash (
    pemData: string,
    hashAlgorithm: HashAlgorithmEnumType = HashAlgorithmEnumType.SHA256,
    issuerCertPem?: string
  ): CertificateHashDataType {
    if (!this.validateCertificateFormat(pemData)) {
      throw new Error('Invalid PEM certificate format')
    }

    const algorithmName = this.getHashAlgorithmName(hashAlgorithm)

    try {
      const firstCertPem = this.extractFirstCertificate(pemData)
      const x509 = new X509Certificate(firstCertPem)

      // RFC 6960 §4.1.1 deviation: spec requires hash of DER-encoded issuer distinguished name.
      // Using string DN from X509Certificate.issuer as simulation approximation
      // (ASN.1/DER encoding of the issuer name is out of scope for this simulator).
      const issuerNameHash = createHash(algorithmName).update(x509.issuer).digest('hex')

      // RFC 6960 §4.1.1: issuerKeyHash is the hash of the issuer certificate's public key
      // Determine which public key to use for issuerKeyHash
      let issuerPublicKeyDer: Buffer

      if (issuerCertPem != null && this.validateCertificateFormat(issuerCertPem)) {
        // Use provided issuer certificate's public key
        const issuerCert = new X509Certificate(this.extractFirstCertificate(issuerCertPem))
        issuerPublicKeyDer = issuerCert.publicKey.export({
          format: 'der',
          type: 'spki',
        }) as Buffer
      } else if (this.isSelfSignedCertificate(x509)) {
        // Self-signed certificate: issuer = subject, use the certificate's own public key
        issuerPublicKeyDer = x509.publicKey.export({
          format: 'der',
          type: 'spki',
        }) as Buffer
      } else {
        // Non-self-signed without issuer cert: use subject's public key as fallback
        // This is technically incorrect per RFC 6960 but maintains backward compatibility
        issuerPublicKeyDer = x509.publicKey.export({
          format: 'der',
          type: 'spki',
        }) as Buffer
      }

      const issuerKeyHash = createHash(algorithmName).update(issuerPublicKeyDer).digest('hex')

      const serialNumber = x509.serialNumber

      return {
        hashAlgorithm,
        issuerKeyHash,
        issuerNameHash,
        serialNumber,
      }
    } catch {
      // Fallback for PEM data that cannot be parsed by X509Certificate
      // Compute hashes from the raw certificate content
      return this.computeFallbackCertificateHash(pemData, hashAlgorithm, algorithmName)
    }
  }

  /**
   * Deletes a certificate by its hash data
   * @param stationHashId - Charging station unique identifier
   * @param hashData - Certificate hash data identifying the certificate to delete
   * @returns Delete operation result with status
   */
  public async deleteCertificate (
    stationHashId: string,
    hashData: CertificateHashDataType
  ): Promise<DeleteCertificateResult> {
    try {
      const basePath = this.getStationCertificatesBasePath(stationHashId)

      if (!(await this.pathExists(basePath))) {
        return { status: DeleteCertificateStatusEnumType.NotFound }
      }

      const certTypeEntries = await readdir(basePath, { withFileTypes: true })
      const certTypes = certTypeEntries
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)

      for (const certType of certTypes) {
        const certTypeDir = join(basePath, certType)
        const allFiles = await readdir(certTypeDir)
        const files = allFiles.filter(f => f.endsWith('.pem'))

        for (const file of files) {
          const filePath = join(certTypeDir, file)
          this.validateCertificatePath(filePath, OCPP20CertificateManager.BASE_CERT_PATH)
          try {
            const pemData = await readFile(filePath, 'utf8')
            const certHash = this.computeCertificateHash(pemData, hashData.hashAlgorithm)

            if (
              certHash.serialNumber === hashData.serialNumber &&
              certHash.issuerNameHash === hashData.issuerNameHash &&
              certHash.issuerKeyHash === hashData.issuerKeyHash
            ) {
              await rm(filePath)
              return { status: DeleteCertificateStatusEnumType.Accepted }
            }
          } catch {
            // Skip unreadable or unparsable certificate file
          }
        }
      }

      return { status: DeleteCertificateStatusEnumType.NotFound }
    } catch {
      // Certificate directory access or validation failed
      return { status: DeleteCertificateStatusEnumType.Failed }
    }
  }

  /**
   * Gets the filesystem path for a certificate
   * @param stationHashId - Charging station unique identifier
   * @param certType - Certificate type (e.g., CSMSRootCertificate, ChargingStationCertificate)
   * @param serialNumber - Certificate serial number
   * @returns Full path where the certificate should be stored
   */
  public getCertificatePath (
    stationHashId: string,
    certType: CertificateSigningUseEnumType | InstallCertificateUseEnumType,
    serialNumber: string
  ): string {
    const basePath = this.getStationCertificatesBasePath(stationHashId)
    const sanitizedSerial = this.sanitizeSerial(serialNumber)
    return join(basePath, certType, `${sanitizedSerial}.pem`)
  }

  /**
   * Gets installed certificates for a charging station
   * @param stationHashId - Charging station unique identifier
   * @param filterTypes - Optional array of certificate types to filter
   * @param hashAlgorithm - Optional hash algorithm to use for certificate hash computation (defaults to SHA256)
   * @returns List of installed certificate hash data chains
   */
  public async getInstalledCertificates (
    stationHashId: string,
    filterTypes?: InstallCertificateUseEnumType[],
    hashAlgorithm?: HashAlgorithmEnumType
  ): Promise<GetInstalledCertificatesResult> {
    const certificateHashDataChain: CertificateHashDataChainType[] = []

    try {
      const basePath = this.getStationCertificatesBasePath(stationHashId)

      if (!(await this.pathExists(basePath))) {
        return { certificateHashDataChain }
      }

      const certTypeEntries = await readdir(basePath, { withFileTypes: true })
      const certTypes = certTypeEntries
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)

      for (const certType of certTypes) {
        if (filterTypes != null && filterTypes.length > 0) {
          if (!filterTypes.includes(certType as InstallCertificateUseEnumType)) {
            continue
          }
        }

        const certTypeDir = join(basePath, certType)
        const allFiles = await readdir(certTypeDir)
        const files = allFiles.filter(f => f.endsWith('.pem'))

        for (const file of files) {
          const filePath = join(certTypeDir, file)
          this.validateCertificatePath(filePath, OCPP20CertificateManager.BASE_CERT_PATH)
          try {
            const pemData = await readFile(filePath, 'utf8')
            const hashData = this.computeCertificateHash(pemData, hashAlgorithm)

            certificateHashDataChain.push({
              certificateHashData: hashData,
              certificateType: this.mapInstallTypeToGetType(
                certType as InstallCertificateUseEnumType
              ),
            })
          } catch {
            // Skip unreadable or unparsable certificate file
            continue
          }
        }
      }
    } catch {
      // Ignore directory listing errors - return empty result
    }
    return { certificateHashDataChain }
  }

  /**
   * Stores a PEM certificate to the filesystem
   * @param stationHashId - Charging station unique identifier
   * @param certType - Certificate type for storage (InstallCertificateUseEnumType for root certificates
   *   or CertificateSigningUseEnumType for signed leaf certificates)
   * @param pemData - PEM-encoded certificate data
   * @returns Storage result with success status and file path or error
   */
  public async storeCertificate (
    stationHashId: string,
    certType: CertificateSigningUseEnumType | InstallCertificateUseEnumType,
    pemData: string
  ): Promise<StoreCertificateResult> {
    if (!this.validateCertificateFormat(pemData)) {
      return {
        error: 'Invalid PEM format: Certificate must have valid BEGIN and END markers',
        success: false,
      }
    }

    try {
      const firstCertPem = this.extractFirstCertificate(pemData)
      let serialNumber: string

      try {
        const hashData = this.computeCertificateHash(firstCertPem)
        serialNumber = hashData.serialNumber
      } catch {
        // X509 parsing failed, generate fallback serial from content hash
        serialNumber = this.generateFallbackSerialNumber(firstCertPem)
      }

      const filePath = this.getCertificatePath(stationHashId, certType, serialNumber)

      this.validateCertificatePath(filePath, OCPP20CertificateManager.BASE_CERT_PATH)

      const dirPath = resolve(filePath, '..')
      if (!(await this.pathExists(dirPath))) {
        await mkdir(dirPath, { recursive: true })
      }

      await writeFile(filePath, pemData, 'utf8')

      return {
        filePath,
        success: true,
      }
    } catch (error) {
      return {
        error: `Failed to store certificate: ${(error as Error).message}`,
        success: false,
      }
    }
  }

  /**
   * Validates PEM certificate format
   * @param pemData - PEM data to validate
   * @returns true if valid PEM certificate format, false otherwise
   */
  public validateCertificateFormat (pemData: unknown): boolean {
    if (pemData == null || typeof pemData !== 'string') {
      return false
    }

    if (pemData.trim().length === 0) {
      return false
    }

    const trimmed = pemData.trim()

    return (
      trimmed.includes(OCPP20CertificateManager.PEM_BEGIN_MARKER) &&
      trimmed.includes(OCPP20CertificateManager.PEM_END_MARKER)
    )
  }

  /**
   * Validates a PEM certificate using X.509 structural parsing.
   * Checks validity period (notBefore/notAfter) and issuer presence per A02.FR.06.
   *
   * **Design choice**: Only the first certificate in a PEM chain is validated.
   * Full chain-of-trust verification (A02.FR.06 hierarchy check) is not implemented —
   * the simulator performs structural validation only, consistent with the medium-depth
   * X.509 scope defined in the audit remediation plan.
   * @param pem - PEM-encoded certificate data (may contain a chain; only first cert is validated)
   * @returns Validation result with reason on failure
   */
  public validateCertificateX509 (pem: string): ValidateCertificateX509Result {
    try {
      const firstCertMatch = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/.exec(
        pem
      )
      if (firstCertMatch == null) {
        return { reason: 'No PEM certificate found', valid: false }
      }
      const cert = new X509Certificate(firstCertMatch[0])
      const now = new Date()
      if (now < new Date(cert.validFrom)) {
        return { reason: 'Certificate is not yet valid', valid: false }
      }
      if (now > new Date(cert.validTo)) {
        return { reason: 'Certificate has expired', valid: false }
      }
      if (!cert.issuer.trim()) {
        return { reason: 'Certificate has no issuer', valid: false }
      }
      return { valid: true }
    } catch (error) {
      return {
        reason: `Certificate parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        valid: false,
      }
    }
  }

  /**
   * Computes fallback hash data when X509Certificate parsing fails.
   * Uses the raw PEM content to derive deterministic but non-RFC-compliant hash values.
   * @remarks
   * This fallback produces stable, unique identifiers for certificate matching purposes only.
   * The hash values do not conform to RFC 6960 §4.1.1 CertID semantics since the raw DER
   * content cannot be structurally parsed without X509Certificate support.
   * @param pemData - PEM-encoded certificate data
   * @param hashAlgorithm - Hash algorithm enum type for the response
   * @param algorithmName - Node.js crypto hash algorithm name
   * @returns Certificate hash data derived from raw PEM content
   */
  private computeFallbackCertificateHash (
    pemData: string,
    hashAlgorithm: HashAlgorithmEnumType,
    algorithmName: string
  ): CertificateHashDataType {
    const base64Content = pemData
      .replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\s/g, '')

    const contentBuffer = Buffer.from(base64Content, 'base64')

    // Use first 64 bytes as issuer name proxy: in DER-encoded X.509, the issuer DN
    // typically resides within this range, providing a stable hash for matching.
    const issuerNameSliceEnd = Math.min(64, contentBuffer.length)
    const issuerNameHash = createHash(algorithmName)
      .update(contentBuffer.subarray(0, issuerNameSliceEnd))
      .digest('hex')
    const issuerKeyHash = createHash(algorithmName).update(contentBuffer).digest('hex')

    const serialNumber = this.generateFallbackSerialNumber(pemData)

    return {
      hashAlgorithm,
      issuerKeyHash,
      issuerNameHash,
      serialNumber,
    }
  }

  private extractFirstCertificate (pemData: string): string {
    const beginIndex = pemData.indexOf(OCPP20CertificateManager.PEM_BEGIN_MARKER)
    const endIndex = pemData.indexOf(OCPP20CertificateManager.PEM_END_MARKER)

    if (beginIndex === -1 || endIndex === -1) {
      return pemData
    }

    return pemData.substring(beginIndex, endIndex + OCPP20CertificateManager.PEM_END_MARKER.length)
  }

  private generateFallbackSerialNumber (pemData: string): string {
    return createHash('sha256').update(pemData).digest('hex').substring(0, 16).toUpperCase()
  }

  private getHashAlgorithmName (hashAlgorithm: HashAlgorithmEnumType): string {
    switch (hashAlgorithm) {
      case HashAlgorithmEnumType.SHA256:
        return 'sha256'
      case HashAlgorithmEnumType.SHA384:
        return 'sha384'
      case HashAlgorithmEnumType.SHA512:
        return 'sha512'
      default:
        return 'sha256'
    }
  }

  /**
   * Builds and validates the base certificates directory path for a station.
   * @param stationHashId - Charging station unique identifier
   * @returns Validated base path for certificate storage
   * @throws {Error} If path validation fails (path traversal attempt)
   */
  private getStationCertificatesBasePath (stationHashId: string): string {
    const sanitizedHashId = this.sanitizePath(stationHashId)
    const basePath = join(
      OCPP20CertificateManager.BASE_CERT_PATH,
      sanitizedHashId,
      OCPP20CertificateManager.CERT_FOLDER
    )
    this.validateCertificatePath(basePath, OCPP20CertificateManager.BASE_CERT_PATH)
    return basePath
  }

  private isSelfSignedCertificate (x509: X509Certificate): boolean {
    return x509.issuer === x509.subject
  }

  private mapInstallTypeToGetType (
    installType: InstallCertificateUseEnumType
  ): GetCertificateIdUseEnumType {
    switch (installType) {
      case InstallCertificateUseEnumType.CSMSRootCertificate:
        return GetCertificateIdUseEnumType.CSMSRootCertificate
      case InstallCertificateUseEnumType.ManufacturerRootCertificate:
        return GetCertificateIdUseEnumType.ManufacturerRootCertificate
      case InstallCertificateUseEnumType.MORootCertificate:
        return GetCertificateIdUseEnumType.MORootCertificate
      case InstallCertificateUseEnumType.V2GRootCertificate:
        return GetCertificateIdUseEnumType.V2GRootCertificate
      default:
        return GetCertificateIdUseEnumType.CSMSRootCertificate
    }
  }

  private async pathExists (path: string): Promise<boolean> {
    try {
      await stat(path)
      return true
    } catch {
      // Path does not exist or is inaccessible
      return false
    }
  }

  private sanitizePath (input: string): string {
    return input
      .replace(/\.\./g, '_')
      .replace(/[/\\]/g, '_')
      .replace(/[<>:"|?*]/g, '_')
  }

  private sanitizeSerial (serial: string): string {
    return serial.replace(/:/g, '-').replace(/[/\\<>"|?*]/g, '_')
  }

  private validateCertificatePath (certificateFileName: string, baseDir: string): string {
    const baseResolved = resolve(baseDir)
    const fileResolved = resolve(baseDir, certificateFileName)

    // Check if resolved path is within the base directory
    if (!fileResolved.startsWith(baseResolved + sep) && fileResolved !== baseResolved) {
      throw new Error(
        `Path traversal attempt detected: certificate path '${certificateFileName}' resolves outside base directory`
      )
    }

    return fileResolved
  }
}

/**
 * Type guard to check if a charging station has a certificate manager
 * @param chargingStation - The charging station to check
 * @returns true if the charging station has a certificate manager
 */
export function hasCertificateManager (
  chargingStation: ChargingStation
): chargingStation is ChargingStationWithCertificateManager {
  return (
    'certificateManager' in chargingStation &&
    chargingStation.certificateManager != null &&
    typeof (chargingStation as ChargingStationWithCertificateManager).certificateManager
      .validateCertificateFormat === 'function'
  )
}
