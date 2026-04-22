/**
 * @file Tests for UIServerUtils
 * @description Unit tests for UI server utility functions (auth token parsing, protocol handling, loopback detection)
 */

import type { IncomingMessage } from 'node:http'

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  getProtocolAndVersion,
  getUsernameAndPasswordFromAuthorizationToken,
  handleProtocols,
  isLoopback,
  isProtocolAndVersionSupported,
} from '../../../src/charging-station/ui-server/UIServerUtils.js'
import { Protocol, ProtocolVersion } from '../../../src/types/index.js'
import { logger } from '../../../src/utils/index.js'
import { createLoggerMocks, standardCleanup } from '../../helpers/TestLifecycleHelpers.js'

await describe('UIServerUtils', async () => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noop = (): void => {}

  afterEach(() => {
    standardCleanup()
  })

  await describe('getUsernameAndPasswordFromAuthorizationToken', async () => {
    await it('should parse valid credentials', () => {
      // cspell:disable-next-line
      const token = Buffer.from('alice:s3cret').toString('base64')
      const result = getUsernameAndPasswordFromAuthorizationToken(token, noop)
      // cspell:disable-next-line
      assert.deepStrictEqual(result, ['alice', 's3cret'])
    })

    await it('should handle password containing colons', () => {
      const token = Buffer.from('user:pass:with:colons').toString('base64')
      const result = getUsernameAndPasswordFromAuthorizationToken(token, noop)
      assert.deepStrictEqual(result, ['user', 'pass:with:colons'])
    })

    await it('should reject token missing colon separator', () => {
      // cspell:disable-next-line
      const token = Buffer.from('nocolon').toString('base64')
      let errorMessage: string | undefined
      const result = getUsernameAndPasswordFromAuthorizationToken(token, err => {
        errorMessage = err?.message
      })
      assert.strictEqual(result, undefined)
      assert.match(errorMessage ?? '', /missing.*separator/i)
    })

    await it('should reject empty username (RFC 7613 §3.1)', () => {
      const token = Buffer.from(':password').toString('base64')
      let errorMessage: string | undefined
      const result = getUsernameAndPasswordFromAuthorizationToken(token, err => {
        errorMessage = err?.message
      })
      assert.strictEqual(result, undefined)
      assert.match(errorMessage ?? '', /empty username/i)
    })

    await it('should reject empty password (RFC 7613 §4.1)', () => {
      const token = Buffer.from('username:').toString('base64')
      let errorMessage: string | undefined
      const result = getUsernameAndPasswordFromAuthorizationToken(token, err => {
        errorMessage = err?.message
      })
      assert.strictEqual(result, undefined)
      assert.match(errorMessage ?? '', /empty password/i)
    })

    await it('should reject empty token', () => {
      let errorMessage: string | undefined
      const result = getUsernameAndPasswordFromAuthorizationToken('', err => {
        errorMessage = err?.message
      })
      assert.strictEqual(result, undefined)
      assert.match(errorMessage ?? '', /missing.*separator/i)
    })
  })

  await describe('getProtocolAndVersion', async () => {
    await it('should parse valid protocol string', () => {
      const result = getProtocolAndVersion(`${Protocol.UI}${ProtocolVersion['0.0.1']}`)
      assert.deepStrictEqual(result, [Protocol.UI, ProtocolVersion['0.0.1']])
    })

    await it('should return undefined for empty string', () => {
      assert.strictEqual(getProtocolAndVersion(''), undefined)
    })

    await it('should return undefined for string not starting with protocol prefix', () => {
      assert.strictEqual(getProtocolAndVersion('http0.0.1'), undefined)
    })

    await it('should return undefined for protocol prefix without version', () => {
      assert.strictEqual(getProtocolAndVersion(Protocol.UI), undefined)
    })
  })

  await describe('isProtocolAndVersionSupported', async () => {
    await it('should return true for supported protocol and version', () => {
      assert.strictEqual(
        isProtocolAndVersionSupported(`${Protocol.UI}${ProtocolVersion['0.0.1']}`),
        true
      )
    })

    await it('should return false for unsupported version', () => {
      assert.strictEqual(isProtocolAndVersionSupported(`${Protocol.UI}9.9.9`), false)
    })

    await it('should return false for unsupported protocol prefix', () => {
      assert.strictEqual(isProtocolAndVersionSupported('ws0.0.1'), false)
    })

    await it('should return false for empty string', () => {
      assert.strictEqual(isProtocolAndVersionSupported(''), false)
    })
  })

  await describe('handleProtocols', async () => {
    const dummyRequest = {} as IncomingMessage

    await it('should return matching protocol from set', () => {
      const protocols = new Set([`${Protocol.UI}${ProtocolVersion['0.0.1']}`])
      const result = handleProtocols(protocols, dummyRequest)
      assert.strictEqual(result, `${Protocol.UI}${ProtocolVersion['0.0.1']}`)
    })

    await it('should return false for empty set', () => {
      assert.strictEqual(handleProtocols(new Set(), dummyRequest), false)
    })

    await it('should return false and log error when no protocol is supported', t => {
      const { errorMock } = createLoggerMocks(t, logger)
      const protocols = new Set(['unsupported1', 'unsupported2'])
      assert.strictEqual(handleProtocols(protocols, dummyRequest), false)
      assert.strictEqual(errorMock.mock.calls.length, 1)
    })

    await it('should return first supported protocol when multiple provided', () => {
      const supported = `${Protocol.UI}${ProtocolVersion['0.0.1']}`
      const protocols = new Set([supported, 'unsupported'])
      assert.strictEqual(handleProtocols(protocols, dummyRequest), supported)
    })
  })

  await describe('isLoopback', async () => {
    await it('should return true for localhost', () => {
      assert.strictEqual(isLoopback('localhost'), true)
    })

    await it('should return true for 127.0.0.1', () => {
      assert.strictEqual(isLoopback('127.0.0.1'), true)
    })

    await it('should return true for IPv6 loopback ::1', () => {
      assert.strictEqual(isLoopback('::1'), true)
    })

    await it('should return true for full IPv6 loopback', () => {
      assert.strictEqual(isLoopback('0000:0000:0000:0000:0000:0000:0000:0001'), true)
    })

    await it('should return false for external IPv4 address', () => {
      assert.strictEqual(isLoopback('192.168.1.1'), false)
    })

    await it('should return false for empty string', () => {
      assert.strictEqual(isLoopback(''), false)
    })
  })
})
