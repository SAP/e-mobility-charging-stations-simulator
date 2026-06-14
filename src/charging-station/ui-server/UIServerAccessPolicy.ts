import type { IncomingMessage } from 'node:http'

import type { UIServerConfiguration } from '../../types/index.js'

import { UI_SERVER_ACCESS_POLICY_DEFAULTS } from '../../utils/ConfigurationSchema.js'
import {
  isLoopback,
  normalizeHost,
  normalizeIPAddress,
  splitHeaderList,
  splitQuoted,
} from './UIServerNet.js'

const FORWARDED_HEADER_NAMES = [
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
] as const
const SECURE_FORWARDED_PROTOCOLS = new Set(['https', 'wss'])
const WILDCARD_HOSTS = new Set(['', '0.0.0.0', '::'])

/**
 * Reasons a UI server access decision is denied.
 *
 * The enum value is the machine-readable identity; the rendered text is
 * `DENIAL_MESSAGES[reason]`.
 */
export enum UIServerAccessDenialReason {
  AmbiguousForwardedClient = 'ambiguous-forwarded-client',
  AmbiguousForwardedHeader = 'ambiguous-forwarded-header',
  AmbiguousForwardedHost = 'ambiguous-forwarded-host',
  AmbiguousForwardedParameter = 'ambiguous-forwarded-parameter',
  AmbiguousForwardedProtocol = 'ambiguous-forwarded-protocol',
  DuplicateGatewayHeaders = 'duplicate-gateway-headers',
  ForwardedFromUntrustedPeer = 'forwarded-from-untrusted-peer',
  HostNotAllowed = 'host-not-allowed',
  InvalidForwardedClient = 'invalid-forwarded-client',
  InvalidForwardedHost = 'invalid-forwarded-host',
  InvalidForwardedProtocol = 'invalid-forwarded-protocol',
  LoopbackProxyDisabled = 'loopback-proxy-disabled',
  OriginNotAllowed = 'origin-not-allowed',
  ProxyTlsRequired = 'proxy-tls-required',
  TlsRequired = 'tls-required',
}

const DENIAL_MESSAGES: Readonly<Record<UIServerAccessDenialReason, string>> = {
  [UIServerAccessDenialReason.AmbiguousForwardedClient]:
    'Ambiguous forwarded client address headers are not allowed',
  [UIServerAccessDenialReason.AmbiguousForwardedHeader]:
    'Ambiguous Forwarded header is not allowed',
  [UIServerAccessDenialReason.AmbiguousForwardedHost]:
    'Ambiguous forwarded host headers are not allowed',
  [UIServerAccessDenialReason.AmbiguousForwardedParameter]:
    'Ambiguous Forwarded parameter is not allowed',
  [UIServerAccessDenialReason.AmbiguousForwardedProtocol]:
    'Ambiguous forwarded protocol headers are not allowed',
  [UIServerAccessDenialReason.DuplicateGatewayHeaders]:
    'Duplicate gateway security headers are not allowed',
  [UIServerAccessDenialReason.ForwardedFromUntrustedPeer]:
    'Forwarded headers are only accepted from trusted proxies',
  [UIServerAccessDenialReason.HostNotAllowed]: 'Host header is not allowed',
  [UIServerAccessDenialReason.InvalidForwardedClient]:
    'Invalid X-Forwarded-For header is not allowed',
  [UIServerAccessDenialReason.InvalidForwardedHost]:
    'Invalid X-Forwarded-Host header is not allowed',
  [UIServerAccessDenialReason.InvalidForwardedProtocol]:
    'Invalid X-Forwarded-Proto header is not allowed',
  [UIServerAccessDenialReason.LoopbackProxyDisabled]:
    'Loopback proxy forwarding requires accessPolicy.allowLoopbackProxy=true',
  [UIServerAccessDenialReason.OriginNotAllowed]: 'Origin header is not allowed',
  [UIServerAccessDenialReason.ProxyTlsRequired]:
    'Trusted proxy requests must use a secure forwarded protocol',
  [UIServerAccessDenialReason.TlsRequired]: 'TLS is required for non-loopback UI server access',
}

