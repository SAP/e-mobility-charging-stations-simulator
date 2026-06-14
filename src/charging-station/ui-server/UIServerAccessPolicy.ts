/**
 * UI server gateway access policy: source classification, forwarded-header
 * parsing, host/origin allowlists, and the per-request decision cache.
 */
import type { IncomingMessage } from 'node:http'

import type { UIServerConfiguration } from '../../types/index.js'

import { isLoopback, normalizeHost, normalizeIPAddress, splitHeaderList } from './UIServerNet.js'

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
 */
export interface UIServerAccessCache {
  readonly decisions: WeakMap<IncomingMessage, UIServerAccessDecision>
  readonly trustedProxies: WeakMap<UIServerConfiguration, ReadonlySet<string>>
}

/**
 * Outcome of a UI server access policy evaluation.
 *
 * Discriminated by `allowed`. Allowed decisions carry the resolved client
 * address; denied decisions carry the {@link UIServerAccessDenialReason}
 * and its rendered message.
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

/**
 * Internal helper outcome shared by forwarded-header parsers.
 *
 * Discriminated by `kind`. `'absent'` means the header is not present;
 * `'ok'` carries the parsed value; `'error'` carries a denial reason that
 * propagates to the access decision.
 */
type ParseOutcome<T> =
  | { readonly kind: 'absent' }
  | { readonly kind: 'error'; readonly reason: UIServerAccessDenialReason }
  | { readonly kind: 'ok'; readonly value: T }

const ABSENT: ParseOutcome<never> = { kind: 'absent' }

type ForwardedParams = Partial<Record<'by' | 'for' | 'host' | 'proto', string>>

/**
 * Resolve the UI server access decision for the given request.
 *
 * The decision is memoized on the request via the supplied
 * {@link UIServerAccessCache} so a request consulted at multiple stages is
 * evaluated exactly once.
 * @param req The incoming HTTP request.
 * @param uiServerConfiguration The UI server configuration to evaluate against.
 * @param cache The owning UI server's access cache.
 * @returns The cached or freshly computed {@link UIServerAccessDecision}.
 */
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
  const allowLoopbackProxy = accessPolicy?.allowLoopbackProxy ?? false
  const requireTlsForNonLoopback = accessPolicy?.requireTlsForNonLoopback ?? true
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
  // Reject untrusted forwarded headers before any ambiguity check so operator
  // logs reflect the trust violation rather than a parser-level symptom.
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

  const forwardedProtocolValue = forwardedProtocol.kind === 'ok' ? forwardedProtocol.value : null
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
  if (!trustedProxy) {
    return ABSENT
  }
  if (forwarded.kind === 'error') {
    return forwarded
  }
  const xForwardedFor = getSingleHeaderValue(req, 'x-forwarded-for')
  const forwardedForFromForwarded = forwarded.kind === 'ok' ? forwarded.value.for : undefined
  if (forwardedForFromForwarded != null && xForwardedFor != null) {
    return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedClient }
  }
  const forwardedFor = forwardedForFromForwarded ?? xForwardedFor
  if (forwardedFor == null) {
    return ABSENT
  }
  const addresses = splitHeaderList(forwardedFor)
  if (addresses.length === 0) {
    // Header was present but contained no extractable addresses (e.g. ","):
    // treat as malformed rather than silently allowed, mirroring the
    // multi-value rule below.
    return { kind: 'error', reason: UIServerAccessDenialReason.InvalidForwardedClient }
  }
  // Multi-hop X-Forwarded-For chains are intentionally rejected: ambiguity in
  // trust depth would require a CIDR/hop-count model (see proxy-addr
  // semantics) that is out of scope for this version. Documented in the
  // README "UI Protocol" section.
  if (addresses.length !== 1) {
    return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedClient }
  }
  const normalizedAddress = normalizeIPAddress(addresses[0])
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
  const xForwardedProtocol = getSingleHeaderValue(req, 'x-forwarded-proto')
  const forwardedProtoFromForwarded = forwarded.kind === 'ok' ? forwarded.value.proto : undefined
  if (forwardedProtoFromForwarded != null && xForwardedProtocol != null) {
    return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedProtocol }
  }
  if (xForwardedProtocol != null) {
    const protocols = splitHeaderList(xForwardedProtocol)
    if (protocols.length !== 1) {
      return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedProtocol }
    }
    return { kind: 'ok', value: protocols[0].toLowerCase() }
  }
  return forwardedProtoFromForwarded != null
    ? { kind: 'ok', value: forwardedProtoFromForwarded.toLowerCase() }
    : ABSENT
}

