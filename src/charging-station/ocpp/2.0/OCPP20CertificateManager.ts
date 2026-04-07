// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { hash, X509Certificate } from 'node:crypto'
import { mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

import type { ChargingStation } from '../../ChargingStation.js'

import { BaseError } from '../../../exception/index.js'
import {
  type CertificateHashDataChainType,
  type CertificateHashDataType,
  CertificateSigningUseEnumType,
  DeleteCertificateStatusEnumType,
  GetCertificateIdUseEnumType,
  HashAlgorithmEnumType,
  InstallCertificateUseEnumType,
} from '../../../types/index.js'
import { convertToDate, getErrorMessage, isEmpty, isNotEmptyArray } from '../../../utils/index.js'
import { extractDerIssuer } from './Asn1DerUtils.js'

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
  isChargingStationCertificateHash(
    stationHashId: string,
    certificateHashData: CertificateHashDataType,
    hashAlgorithm?: HashAlgorithmEnumType
  ): boolean | Promise<boolean>
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
   * **RFC 6960 §4.1.1 compliant**: `issuerNameHash` is computed from the DER-encoded issuer
   * distinguished name extracted from the raw X.509 certificate, per RFC 6960 requirements.
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
      throw new BaseError('Invalid PEM certificate format')
    }

    const algorithmName = this.getHashAlgorithmName(hashAlgorithm)

    try {
      const firstCertPem = this.extractFirstCertificate(pemData)
      const x509 = new X509Certificate(firstCertPem)

      // RFC 6960 §4.1.1: issuerNameHash is the hash of the DER-encoded issuer DN
      const issuerDer = extractDerIssuer(x509.raw)
      const issuerNameHash = hash(algorithmName, issuerDer, 'hex')

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

      const issuerKeyHash = hash(algorithmName, issuerPublicKeyDer, 'hex')

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
      const basePath = await this.getStationCertificatesBasePath(stationHashId)

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
          await this.validateCertificatePath(filePath, OCPP20CertificateManager.BASE_CERT_PATH)
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
  public async getCertificatePath (
    stationHashId: string,
    certType: CertificateSigningUseEnumType | InstallCertificateUseEnumType,
    serialNumber: string
  ): Promise<string> {
    const basePath = await this.getStationCertificatesBasePath(stationHashId)
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
      const basePath = await this.getStationCertificatesBasePath(stationHashId)

      if (!(await this.pathExists(basePath))) {
        return { certificateHashDataChain }
      }

      const certTypeEntries = await readdir(basePath, { withFileTypes: true })
      const certTypes = certTypeEntries
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)

      for (const certType of certTypes) {
        if (filterTypes != null && isNotEmptyArray(filterTypes)) {
          if (!filterTypes.includes(certType as InstallCertificateUseEnumType)) {
            continue
          }
        }

        const certTypeDir = join(basePath, certType)
        const allFiles = await readdir(certTypeDir)
        const files = allFiles.filter(f => f.endsWith('.pem'))

        for (const file of files) {
          const filePath = join(certTypeDir, file)
          await this.validateCertificatePath(filePath, OCPP20CertificateManager.BASE_CERT_PATH)
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
   * Checks whether the given certificate hash data matches a ChargingStationCertificate
   * stored on disk for the specified station.
   * @param stationHashId - Charging station unique identifier
   * @param certificateHashData - Certificate hash data to check against stored CS certificates
   * @param hashAlgorithm - Optional hash algorithm override (defaults to certificateHashData.hashAlgorithm)
   * @returns true if the hash matches a stored ChargingStationCertificate, false otherwise
   */
  public async isChargingStationCertificateHash (
    stationHashId: string,
    certificateHashData: CertificateHashDataType,
    hashAlgorithm?: HashAlgorithmEnumType
  ): Promise<boolean> {
    try {
      const certFilePath = await this.getCertificatePath(
        stationHashId,
        CertificateSigningUseEnumType.ChargingStationCertificate,
        ''
      )
      // getCertificatePath returns basePath/ChargingStationCertificate/.pem
      // We need the directory: basePath/ChargingStationCertificate
      const dirPath = resolve(certFilePath, '..')

      if (!(await this.pathExists(dirPath))) {
        return false
      }

      const allFiles = await readdir(dirPath)
      const pemFiles = allFiles.filter(f => f.endsWith('.pem'))

      for (const file of pemFiles) {
        const filePath = join(dirPath, file)
        await this.validateCertificatePath(filePath, OCPP20CertificateManager.BASE_CERT_PATH)
        try {
          const pemData = await readFile(filePath, 'utf8')
          const hashData = this.computeCertificateHash(
            pemData,
            hashAlgorithm ?? certificateHashData.hashAlgorithm
          )
          if (
            hashData.serialNumber === certificateHashData.serialNumber &&
            hashData.issuerNameHash === certificateHashData.issuerNameHash &&
            hashData.issuerKeyHash === certificateHashData.issuerKeyHash
          ) {
            return true
          }
        } catch {
          continue
        }
      }
    } catch {
      // Ignore errors — treat as "not a CS cert"
    }
    return false
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

      const filePath = await this.getCertificatePath(stationHashId, certType, serialNumber)

      await this.validateCertificatePath(filePath, OCPP20CertificateManager.BASE_CERT_PATH)

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
        error: `Failed to store certificate: ${getErrorMessage(error)}`,
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

    if (isEmpty(pemData)) {
      return false
    }

    const trimmed = pemData.trim()

    return (
      trimmed.includes(OCPP20CertificateManager.PEM_BEGIN_MARKER) &&
      trimmed.includes(OCPP20CertificateManager.PEM_END_MARKER)
    )
  }

  /**
   * Validates a PEM certificate chain using X.509 structural parsing.
   * Checks validity period (notBefore/notAfter) for all certificates and verifies
   * chain-of-trust by checking issuance and signature for each consecutive pair.
   * @param pem - PEM-encoded certificate data (may contain a chain, ordered leaf → intermediate → root)
   * @returns Validation result with reason on failure
   */
  public validateCertificateX509 (pem: string): ValidateCertificateX509Result {
    try {
      const pemCertificates = pem.match(
        /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g
      )
      if (pemCertificates == null || pemCertificates.length === 0) {
        return { reason: 'No PEM certificate found', valid: false }
      }

      const certs = pemCertificates.map(p => new X509Certificate(p))
      const now = new Date()

      for (const cert of certs) {
        const validFromDate = convertToDate(cert.validFrom)
        const validToDate = convertToDate(cert.validTo)
        if (validFromDate != null && now < validFromDate) {
          return { reason: 'Certificate is not yet valid', valid: false }
        }
        if (validToDate != null && now > validToDate) {
          return { reason: 'Certificate has expired', valid: false }
        }
        if (!cert.issuer.trim()) {
          return { reason: 'Certificate has no issuer', valid: false }
        }
      }

      for (let i = 0; i < certs.length - 1; i++) {
        if (!certs[i].checkIssued(certs[i + 1])) {
          return {
            reason: 'Certificate chain verification failed: issuer mismatch',
            valid: false,
          }
        }
        if (!certs[i].verify(certs[i + 1].publicKey)) {
          return {
            reason: 'Certificate chain verification failed: signature verification failed',
            valid: false,
          }
        }
      }

      return { valid: true }
    } catch (error) {
      return {
        reason: `Certificate parsing failed: ${getErrorMessage(error)}`,
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
    const issuerNameHash = hash(algorithmName, contentBuffer.subarray(0, issuerNameSliceEnd), 'hex')
    const issuerKeyHash = hash(algorithmName, contentBuffer, 'hex')

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
    return hash('sha256', pemData, 'hex').substring(0, 16).toUpperCase()
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
  private async getStationCertificatesBasePath (stationHashId: string): Promise<string> {
    const sanitizedHashId = this.sanitizePath(stationHashId)
    const basePath = join(
      OCPP20CertificateManager.BASE_CERT_PATH,
      sanitizedHashId,
      OCPP20CertificateManager.CERT_FOLDER
    )
    await this.validateCertificatePath(basePath, OCPP20CertificateManager.BASE_CERT_PATH)
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

  private async validateCertificatePath (
    certificateFileName: string,
    baseDir: string
  ): Promise<string> {
    // Resolve symlinks when paths exist; falls back to resolve() for not-yet-created paths
    let baseResolved: string
    try {
      baseResolved = await realpath(resolve(baseDir))
    } catch {
      baseResolved = resolve(baseDir)
    }

    let fileResolved: string
    try {
      fileResolved = await realpath(resolve(baseDir, certificateFileName))
    } catch {
      fileResolved = resolve(baseDir, certificateFileName)
    }

    if (!fileResolved.startsWith(baseResolved + sep) && fileResolved !== baseResolved) {
      throw new BaseError(
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