/**
 * Per-{@link AbstractUIServer} cache holding the decisions of in-flight
 * requests and the normalized trusted-proxy index of the active
 * configuration. Both maps are weakly keyed so entries are released with
 * their owning object.
 *
 * Cache invalidation is identity-based: mutating
 * `accessPolicy.trustedProxies` in place will not refresh the normalized
 * set. Reload flows must construct a new {@link UIServerConfiguration}.
 */
export interface UIServerAccessCache {
  readonly decisions: WeakMap<IncomingMessage, UIServerAccessDecision>
  readonly trustedProxies: WeakMap<UIServerConfiguration, ReadonlySet<string>>
}

/**
 * UI server access decision: `allowed: true` carries the resolved client
 * address; `allowed: false` carries the denial reason and rendered message.
 */
export type UIServerAccessDecision =
  | {
    readonly allowed: false
    readonly clientAddress: string
    readonly message: string
    readonly reason: UIServerAccessDenialReason
  }
  | { readonly allowed: true; readonly clientAddress: string }

export const createUIServerAccessCache = (): UIServerAccessCache => ({
  decisions: new WeakMap<IncomingMessage, UIServerAccessDecision>(),
  trustedProxies: new WeakMap<UIServerConfiguration, ReadonlySet<string>>(),
})

type ParseOutcome<T> =
  | { readonly kind: 'absent' }
  | { readonly kind: 'error'; readonly reason: UIServerAccessDenialReason }
  | { readonly kind: 'ok'; readonly value: T }

const ABSENT: ParseOutcome<never> = { kind: 'absent' }

type ForwardedParams = Partial<Record<'by' | 'for' | 'host' | 'proto', string>>

export const resolveUIServerAccess = (
  req: IncomingMessage,
  uiServerConfiguration: UIServerConfiguration,
  cache: UIServerAccessCache
): UIServerAccessDecision => {
  const cached = cache.decisions.get(req)
  if (cached != null) {
    return cached
  }
  const decision = evaluateUIServerAccess(req, uiServerConfiguration, cache)
  cache.decisions.set(req, decision)
  return decision
}

const evaluateUIServerAccess = (
  req: IncomingMessage,
  uiServerConfiguration: UIServerConfiguration,
  cache: UIServerAccessCache
): UIServerAccessDecision => {
  const accessPolicy = uiServerConfiguration.accessPolicy
  const allowLoopbackProxy =
    accessPolicy?.allowLoopbackProxy ?? UI_SERVER_ACCESS_POLICY_DEFAULTS.allowLoopbackProxy
  const requireTlsForNonLoopback =
    accessPolicy?.requireTlsForNonLoopback ??
    UI_SERVER_ACCESS_POLICY_DEFAULTS.requireTlsForNonLoopback
  const trustedProxies = getTrustedProxies(uiServerConfiguration, cache)
  const remoteAddress = req.socket.remoteAddress ?? ''
  const remoteAddressIsLoopback = isLoopback(remoteAddress)
  const remoteAddressIsTrustedProxy = isTrustedProxy(remoteAddress, trustedProxies)
  const forwardedHeadersPresent = hasForwardedHeaders(req)
  const forwarded = parseSingleForwardedHeader(req)
  const forwardedProtocol = getForwardedProtocol(req, forwarded)
  const forwardedClientAddress = getForwardedClientAddress(
    req,
    remoteAddressIsTrustedProxy,
    forwarded
  )
  const forwardedHost = getForwardedHost(req, forwarded)
  const clientAddress =
    forwardedClientAddress.kind === 'ok' ? forwardedClientAddress.value : remoteAddress

  if (hasDuplicateHeaders(req, [...FORWARDED_HEADER_NAMES, 'host', 'origin'])) {
    return deny(clientAddress, UIServerAccessDenialReason.DuplicateGatewayHeaders)
  }
  if (forwardedHeadersPresent && !remoteAddressIsTrustedProxy) {
    return deny(clientAddress, UIServerAccessDenialReason.ForwardedFromUntrustedPeer)
  }
  if (forwardedProtocol.kind === 'error') {
    return deny(clientAddress, forwardedProtocol.reason)
  }
  if (forwardedClientAddress.kind === 'error') {
    return deny(clientAddress, forwardedClientAddress.reason)
  }
  if (forwardedHost.kind === 'error') {
    return deny(clientAddress, forwardedHost.reason)
  }
  if (forwardedHeadersPresent && remoteAddressIsLoopback && !allowLoopbackProxy) {
    return deny(clientAddress, UIServerAccessDenialReason.LoopbackProxyDisabled)
  }
  if (!isHostAllowed(req, uiServerConfiguration, remoteAddressIsTrustedProxy, forwardedHost)) {
    return deny(clientAddress, UIServerAccessDenialReason.HostNotAllowed)
  }
  if (!isOriginAllowed(req, uiServerConfiguration)) {
    return deny(clientAddress, UIServerAccessDenialReason.OriginNotAllowed)
  }

  const forwardedProtocolValue =
    forwardedProtocol.kind === 'ok' ? forwardedProtocol.value : undefined
  const secureForwardedProtocol = isSecureForwardedProtocol(forwardedProtocolValue)
  if (requireTlsForNonLoopback && forwardedHeadersPresent && !secureForwardedProtocol) {
    return deny(clientAddress, UIServerAccessDenialReason.ProxyTlsRequired)
  }
  if (requireTlsForNonLoopback && !remoteAddressIsLoopback && !secureForwardedProtocol) {
    return deny(clientAddress, UIServerAccessDenialReason.TlsRequired)
  }

  return { allowed: true, clientAddress }
}

