/**
 * @file Tests for UIServerUtils
 * @description Unit tests for UI server utility functions (auth token parsing, protocol handling, loopback detection)
 */

import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  evaluateUIServerAccess,
  getProtocolAndVersion,
  getUsernameAndPasswordFromAuthorizationToken,
  handleProtocols,
  isLoopback,
  isProtocolAndVersionSupported,
} from '../../../src/charging-station/ui-server/UIServerUtils.js'
import {
  ApplicationProtocol,
  ApplicationProtocolVersion,
  Protocol,
  ProtocolVersion,
  type UIServerConfiguration,
} from '../../../src/types/index.js'
import { logger } from '../../../src/utils/index.js'
import { createLoggerMocks, standardCleanup } from '../../helpers/TestLifecycleHelpers.js'

await describe('UIServerUtils', async () => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noop = (): void => {}

  const createAccessPolicyConfiguration = (
    overrides?: Partial<UIServerConfiguration>
  ): UIServerConfiguration => ({
    accessPolicy: {
      allowedHosts: [],
      allowedOrigins: [],
      allowLoopbackProxy: false,
      requireTlsForNonLoopback: true,
      trustedProxies: [],
    },
    enabled: true,
    options: {
      host: 'localhost',
      port: 8080,
    },
    type: ApplicationProtocol.WS,
    version: ApplicationProtocolVersion.VERSION_11,
    ...overrides,
  })

  const createAccessPolicyRequest = ({
    encrypted = false,
    headers = {},
    rawHeaders = [],
    remoteAddress = '127.0.0.1',
  }: {
    encrypted?: boolean
    headers?: IncomingHttpHeaders
    rawHeaders?: string[]
    remoteAddress?: string
  }): IncomingMessage => {
    return {
      headers,
      rawHeaders,
      socket: { encrypted, remoteAddress } as never,
    } as unknown as IncomingMessage
  }

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

    await it('should return true for IPv4-mapped loopback addresses', () => {
      assert.strictEqual(isLoopback('::ffff:127.0.0.1'), true)
      assert.strictEqual(isLoopback('::ffff:7f00:1'), true)
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

    await it('should return false for invalid and ambiguous addresses', () => {
      assert.strictEqual(isLoopback('127.999.999.999'), false)
      assert.strictEqual(isLoopback('1'), false)
      assert.strictEqual(isLoopback('[::1]:8080'), true)
    })

    await it('should return false for empty string', () => {
      assert.strictEqual(isLoopback(''), false)
    })
  })

  await describe('evaluateUIServerAccess', async () => {
    await it('should allow direct loopback plaintext requests', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({ headers: { host: 'localhost:8080' } }),
        createAccessPolicyConfiguration()
      )

      assert.strictEqual(decision.allowed, true)
    })

    await it('should allow direct IPv6 loopback plaintext requests', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          headers: { host: '[::1]:8080' },
          remoteAddress: '::1',
        }),
        createAccessPolicyConfiguration()
      )

      assert.strictEqual(decision.allowed, true)
    })

    await it('should allow direct non-loopback TLS requests with an allowed host', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          encrypted: true,
          headers: { host: 'gateway.example.com' },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: { allowedHosts: ['gateway.example.com'] },
        })
      )

      assert.strictEqual(decision.allowed, true)
    })

    await it('should reject spoofed forwarded proto from direct non-loopback clients', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          headers: { host: 'gateway.example.com', 'x-forwarded-proto': 'https' },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: { allowedHosts: ['gateway.example.com'] },
        })
      )

      assert.strictEqual(decision.allowed, false)
      assert.match(decision.reason ?? '', /trusted proxies/i)
    })

    await it('should allow secure traffic from a trusted proxy', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should allow standard Forwarded proto-only traffic from a trusted proxy', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'proto=https',
            host: 'gateway.example.com',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '192.0.2.10')
    })

    await it('should allow standard Forwarded for and proto traffic from a trusted proxy', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for=203.0.113.10;proto=https',
            host: 'gateway.example.com',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should reject plaintext traffic from a trusted proxy', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'http',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, false)
      assert.match(decision.reason ?? '', /secure forwarded protocol/i)
    })

    await it('should reject insecure forwarded protocol over an encrypted proxy connection', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          encrypted: true,
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'http',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, false)
      assert.match(decision.reason ?? '', /secure forwarded protocol/i)
    })

    await it('should reject ambiguous forwarded client address lists', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '198.51.100.77, 203.0.113.10',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, false)
      assert.match(decision.reason ?? '', /x-forwarded-for/i)
    })

    await it('should reject loopback proxy forwarding without explicit opt-in', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          headers: {
            host: 'localhost:8080',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '127.0.0.1',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: { trustedProxies: ['127.0.0.1'] },
        })
      )

      assert.strictEqual(decision.allowed, false)
      assert.match(decision.reason ?? '', /allowLoopbackProxy/i)
    })

    await it('should reject duplicate forwarded headers', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          headers: { host: 'gateway.example.com', 'x-forwarded-proto': 'https' },
          rawHeaders: [
            'Host',
            'gateway.example.com',
            'X-Forwarded-Proto',
            'https',
            'X-Forwarded-Proto',
            'https',
          ],
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: { allowedHosts: ['gateway.example.com'] },
        })
      )

      assert.strictEqual(decision.allowed, false)
      assert.match(decision.reason ?? '', /duplicate/i)
    })

    await it('should reject disallowed host headers', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({ headers: { host: 'attacker.test' } }),
        createAccessPolicyConfiguration()
      )

      assert.strictEqual(decision.allowed, false)
      assert.match(decision.reason ?? '', /host/i)
    })

    await it('should reject wildcard listen hosts without explicit allowed hosts', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          encrypted: true,
          headers: { host: 'gateway.example.com' },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          options: { host: '0.0.0.0', port: 8080 },
        })
      )

      assert.strictEqual(decision.allowed, false)
      assert.match(decision.reason ?? '', /host/i)
    })

    await it('should allow wildcard listen hosts with explicit allowed hosts', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          encrypted: true,
          headers: { host: 'gateway.example.com' },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: { allowedHosts: ['gateway.example.com'] },
          options: { host: '0.0.0.0', port: 8080 },
        })
      )

      assert.strictEqual(decision.allowed, true)
    })

    await it('should reject disallowed origin headers', () => {
      const decision = evaluateUIServerAccess(
        createAccessPolicyRequest({
          headers: { host: 'localhost:8080', origin: 'http://attacker.test' },
        }),
        createAccessPolicyConfiguration()
      )

      assert.strictEqual(decision.allowed, false)
      assert.match(decision.reason ?? '', /origin/i)
    })
  })
})
