/**
 * @file Tests for OCPP20CertificateManager
 * @description Unit tests for OCPP 2.0 certificate management and validation
 */

import { expect } from '@std/expect'
import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { OCPP20CertificateManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20CertificateManager.js'
import {
  type CertificateHashDataType,
  HashAlgorithmEnumType,
  InstallCertificateUseEnumType,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  EMPTY_PEM_CERTIFICATE,
  INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
  INVALID_PEM_WRONG_MARKERS,
  VALID_PEM_CERTIFICATE_EXTENDED,
} from './OCPP20CertificateTestData.js'

const TEST_STATION_HASH_ID = 'test-station-hash-12345'
const TEST_CERT_TYPE = InstallCertificateUseEnumType.CSMSRootCertificate

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
    standardCleanup()
  })

  await describe('storeCertificate', async () => {
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })

    await it('should store a valid PEM certificate to the correct path', async () => {
      const result = await manager.storeCertificate(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        VALID_PEM_CERTIFICATE_EXTENDED
      )

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.filePath).toContain(TEST_STATION_HASH_ID)
      expect(result.filePath).toContain('certs')
      expect(result.filePath).toMatch(/\.pem$/)
    })

    await it('should reject invalid PEM certificate without BEGIN/END markers', async () => {
      const result = await manager.storeCertificate(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        INVALID_PEM_CERTIFICATE_MISSING_MARKERS
      )

      expect(result).toBeDefined()
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid PEM format')
    })

    await it('should reject empty certificate data', async () => {
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
      const result = await manager.storeCertificate(
        TEST_STATION_HASH_ID,
        InstallCertificateUseEnumType.V2GRootCertificate,
        VALID_PEM_CERTIFICATE_EXTENDED
      )

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.filePath).toContain('V2GRootCertificate')
    })
  })

  await describe('deleteCertificate', async () => {
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })
    await it('should delete certificate by hash data', async () => {
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
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })
    await it('should return list of installed certificates for station', async () => {
      const result = await manager.getInstalledCertificates(TEST_STATION_HASH_ID)

      expect(result).toBeDefined()
      expect(Array.isArray(result.certificateHashDataChain)).toBe(true)
    })

    await it('should filter certificates by type when filter provided', async () => {
      const filterTypes = [InstallCertificateUseEnumType.CSMSRootCertificate]
      const result = await manager.getInstalledCertificates(TEST_STATION_HASH_ID, filterTypes)

      expect(result).toBeDefined()
      expect(Array.isArray(result.certificateHashDataChain)).toBe(true)
    })

    await it('should return empty list when no certificates installed', async () => {
      const result = await manager.getInstalledCertificates('empty-station-hash-id')

      expect(result).toBeDefined()
      expect(result.certificateHashDataChain).toHaveLength(0)
    })

    await it('should support multiple certificate type filters', async () => {
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
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })
    await it('should compute hash data for valid PEM certificate', () => {
      const hashData = manager.computeCertificateHash(VALID_PEM_CERTIFICATE_EXTENDED)

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
      const hashData = manager.computeCertificateHash(VALID_PEM_CERTIFICATE_EXTENDED)

      const hexPattern = /^[a-fA-F0-9]+$/
      expect(hashData.issuerNameHash).toMatch(hexPattern)
      expect(hashData.issuerKeyHash).toMatch(hexPattern)
    })

    await it('should throw error for invalid PEM certificate', () => {
      expect(() => {
        manager.computeCertificateHash(INVALID_PEM_CERTIFICATE_MISSING_MARKERS)
      }).toThrow()
    })

    await it('should throw error for empty certificate', () => {
      expect(() => {
        manager.computeCertificateHash(EMPTY_PEM_CERTIFICATE)
      }).toThrow()
    })

    await it('should support SHA384 hash algorithm', () => {
      const hashData = manager.computeCertificateHash(
        VALID_PEM_CERTIFICATE_EXTENDED,
        HashAlgorithmEnumType.SHA384
      )

      expect(hashData).toBeDefined()
      expect(hashData.hashAlgorithm).toBe(HashAlgorithmEnumType.SHA384)
    })

    await it('should support SHA512 hash algorithm', () => {
      const hashData = manager.computeCertificateHash(
        VALID_PEM_CERTIFICATE_EXTENDED,
        HashAlgorithmEnumType.SHA512
      )

      expect(hashData).toBeDefined()
      expect(hashData.hashAlgorithm).toBe(HashAlgorithmEnumType.SHA512)
    })
  })

  await describe('validateCertificateFormat', async () => {
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })
    await it('should return true for valid PEM certificate', () => {
      const isValid = manager.validateCertificateFormat(VALID_PEM_CERTIFICATE_EXTENDED)

      expect(isValid).toBe(true)
    })

    await it('should return false for certificate without BEGIN marker', () => {
      const isValid = manager.validateCertificateFormat(INVALID_PEM_CERTIFICATE_MISSING_MARKERS)

      expect(isValid).toBe(false)
    })

    await it('should return false for certificate with wrong markers', () => {
      const isValid = manager.validateCertificateFormat(INVALID_PEM_WRONG_MARKERS)

      expect(isValid).toBe(false)
    })

    await it('should return false for empty string', () => {
      const isValid = manager.validateCertificateFormat(EMPTY_PEM_CERTIFICATE)

      expect(isValid).toBe(false)
    })

    await it('should return false for null/undefined input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid null input
      expect(manager.validateCertificateFormat(null as any)).toBe(false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid undefined input
      expect(manager.validateCertificateFormat(undefined as any)).toBe(false)
    })

    await it('should return true for certificate with extra whitespace', () => {
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
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })
    await it('should return correct file path for certificate', () => {
      const path = manager.getCertificatePath(TEST_STATION_HASH_ID, TEST_CERT_TYPE, 'SERIAL-12345')

      expect(path).toBeDefined()
      expect(path).toContain(TEST_STATION_HASH_ID)
      expect(path).toContain('certs')
      expect(path).toContain('CSMSRootCertificate')
      expect(path).toContain('SERIAL-12345')
      expect(path).toMatch(/\.pem$/)
    })

    await it('should handle special characters in serial number', () => {
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
      const path = manager.getCertificatePath(TEST_STATION_HASH_ID, TEST_CERT_TYPE, 'SERIAL-12345')

      expect(path).toMatch(/configurations/)
      expect(path).toMatch(/certs/)
      expect(path).toMatch(/\.pem$/)
    })
  })

  await describe('Edge cases and error handling', async () => {
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })
    await it('should handle concurrent certificate operations', async () => {
      const results = await Promise.all([
        manager.storeCertificate(
          TEST_STATION_HASH_ID,
          InstallCertificateUseEnumType.CSMSRootCertificate,
          VALID_PEM_CERTIFICATE_EXTENDED
        ),
        manager.storeCertificate(
          TEST_STATION_HASH_ID,
          InstallCertificateUseEnumType.V2GRootCertificate,
          VALID_PEM_CERTIFICATE_EXTENDED
        ),
        manager.getInstalledCertificates(TEST_STATION_HASH_ID),
      ])

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toBeDefined()
      })
    })

    await it('should handle very long certificate chains', async () => {
      const longChain = Array(5).fill(VALID_PEM_CERTIFICATE_EXTENDED).join('\n')

      const result = await manager.storeCertificate(TEST_STATION_HASH_ID, TEST_CERT_TYPE, longChain)

      expect(result).toBeDefined()
    })

    await it('should sanitize station hash ID for filesystem safety', () => {
      const maliciousHashId = '../../../etc/passwd'

      const path = manager.getCertificatePath(maliciousHashId, TEST_CERT_TYPE, 'SERIAL-001')

      expect(path).not.toContain('..')
    })
  })
})
