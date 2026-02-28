/**
 * @file Tests for CertificateAuthStrategy
 * @description Unit tests for certificate-based authentication strategy
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../../src/charging-station/ChargingStation.js'
import type { OCPPAuthAdapter } from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { CertificateAuthStrategy } from '../../../../../src/charging-station/ocpp/auth/strategies/CertificateAuthStrategy.js'
import {
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'
import {
  createMockAuthorizationResult,
  createMockAuthRequest,
  createMockOCPPAdapter,
  createTestAuthConfig,
} from '../helpers/MockFactories.js'

await describe('CertificateAuthStrategy', async () => {
  let strategy: CertificateAuthStrategy
  let mockChargingStation: ChargingStation
  let mockOCPP20Adapter: OCPPAuthAdapter

  beforeEach(() => {
    mockChargingStation = {
      logPrefix: () => '[TEST-CS-001]',
      stationInfo: {
        chargingStationId: 'TEST-CS-001',
        ocppVersion: OCPPVersion.VERSION_20,
      },
    } as unknown as ChargingStation

    mockOCPP20Adapter = createMockOCPPAdapter(OCPPVersion.VERSION_20, {
      authorizeRemote: async () =>
        Promise.resolve(
          createMockAuthorizationResult({
            method: AuthenticationMethod.CERTIFICATE_BASED,
          })
        ),
      convertToUnifiedIdentifier: identifier => ({
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.CERTIFICATE,
        value: typeof identifier === 'string' ? identifier : JSON.stringify(identifier),
      }),
    })

    const adapters = new Map<OCPPVersion, OCPPAuthAdapter>()
    adapters.set(OCPPVersion.VERSION_20, mockOCPP20Adapter)

    strategy = new CertificateAuthStrategy(mockChargingStation, adapters)
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('constructor', async () => {
    await it('should initialize with correct name and priority', () => {
      expect(strategy.name).toBe('CertificateAuthStrategy')
      expect(strategy.priority).toBe(3)
    })
  })

  await describe('initialize', async () => {
    await it('should initialize successfully when certificate auth is enabled', async () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      await expect(strategy.initialize(config)).resolves.toBeUndefined()
    })

    await it('should handle disabled certificate auth gracefully', async () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: false })
      await expect(strategy.initialize(config)).resolves.toBeUndefined()
    })
  })

  await describe('canHandle', async () => {
    beforeEach(async () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      await strategy.initialize(config)
    })

    await it('should return true for certificate identifiers with OCPP 2.0', () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          certificateHashData: {
            hashAlgorithm: 'SHA256',
            issuerKeyHash: 'ABC123',
            issuerNameHash: 'DEF456',
            serialNumber: 'TEST_CERT_001',
          },
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.CERTIFICATE,
          value: 'CERT_IDENTIFIER',
        },
      })

      expect(strategy.canHandle(request, config)).toBe(true)
    })

    await it('should return false for non-certificate identifiers', () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.ID_TAG,
          value: 'ID_TAG',
        },
      })

      expect(strategy.canHandle(request, config)).toBe(false)
    })

    await it('should return false for OCPP 1.6', () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          ocppVersion: OCPPVersion.VERSION_16,
          type: IdentifierType.CERTIFICATE,
          value: 'CERT',
        },
      })

      expect(strategy.canHandle(request, config)).toBe(false)
    })

    await it('should return false when certificate auth is disabled', () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: false })
      const request = createMockAuthRequest({
        identifier: {
          certificateHashData: {
            hashAlgorithm: 'SHA256',
            issuerKeyHash: 'ABC123',
            issuerNameHash: 'DEF456',
            serialNumber: 'TEST_CERT_001',
          },
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.CERTIFICATE,
          value: 'CERT',
        },
      })

      expect(strategy.canHandle(request, config)).toBe(false)
    })

    await it('should return false when missing certificate data', () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.CERTIFICATE,
          value: 'CERT_NO_DATA',
        },
      })

      expect(strategy.canHandle(request, config)).toBe(false)
    })
  })

  await describe('authenticate', async () => {
    beforeEach(async () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      await strategy.initialize(config)
    })

    await it('should authenticate valid test certificate', async () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          certificateHashData: {
            hashAlgorithm: 'SHA256',
            issuerKeyHash: 'abc123def456',
            issuerNameHash: '789012ghi345',
            serialNumber: 'TEST_CERT_001',
          },
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.CERTIFICATE,
          value: 'CERT_TEST',
        },
      })

      const result = await strategy.authenticate(request, config)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result?.method).toBe(AuthenticationMethod.CERTIFICATE_BASED)
    })

    await it('should reject invalid certificate serial numbers', async () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          certificateHashData: {
            hashAlgorithm: 'SHA256',
            issuerKeyHash: 'abc123',
            issuerNameHash: 'def456',
            serialNumber: 'INVALID_CERT',
          },
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.CERTIFICATE,
          value: 'CERT_INVALID',
        },
      })

      const result = await strategy.authenticate(request, config)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.BLOCKED)
    })

    await it('should reject revoked certificates', async () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          certificateHashData: {
            hashAlgorithm: 'SHA256',
            issuerKeyHash: 'abc123',
            issuerNameHash: 'def456',
            serialNumber: 'REVOKED_CERT',
          },
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.CERTIFICATE,
          value: 'CERT_REVOKED',
        },
      })

      const result = await strategy.authenticate(request, config)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.BLOCKED)
    })

    await it('should handle missing certificate data', async () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.CERTIFICATE,
          value: 'CERT_NO_DATA',
        },
      })

      const result = await strategy.authenticate(request, config)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.INVALID)
    })

    await it('should handle invalid hash algorithm', async () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          certificateHashData: {
            hashAlgorithm: 'MD5',
            issuerKeyHash: 'abc123',
            issuerNameHash: 'def456',
            serialNumber: 'TEST_CERT',
          },
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.CERTIFICATE,
          value: 'CERT_BAD_ALGO',
        },
      })

      const result = await strategy.authenticate(request, config)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.INVALID)
    })

    await it('should handle invalid hash format', async () => {
      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          certificateHashData: {
            hashAlgorithm: 'SHA256',
            issuerKeyHash: 'not-hex!',
            issuerNameHash: 'also-not-hex!',
            serialNumber: 'TEST_CERT',
          },
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.CERTIFICATE,
          value: 'CERT_BAD_HASH',
        },
      })

      const result = await strategy.authenticate(request, config)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.INVALID)
    })
  })

  await describe('getStats', async () => {
    await it('should return strategy statistics', async () => {
      const stats = await strategy.getStats()

      expect(stats.isInitialized).toBe(false)
      expect(stats.totalRequests).toBe(0)
      expect(stats.successfulAuths).toBe(0)
      expect(stats.failedAuths).toBe(0)
    })

    await it('should update stats after authentication', async () => {
      await strategy.initialize(createTestAuthConfig({ certificateAuthEnabled: true }))

      const config = createTestAuthConfig({ certificateAuthEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          certificateHashData: {
            hashAlgorithm: 'SHA256',
            issuerKeyHash: 'abc123',
            issuerNameHash: 'def456',
            serialNumber: 'TEST_CERT_001',
          },
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.CERTIFICATE,
          value: 'CERT_TEST',
        },
      })

      await strategy.authenticate(request, config)

      const stats = await strategy.getStats()
      expect(stats.totalRequests).toBe(1)
      expect(stats.successfulAuths).toBe(1)
    })
  })

  await describe('cleanup', async () => {
    await it('should reset strategy state', async () => {
      await strategy.initialize(createTestAuthConfig({ certificateAuthEnabled: true }))

      await strategy.cleanup()
      const stats = await strategy.getStats()
      expect(stats.isInitialized).toBe(false)
    })
  })
})
