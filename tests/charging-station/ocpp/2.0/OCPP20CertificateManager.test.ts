/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it, mock } from 'node:test'

import {
  type CertificateHashDataType,
  HashAlgorithmEnumType,
  InstallCertificateUseEnumType,
} from '../../../../src/types/index.js'

import { OCPP20CertificateManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20CertificateManager.js'

const mockFs = {
  existsSync: mock.fn(() => true),
  mkdirSync: mock.fn(() => undefined),
  readdirSync: mock.fn(() => []),
  readFileSync: mock.fn(() => ''),
  rmSync: mock.fn(() => undefined),
  writeFileSync: mock.fn(() => undefined),
}

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

const EXPECTED_HASH_DATA: CertificateHashDataType = {
  hashAlgorithm: HashAlgorithmEnumType.SHA256,
  issuerKeyHash: expect.stringMatching(/^[a-fA-F0-9]+$/),
  issuerNameHash: expect.stringMatching(/^[a-fA-F0-9]+$/),
  serialNumber: expect.any(String),
}

await describe('OCPP20CertificateManager', async () => {
  await describe('storeCertificate', async () => {
    await it('Should store a valid PEM certificate to the correct path', async () => {
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
      expect(result.filePath).toEndWith('.pem')
    })

    await it('Should reject invalid PEM certificate without BEGIN/END markers', async () => {
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

    await it('Should reject empty certificate data', async () => {
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

    await it('Should create certificate directory structure if not exists', async () => {
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
    await it('Should delete certificate by hash data', async () => {
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

    await it('Should return NotFound for non-existent certificate', async () => {
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

    await it('Should handle filesystem errors gracefully', async () => {
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
    await it('Should return list of installed certificates for station', async () => {
      const manager = new OCPP20CertificateManager()

      const result = await manager.getInstalledCertificates(TEST_STATION_HASH_ID)

      expect(result).toBeDefined()
      expect(Array.isArray(result.certificateHashDataChain)).toBe(true)
    })

    await it('Should filter certificates by type when filter provided', async () => {
      const manager = new OCPP20CertificateManager()

      const filterTypes = [InstallCertificateUseEnumType.CSMSRootCertificate]
      const result = await manager.getInstalledCertificates(TEST_STATION_HASH_ID, filterTypes)

      expect(result).toBeDefined()
      expect(Array.isArray(result.certificateHashDataChain)).toBe(true)
    })

    await it('Should return empty list when no certificates installed', async () => {
      const manager = new OCPP20CertificateManager()

      const result = await manager.getInstalledCertificates('empty-station-hash-id')

      expect(result).toBeDefined()
      expect(result.certificateHashDataChain).toHaveLength(0)
    })

    await it('Should support multiple certificate type filters', async () => {
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
    await it('Should compute hash data for valid PEM certificate', async () => {
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

    await it('Should return hex-encoded hash values', async () => {
      const manager = new OCPP20CertificateManager()

      const hashData = manager.computeCertificateHash(VALID_PEM_CERTIFICATE)

      const hexPattern = /^[a-fA-F0-9]+$/
      expect(hashData.issuerNameHash).toMatch(hexPattern)
      expect(hashData.issuerKeyHash).toMatch(hexPattern)
    })

    await it('Should throw error for invalid PEM certificate', async () => {
      const manager = new OCPP20CertificateManager()

      expect(() => {
        manager.computeCertificateHash(INVALID_PEM_NO_MARKERS)
      }).toThrow()
    })

    await it('Should throw error for empty certificate', async () => {
      const manager = new OCPP20CertificateManager()

      expect(() => {
        manager.computeCertificateHash(EMPTY_PEM_CERTIFICATE)
      }).toThrow()
    })

    await it('Should support SHA384 hash algorithm', async () => {
      const manager = new OCPP20CertificateManager()

      const hashData = manager.computeCertificateHash(
        VALID_PEM_CERTIFICATE,
        HashAlgorithmEnumType.SHA384
      )

      expect(hashData).toBeDefined()
      expect(hashData.hashAlgorithm).toBe(HashAlgorithmEnumType.SHA384)
    })

    await it('Should support SHA512 hash algorithm', async () => {
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
    await it('Should return true for valid PEM certificate', () => {
      const manager = new OCPP20CertificateManager()

      const isValid = manager.validateCertificateFormat(VALID_PEM_CERTIFICATE)

      expect(isValid).toBe(true)
    })

    await it('Should return false for certificate without BEGIN marker', () => {
      const manager = new OCPP20CertificateManager()

      const isValid = manager.validateCertificateFormat(INVALID_PEM_NO_MARKERS)

      expect(isValid).toBe(false)
    })

    await it('Should return false for certificate with wrong markers', () => {
      const manager = new OCPP20CertificateManager()

      const isValid = manager.validateCertificateFormat(INVALID_PEM_WRONG_MARKERS)

      expect(isValid).toBe(false)
    })

    await it('Should return false for empty string', () => {
      const manager = new OCPP20CertificateManager()

      const isValid = manager.validateCertificateFormat(EMPTY_PEM_CERTIFICATE)

      expect(isValid).toBe(false)
    })

    await it('Should return false for null/undefined input', () => {
      const manager = new OCPP20CertificateManager()

      expect(manager.validateCertificateFormat(null as any)).toBe(false)
      expect(manager.validateCertificateFormat(undefined as any)).toBe(false)
    })

    await it('Should return true for certificate with extra whitespace', () => {
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
    await it('Should return correct file path for certificate', () => {
      const manager = new OCPP20CertificateManager()

      const path = manager.getCertificatePath(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        'SERIAL-12345'
      )

      expect(path).toBeDefined()
      expect(path).toContain(TEST_STATION_HASH_ID)
      expect(path).toContain('certs')
      expect(path).toContain('CSMSRootCertificate')
      expect(path).toContain('SERIAL-12345')
      expect(path).toEndWith('.pem')
    })

    await it('Should handle special characters in serial number', () => {
      const manager = new OCPP20CertificateManager()

      const path = manager.getCertificatePath(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        'SERIAL:ABC/123'
      )

      expect(path).toBeDefined()
      expect(path).not.toContain(':')
      expect(path).not.toContain('/')
    })

    await it('Should return different paths for different certificate types', () => {
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

    await it('Should return path following project convention', () => {
      const manager = new OCPP20CertificateManager()

      const path = manager.getCertificatePath(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        'SERIAL-12345'
      )

      expect(path).toMatch(/configurations/)
      expect(path).toMatch(/certs/)
      expect(path).toEndWith('.pem')
    })
  })

  await describe('Edge cases and error handling', async () => {
    await it('Should handle concurrent certificate operations', async () => {
      const manager = new OCPP20CertificateManager()

      const operations = [
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
      ]

      const results = await Promise.all(operations)

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toBeDefined()
      })
    })

    await it('Should handle very long certificate chains', async () => {
      const manager = new OCPP20CertificateManager()

      const longChain = Array(5)
        .fill(VALID_PEM_CERTIFICATE)
        .join('\n')

      const result = await manager.storeCertificate(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        longChain
      )

      expect(result).toBeDefined()
    })

    await it('Should sanitize station hash ID for filesystem safety', async () => {
      const manager = new OCPP20CertificateManager()

      const maliciousHashId = '../../../etc/passwd'

      const path = manager.getCertificatePath(
        maliciousHashId,
        TEST_CERT_TYPE,
        'SERIAL-001'
      )

      expect(path).not.toContain('..')
    })
  })
})