const deny = (
  clientAddress: string,
  reason: UIServerAccessDenialReason
): UIServerAccessDecision => {
  return {
    allowed: false,
    clientAddress,
    message: DENIAL_MESSAGES[reason],
    reason,
  }
}

const getForwardedClientAddress = (
  req: IncomingMessage,
  trustedProxy: boolean,
  forwarded: ParseOutcome<ForwardedParams>
): ParseOutcome<string> => {
  if (forwarded.kind === 'error') {
    return forwarded
  }
  if (!trustedProxy) {
    return ABSENT
  }
  const picked = pickForwardedValue(
    nonEmpty(getSingleHeaderValue(req, 'x-forwarded-for')),
    forwarded.kind === 'ok' ? forwarded.value.for : undefined,
    UIServerAccessDenialReason.AmbiguousForwardedClient
  )
  if (picked.kind !== 'ok') {
    return picked
  }
  const addresses = splitHeaderList(picked.value)
  if (addresses.length === 0) {
    return { kind: 'error', reason: UIServerAccessDenialReason.InvalidForwardedClient }
  }
  // Multi-hop X-Forwarded-For chains are intentionally rejected: ambiguity in
  // trust depth would require a CIDR/hop-count model (see proxy-addr
  // semantics) that is out of scope for this version. Documented in the
  // README "UI Protocol" section.
  if (addresses.length !== 1) {
    return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedClient }
  }
  const candidate = addresses[0]
  if (isHiddenIdentity(candidate)) {
    return ABSENT
  }
  const normalizedAddress = normalizeIPAddress(candidate)
  return normalizedAddress != null
    ? { kind: 'ok', value: normalizedAddress.value }
    : { kind: 'error', reason: UIServerAccessDenialReason.InvalidForwardedClient }
}

const getForwardedProtocol = (
  req: IncomingMessage,
  forwarded: ParseOutcome<ForwardedParams>
): ParseOutcome<string> => {
  if (forwarded.kind === 'error') {
    return forwarded
  }
  const xForwardedProtocol = nonEmpty(getSingleHeaderValue(req, 'x-forwarded-proto'))
  const picked = pickForwardedValue(
    xForwardedProtocol,
    forwarded.kind === 'ok' ? forwarded.value.proto : undefined,
    UIServerAccessDenialReason.AmbiguousForwardedProtocol
  )
  if (picked.kind !== 'ok') {
    return picked
  }
  if (xForwardedProtocol != null) {
    const protocols = splitHeaderList(xForwardedProtocol)
    if (protocols.length === 0) {
      return { kind: 'error', reason: UIServerAccessDenialReason.InvalidForwardedProtocol }
    }
    if (protocols.length > 1) {
      return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedProtocol }
    }
    return { kind: 'ok', value: protocols[0].toLowerCase() }
  }
  return { kind: 'ok', value: picked.value.toLowerCase() }
}

