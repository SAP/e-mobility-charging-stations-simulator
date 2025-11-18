import { expect } from '@std/expect'
import { beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../../src/charging-station/ChargingStation.js'
import type { OCPPAuthAdapter } from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { CertificateAuthStrategy } from '../../../../../src/charging-station/ocpp/auth/strategies/CertificateAuthStrategy.js'
import {
  type AuthConfiguration,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
import { createMockAuthorizationResult, createMockAuthRequest } from '../helpers/MockFactories.js'

await describe('CertificateAuthStrategy', async () => {
  let strategy: CertificateAuthStrategy
  let mockChargingStation: ChargingStation
  let mockOCPP20Adapter: OCPPAuthAdapter

  beforeEach(() => {
    // Create mock charging station
    mockChargingStation = {
      logPrefix: () => '[TEST-CS-001]',
      stationInfo: {
        chargingStationId: 'TEST-CS-001',
        ocppVersion: OCPPVersion.VERSION_20,
      },
    } as unknown as ChargingStation

    // Create mock OCPP 2.0 adapter (certificate auth only in 2.0+)
    mockOCPP20Adapter = {
      authorizeRemote: async () =>
        Promise.resolve(
          createMockAuthorizationResult({
            method: AuthenticationMethod.CERTIFICATE_BASED,
          })
        ),
      convertFromUnifiedIdentifier: identifier => identifier,
      convertToUnifiedIdentifier: identifier => ({
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.CERTIFICATE,
        value: typeof identifier === 'string' ? identifier : JSON.stringify(identifier),
      }),
      getConfigurationSchema: () => ({}),
      isRemoteAvailable: async () => Promise.resolve(true),
      ocppVersion: OCPPVersion.VERSION_20,
      validateConfiguration: async () => Promise.resolve(true),
    }

    const adapters = new Map<OCPPVersion, OCPPAuthAdapter>()
    adapters.set(OCPPVersion.VERSION_20, mockOCPP20Adapter)

    strategy = new CertificateAuthStrategy(mockChargingStation, adapters)
  })

  await describe('constructor', async () => {
    await it('should initialize with correct name and priority', () => {
      expect(strategy.name).toBe('CertificateAuthStrategy')
      expect(strategy.priority).toBe(3)
    })
  })

  await describe('initialize', async () => {
    await it('should initialize successfully when certificate auth is enabled', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      await expect(strategy.initialize(config)).resolves.toBeUndefined()
    })

    await it('should handle disabled certificate auth gracefully', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      await expect(strategy.initialize(config)).resolves.toBeUndefined()
    })
  })

  await describe('canHandle', async () => {
    beforeEach(async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }
      await strategy.initialize(config)
    })

    await it('should return true for certificate identifiers with OCPP 2.0', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }
      await strategy.initialize(config)
    })

    await it('should authenticate valid test certificate', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      await strategy.initialize({
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      })

      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

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
      await strategy.initialize({
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      })

      await strategy.cleanup()
      const stats = await strategy.getStats()
      expect(stats.isInitialized).toBe(false)
    })
  })
})
