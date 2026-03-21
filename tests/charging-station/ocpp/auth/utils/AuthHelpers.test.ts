/**
 * @file Tests for AuthHelpers
 * @description Unit tests for authentication helper utilities
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  AuthContext,
  AuthenticationMethod,
  type AuthorizationResult,
  AuthorizationStatus,
  IdentifierType,
  type UnifiedIdentifier,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { AuthHelpers } from '../../../../../src/charging-station/ocpp/auth/utils/AuthHelpers.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'

await describe('AuthHelpers', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await describe('calculateTTL', async () => {
    await it('should return undefined for undefined expiry date', () => {
      const result = AuthHelpers.calculateTTL(undefined)
      assert.strictEqual(result, undefined)
    })

    await it('should return undefined for expired date', () => {
      const expiredDate = new Date(Date.now() - 1000)
      const result = AuthHelpers.calculateTTL(expiredDate)
      assert.strictEqual(result, undefined)
    })

    await it('should calculate correct TTL in seconds for future date', () => {
      const futureDate = new Date(Date.now() + 5000)
      const result = AuthHelpers.calculateTTL(futureDate)
      assert.notStrictEqual(result, undefined)
      if (result !== undefined) {
        assert.ok(result >= 4)
        assert.ok(result <= 5)
      }
    })

    await it('should round down TTL to nearest second', () => {
      const futureDate = new Date(Date.now() + 5500)
      const result = AuthHelpers.calculateTTL(futureDate)
      assert.strictEqual(result, 5)
    })
  })

  await describe('createAuthRequest', async () => {
    await it('should create basic auth request with minimal parameters', () => {
      const identifier: UnifiedIdentifier = {
        type: IdentifierType.ID_TAG,
        value: 'TEST123',
      }
      const context = AuthContext.TRANSACTION_START

      const request = AuthHelpers.createAuthRequest(identifier, context)

      assert.strictEqual(request.identifier, identifier)
      assert.strictEqual(request.context, context)
      assert.strictEqual(request.allowOffline, true)
      assert.ok(request.timestamp instanceof Date)
      assert.strictEqual(request.connectorId, undefined)
      assert.strictEqual(request.metadata, undefined)
    })

    await it('should create auth request with connector ID', () => {
      const identifier: UnifiedIdentifier = {
        type: IdentifierType.LOCAL,
        value: 'LOCAL001',
      }
      const context = AuthContext.REMOTE_START
      const connectorId = 1

      const request = AuthHelpers.createAuthRequest(identifier, context, connectorId)

      assert.strictEqual(request.connectorId, 1)
    })

    await it('should create auth request with metadata', () => {
      const identifier: UnifiedIdentifier = {
        type: IdentifierType.CENTRAL,
        value: 'CENTRAL001',
      }
      const context = AuthContext.RESERVATION
      const metadata = { source: 'test' }

      const request = AuthHelpers.createAuthRequest(identifier, context, undefined, metadata)

      assert.deepStrictEqual(request.metadata, { source: 'test' })
    })
  })

  await describe('createRejectedResult', async () => {
    await it('should create rejected result without reason', () => {
      const result = AuthHelpers.createRejectedResult(
        AuthorizationStatus.BLOCKED,
        AuthenticationMethod.LOCAL_LIST
      )

      assert.strictEqual(result.status, AuthorizationStatus.BLOCKED)
      assert.strictEqual(result.method, AuthenticationMethod.LOCAL_LIST)
      assert.strictEqual(result.isOffline, false)
      assert.ok(result.timestamp instanceof Date)
      assert.strictEqual(result.additionalInfo, undefined)
    })

    await it('should create rejected result with reason', () => {
      const result = AuthHelpers.createRejectedResult(
        AuthorizationStatus.EXPIRED,
        AuthenticationMethod.REMOTE_AUTHORIZATION,
        'Token expired on 2024-01-01'
      )

      assert.strictEqual(result.status, AuthorizationStatus.EXPIRED)
      assert.strictEqual(result.method, AuthenticationMethod.REMOTE_AUTHORIZATION)
      assert.deepStrictEqual(result.additionalInfo, { reason: 'Token expired on 2024-01-01' })
    })
  })

  await describe('formatAuthError', async () => {
    await it('should format error message with truncated identifier', () => {
      const error = new Error('Connection timeout')
      const identifier: UnifiedIdentifier = {
        type: IdentifierType.ID_TAG,
        value: 'VERY_LONG_IDENTIFIER_VALUE_12345',
      }

      const message = AuthHelpers.formatAuthError(error, identifier)

      assert.ok(message.includes('VERY_LON...'))
      assert.ok(message.includes('IdTag'))
      assert.ok(message.includes('Connection timeout'))
    })

    await it('should handle short identifiers correctly', () => {
      const error = new Error('Invalid format')
      const identifier: UnifiedIdentifier = {
        type: IdentifierType.LOCAL,
        value: 'SHORT',
      }

      const message = AuthHelpers.formatAuthError(error, identifier)

      assert.ok(message.includes('SHORT'))
      assert.ok(!message.includes('SHORT...'))
      assert.ok(message.includes('Local'))
      assert.ok(message.includes('Invalid format'))
    })
  })

  await describe('getStatusMessage', async () => {
    await it('should return message for ACCEPTED status', () => {
      assert.strictEqual(
        AuthHelpers.getStatusMessage(AuthorizationStatus.ACCEPTED),
        'Authorization accepted'
      )
    })

    await it('should return message for BLOCKED status', () => {
      assert.strictEqual(
        AuthHelpers.getStatusMessage(AuthorizationStatus.BLOCKED),
        'Identifier is blocked'
      )
    })

    await it('should return message for EXPIRED status', () => {
      assert.strictEqual(
        AuthHelpers.getStatusMessage(AuthorizationStatus.EXPIRED),
        'Authorization has expired'
      )
    })

    await it('should return message for INVALID status', () => {
      assert.strictEqual(
        AuthHelpers.getStatusMessage(AuthorizationStatus.INVALID),
        'Invalid identifier'
      )
    })

    await it('should return message for CONCURRENT_TX status', () => {
      assert.strictEqual(
        AuthHelpers.getStatusMessage(AuthorizationStatus.CONCURRENT_TX),
        'Concurrent transaction in progress'
      )
    })

    await it('should return message for NOT_AT_THIS_LOCATION status', () => {
      assert.strictEqual(
        AuthHelpers.getStatusMessage(AuthorizationStatus.NOT_AT_THIS_LOCATION),
        'Not authorized at this location'
      )
    })

    await it('should return message for NOT_AT_THIS_TIME status', () => {
      assert.strictEqual(
        AuthHelpers.getStatusMessage(AuthorizationStatus.NOT_AT_THIS_TIME),
        'Not authorized at this time'
      )
    })

    await it('should return message for PENDING status', () => {
      assert.strictEqual(
        AuthHelpers.getStatusMessage(AuthorizationStatus.PENDING),
        'Authorization pending'
      )
    })

    await it('should return message for UNKNOWN status', () => {
      assert.strictEqual(
        AuthHelpers.getStatusMessage(AuthorizationStatus.UNKNOWN),
        'Unknown authorization status'
      )
    })

    await it('should return generic message for unknown status', () => {
      assert.strictEqual(
        AuthHelpers.getStatusMessage(AuthorizationStatus.NO_CREDIT),
        'Authorization failed'
      )
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

      assert.strictEqual(AuthHelpers.isPermanentFailure(result), true)
    })

    await it('should return true for EXPIRED status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.EXPIRED,
        timestamp: new Date(),
      }

      assert.strictEqual(AuthHelpers.isPermanentFailure(result), true)
    })

    await it('should return true for INVALID status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.INVALID,
        timestamp: new Date(),
      }

      assert.strictEqual(AuthHelpers.isPermanentFailure(result), true)
    })

    await it('should return false for ACCEPTED status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      assert.strictEqual(AuthHelpers.isPermanentFailure(result), false)
    })

    await it('should return false for PENDING status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.PENDING,
        timestamp: new Date(),
      }

      assert.strictEqual(AuthHelpers.isPermanentFailure(result), false)
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

      assert.strictEqual(AuthHelpers.isResultValid(result), false)
    })

    await it('should return true for ACCEPTED without expiry date', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      assert.strictEqual(AuthHelpers.isResultValid(result), true)
    })

    await it('should return false for expired ACCEPTED result', () => {
      const result: AuthorizationResult = {
        expiryDate: new Date(Date.now() - 1000),
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      assert.strictEqual(AuthHelpers.isResultValid(result), false)
    })

    await it('should return true for non-expired ACCEPTED result', () => {
      const result: AuthorizationResult = {
        expiryDate: new Date(Date.now() + 10000),
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      assert.strictEqual(AuthHelpers.isResultValid(result), true)
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

      assert.strictEqual(AuthHelpers.isTemporaryFailure(result), true)
    })

    await it('should return true for UNKNOWN status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.UNKNOWN,
        timestamp: new Date(),
      }

      assert.strictEqual(AuthHelpers.isTemporaryFailure(result), true)
    })

    await it('should return false for BLOCKED status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.BLOCKED,
        timestamp: new Date(),
      }

      assert.strictEqual(AuthHelpers.isTemporaryFailure(result), false)
    })

    await it('should return false for ACCEPTED status', () => {
      const result: AuthorizationResult = {
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }

      assert.strictEqual(AuthHelpers.isTemporaryFailure(result), false)
    })
  })

  await describe('mergeAuthResults', async () => {
    await it('should return undefined for empty array', () => {
      const result = AuthHelpers.mergeAuthResults([])
      assert.strictEqual(result, undefined)
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
      assert.strictEqual(merged?.status, AuthorizationStatus.ACCEPTED)
      assert.strictEqual(merged.method, AuthenticationMethod.REMOTE_AUTHORIZATION)
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
      assert.strictEqual(merged?.status, AuthorizationStatus.BLOCKED)
      assert.strictEqual(merged.method, AuthenticationMethod.LOCAL_LIST)
      assert.strictEqual(merged.isOffline, true)
      assert.deepStrictEqual(merged.additionalInfo, {
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

      assert.deepStrictEqual(sanitized, {
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

      assert.deepStrictEqual(sanitized, {
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