const getForwardedHost = (
  req: IncomingMessage,
  forwarded: ParseOutcome<ForwardedParams>
): ParseOutcome<string> => {
  if (forwarded.kind === 'error') {
    return forwarded
  }
  const xForwardedHost = nonEmpty(getSingleHeaderValue(req, 'x-forwarded-host'))
  const picked = pickForwardedValue(
    xForwardedHost,
    forwarded.kind === 'ok' ? forwarded.value.host : undefined,
    UIServerAccessDenialReason.AmbiguousForwardedHost
  )
  if (picked.kind !== 'ok') {
    return picked
  }
  if (xForwardedHost != null) {
    const hosts = splitHeaderList(xForwardedHost)
    if (hosts.length === 0) {
      return { kind: 'error', reason: UIServerAccessDenialReason.InvalidForwardedHost }
    }
    if (hosts.length > 1) {
      return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedHost }
    }
    return { kind: 'ok', value: hosts[0] }
  }
  return { kind: 'ok', value: picked.value }
}

const pickForwardedValue = (
  xValue: string | undefined,
  forwardedValue: string | undefined,
  ambiguousReason: UIServerAccessDenialReason
): ParseOutcome<string> => {
  if (xValue != null && forwardedValue != null) {
    return { kind: 'error', reason: ambiguousReason }
  }
  const value = forwardedValue ?? xValue
  return value != null ? { kind: 'ok', value } : ABSENT
}

const nonEmpty = (value: string | undefined): string | undefined =>
  value == null || value.trim() === '' ? undefined : value

// RFC 7239 §6: "unknown" and obfuscated node identifiers ("_" + token chars).
// Optional ":port" suffix is stripped before comparison.
const isHiddenIdentity = (value: string): boolean => {
  const withoutPort = value.replace(/:\d+$/, '')
  return withoutPort.toLowerCase() === 'unknown' || /^_[A-Za-z0-9._-]+$/.test(withoutPort)
}

const parseSingleForwardedHeader = (req: IncomingMessage): ParseOutcome<ForwardedParams> => {
  const forwarded = nonEmpty(getSingleHeaderValue(req, 'forwarded'))
  if (forwarded == null) {
    return ABSENT
  }
  const entries = splitHeaderList(forwarded)
  if (entries.length !== 1) {
    return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedHeader }
  }
  const params: ForwardedParams = {}
  for (const part of splitQuoted(entries[0], ';')) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }
    const key = part.slice(0, separatorIndex).trim().toLowerCase()
    const raw = part.slice(separatorIndex + 1).trim()
    const quoted = /^"(.*)"$/.exec(raw)
    const value = nonEmpty(quoted != null ? quoted[1].replace(/\\(.)/g, '$1') : raw)
    if (key !== 'by' && key !== 'for' && key !== 'host' && key !== 'proto') {
      continue
    }
    if (value == null) {
      continue
    }
    if (Object.hasOwn(params, key)) {
      return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedParameter }
    }
    params[key] = value
  }
  return { kind: 'ok', value: params }
}

const getHeaderValues = (req: IncomingMessage, headerName: string): string[] => {
  const value = req.headers[headerName]
  if (Array.isArray(value)) {
    return value
  }
  return typeof value === 'string' ? [value] : []
}

const getSingleHeaderValue = (req: IncomingMessage, headerName: string): string | undefined => {
  const values = getHeaderValues(req, headerName)
  return values.length === 1 ? values[0] : undefined
}

const hasDuplicateHeaders = (req: IncomingMessage, headerNames: readonly string[]): boolean => {
  const distinctHeaders = req.headersDistinct
  const rawHeaders = req.rawHeaders
  const rawHeaderCounts = new Map<string, number>()
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index].toLowerCase()
    rawHeaderCounts.set(name, (rawHeaderCounts.get(name) ?? 0) + 1)
  }
  for (const headerName of headerNames) {
    if ((distinctHeaders[headerName]?.length ?? 0) > 1) {
      return true
    }
    if ((rawHeaderCounts.get(headerName) ?? 0) > 1) {
      return true
    }
  }
  return false
}

const hasForwardedHeaders = (req: IncomingMessage): boolean =>
  FORWARDED_HEADER_NAMES.some(headerName =>
    getHeaderValues(req, headerName).some(value => nonEmpty(value) != null)
  )

