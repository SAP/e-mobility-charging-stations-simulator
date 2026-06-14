/**
 * @file Tests for UIServerAccessPolicy
 * @description Unit tests for the UI server gateway access policy:
 *   per-request decision evaluation, forwarded-header parsing, host/origin
 *   allowlists, trusted-proxy classification, and the per-request memo cache.
 */

import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  createUIServerAccessCache,
  resolveUIServerAccess,
  type UIServerAccessDecision,
  UIServerAccessDenialReason,
} from '../../../src/charging-station/ui-server/UIServerAccessPolicy.js'
import { type UIServerConfiguration } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import {
  createGatewayConfigWithoutTrustedProxies,
  createGatewayConfigWithTrustedProxy,
  createMockUIServerConfiguration,
} from './UIServerTestUtils.js'

await describe('UIServerAccessPolicy', async () => {
  const createAccessPolicyConfiguration = (
    overrides?: Partial<UIServerConfiguration>
  ): UIServerConfiguration => createMockUIServerConfiguration(overrides)

  const createAccessPolicyRequest = ({
    encrypted = false,
    headers = {},
    headersDistinct = {},
    rawHeaders = [],
    remoteAddress = '127.0.0.1',
  }: {
    encrypted?: boolean
    headers?: IncomingHttpHeaders
    headersDistinct?: NodeJS.Dict<string[]>
    rawHeaders?: string[]
    remoteAddress?: string
  }): IncomingMessage => {
    return {
      headers,
      headersDistinct,
      rawHeaders,
      socket: { encrypted, remoteAddress } as never,
    } as unknown as IncomingMessage
  }

  // Narrows the discriminated union and asserts the enum reason; tests assert
  // on the machine-readable identity rather than the rendered message.
  const expectDenied = (
    decision: UIServerAccessDecision,
    expectedReason: UIServerAccessDenialReason
  ): void => {
    assert.strictEqual(decision.allowed, false)
    assert.strictEqual(decision.reason, expectedReason)
    assert.strictEqual(decision.message.length > 0, true)
  }

  const evaluate = (req: IncomingMessage, config: UIServerConfiguration): UIServerAccessDecision =>
    resolveUIServerAccess(req, config, createUIServerAccessCache())

  afterEach(() => {
    standardCleanup()
  })

  await describe('resolveUIServerAccess', async () => {
    await it('should allow direct loopback plaintext requests', () => {
      const decision = evaluate(
        createAccessPolicyRequest({ headers: { host: 'localhost:8080' } }),
        createAccessPolicyConfiguration()
      )

      assert.strictEqual(decision.allowed, true)
    })

    await it('should allow direct IPv6 loopback plaintext requests', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: '[::1]:8080' },
          remoteAddress: '::1',
        }),
        createAccessPolicyConfiguration()
      )

      assert.strictEqual(decision.allowed, true)
    })

    await it('should reject direct non-loopback plaintext requests', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: 'gateway.example.com' },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.TlsRequired)
    })

    await it('should reject spoofed forwarded proto from direct non-loopback clients', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: 'gateway.example.com', 'x-forwarded-proto': 'https' },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.ForwardedFromUntrustedPeer)
    })

    await it('should allow secure traffic from a trusted proxy', () => {
      const decision = evaluate(
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
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should match an IPv4-mapped IPv6 remote against an IPv4 trusted proxy', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.7',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '::ffff:1.2.3.4',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['1.2.3.4'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.7')
    })

    await it('should match the hexadecimal IPv4-mapped IPv6 form against an IPv4 trusted proxy', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.7',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '::ffff:0102:0304',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['1.2.3.4'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.7')
    })

    await it('should allow standard Forwarded proto-only traffic from a trusted proxy', () => {
      const decision = evaluate(
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
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '192.0.2.10')
    })

    await it('should allow standard Forwarded for and proto traffic from a trusted proxy', () => {
      const decision = evaluate(
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
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should reject plaintext traffic from a trusted proxy', () => {
      const decision = evaluate(
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
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.ProxyTlsRequired)
    })

    await it('should reject ambiguous forwarded client address lists', () => {
      const decision = evaluate(
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
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.AmbiguousForwardedClient)
    })

    await it('should reject ambiguous X-Forwarded-Proto multi-value lists', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'https, http',
          },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      expectDenied(decision, UIServerAccessDenialReason.AmbiguousForwardedProtocol)
    })

    await it('should reject ambiguous X-Forwarded-Host multi-value lists', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-host': 'a.example.com, b.example.com',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      expectDenied(decision, UIServerAccessDenialReason.AmbiguousForwardedHost)
    })

    await it('should reject empty X-Forwarded-Proto comma-only lists from a trusted proxy', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': ',,,',
          },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      expectDenied(decision, UIServerAccessDenialReason.InvalidForwardedProtocol)
    })

    await it('should reject empty X-Forwarded-Host comma-only lists from a trusted proxy', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-host': ',,,',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      expectDenied(decision, UIServerAccessDenialReason.InvalidForwardedHost)
    })

    await it('should reject Forwarded headers with multiple comma-separated entries', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for=203.0.113.10;proto=https, for=198.51.100.77;proto=https',
            host: 'gateway.example.com',
          },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      expectDenied(decision, UIServerAccessDenialReason.AmbiguousForwardedHeader)
    })

    await it('should treat an empty Forwarded header as absent', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: '',
            host: 'localhost:8080',
          },
        }),
        createAccessPolicyConfiguration()
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '127.0.0.1')
    })

    await it('should reject Forwarded entries with duplicate parameters', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for=203.0.113.10;for=198.51.100.77;proto=https',
            host: 'gateway.example.com',
          },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      expectDenied(decision, UIServerAccessDenialReason.AmbiguousForwardedParameter)
    })

    await it('should reject non-IP, non-hidden Forwarded for parameters', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for=gateway.local;proto=https',
            host: 'gateway.example.com',
          },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      expectDenied(decision, UIServerAccessDenialReason.InvalidForwardedClient)
    })

    await it('should reject when both X-Forwarded-For and Forwarded for= are present', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for=unknown;proto=https',
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
          },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      expectDenied(decision, UIServerAccessDenialReason.AmbiguousForwardedClient)
    })

    await it('should detect duplicate gateway headers via headersDistinct alone', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'https',
          },
          headersDistinct: { 'x-forwarded-for': ['203.0.113.10', '198.51.100.77'] },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      expectDenied(decision, UIServerAccessDenialReason.DuplicateGatewayHeaders)
    })

    await it('should reject loopback proxy forwarding without explicit opt-in', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'localhost:8080',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '127.0.0.1',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: [],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['127.0.0.1'],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.LoopbackProxyDisabled)
    })

    await it('should accept loopback proxy forwarding when allowLoopbackProxy is enabled', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'localhost:8080',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '127.0.0.1',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: [],
            allowedOrigins: [],
            allowLoopbackProxy: true,
            requireTlsForNonLoopback: true,
            trustedProxies: ['127.0.0.1'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should reject duplicate forwarded headers', () => {
      const decision = evaluate(
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
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.DuplicateGatewayHeaders)
    })

    await it('should reject disallowed host headers', () => {
      const decision = evaluate(
        createAccessPolicyRequest({ headers: { host: 'attacker.test' } }),
        createAccessPolicyConfiguration()
      )

      expectDenied(decision, UIServerAccessDenialReason.HostNotAllowed)
    })

    await it('should reject wildcard listen hosts without explicit allowed hosts', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          encrypted: true,
          headers: { host: 'gateway.example.com' },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          options: { host: '0.0.0.0', port: 8080 },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.HostNotAllowed)
    })

    await it('should match X-Forwarded-Host against allowedHosts when the immediate peer is a trusted proxy', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'internal-svc',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-host': 'gateway.example.com',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
    })

    await it('should match Forwarded host parameter against allowedHosts when the immediate peer is a trusted proxy', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for=203.0.113.10;host=gateway.example.com;proto=https',
            host: 'internal-svc',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
    })

    await it('should reject conflicting Forwarded host and X-Forwarded-Host headers', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for=203.0.113.10;host=gateway.example.com;proto=https',
            host: 'internal-svc',
            'x-forwarded-host': 'attacker.test',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.AmbiguousForwardedHost)
    })

    await it('should ignore Forwarded host parameter when the immediate peer is untrusted', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'host=gateway.example.com',
            host: 'internal-svc',
          },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.ForwardedFromUntrustedPeer)
    })

    await it('should prefer untrusted peer denial over ambiguous forwarded protocol', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'proto=https',
            host: 'gateway.example.com',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.ForwardedFromUntrustedPeer)
    })

    await it('should prefer untrusted peer denial over ambiguous forwarded host', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'host=gateway.example.com',
            host: 'internal-svc',
            'x-forwarded-host': 'attacker.test',
          },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.ForwardedFromUntrustedPeer)
    })

    await it('should fall back to Host header when Forwarded host parameter is empty', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for=203.0.113.10;host=;proto=https',
            host: 'gateway.example.com',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should fall back to Host header when X-Forwarded-Host is empty', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-host': '',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should treat empty X-Forwarded-Proto as absent rather than ambiguous', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': '',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.ProxyTlsRequired)
    })

    await it('should fall back to remote address when X-Forwarded-For is empty', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '192.0.2.10')
    })

    await it('should ignore empty X-Forwarded-For when Forwarded for parameter is present', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for=203.0.113.10;proto=https',
            host: 'gateway.example.com',
            'x-forwarded-for': '',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should treat empty forwarded headers as absent for the trusted-peer check', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-proto': '',
          },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.TlsRequired)
    })

    await it('should treat whitespace-only forwarded headers as absent', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'localhost:8080',
            'x-forwarded-proto': '   ',
          },
        }),
        createAccessPolicyConfiguration()
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '127.0.0.1')
    })

    await it('should accept empty forwarded headers from a loopback peer', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'localhost:8080',
            'x-forwarded-proto': '',
          },
          remoteAddress: '127.0.0.1',
        }),
        createAccessPolicyConfiguration()
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '127.0.0.1')
    })

    await it('should treat Forwarded for=unknown as identity hidden and use the trusted proxy address', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for=unknown;proto=https',
            host: 'gateway.example.com',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '192.0.2.10')
    })

    await it('should treat Forwarded obfuscated for parameter as identity hidden', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for=_hidden;proto=https',
            host: 'gateway.example.com',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '192.0.2.10')
    })

    await it('should treat X-Forwarded-For unknown as identity hidden', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': 'unknown',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '192.0.2.10')
    })

    await it('should reject disallowed origin headers', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: 'localhost:8080', origin: 'http://attacker.test' },
        }),
        createAccessPolicyConfiguration()
      )

      expectDenied(decision, UIServerAccessDenialReason.OriginNotAllowed)
    })

    await it('should reject malformed Origin URLs', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: 'localhost:8080', origin: 'not-a-valid-url' },
        }),
        createAccessPolicyConfiguration()
      )

      expectDenied(decision, UIServerAccessDenialReason.OriginNotAllowed)
    })

    await it('should accept Origin matching allowedHosts when allowedOrigins is empty', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            origin: 'https://gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should accept allowedOrigins entries with a trailing slash', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: 'localhost:8080', origin: 'https://app.example.com' },
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: [],
            allowedOrigins: ['https://app.example.com/'],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
    })

    await it('should accept allowedOrigins entries with the protocol default port', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: 'localhost:8080', origin: 'https://app.example.com' },
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: [],
            allowedOrigins: ['https://app.example.com:443'],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
    })

    await it('should reject origins that differ from allowedOrigins by port', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: 'localhost:8080', origin: 'https://app.example.com:8081' },
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: [],
            allowedOrigins: ['https://app.example.com:8080'],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.OriginNotAllowed)
    })

    await it('should reject origins that differ from allowedOrigins by protocol', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: 'localhost:8080', origin: 'http://app.example.com' },
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: [],
            allowedOrigins: ['https://app.example.com'],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: [],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.OriginNotAllowed)
    })

    await it('should extract IPv6 client address from Forwarded for parameter with port', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded: 'for="[2001:db8::1]:8080";proto=https',
            host: 'gateway.example.com',
          },
          remoteAddress: '2001:db8::100',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['2001:db8::100'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '2001:db8:0:0:0:0:0:1')
    })

    await it('should unescape RFC 7230 quoted-pair sequences in Forwarded parameter values', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            forwarded:
              'for="203.0.113.10";host="\\g\\a\\t\\e\\w\\a\\y\\.\\e\\x\\a\\m\\p\\l\\e\\.\\c\\o\\m";proto=https',
            host: 'gateway.example.com',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should still require TLS when a trusted proxy claims a loopback client', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '127.0.0.1',
            'x-forwarded-proto': 'http',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.ProxyTlsRequired)
    })

    await it('should deny non-loopback access when accessPolicy is undefined', () => {
      const config = createAccessPolicyConfiguration()

      delete (config as { accessPolicy?: unknown }).accessPolicy

      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: 'localhost:8080' },
          remoteAddress: '203.0.113.10',
        }),
        config
      )
      expectDenied(decision, UIServerAccessDenialReason.TlsRequired)
    })

    await it('should allow loopback access when accessPolicy is undefined', () => {
      const config = createAccessPolicyConfiguration()

      delete (config as { accessPolicy?: unknown }).accessPolicy

      const decision = evaluate(
        createAccessPolicyRequest({ headers: { host: 'localhost:8080' } }),
        config
      )
      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '127.0.0.1')
    })

    await it('should allow non-loopback plaintext when requireTlsForNonLoopback is false', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: 'gateway.example.com' },
          remoteAddress: '203.0.113.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: false,
            trustedProxies: [],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
    })

    await it('should reject X-Forwarded-For with no parseable addresses', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': ',',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '192.0.2.10',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: ['gateway.example.com'],
            allowedOrigins: [],
            allowLoopbackProxy: false,
            requireTlsForNonLoopback: true,
            trustedProxies: ['192.0.2.10'],
          },
        })
      )

      expectDenied(decision, UIServerAccessDenialReason.InvalidForwardedClient)
    })

    await it('should reject literal null origin from sandboxed contexts', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: { host: 'localhost:8080', origin: 'null' },
        }),
        createAccessPolicyConfiguration()
      )

      expectDenied(decision, UIServerAccessDenialReason.OriginNotAllowed)
    })

    await it('should normalize whitespace-padded Host headers', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: '  gateway.example.com  ',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should accept uppercase X-Forwarded-Proto values', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'gateway.example.com',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'HTTPS',
          },
          remoteAddress: '192.0.2.10',
        }),
        createGatewayConfigWithTrustedProxy()
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should accept IPv4-mapped IPv6 loopback proxies when allowLoopbackProxy is enabled', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          headers: {
            host: 'localhost:8080',
            'x-forwarded-for': '203.0.113.10',
            'x-forwarded-proto': 'https',
          },
          remoteAddress: '::ffff:127.0.0.1',
        }),
        createAccessPolicyConfiguration({
          accessPolicy: {
            allowedHosts: [],
            allowedOrigins: [],
            allowLoopbackProxy: true,
            requireTlsForNonLoopback: true,
            trustedProxies: ['127.0.0.1'],
          },
        })
      )

      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.clientAddress, '203.0.113.10')
    })

    await it('should require TLS even when the underlying socket is encrypted but no forwarded headers are present', () => {
      const decision = evaluate(
        createAccessPolicyRequest({
          encrypted: true,
          headers: { host: 'gateway.example.com' },
          remoteAddress: '203.0.113.10',
        }),
        createGatewayConfigWithoutTrustedProxies()
      )

      expectDenied(decision, UIServerAccessDenialReason.TlsRequired)
    })
  })

  await describe('per-request memoization', async () => {
    await it('should evaluate the policy only once per request', () => {
      const config = createAccessPolicyConfiguration()
      const cache = createUIServerAccessCache()
      const req = createAccessPolicyRequest({ headers: { host: 'localhost:8080' } })

      const first = resolveUIServerAccess(req, config, cache)
      const second = resolveUIServerAccess(req, config, cache)

      assert.strictEqual(first, second)
      assert.strictEqual(first.allowed, true)
    })

    await it('should return distinct decisions for distinct requests', () => {
      const config = createAccessPolicyConfiguration()
      const cache = createUIServerAccessCache()
      const reqA = createAccessPolicyRequest({ headers: { host: 'localhost:8080' } })
      const reqB = createAccessPolicyRequest({
        headers: { host: 'attacker.test' },
        remoteAddress: '127.0.0.1',
      })

      const decisionA = resolveUIServerAccess(reqA, config, cache)
      const decisionB = resolveUIServerAccess(reqB, config, cache)

      assert.strictEqual(decisionA.allowed, true)
      expectDenied(decisionB, UIServerAccessDenialReason.HostNotAllowed)
    })

    await it('should isolate decisions across distinct caches', () => {
      const config = createAccessPolicyConfiguration()
      const cacheA = createUIServerAccessCache()
      const cacheB = createUIServerAccessCache()
      const req = createAccessPolicyRequest({ headers: { host: 'localhost:8080' } })

      resolveUIServerAccess(req, config, cacheA)

      assert.strictEqual(cacheA.decisions.has(req), true)
      assert.strictEqual(cacheB.decisions.has(req), false)
    })
  })
})
