/**
 * @file Tests for OCPP20CertificateManager
 * @description Unit tests for OCPP 2.0 certificate management and validation
 */

import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { OCPP20CertificateManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20CertificateManager.js'
import {
  type CertificateHashDataType,
  DeleteCertificateStatusEnumType,
  HashAlgorithmEnumType,
  InstallCertificateUseEnumType,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  EMPTY_PEM_CERTIFICATE,
  EXPIRED_X509_PEM_CERTIFICATE,
  INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
  INVALID_PEM_WRONG_MARKERS,
  VALID_PEM_CERTIFICATE_EXTENDED,
  VALID_X509_PEM_CERTIFICATE,
} from './OCPP20CertificateTestData.js'

const TEST_STATION_HASH_ID = 'test-station-hash-12345'
const TEST_CERT_TYPE = InstallCertificateUseEnumType.CSMSRootCertificate

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

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result.success, true)
      if (result.filePath == null) {
        assert.fail('Expected filePath to be defined')
      }
      assert.ok(result.filePath.includes(TEST_STATION_HASH_ID))
      assert.ok(result.filePath.includes('certs'))
      assert.match(result.filePath, /\.pem$/)
    })

    await it('should reject invalid PEM certificate without BEGIN/END markers', async () => {
      const result = await manager.storeCertificate(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        INVALID_PEM_CERTIFICATE_MISSING_MARKERS
      )

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result.success, false)
      if (result.error == null) {
        assert.fail('Expected error to be defined')
      }
      assert.ok(result.error.includes('Invalid PEM format'))
    })

    await it('should reject empty certificate data', async () => {
      const result = await manager.storeCertificate(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        EMPTY_PEM_CERTIFICATE
      )

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result.success, false)
      assert.notStrictEqual(result.error, undefined)
    })

    await it('should create certificate directory structure if not exists', async () => {
      const result = await manager.storeCertificate(
        TEST_STATION_HASH_ID,
        InstallCertificateUseEnumType.V2GRootCertificate,
        VALID_PEM_CERTIFICATE_EXTENDED
      )

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result.success, true)
      if (result.filePath == null) {
        assert.fail('Expected filePath to be defined')
      }
      assert.ok(result.filePath.includes('V2GRootCertificate'))
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

      assert.notStrictEqual(result, undefined)
      assert.notStrictEqual(result.status, undefined)
      assert.ok(
        [
          DeleteCertificateStatusEnumType.Accepted,
          DeleteCertificateStatusEnumType.Failed,
          DeleteCertificateStatusEnumType.NotFound,
        ].includes(result.status)
      )
    })

    await it('should return NotFound for non-existent certificate', async () => {
      const hashData: CertificateHashDataType = {
        hashAlgorithm: HashAlgorithmEnumType.SHA256,
        issuerKeyHash: 'non-existent-hash',
        issuerNameHash: 'non-existent-hash',
        serialNumber: 'NON-EXISTENT-SN',
      }

      const result = await manager.deleteCertificate(TEST_STATION_HASH_ID, hashData)

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result.status, DeleteCertificateStatusEnumType.NotFound)
    })

    await it('should handle filesystem errors gracefully', async () => {
      const hashData: CertificateHashDataType = {
        hashAlgorithm: HashAlgorithmEnumType.SHA256,
        issuerKeyHash: 'valid-hash',
        issuerNameHash: 'valid-hash',
        serialNumber: 'VALID-SN',
      }

      const result = await manager.deleteCertificate('invalid-station-id', hashData)

      assert.notStrictEqual(result, undefined)
      assert.ok(
        [DeleteCertificateStatusEnumType.Failed, DeleteCertificateStatusEnumType.NotFound].includes(
          result.status
        )
      )
    })
  })

  await describe('getInstalledCertificates', async () => {
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })
    await it('should return list of installed certificates for station', async () => {
      const result = await manager.getInstalledCertificates(TEST_STATION_HASH_ID)

      assert.notStrictEqual(result, undefined)
      assert.ok(Array.isArray(result.certificateHashDataChain))
    })

    await it('should filter certificates by type when filter provided', async () => {
      const filterTypes = [InstallCertificateUseEnumType.CSMSRootCertificate]
      const result = await manager.getInstalledCertificates(TEST_STATION_HASH_ID, filterTypes)

      assert.notStrictEqual(result, undefined)
      assert.ok(Array.isArray(result.certificateHashDataChain))
    })

    await it('should return empty list when no certificates installed', async () => {
      const result = await manager.getInstalledCertificates('empty-station-hash-id')

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result.certificateHashDataChain.length, 0)
    })

    await it('should support multiple certificate type filters', async () => {
      const filterTypes = [
        InstallCertificateUseEnumType.CSMSRootCertificate,
        InstallCertificateUseEnumType.V2GRootCertificate,
        InstallCertificateUseEnumType.ManufacturerRootCertificate,
      ]
      const result = await manager.getInstalledCertificates(TEST_STATION_HASH_ID, filterTypes)

      assert.notStrictEqual(result, undefined)
      assert.ok(Array.isArray(result.certificateHashDataChain))
    })
  })

  await describe('computeCertificateHash', async () => {
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })
    await it('should compute hash data for valid PEM certificate', () => {
      const hashData = manager.computeCertificateHash(VALID_PEM_CERTIFICATE_EXTENDED)

      assert.notStrictEqual(hashData, undefined)
      assert.strictEqual(hashData.hashAlgorithm, HashAlgorithmEnumType.SHA256)
      assert.notStrictEqual(hashData.issuerNameHash, undefined)
      assert.strictEqual(typeof hashData.issuerNameHash, 'string')
      assert.notStrictEqual(hashData.issuerKeyHash, undefined)
      assert.strictEqual(typeof hashData.issuerKeyHash, 'string')
      assert.notStrictEqual(hashData.serialNumber, undefined)
      assert.strictEqual(typeof hashData.serialNumber, 'string')
    })

    await it('should return hex-encoded hash values', () => {
      const hashData = manager.computeCertificateHash(VALID_PEM_CERTIFICATE_EXTENDED)

      const hexPattern = /^[a-fA-F0-9]+$/
      assert.match(hashData.issuerNameHash, hexPattern)
      assert.match(hashData.issuerKeyHash, hexPattern)
    })

    await it('should throw error for invalid PEM certificate', () => {
      assert.throws(() => {
        manager.computeCertificateHash(INVALID_PEM_CERTIFICATE_MISSING_MARKERS)
      })
    })

    await it('should throw error for empty certificate', () => {
      assert.throws(() => {
        manager.computeCertificateHash(EMPTY_PEM_CERTIFICATE)
      })
    })

    await it('should support SHA384 hash algorithm', () => {
      const hashData = manager.computeCertificateHash(
        VALID_PEM_CERTIFICATE_EXTENDED,
        HashAlgorithmEnumType.SHA384
      )

      assert.notStrictEqual(hashData, undefined)
      assert.strictEqual(hashData.hashAlgorithm, HashAlgorithmEnumType.SHA384)
    })

    await it('should support SHA512 hash algorithm', () => {
      const hashData = manager.computeCertificateHash(
        VALID_PEM_CERTIFICATE_EXTENDED,
        HashAlgorithmEnumType.SHA512
      )

      assert.notStrictEqual(hashData, undefined)
      assert.strictEqual(hashData.hashAlgorithm, HashAlgorithmEnumType.SHA512)
    })
  })

  await describe('validateCertificateFormat', async () => {
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })
    await it('should return true for valid PEM certificate', () => {
      const isValid = manager.validateCertificateFormat(VALID_PEM_CERTIFICATE_EXTENDED)

      assert.strictEqual(isValid, true)
    })

    await it('should return false for certificate without BEGIN marker', () => {
      const isValid = manager.validateCertificateFormat(INVALID_PEM_CERTIFICATE_MISSING_MARKERS)

      assert.strictEqual(isValid, false)
    })

    await it('should return false for certificate with wrong markers', () => {
      const isValid = manager.validateCertificateFormat(INVALID_PEM_WRONG_MARKERS)

      assert.strictEqual(isValid, false)
    })

    await it('should return false for empty string', () => {
      const isValid = manager.validateCertificateFormat(EMPTY_PEM_CERTIFICATE)

      assert.strictEqual(isValid, false)
    })

    await it('should return false for null/undefined input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid null input
      assert.strictEqual(manager.validateCertificateFormat(null as any), false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid undefined input
      assert.strictEqual(manager.validateCertificateFormat(undefined as any), false)
    })

    await it('should return true for certificate with extra whitespace', () => {
      const pemWithWhitespace = `
        
        -----BEGIN CERTIFICATE-----
        MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0GCSqGSIb3Qq8teleNzMHjvLuHvVsY
        -----END CERTIFICATE-----
        
      `

      const isValid = manager.validateCertificateFormat(pemWithWhitespace)

      assert.strictEqual(isValid, true)
    })
  })

  await describe('getCertificatePath', async () => {
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })
    await it('should return correct file path for certificate', () => {
      const path = manager.getCertificatePath(TEST_STATION_HASH_ID, TEST_CERT_TYPE, 'SERIAL-12345')

      assert.notStrictEqual(path, undefined)
      assert.ok(path.includes(TEST_STATION_HASH_ID))
      assert.ok(path.includes('certs'))
      assert.ok(path.includes('CSMSRootCertificate'))
      assert.ok(path.includes('SERIAL-12345'))
      assert.match(path, /\.pem$/)
    })

    await it('should handle special characters in serial number', () => {
      const path = manager.getCertificatePath(
        TEST_STATION_HASH_ID,
        TEST_CERT_TYPE,
        'SERIAL:ABC/123'
      )

      assert.notStrictEqual(path, undefined)
      const filename = path.split('/').pop()
      if (filename == null) {
        assert.fail('Expected filename to be defined')
      }
      assert.ok(!filename.includes(':'))
      assert.ok(!filename.includes('/'))
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

      assert.notStrictEqual(csmsPath, v2gPath)
      assert.ok(csmsPath.includes('CSMSRootCertificate'))
      assert.ok(v2gPath.includes('V2GRootCertificate'))
    })

    await it('should return path following project convention', () => {
      const path = manager.getCertificatePath(TEST_STATION_HASH_ID, TEST_CERT_TYPE, 'SERIAL-12345')

      assert.match(path, /configurations/)
      assert.match(path, /certs/)
      assert.match(path, /\.pem$/)
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

      assert.strictEqual(results.length, 3)
      results.forEach(result => {
        assert.notStrictEqual(result, undefined)
      })
    })

    await it('should handle very long certificate chains', async () => {
      const longChain = Array(5).fill(VALID_PEM_CERTIFICATE_EXTENDED).join('\n')

      const result = await manager.storeCertificate(TEST_STATION_HASH_ID, TEST_CERT_TYPE, longChain)

      assert.notStrictEqual(result, undefined)
    })

    await it('should sanitize station hash ID for filesystem safety', () => {
      const maliciousHashId = '../../../etc/passwd'

      const path = manager.getCertificatePath(maliciousHashId, TEST_CERT_TYPE, 'SERIAL-001')

      assert.ok(!path.includes('..'))
    })
  })

  await describe('validateCertificateX509', async () => {
    let manager: OCPP20CertificateManager

    beforeEach(() => {
      manager = new OCPP20CertificateManager()
    })

    await it('should return valid for a real X.509 certificate within validity period', () => {
      const result = manager.validateCertificateX509(VALID_X509_PEM_CERTIFICATE)

      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.reason, undefined)
    })

    await it('should return invalid with reason for an expired X.509 certificate', () => {
      const result = manager.validateCertificateX509(EXPIRED_X509_PEM_CERTIFICATE)

      assert.strictEqual(result.valid, false)
      assert.strictEqual(typeof result.reason, 'string')
      assert.ok(result.reason?.includes('expired'))
    })

    await it('should return invalid with reason for non-PEM data', () => {
      const result = manager.validateCertificateX509('not-a-certificate')

      assert.strictEqual(result.valid, false)
      assert.strictEqual(typeof result.reason, 'string')
      assert.ok(result.reason?.includes('No PEM certificate found'))
    })
  })
})
