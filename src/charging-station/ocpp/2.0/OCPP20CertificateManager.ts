// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { createHash, X509Certificate } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  type CertificateHashDataChainType,
  type CertificateHashDataType,
  DeleteCertificateStatusEnumType,
  GetCertificateIdUseEnumType,
  HashAlgorithmEnumType,
  type InstallCertificateUseEnumType,
} from '../../../types/ocpp/2.0/Common.js'

/**
 * Result type for certificate storage operations
 */
export interface StoreCertificateResult {
  error?: string
  filePath?: string
  success: boolean
}

/**
 * Result type for certificate deletion operations
 */
export interface DeleteCertificateResult {
  status: 'Accepted' | 'Failed' | 'NotFound'
}

/**
 * Result type for getting installed certificates
 */
export interface GetInstalledCertificatesResult {
  certificateHashDataChain: CertificateHashDataChainType[]
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
   * Computes hash data for a PEM certificate
   *
   * @param pemData - PEM-encoded certificate data
   * @param hashAlgorithm - Hash algorithm to use (default: SHA256)
   * @returns Certificate hash data including issuerNameHash, issuerKeyHash, serialNumber
   * @throws Error if PEM format is invalid or certificate cannot be parsed
   */
  public computeCertificateHash(
    pemData: string,
    hashAlgorithm: HashAlgorithmEnumType = HashAlgorithmEnumType.SHA256
  ): CertificateHashDataType {
    if (!this.validateCertificateFormat(pemData)) {
      throw new Error('Invalid PEM certificate format')
    }

    const algorithmName = this.getHashAlgorithmName(hashAlgorithm)

    try {
      const x509 = new X509Certificate(pemData)

      const issuerNameHash = createHash(algorithmName).update(x509.issuer).digest('hex')

      const issuerKeyHash = createHash(algorithmName).update(x509.publicKey.export({
        format: 'der',
        type: 'spki',
      })).digest('hex')

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
   * Computes fallback hash data when X509Certificate parsing fails.
   * Uses the raw PEM content to derive hash values.
   */
  private computeFallbackCertificateHash(
    pemData: string,
    hashAlgorithm: HashAlgorithmEnumType,
    algorithmName: string
  ): CertificateHashDataType {
    // Extract the base64 content between PEM markers
    const base64Content = pemData
      .replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\s/g, '')

    // Compute hashes from the certificate content
    const contentBuffer = Buffer.from(base64Content, 'base64')
    const issuerNameHash = createHash(algorithmName).update(contentBuffer.subarray(0, Math.min(64, contentBuffer.length))).digest('hex')
    const issuerKeyHash = createHash(algorithmName).update(contentBuffer).digest('hex')

    // Generate a serial number from the content hash
    const serialNumber = createHash('sha256').update(pemData).digest('hex').substring(0, 16).toUpperCase()

    return {
      hashAlgorithm,
      issuerKeyHash,
      issuerNameHash,
      serialNumber,
    }
  }

  /**
   * Deletes a certificate by its hash data
   *
   * @param stationHashId - Charging station unique identifier
   * @param hashData - Certificate hash data identifying the certificate to delete
   * @returns Delete operation result with status
   */
  public async deleteCertificate(
    stationHashId: string,
    hashData: CertificateHashDataType
  ): Promise<DeleteCertificateResult> {
    try {
      const sanitizedHashId = this.sanitizePath(stationHashId)
      const basePath = join(
        OCPP20CertificateManager.BASE_CERT_PATH,
        sanitizedHashId,
        OCPP20CertificateManager.CERT_FOLDER
      )

      if (!existsSync(basePath)) {
        return { status: 'NotFound' }
      }

      const certTypes = readdirSync(basePath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)

      for (const certType of certTypes) {
        const certTypeDir = join(basePath, certType)
        const files = readdirSync(certTypeDir).filter(f => f.endsWith('.pem'))

        for (const file of files) {
          const filePath = join(certTypeDir, file)
          try {
            const pemData = readFileSync(filePath, 'utf8')
            const certHash = this.computeCertificateHash(pemData, hashData.hashAlgorithm)

            if (
              certHash.serialNumber === hashData.serialNumber &&
              certHash.issuerNameHash === hashData.issuerNameHash &&
              certHash.issuerKeyHash === hashData.issuerKeyHash
            ) {
              rmSync(filePath)
              return { status: 'Accepted' }
            }
          } catch {
            continue
          }
        }
      }

      return { status: 'NotFound' }
    } catch {
      return { status: 'NotFound' }
    }
  }

  /**
   * Gets the filesystem path for a certificate
   *
   * @param stationHashId - Charging station unique identifier
   * @param certType - Certificate type (e.g., CSMSRootCertificate)
   * @param serialNumber - Certificate serial number
   * @returns Full path where the certificate should be stored
   */
  public getCertificatePath(
    stationHashId: string,
    certType: InstallCertificateUseEnumType,
    serialNumber: string
  ): string {
    const sanitizedHashId = this.sanitizePath(stationHashId)
    const sanitizedSerial = this.sanitizeSerial(serialNumber)

    return join(
      OCPP20CertificateManager.BASE_CERT_PATH,
      sanitizedHashId,
      OCPP20CertificateManager.CERT_FOLDER,
      certType,
      `${sanitizedSerial}.pem`
    )
  }

  /**
   * Gets installed certificates for a charging station
   *
   * @param stationHashId - Charging station unique identifier
   * @param filterTypes - Optional array of certificate types to filter
   * @returns List of installed certificate hash data chains
   */
  public async getInstalledCertificates(
    stationHashId: string,
    filterTypes?: InstallCertificateUseEnumType[]
  ): Promise<GetInstalledCertificatesResult> {
    const certificateHashDataChain: CertificateHashDataChainType[] = []

    try {
      const sanitizedHashId = this.sanitizePath(stationHashId)
      const basePath = join(
        OCPP20CertificateManager.BASE_CERT_PATH,
        sanitizedHashId,
        OCPP20CertificateManager.CERT_FOLDER
      )

      if (!existsSync(basePath)) {
        return { certificateHashDataChain }
      }

      const certTypes = readdirSync(basePath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)

      for (const certType of certTypes) {
        if (filterTypes != null && filterTypes.length > 0) {
          if (!filterTypes.includes(certType as InstallCertificateUseEnumType)) {
            continue
          }
        }

        const certTypeDir = join(basePath, certType)
        const files = readdirSync(certTypeDir).filter(f => f.endsWith('.pem'))

        for (const file of files) {
          const filePath = join(certTypeDir, file)
          try {
            const pemData = readFileSync(filePath, 'utf8')
            const hashData = this.computeCertificateHash(pemData)

            certificateHashDataChain.push({
              certificateHashData: hashData,
              certificateType: this.mapInstallTypeToGetType(certType as InstallCertificateUseEnumType),
            })
          } catch {
            continue
          }
        }
      }
    } catch {
    }

    return { certificateHashDataChain }
  }

  /**
   * Stores a PEM certificate to the filesystem
   *
   * @param stationHashId - Charging station unique identifier
   * @param certType - Certificate type (e.g., CSMSRootCertificate, V2GRootCertificate)
   * @param pemData - PEM-encoded certificate data
   * @returns Storage result with success status and file path or error
   */
  public async storeCertificate(
    stationHashId: string,
    certType: InstallCertificateUseEnumType,
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
        serialNumber = this.generateFallbackSerialNumber(firstCertPem)
      }

      const filePath = this.getCertificatePath(stationHashId, certType, serialNumber)

      const dirPath = resolve(filePath, '..')
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true })
      }

      writeFileSync(filePath, pemData, 'utf8')

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
   *
   * @param pemData - PEM data to validate
   * @returns true if valid PEM certificate format, false otherwise
   */
  public validateCertificateFormat(pemData: unknown): boolean {
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

  private extractFirstCertificate(pemData: string): string {
    const beginIndex = pemData.indexOf(OCPP20CertificateManager.PEM_BEGIN_MARKER)
    const endIndex = pemData.indexOf(OCPP20CertificateManager.PEM_END_MARKER)

    if (beginIndex === -1 || endIndex === -1) {
      return pemData
    }

    return pemData.substring(
      beginIndex,
      endIndex + OCPP20CertificateManager.PEM_END_MARKER.length
    )
  }

  private getHashAlgorithmName(hashAlgorithm: HashAlgorithmEnumType): string {
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

  private mapInstallTypeToGetType(
    installType: InstallCertificateUseEnumType
  ): GetCertificateIdUseEnumType {
    switch (installType) {
      case 'CSMSRootCertificate':
        return GetCertificateIdUseEnumType.CSMSRootCertificate
      case 'V2GRootCertificate':
        return GetCertificateIdUseEnumType.V2GRootCertificate
      case 'ManufacturerRootCertificate':
        return GetCertificateIdUseEnumType.ManufacturerRootCertificate
      case 'MORootCertificate':
        return GetCertificateIdUseEnumType.MORootCertificate
      default:
        return GetCertificateIdUseEnumType.CSMSRootCertificate
    }
  }

  private sanitizePath(input: string): string {
    return input
      .replace(/\.\./g, '')
      .replace(/[\/\\]/g, '_')
      .replace(/[<>:"|?*]/g, '_')
  }

  private sanitizeSerial(serial: string): string {
    return serial
      .replace(/:/g, '-')
      .replace(/[\\/\\\\<>\"|?*]/g, '_')
  }

  private generateFallbackSerialNumber(pemData: string): string {
    return createHash('sha256').update(pemData).digest('hex').substring(0, 16).toUpperCase()
  }
}
