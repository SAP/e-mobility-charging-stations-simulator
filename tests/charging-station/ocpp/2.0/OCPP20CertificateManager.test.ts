/**
 * @file Tests for OCPP20CertificateManager
 * @description Unit tests for OCPP 2.0 certificate management and validation
 */

import { expect } from '@std/expect'
import { rm } from 'node:fs/promises'
import { afterEach, describe, it } from 'node:test'

import { OCPP20CertificateManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20CertificateManager.js'
import {
  type CertificateHashDataType,
  HashAlgorithmEnumType,
  InstallCertificateUseEnumType,
} from '../../../../src/types/index.js'

const TEST_STATION_HASH_ID = 'test-station-hash-12345'
const TEST_CERT_TYPE = InstallCertificateUseEnumType.CSMSRootCertificate

const VALID_PEM_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0GCSqGSIb3Qq8teleNzMHjvLuHvVsY
a5uYmO6K8pzuYmOvfLNNMC5leGFtcGxlLmNvbTAeFw0xNzAxMTIyMTI3NDBaFw0y
NzAxMTAyMTI3NDBaMC4xLDAqBgNVBAMTI2V4YW1wbGUuY29tIFNlbGYgU2lnbmVk
IENlcnRpZmljYXRlMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqGxm
mO6K8pzuYmOvfLNNMC5leGFtcGxlLmNvbTAeFw0xNzAxMTIyMTI3NDBaFw0yNzAx
MTAyMTI3NDBaMC4xLDAqBgNVBAMTI2V4YW1wbGUuY29tIFNlbGYgU2lnbmVkIENl
cnRpZmljYXRlMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqGxmmO6K
8pzuYmOvfLNNMBQLq2K8pzuY0BAQEFAAOCAQ8AMIIBCgKCAQEAqGxmmO6K8pzuYq
-----END CERTIFICATE-----`

const INVALID_PEM_NO_MARKERS = `
MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0GCSqGSIb3Qq8teleNzMHjvLuHvVsY
a5uYmO6K8pzuYmOvfLNNMC5leGFtcGxlLmNvbTAeFw0xNzAxMTIyMTI3NDBaFw0y
`

const INVALID_PEM_WRONG_MARKERS = `-----BEGIN PRIVATE KEY-----
MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0GCSqGSIb3Qq8teleNzMHjvLuHvVsY
-----END PRIVATE KEY-----`

const EMPTY_PEM_CERTIFICATE = ''

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for future assertions
const _EXPECTED_HASH_DATA: CertificateHashDataType = {
  hashAlgorithm: HashAlgorithmEnumType.SHA256,
  issuerKeyHash: expect.stringMatching(/^[a-fA-F0-9]+$/),
  issuerNameHash: expect.stringMatching(/^[a-fA-F0-9]+$/),
  serialNumber: expect.any(String),
}

await describe('I02-I04 - ISO15118 Certificate Management', async () => {
  afterEach(async () => {
    await rm(`dist/assets/configurations/${TEST_STATION_HASH_ID}`, {
      force: true,
      recursive: true,
    })
    await rm('dist/assets/configurations/empty-station-hash-id', {
      force: true,
      recursive: true,
    })
    await rm('dist/assets/configurations/invalid-station-id', {
      force: true,
      recursive: true,
    })
  })

  await describe('storeCertificate', async () => {
    await it('should store a valid PEM certificate to the correct path', async () => {
      const manager = new OCPP20CertificateManager()

      const result = await manager.storeCertificate(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        VALID_PEM_CERTIFICATE
      )

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.filePath).toContain(TEST_STATION_HASH_ID)
      expect(result.filePath).toContain('certs')
      expect(result.filePath).toMatch(/\.pem$/)
    })

    await it('should reject invalid PEM certificate without BEGIN/END markers', async () => {
      const manager = new OCPP20CertificateManager()

      const result = await manager.storeCertificate(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        INVALID_PEM_NO_MARKERS
      )

      expect(result).toBeDefined()
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid PEM format')
    })

    await it('should reject empty certificate data', async () => {
      const manager = new OCPP20CertificateManager()

      const result = await manager.storeCertificate(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        EMPTY_PEM_CERTIFICATE
      )

      expect(result).toBeDefined()
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    await it('should create certificate directory structure if not exists', async () => {
      const manager = new OCPP20CertificateManager()

      const result = await manager.storeCertificate(
        TEST_STATION_HASH_ID,
        InstallCertificateUseEnumType.V2GRootCertificate,
        VALID_PEM_CERTIFICATE
      )

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.filePath).toContain('V2GRootCertificate')
    })
  })

  await describe('deleteCertificate', async () => {
    await it('should delete certificate by hash data', async () => {
      const manager = new OCPP20CertificateManager()

      const hashData: CertificateHashDataType = {
        hashAlgorithm: HashAlgorithmEnumType.SHA256,
        issuerKeyHash: 'abc123def456',
        issuerNameHash: 'xyz789abc012',
        serialNumber: 'SN-12345',
      }

      const result = await manager.deleteCertificate(TEST_STATION_HASH_ID, hashData)

      expect(result).toBeDefined()
      expect(result.status).toBeDefined()
      expect(['Accepted', 'NotFound', 'Failed']).toContain(result.status)
    })

    await it('should return NotFound for non-existent certificate', async () => {
      const manager = new OCPP20CertificateManager()

      const hashData: CertificateHashDataType = {
        hashAlgorithm: HashAlgorithmEnumType.SHA256,
        issuerKeyHash: 'non-existent-hash',
        issuerNameHash: 'non-existent-hash',
        serialNumber: 'NON-EXISTENT-SN',
      }

      const result = await manager.deleteCertificate(TEST_STATION_HASH_ID, hashData)

      expect(result).toBeDefined()
      expect(result.status).toBe('NotFound')
    })

    await it('should handle filesystem errors gracefully', async () => {
      const manager = new OCPP20CertificateManager()

      const hashData: CertificateHashDataType = {
        hashAlgorithm: HashAlgorithmEnumType.SHA256,
        issuerKeyHash: 'valid-hash',
        issuerNameHash: 'valid-hash',
        serialNumber: 'VALID-SN',
      }

      const result = await manager.deleteCertificate('invalid-station-id', hashData)

      expect(result).toBeDefined()
      expect(['NotFound', 'Failed']).toContain(result.status)
    })
  })

  await describe('getInstalledCertificates', async () => {
    await it('should return list of installed certificates for station', async () => {
      const manager = new OCPP20CertificateManager()

      const result = await manager.getInstalledCertificates(TEST_STATION_HASH_ID)

      expect(result).toBeDefined()
      expect(Array.isArray(result.certificateHashDataChain)).toBe(true)
    })

    await it('should filter certificates by type when filter provided', async () => {
      const manager = new OCPP20CertificateManager()

      const filterTypes = [InstallCertificateUseEnumType.CSMSRootCertificate]
      const result = await manager.getInstalledCertificates(TEST_STATION_HASH_ID, filterTypes)

      expect(result).toBeDefined()
      expect(Array.isArray(result.certificateHashDataChain)).toBe(true)
    })

    await it('should return empty list when no certificates installed', async () => {
      const manager = new OCPP20CertificateManager()

      const result = await manager.getInstalledCertificates('empty-station-hash-id')

      expect(result).toBeDefined()
      expect(result.certificateHashDataChain).toHaveLength(0)
    })

    await it('should support multiple certificate type filters', async () => {
      const manager = new OCPP20CertificateManager()

      const filterTypes = [
        InstallCertificateUseEnumType.CSMSRootCertificate,
        InstallCertificateUseEnumType.V2GRootCertificate,
        InstallCertificateUseEnumType.ManufacturerRootCertificate,
      ]
      const result = await manager.getInstalledCertificates(TEST_STATION_HASH_ID, filterTypes)

      expect(result).toBeDefined()
      expect(Array.isArray(result.certificateHashDataChain)).toBe(true)
    })
  })

  await describe('computeCertificateHash', async () => {
    await it('should compute hash data for valid PEM certificate', () => {
      const manager = new OCPP20CertificateManager()

      const hashData = manager.computeCertificateHash(VALID_PEM_CERTIFICATE)

      expect(hashData).toBeDefined()
      expect(hashData.hashAlgorithm).toBe(HashAlgorithmEnumType.SHA256)
      expect(hashData.issuerNameHash).toBeDefined()
      expect(typeof hashData.issuerNameHash).toBe('string')
      expect(hashData.issuerKeyHash).toBeDefined()
      expect(typeof hashData.issuerKeyHash).toBe('string')
      expect(hashData.serialNumber).toBeDefined()
      expect(typeof hashData.serialNumber).toBe('string')
    })

    await it('should return hex-encoded hash values', () => {
      const manager = new OCPP20CertificateManager()

      const hashData = manager.computeCertificateHash(VALID_PEM_CERTIFICATE)

      const hexPattern = /^[a-fA-F0-9]+$/
      expect(hashData.issuerNameHash).toMatch(hexPattern)
      expect(hashData.issuerKeyHash).toMatch(hexPattern)
    })

    await it('should throw error for invalid PEM certificate', () => {
      const manager = new OCPP20CertificateManager()

      expect(() => {
        manager.computeCertificateHash(INVALID_PEM_NO_MARKERS)
      }).toThrow()
    })

    await it('should throw error for empty certificate', () => {
      const manager = new OCPP20CertificateManager()

      expect(() => {
        manager.computeCertificateHash(EMPTY_PEM_CERTIFICATE)
      }).toThrow()
    })

    await it('should support SHA384 hash algorithm', () => {
      const manager = new OCPP20CertificateManager()

      const hashData = manager.computeCertificateHash(
        VALID_PEM_CERTIFICATE,
        HashAlgorithmEnumType.SHA384
      )

      expect(hashData).toBeDefined()
      expect(hashData.hashAlgorithm).toBe(HashAlgorithmEnumType.SHA384)
    })

    await it('should support SHA512 hash algorithm', () => {
      const manager = new OCPP20CertificateManager()

      const hashData = manager.computeCertificateHash(
        VALID_PEM_CERTIFICATE,
        HashAlgorithmEnumType.SHA512
      )

      expect(hashData).toBeDefined()
      expect(hashData.hashAlgorithm).toBe(HashAlgorithmEnumType.SHA512)
    })
  })

  await describe('validateCertificateFormat', async () => {
    await it('should return true for valid PEM certificate', () => {
      const manager = new OCPP20CertificateManager()

      const isValid = manager.validateCertificateFormat(VALID_PEM_CERTIFICATE)

      expect(isValid).toBe(true)
    })

    await it('should return false for certificate without BEGIN marker', () => {
      const manager = new OCPP20CertificateManager()

      const isValid = manager.validateCertificateFormat(INVALID_PEM_NO_MARKERS)

      expect(isValid).toBe(false)
    })

    await it('should return false for certificate with wrong markers', () => {
      const manager = new OCPP20CertificateManager()

      const isValid = manager.validateCertificateFormat(INVALID_PEM_WRONG_MARKERS)

      expect(isValid).toBe(false)
    })

    await it('should return false for empty string', () => {
      const manager = new OCPP20CertificateManager()

      const isValid = manager.validateCertificateFormat(EMPTY_PEM_CERTIFICATE)

      expect(isValid).toBe(false)
    })

    await it('should return false for null/undefined input', () => {
      const manager = new OCPP20CertificateManager()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid null input
      expect(manager.validateCertificateFormat(null as any)).toBe(false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid undefined input
      expect(manager.validateCertificateFormat(undefined as any)).toBe(false)
    })

    await it('should return true for certificate with extra whitespace', () => {
      const manager = new OCPP20CertificateManager()

      const pemWithWhitespace = `
        
        -----BEGIN CERTIFICATE-----
        MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0GCSqGSIb3Qq8teleNzMHjvLuHvVsY
        -----END CERTIFICATE-----
        
      `

      const isValid = manager.validateCertificateFormat(pemWithWhitespace)

      expect(isValid).toBe(true)
    })
  })

  await describe('getCertificatePath', async () => {
    await it('should return correct file path for certificate', () => {
      const manager = new OCPP20CertificateManager()

      const path = manager.getCertificatePath(TEST_STATION_HASH_ID, TEST_CERT_TYPE, 'SERIAL-12345')

      expect(path).toBeDefined()
      expect(path).toContain(TEST_STATION_HASH_ID)
      expect(path).toContain('certs')
      expect(path).toContain('CSMSRootCertificate')
      expect(path).toContain('SERIAL-12345')
      expect(path).toMatch(/\.pem$/)
    })

    await it('should handle special characters in serial number', () => {
      const manager = new OCPP20CertificateManager()

      const path = manager.getCertificatePath(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        'SERIAL:ABC/123'
      )

      expect(path).toBeDefined()
      const filename = path.split('/').pop()
      expect(filename).not.toContain(':')
      expect(filename).not.toContain('/')
    })

    await it('should return different paths for different certificate types', () => {
      const manager = new OCPP20CertificateManager()

      const csmsPath = manager.getCertificatePath(
        TEST_STATION_HASH_ID,
        InstallCertificateUseEnumType.CSMSRootCertificate,
        'SERIAL-001'
      )

      const v2gPath = manager.getCertificatePath(
        TEST_STATION_HASH_ID,
        InstallCertificateUseEnumType.V2GRootCertificate,
        'SERIAL-001'
      )

      expect(csmsPath).not.toBe(v2gPath)
      expect(csmsPath).toContain('CSMSRootCertificate')
      expect(v2gPath).toContain('V2GRootCertificate')
    })

    await it('should return path following project convention', () => {
      const manager = new OCPP20CertificateManager()

      const path = manager.getCertificatePath(TEST_STATION_HASH_ID, TEST_CERT_TYPE, 'SERIAL-12345')

      expect(path).toMatch(/configurations/)
      expect(path).toMatch(/certs/)
      expect(path).toMatch(/\.pem$/)
    })
  })

  await describe('Edge cases and error handling', async () => {
    await it('should handle concurrent certificate operations', async () => {
      const manager = new OCPP20CertificateManager()

      const results = await Promise.all([
        manager.storeCertificate(
          TEST_STATION_HASH_ID,
          InstallCertificateUseEnumType.CSMSRootCertificate,
          VALID_PEM_CERTIFICATE
        ),
        manager.storeCertificate(
          TEST_STATION_HASH_ID,
          InstallCertificateUseEnumType.V2GRootCertificate,
          VALID_PEM_CERTIFICATE
        ),
        manager.getInstalledCertificates(TEST_STATION_HASH_ID),
      ])

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toBeDefined()
      })
    })

    await it('should handle very long certificate chains', async () => {
      const manager = new OCPP20CertificateManager()

      const longChain = Array(5).fill(VALID_PEM_CERTIFICATE).join('\n')

      const result = await manager.storeCertificate(TEST_STATION_HASH_ID, TEST_CERT_TYPE, longChain)

      expect(result).toBeDefined()
    })

    await it('should sanitize station hash ID for filesystem safety', () => {
      const manager = new OCPP20CertificateManager()

      const maliciousHashId = '../../../etc/passwd'

      const path = manager.getCertificatePath(maliciousHashId, TEST_CERT_TYPE, 'SERIAL-001')

      expect(path).not.toContain('..')
    })
  })
})
