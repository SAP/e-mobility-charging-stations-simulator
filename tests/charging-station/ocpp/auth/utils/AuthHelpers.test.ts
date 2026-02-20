import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import {
  AuthContext,
  AuthenticationMethod,
  type AuthorizationResult,
  AuthorizationStatus,
  IdentifierType,
  type UnifiedIdentifier,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { AuthHelpers } from '../../../../../src/charging-station/ocpp/auth/utils/AuthHelpers.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'

await describe('AuthHelpers', async () => {
  await describe('calculateTTL', async () => {
    await it('should return undefined for undefined expiry date', () => {
      const result = AuthHelpers.calculateTTL(undefined)
      expect(result).toBeUndefined()
    })

    await it('should return undefined for expired date', () => {
      const expiredDate = new Date(Date.now() - 1000)
      const result = AuthHelpers.calculateTTL(expiredDate)
      expect(result).toBeUndefined()
    })

    await it('should calculate correct TTL in seconds for future date', () => {
      const futureDate = new Date(Date.now() + 5000)
      const result = AuthHelpers.calculateTTL(futureDate)
      expect(result).toBeDefined()
      if (result !== undefined) {
        expect(result).toBeGreaterThanOrEqual(4)
        expect(result).toBeLessThanOrEqual(5)
      }
    })

    await it('should round down TTL to nearest second', () => {
      const futureDate = new Date(Date.now() + 5500)
      const result = AuthHelpers.calculateTTL(futureDate)
      expect(result).toBe(5)
    })
  })

  await describe('createAuthRequest', async () => {
    await it('should create basic auth request with minimal parameters', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'TEST123',
      }
      const context = AuthContext.TRANSACTION_START

      const request = AuthHelpers.createAuthRequest(identifier, context)

      expect(request.identifier).toBe(identifier)
      expect(request.context).toBe(context)
      expect(request.allowOffline).toBe(true)
      expect(request.timestamp).toBeInstanceOf(Date)
      expect(request.connectorId).toBeUndefined()
      expect(request.metadata).toBeUndefined()
    })

    await it('should create auth request with connector ID', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.LOCAL,
        value: 'LOCAL001',
      }
      const context = AuthContext.REMOTE_START
      const connectorId = 1

      const request = AuthHelpers.createAuthRequest(identifier, context, connectorId)

      expect(request.connectorId).toBe(1)
    })

    await it('should create auth request with metadata', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.CENTRAL,
        value: 'CENTRAL001',
      }
      const context = AuthContext.RESERVATION
      const metadata = { source: 'test' }

      const request = AuthHelpers.createAuthRequest(identifier, context, undefined, metadata)

      expect(request.metadata).toEqual({ source: 'test' })
    })
  })

  await describe('createRejectedResult', async () => {
    await it('should create rejected result without reason', () => {
      const result = AuthHelpers.createRejectedResult(
        AuthorizationStatus.BLOCKED,
        AuthenticationMethod.LOCAL_LIST
      )

      expect(result.status).toBe(AuthorizationStatus.BLOCKED)
      expect(result.method).toBe(AuthenticationMethod.LOCAL_LIST)
      expect(result.isOffline).toBe(false)
      expect(result.timestamp).toBeInstanceOf(Date)
      expect(result.additionalInfo).toBeUndefined()
    })

    await it('should create rejected result with reason', () => {
      const result = AuthHelpers.createRejectedResult(
        AuthorizationStatus.EXPIRED,
        AuthenticationMethod.REMOTE_AUTHORIZATION,
        'Token expired on 2024-01-01'
      )

      expect(result.status).toBe(AuthorizationStatus.EXPIRED)
      expect(result.method).toBe(AuthenticationMethod.REMOTE_AUTHORIZATION)
      expect(result.additionalInfo).toEqual({ reason: 'Token expired on 2024-01-01' })
    })
  })

  await describe('formatAuthError', async () => {
    await it('should format error message with truncated identifier', () => {
      const error = new Error('Connection timeout')
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'VERY_LONG_IDENTIFIER_VALUE_12345',
      }

      const message = AuthHelpers.formatAuthError(error, identifier)

      expect(message).toContain('VERY_LON...')
      expect(message).toContain('IdTag')
      expect(message).toContain('Connection timeout')
    })

    await it('should handle short identifiers correctly', () => {
      const error = new Error('Invalid format')
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.LOCAL,
        value: 'SHORT',
      }

      const message = AuthHelpers.formatAuthError(error, identifier)

      expect(message).toContain('SHORT...')
      expect(message).toContain('Local')
      expect(message).toContain('Invalid format')
    })
  })

  await describe('getStatusMessage', async () => {
    await it('should return message for ACCEPTED status', () => {
      expect(AuthHelpers.getStatusMessage(AuthorizationStatus.ACCEPTED)).toBe(
        'Authorization accepted'
      )
    })

    await it('should return message for BLOCKED status', () => {
      expect(AuthHelpers.getStatusMessage(AuthorizationStatus.BLOCKED)).toBe(
        'Identifier is blocked'
      )
    })

    await it('should return message for EXPIRED status', () => {
      expect(AuthHelpers.getStatusMessage(AuthorizationStatus.EXPIRED)).toBe(
        'Authorization has expired'
      )
    })

    await it('should return message for INVALID status', () => {
      expect(AuthHelpers.getStatusMessage(AuthorizationStatus.INVALID)).toBe('Invalid identifier')
    })

    await it('should return message for CONCURRENT_TX status', () => {
      expect(AuthHelpers.getStatusMessage(AuthorizationStatus.CONCURRENT_TX)).toBe(
        'Concurrent transaction in progress'
      )
    })

    await it('should return message for NOT_AT_THIS_LOCATION status', () => {
      expect(AuthHelpers.getStatusMessage(AuthorizationStatus.NOT_AT_THIS_LOCATION)).toBe(
        'Not authorized at this location'
      )
    })

    await it('should return message for NOT_AT_THIS_TIME status', () => {
      expect(AuthHelpers.getStatusMessage(AuthorizationStatus.NOT_AT_THIS_TIME)).toBe(
        'Not authorized at this time'
      )
    })

    await it('should return message for PENDING status', () => {
      expect(AuthHelpers.getStatusMessage(AuthorizationStatus.PENDING)).toBe(
        'Authorization pending'
      )
    })

    await it('should return message for UNKNOWN status', () => {
      expect(AuthHelpers.getStatusMessage(AuthorizationStatus.UNKNOWN)).toBe(
        'Unknown authorization status'
      )
    })

    await it('should return generic message for unknown status', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      expect(AuthHelpers.getStatusMessage('INVALID_STATUS' as any)).toBe('Authorization failed')
    })
  })

  await describe('isCacheable', async () => {
    await it('should return false for non-ACCEPTED status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.BLOCKED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isCacheable(result)).toBe(false)
    })

    await it('should return false for ACCEPTED without expiry date', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isCacheable(result)).toBe(false)
    })

    await it('should return false for already expired result', () => {
      const result: AuthorizationResult = {
        expiryDate: new Date(Date.now() - 1000),
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isCacheable(result)).toBe(false)
    })

    await it('should return false for expiry too far in future (>1 year)', () => {
      const oneYearPlusOne = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000)
      const result: AuthorizationResult = {
        expiryDate: oneYearPlusOne,
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isCacheable(result)).toBe(false)
    })

    await it('should return true for valid ACCEPTED result with reasonable expiry', () => {
      const result: AuthorizationResult = {
        expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isCacheable(result)).toBe(true)
    })
  })

  await describe('isPermanentFailure', async () => {
    await it('should return true for BLOCKED status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.BLOCKED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isPermanentFailure(result)).toBe(true)
    })

    await it('should return true for EXPIRED status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.EXPIRED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isPermanentFailure(result)).toBe(true)
    })

    await it('should return true for INVALID status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.INVALID,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isPermanentFailure(result)).toBe(true)
    })

    await it('should return false for ACCEPTED status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isPermanentFailure(result)).toBe(false)
    })

    await it('should return false for PENDING status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.PENDING,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isPermanentFailure(result)).toBe(false)
    })
  })

  await describe('isResultValid', async () => {
    await it('should return false for non-ACCEPTED status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.BLOCKED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isResultValid(result)).toBe(false)
    })

    await it('should return true for ACCEPTED without expiry date', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isResultValid(result)).toBe(true)
    })

    await it('should return false for expired ACCEPTED result', () => {
      const result: AuthorizationResult = {
        expiryDate: new Date(Date.now() - 1000),
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isResultValid(result)).toBe(false)
    })

    await it('should return true for non-expired ACCEPTED result', () => {
      const result: AuthorizationResult = {
        expiryDate: new Date(Date.now() + 10000),
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isResultValid(result)).toBe(true)
    })
  })

  await describe('isTemporaryFailure', async () => {
    await it('should return true for PENDING status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.PENDING,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isTemporaryFailure(result)).toBe(true)
    })

    await it('should return true for UNKNOWN status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.UNKNOWN,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isTemporaryFailure(result)).toBe(true)
    })

    await it('should return false for BLOCKED status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.BLOCKED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isTemporaryFailure(result)).toBe(false)
    })

    await it('should return false for ACCEPTED status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      expect(AuthHelpers.isTemporaryFailure(result)).toBe(false)
    })
  })

  await describe('mergeAuthResults', async () => {
    await it('should return undefined for empty array', () => {
      const result = AuthHelpers.mergeAuthResults([])
      expect(result).toBeUndefined()
    })

    await it('should return first ACCEPTED result', () => {
      const results: AuthorizationResult[] = [
        {
          isOffline: false,
          method: AuthenticationMethod.LOCAL_LIST,
          status: AuthorizationStatus.BLOCKED,
          timestamp: new Date(),
        },
        {
          isOffline: false,
          method: AuthenticationMethod.REMOTE_AUTHORIZATION,
          status: AuthorizationStatus.ACCEPTED,
          timestamp: new Date(),
        },
        {
          isOffline: false,
          method: AuthenticationMethod.CERTIFICATE_BASED,
          status: AuthorizationStatus.ACCEPTED,
          timestamp: new Date(),
        },
      ]

      const merged = AuthHelpers.mergeAuthResults(results)
      expect(merged?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(merged?.method).toBe(AuthenticationMethod.REMOTE_AUTHORIZATION)
    })

    await it('should merge information when all results are rejections', () => {
      const results: AuthorizationResult[] = [
        {
          isOffline: false,
          method: AuthenticationMethod.LOCAL_LIST,
          status: AuthorizationStatus.BLOCKED,
          timestamp: new Date(),
        },
        {
          isOffline: true,
          method: AuthenticationMethod.REMOTE_AUTHORIZATION,
          status: AuthorizationStatus.EXPIRED,
          timestamp: new Date(),
        },
      ]

      const merged = AuthHelpers.mergeAuthResults(results)
      expect(merged?.status).toBe(AuthorizationStatus.BLOCKED)
      expect(merged?.method).toBe(AuthenticationMethod.LOCAL_LIST)
      expect(merged?.isOffline).toBe(true)
      expect(merged?.additionalInfo).toEqual({
        attemptedMethods: 'LocalList, RemoteAuthorization',
        totalAttempts: 2,
      })
    })
  })

  await describe('sanitizeForLogging', async () => {
    await it('should sanitize result with all fields', () => {
      const result: AuthorizationResult = {
        expiryDate: new Date('2024-12-31T23:59:59Z'),
        groupId: 'GROUP123',
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        personalMessage: {
          content: 'Welcome',
          format: 'ASCII',
        },
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date('2024-01-01T00:00:00Z'),
      }

      const sanitized = AuthHelpers.sanitizeForLogging(result)

      expect(sanitized).toEqual({
        hasExpiryDate: true,
        hasGroupId: true,
        hasPersonalMessage: true,
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: '2024-01-01T00:00:00.000Z',
      })
    })

    await it('should sanitize result with minimal fields', () => {
      const result: AuthorizationResult = {
        isOffline: true,
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
        status: AuthorizationStatus.BLOCKED,
        timestamp: new Date('2024-06-15T12:30:45Z'),
      }

      const sanitized = AuthHelpers.sanitizeForLogging(result)

      expect(sanitized).toEqual({
        hasExpiryDate: false,
        hasGroupId: false,
        hasPersonalMessage: false,
        isOffline: true,
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
        status: AuthorizationStatus.BLOCKED,
        timestamp: '2024-06-15T12:30:45.000Z',
      })
    })
  })
})