const isHostAllowed = (
  req: IncomingMessage,
  uiServerConfiguration: UIServerConfiguration,
  trustedProxy: boolean,
  forwardedHost: ParseOutcome<string>
): boolean => {
  const allowedHosts = getAllowedHosts(uiServerConfiguration)
  if (allowedHosts.length === 0) {
    return false
  }
  const host = getSingleHeaderValue(req, 'host')
  if (host == null) {
    return false
  }
  // When the immediate peer is a trusted proxy and a forwarded host header
  // is present, it is the canonical public host (proxies that rewrite `Host`
  // to an internal upstream name forward the public name here).
  const trustedForwardedHost =
    trustedProxy && forwardedHost.kind === 'ok' ? forwardedHost.value : undefined
  const hostToCheck = trustedForwardedHost ?? host
  return allowedHosts.some(allowedHost => isSameHost(hostToCheck, allowedHost))
}

const isOriginAllowed = (
  req: IncomingMessage,
  uiServerConfiguration: UIServerConfiguration
): boolean => {
  const origin = getSingleHeaderValue(req, 'origin')
  if (origin == null) {
    return true
  }
  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    return false
  }
  const allowedOrigins = uiServerConfiguration.accessPolicy?.allowedOrigins ?? []
  if (allowedOrigins.length > 0) {
    return allowedOrigins.some(allowedOrigin => isSameOrigin(originUrl, allowedOrigin))
  }
  const allowedHosts = getAllowedHosts(uiServerConfiguration)
  return (
    allowedHosts.length > 0 &&
    allowedHosts.some(allowedHost => isSameHost(originUrl.hostname, allowedHost))
  )
}

const isSameOrigin = (left: URL, right: string): boolean => {
  let rightUrl: URL
  try {
    rightUrl = new URL(right)
  } catch {
    return false
  }
  return left.protocol === rightUrl.protocol && left.host === rightUrl.host
}

const getAllowedHosts = (uiServerConfiguration: UIServerConfiguration): string[] => {
  const allowedHosts = uiServerConfiguration.accessPolicy?.allowedHosts ?? []
  const configuredHost = uiServerConfiguration.options?.host ?? ''
  if (WILDCARD_HOSTS.has(configuredHost)) {
    return allowedHosts
  }
  const derivedHosts = isLoopback(configuredHost)
    ? ['localhost', '127.0.0.1', '::1']
    : [configuredHost]
  return [...new Set([...allowedHosts, ...derivedHosts])]
}

const isSameHost = (left: string, right: string): boolean => {
  const leftAddress = normalizeIPAddress(left)
  const rightAddress = normalizeIPAddress(right)
  if (leftAddress != null || rightAddress != null) {
    return (
      leftAddress?.family === rightAddress?.family && leftAddress?.value === rightAddress?.value
    )
  }
  const leftHost = normalizeHost(left)
  const rightHost = normalizeHost(right)
  return leftHost != null && rightHost != null && leftHost === rightHost
}

const isSecureForwardedProtocol = (protocol: string | undefined): boolean => {
  return protocol != null && SECURE_FORWARDED_PROTOCOLS.has(protocol)
}

const getTrustedProxies = (
  uiServerConfiguration: UIServerConfiguration,
  cache: UIServerAccessCache
): ReadonlySet<string> => {
  const cached = cache.trustedProxies.get(uiServerConfiguration)
  if (cached != null) {
    return cached
  }
  const trustedProxies = uiServerConfiguration.accessPolicy?.trustedProxies ?? []
  const normalized = new Set<string>()
  for (const proxy of trustedProxies) {
    const normalizedProxy = normalizeIPAddress(proxy)
    if (normalizedProxy != null) {
      normalized.add(`${normalizedProxy.family}:${normalizedProxy.value}`)
    }
  }
  cache.trustedProxies.set(uiServerConfiguration, normalized)
  return normalized
}

const isTrustedProxy = (remoteAddress: string, trustedProxies: ReadonlySet<string>): boolean => {
  if (trustedProxies.size === 0) {
    return false
  }
  const normalizedRemoteAddress = normalizeIPAddress(remoteAddress)
  if (normalizedRemoteAddress == null) {
    return false
  }
  return trustedProxies.has(`${normalizedRemoteAddress.family}:${normalizedRemoteAddress.value}`)
}