const getForwardedHost = (
  req: IncomingMessage,
  forwarded: ParseOutcome<ForwardedParams>
): ParseOutcome<string> => {
  if (forwarded.kind === 'error') {
    return forwarded
  }
  const xForwardedHost = getSingleHeaderValue(req, 'x-forwarded-host')
  const forwardedHostFromForwarded = forwarded.kind === 'ok' ? forwarded.value.host : undefined
  if (forwardedHostFromForwarded != null && xForwardedHost != null) {
    return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedHost }
  }
  const value = forwardedHostFromForwarded ?? xForwardedHost
  return value != null ? { kind: 'ok', value } : ABSENT
}

const parseSingleForwardedHeader = (req: IncomingMessage): ParseOutcome<ForwardedParams> => {
  const forwarded = getSingleHeaderValue(req, 'forwarded')
  if (forwarded == null) {
    return ABSENT
  }
  const entries = splitHeaderList(forwarded)
  if (entries.length !== 1) {
    return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedHeader }
  }
  const params: ForwardedParams = {}
  for (const part of splitForwardedPairs(entries[0])) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }
    const key = part.slice(0, separatorIndex).trim().toLowerCase()
    const value = part
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^"|"$/g, '')
    if (key !== 'by' && key !== 'for' && key !== 'host' && key !== 'proto') {
      continue
    }
    if (Object.hasOwn(params, key)) {
      return { kind: 'error', reason: UIServerAccessDenialReason.AmbiguousForwardedParameter }
    }
    params[key] = value
  }
  return { kind: 'ok', value: params }
}

const splitForwardedPairs = (value: string): string[] => {
  const pairs: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of value) {
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
      continue
    }
    if (char === ';' && !inQuotes) {
      const trimmed = current.trim()
      if (trimmed !== '') {
        pairs.push(trimmed)
      }
      current = ''
      continue
    }
    current += char
  }
  const trimmed = current.trim()
  if (trimmed !== '') {
    pairs.push(trimmed)
  }
  return pairs
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
  const distinctHeaders = Reflect.get(req, 'headersDistinct') as
    | IncomingMessage['headersDistinct']
    | undefined
  const rawHeaders = (Reflect.get(req, 'rawHeaders') as string[] | undefined) ?? []
  const rawHeaderCounts = new Map<string, number>()
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index].toLowerCase()
    rawHeaderCounts.set(name, (rawHeaderCounts.get(name) ?? 0) + 1)
  }
  for (const headerName of headerNames) {
    if ((distinctHeaders?.[headerName]?.length ?? 0) > 1) {
      return true
    }
    if ((rawHeaderCounts.get(headerName) ?? 0) > 1) {
      return true
    }
  }
  return false
}

const hasForwardedHeaders = (req: IncomingMessage): boolean => {
  return FORWARDED_HEADER_NAMES.some(headerName => getHeaderValues(req, headerName).length > 0)
}

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
  // When `accessPolicy.allowedOrigins` is non-empty it is the exclusive
  // allowlist. When empty, the origin's URL hostname falls back to matching
  // against `getAllowedHosts(...)` so that browser-facing access stays
  // implicitly aligned with the explicit Host allowlist (see README
  // "UI Protocol" section).
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
  // Loopback listen hosts implicitly allow all loopback aliases so that a
  // local client using either `localhost`, `127.0.0.1`, or `[::1]` is not
  // rejected; non-loopback listen hosts only allow the configured host.
  const derivedHosts = isLoopback(configuredHost)
    ? ['localhost', '127.0.0.1', '::1']
    : [configuredHost]
  return [...new Set([...allowedHosts, ...derivedHosts])]
}

const isSameHost = (left: string, right: string): boolean => {
  const leftHost = normalizeHost(left)
  const rightHost = normalizeHost(right)
  if (leftHost == null || rightHost == null) {
    return false
  }
  const leftAddress = normalizeIPAddress(leftHost)
  const rightAddress = normalizeIPAddress(rightHost)
  if (leftAddress != null || rightAddress != null) {
    return (
      leftAddress?.family === rightAddress?.family && leftAddress?.value === rightAddress?.value
    )
  }
  return leftHost === rightHost
}

const isSecureForwardedProtocol = (protocol: null | string | undefined): boolean => {
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
