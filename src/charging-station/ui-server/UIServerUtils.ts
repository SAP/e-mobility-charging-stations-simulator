import type { IncomingMessage } from 'node:http'
import type { TLSSocket } from 'node:tls'

import { isIP } from 'node:net'

import type { UIServerConfiguration } from '../../types/index.js'

import { BaseError } from '../../exception/index.js'
import { Protocol, ProtocolVersion } from '../../types/index.js'
import { getErrorMessage, isEmpty, logger, logPrefix } from '../../utils/index.js'

export enum HttpMethod {
  DELETE = 'DELETE',
  GET = 'GET',
  PATCH = 'PATCH',
  POST = 'POST',
  PUT = 'PUT',
}

const LOOPBACK_HOSTNAME = 'localhost'
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
 * Decision identity is a closed enum value. The human-readable rendering is
 * `DENIAL_MESSAGES[reason]`. Tests assert on `reason`; logs and errors format
 * `message`. Adding a new branch requires extending both the enum and
 * `DENIAL_MESSAGES`.
 */
export enum UIServerAccessDenialReason {
  AmbiguousForwardedClient = 'ambiguous-forwarded-client',
  AmbiguousForwardedHeader = 'ambiguous-forwarded-header',
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
 * Outcome of a UI server access policy evaluation.
 *
 * Discriminated by `allowed`. Allowed decisions carry only the resolved
 * client address; denied decisions carry both an enum reason
 * (machine-readable, stable across refactors) and a rendered message
 * (human-readable, derived from {@link DENIAL_MESSAGES}).
 */
export type UIServerAccessDecision =
  | {
    readonly allowed: false
    readonly clientAddress: string
    readonly message: string
    readonly reason: UIServerAccessDenialReason
  }
  | { readonly allowed: true; readonly clientAddress: string }

// Decisions are cached per-request to avoid re-evaluating the policy for both
// the access gate and rate-limit client identification. WeakMap holds a weak
// reference to the IncomingMessage; entries are GC-collected when the request
// is released by the HTTP server.
const accessDecisionCache = new WeakMap<IncomingMessage, UIServerAccessDecision>()

// Normalized trusted-proxy sets are precomputed on first use per
// UIServerConfiguration. The schema layer (UIServerAccessPolicySchema)
// guarantees every entry is a parseable IP literal; entries that fail to
// normalize at runtime are still discarded defensively.
const trustedProxiesCache = new WeakMap<UIServerConfiguration, ReadonlySet<string>>()

export const getUsernameAndPasswordFromAuthorizationToken = (
  authorizationToken: string,
  next: (err?: Error) => void
): [string, string] | undefined => {
  try {
    const authentication = Buffer.from(authorizationToken, 'base64').toString('utf8')
    const separatorIndex = authentication.indexOf(':')
    if (separatorIndex === -1) {
      next(new BaseError('Invalid basic authentication token format: missing ":" separator'))
      return undefined
    }
    const username = authentication.slice(0, separatorIndex)
    const password = authentication.slice(separatorIndex + 1)
    if (isEmpty(username)) {
      next(new BaseError('Invalid basic authentication token format: empty username'))
      return undefined
    }
    if (isEmpty(password)) {
      next(new BaseError('Invalid basic authentication token format: empty password'))
      return undefined
    }
    return [username, password]
  } catch (error) {
    next(new BaseError(`Invalid basic authentication token format: ${getErrorMessage(error)}`))
    return undefined
  }
}

export const handleProtocols = (
  protocols: Set<string>,
  _request: IncomingMessage
): false | string => {
  if (isEmpty(protocols)) {
    return false
  }
  for (const protocol of protocols) {
    if (isProtocolAndVersionSupported(protocol)) {
      return protocol
    }
  }
  logger.error(
    `${logPrefix(
      ' UI WebSocket Server |'
    )} Unsupported protocol in client request: '${Array.from(protocols).join(', ')}'`
  )
  return false
}

export const isProtocolAndVersionSupported = (protocolStr: string): boolean => {
  const protocolAndVersion = getProtocolAndVersion(protocolStr)
  if (protocolAndVersion == null) {
    return false
  }
  const [protocol, version] = protocolAndVersion
  return (
    Object.values(Protocol).includes(protocol) && Object.values(ProtocolVersion).includes(version)
  )
}

export const getProtocolAndVersion = (
  protocolStr: string
): [Protocol, ProtocolVersion] | undefined => {
  if (isEmpty(protocolStr)) {
    return undefined
  }
  if (!protocolStr.startsWith(Protocol.UI)) {
    return undefined
  }
  const protocolIndex = protocolStr.indexOf(Protocol.UI)
  const protocol = protocolStr.substring(protocolIndex, protocolIndex + Protocol.UI.length)
  const version = protocolStr.substring(protocolIndex + Protocol.UI.length)
  if (isEmpty(protocol) || isEmpty(version)) {
    return undefined
  }
  return [protocol, version] as [Protocol, ProtocolVersion]
}

export const isLoopback = (address: string): boolean => {
  if (address.trim().toLowerCase() === LOOPBACK_HOSTNAME) {
    return true
  }
  const normalizedAddress = normalizeIPAddress(address)
  if (normalizedAddress == null) {
    return false
  }
  if (normalizedAddress.family === 'ipv4') {
    return normalizedAddress.value.split('.')[0] === '127'
  }
  const groups = normalizedAddress.value.split(':')
  return groups.slice(0, -1).every(group => group === '0') && groups.at(-1) === '1'
}

/**
 * Resolve the UI server access decision for the given request.
 *
 * The decision is memoized on the request via a {@link WeakMap} so that a
 * single request consulted at multiple stages (access gate, rate-limit
 * client identification) is evaluated exactly once.
 * @param req The incoming HTTP request.
 * @param uiServerConfiguration The UI server configuration to evaluate against.
 * @returns The cached or freshly computed {@link UIServerAccessDecision}.
 */
export const resolveUIServerAccess = (
  req: IncomingMessage,
  uiServerConfiguration: UIServerConfiguration
): UIServerAccessDecision => {
  const cached = accessDecisionCache.get(req)
  if (cached != null) {
    return cached
  }
  const decision = evaluateUIServerAccess(req, uiServerConfiguration)
  accessDecisionCache.set(req, decision)
  return decision
}

export const evaluateUIServerAccess = (
  req: IncomingMessage,
  uiServerConfiguration: UIServerConfiguration
): UIServerAccessDecision => {
  const accessPolicy = uiServerConfiguration.accessPolicy
  const allowLoopbackProxy = accessPolicy?.allowLoopbackProxy ?? false
  const requireTlsForNonLoopback = accessPolicy?.requireTlsForNonLoopback ?? true
  const trustedProxies = getTrustedProxies(uiServerConfiguration)
  const remoteAddress = req.socket.remoteAddress ?? ''
  const remoteAddressIsLoopback = isLoopback(remoteAddress)
  const remoteAddressIsTrustedProxy = isTrustedProxy(remoteAddress, trustedProxies)
  const forwardedHeadersPresent = hasForwardedHeaders(req)
  const forwardedProtocol = getForwardedProtocol(req)
  const forwardedClientAddress = getForwardedClientAddress(req, remoteAddressIsTrustedProxy)
  const clientAddress = forwardedClientAddress.value ?? remoteAddress

  if (hasDuplicateHeaders(req, [...FORWARDED_HEADER_NAMES, 'host', 'origin'])) {
    return deny(clientAddress, UIServerAccessDenialReason.DuplicateGatewayHeaders)
  }
  if (forwardedProtocol.error != null) {
    return deny(clientAddress, forwardedProtocol.error)
  }
  if (forwardedClientAddress.error != null) {
    return deny(clientAddress, forwardedClientAddress.error)
  }
  if (forwardedHeadersPresent && !remoteAddressIsTrustedProxy) {
    return deny(clientAddress, UIServerAccessDenialReason.ForwardedFromUntrustedPeer)
  }
  if (forwardedHeadersPresent && remoteAddressIsLoopback && !allowLoopbackProxy) {
    return deny(clientAddress, UIServerAccessDenialReason.LoopbackProxyDisabled)
  }
  if (!isHostAllowed(req, uiServerConfiguration, remoteAddressIsTrustedProxy)) {
    return deny(clientAddress, UIServerAccessDenialReason.HostNotAllowed)
  }
  if (!isOriginAllowed(req, uiServerConfiguration)) {
    return deny(clientAddress, UIServerAccessDenialReason.OriginNotAllowed)
  }

  const secureForwardedProtocol = isSecureForwardedProtocol(forwardedProtocol.value)
  if (requireTlsForNonLoopback && forwardedHeadersPresent && !secureForwardedProtocol) {
    return deny(clientAddress, UIServerAccessDenialReason.ProxyTlsRequired)
  }
  const secure = isDirectTLSRequest(req) || secureForwardedProtocol
  if (requireTlsForNonLoopback && !remoteAddressIsLoopback && !secure) {
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
  trustedProxy: boolean
): { error?: UIServerAccessDenialReason; value?: string } => {
  if (!trustedProxy) {
    return {}
  }
  const forwarded = parseSingleForwardedHeader(req)
  const xForwardedFor = getSingleHeaderValue(req, 'x-forwarded-for')
  if (forwarded.error != null) {
    return { error: forwarded.error }
  }
  if (forwarded.params?.for != null && xForwardedFor != null) {
    return { error: UIServerAccessDenialReason.AmbiguousForwardedClient }
  }
  const forwardedFor = forwarded.params?.for ?? xForwardedFor
  if (forwardedFor == null) {
    return {}
  }
  const addresses = splitHeaderList(forwardedFor)
  if (addresses.length === 0) {
    // Header was present but contained no extractable addresses (e.g. ","):
    // treat as malformed rather than silently allowed, mirroring the
    // multi-value rule below.
    return { error: UIServerAccessDenialReason.InvalidForwardedClient }
  }
  // Multi-hop X-Forwarded-For chains are intentionally rejected: ambiguity in
  // trust depth would require a CIDR/hop-count model (see proxy-addr
  // semantics) that is out of scope for this version. Documented in the
  // README "UI Protocol" section.
  if (addresses.length !== 1) {
    return { error: UIServerAccessDenialReason.AmbiguousForwardedClient }
  }
  const normalizedAddress = normalizeIPAddress(addresses[0])
  return normalizedAddress != null
    ? { value: normalizedAddress.value }
    : { error: UIServerAccessDenialReason.InvalidForwardedClient }
}

const getForwardedProtocol = (
  req: IncomingMessage
): { error?: UIServerAccessDenialReason; value?: string } => {
  const forwarded = parseSingleForwardedHeader(req)
  const xForwardedProtocol = getSingleHeaderValue(req, 'x-forwarded-proto')
  if (forwarded.error != null) {
    return { error: forwarded.error }
  }
  if (forwarded.params?.proto != null && xForwardedProtocol != null) {
    return { error: UIServerAccessDenialReason.AmbiguousForwardedProtocol }
  }
  if (xForwardedProtocol != null) {
    const protocols = splitHeaderList(xForwardedProtocol)
    if (protocols.length !== 1) {
      return { error: UIServerAccessDenialReason.AmbiguousForwardedProtocol }
    }
    return { value: protocols[0].toLowerCase() }
  }
  return forwarded.params?.proto != null ? { value: forwarded.params.proto.toLowerCase() } : {}
}

const parseSingleForwardedHeader = (
  req: IncomingMessage
): { error?: UIServerAccessDenialReason; params?: Record<string, string> } => {
  const forwarded = getSingleHeaderValue(req, 'forwarded')
  if (forwarded == null) {
    return {}
  }
  const entries = splitHeaderList(forwarded)
  if (entries.length !== 1) {
    return { error: UIServerAccessDenialReason.AmbiguousForwardedHeader }
  }
  const params: Record<string, string> = {}
  for (const part of entries[0].split(';')) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }
    const key = part.slice(0, separatorIndex).trim().toLowerCase()
    const value = part
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^"|"$/g, '')
    if (key === '') {
      continue
    }
    if (Object.hasOwn(params, key)) {
      return { error: UIServerAccessDenialReason.AmbiguousForwardedParameter }
    }
    params[key] = value
  }
  return { params }
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
  for (const headerName of headerNames) {
    if ((distinctHeaders?.[headerName]?.length ?? 0) > 1) {
      return true
    }
    let rawHeaderCount = 0
    const rawHeaders = (Reflect.get(req, 'rawHeaders') as string[] | undefined) ?? []
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() === headerName) {
        ++rawHeaderCount
      }
    }
    if (rawHeaderCount > 1) {
      return true
    }
  }
  return false
}

const hasForwardedHeaders = (req: IncomingMessage): boolean => {
  return FORWARDED_HEADER_NAMES.some(headerName => getHeaderValues(req, headerName).length > 0)
}

// `isDirectTLSRequest` is currently never true: AbstractUIServer instantiates
// only plaintext servers (`new http.Server()` for HTTP/1.1,
// `node:http2.createServer()` for h2c). Kept for forward compatibility with a
// future `https.createServer` / `http2.createSecureServer` code path.
// Non-loopback access today is gated by `X-Forwarded-Proto: https` arriving
// from a trusted proxy (see README "UI Protocol" section).
const isDirectTLSRequest = (req: IncomingMessage): boolean => {
  return (req.socket as TLSSocket).encrypted
}

const isHostAllowed = (
  req: IncomingMessage,
  uiServerConfiguration: UIServerConfiguration,
  trustedProxy: boolean
): boolean => {
  const allowedHosts = getAllowedHosts(uiServerConfiguration)
  if (allowedHosts.length === 0) {
    return false
  }
  const host = getSingleHeaderValue(req, 'host')
  if (host == null) {
    return false
  }
  const hostsToCheck = [host]
  const forwardedHost = getSingleHeaderValue(req, 'x-forwarded-host')
  if (trustedProxy && forwardedHost != null) {
    hostsToCheck.push(forwardedHost)
  }
  return hostsToCheck.every(hostToCheck =>
    allowedHosts.some(allowedHost => isSameHost(hostToCheck, allowedHost))
  )
}

const isOriginAllowed = (
  req: IncomingMessage,
  uiServerConfiguration: UIServerConfiguration
): boolean => {
  const origin = getSingleHeaderValue(req, 'origin')
  if (origin == null) {
    return true
  }
  // When `accessPolicy.allowedOrigins` is non-empty it is the exclusive
  // allowlist. When empty, the origin's URL hostname falls back to matching
  // against `getAllowedHosts(...)` so that browser-facing access stays
  // implicitly aligned with the explicit Host allowlist (see README
  // "UI Protocol" section).
  const allowedOrigins = uiServerConfiguration.accessPolicy?.allowedOrigins ?? []
  if (allowedOrigins.length > 0) {
    return allowedOrigins.some(
      allowedOrigin => allowedOrigin.toLowerCase() === origin.toLowerCase()
    )
  }
  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    return false
  }
  const allowedHosts = getAllowedHosts(uiServerConfiguration)
  return (
    allowedHosts.length > 0 &&
    allowedHosts.some(allowedHost => isSameHost(originUrl.hostname, allowedHost))
  )
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

const isSecureForwardedProtocol = (protocol: string | undefined): boolean => {
  return protocol != null && SECURE_FORWARDED_PROTOCOLS.has(protocol)
}

const getTrustedProxies = (uiServerConfiguration: UIServerConfiguration): ReadonlySet<string> => {
  const cached = trustedProxiesCache.get(uiServerConfiguration)
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
  trustedProxiesCache.set(uiServerConfiguration, normalized)
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

const normalizeHost = (host: string): string | undefined => {
  const trimmedHost = host.trim().toLowerCase().replace(/\.$/, '')
  if (trimmedHost === '') {
    return undefined
  }
  const bracketMatch = /^\[([^\]]+)](?::(\d+))?$/.exec(trimmedHost)
  if (bracketMatch != null) {
    return isValidPort(bracketMatch[2]) ? bracketMatch[1] : undefined
  }
  if (isIP(trimmedHost) === 6) {
    return trimmedHost
  }
  const parts = trimmedHost.split(':')
  if (parts.length > 2 || (parts.length === 2 && !isValidPort(parts[1]))) {
    return undefined
  }
  return parts[0]
}

const isValidPort = (port: string | undefined): boolean => {
  if (port == null) {
    return true
  }
  if (!/^\d+$/.test(port)) {
    return false
  }
  const parsedPort = Number.parseInt(port, 10)
  return parsedPort >= 0 && parsedPort <= 65535
}

const normalizeIPAddress = (
  address: string
): undefined | { family: 'ipv4' | 'ipv6'; value: string } => {
  const host = normalizeHost(address) ?? address.trim().toLowerCase()
  if (host === '') {
    return undefined
  }
  if (host === LOOPBACK_HOSTNAME) {
    return { family: 'ipv4', value: '127.0.0.1' }
  }
  const ipv4MappedAddress = parseIPv4MappedAddress(host)
  if (ipv4MappedAddress != null) {
    return { family: 'ipv4', value: ipv4MappedAddress }
  }
  if (isIP(host) === 4) {
    return { family: 'ipv4', value: host }
  }
  if (isIP(host) === 6) {
    const groups = expandIPv6(host)
    return groups != null ? { family: 'ipv6', value: groups.join(':') } : undefined
  }
  return undefined
}

const parseIPv4MappedAddress = (address: string): string | undefined => {
  const dottedMatch = /^::ffff:(.+)$/i.exec(address)
  if (dottedMatch != null && isIP(dottedMatch[1]) === 4) {
    return dottedMatch[1]
  }
  const hexMatch = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address)
  if (hexMatch == null) {
    return undefined
  }
  const high = Number.parseInt(hexMatch[1], 16)
  const low = Number.parseInt(hexMatch[2], 16)
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
}

const expandIPv6 = (address: string): string[] | undefined => {
  const sections = address.toLowerCase().split('::')
  if (sections.length > 2) {
    return undefined
  }
  const head = sections[0] === '' ? [] : sections[0].split(':')
  const tail = sections.length === 1 || sections[1] === '' ? [] : sections[1].split(':')
  const missingGroups = 8 - head.length - tail.length
  if ((sections.length === 1 && missingGroups !== 0) || missingGroups < 0) {
    return undefined
  }
  const groups = [...head, ...Array<string>(missingGroups).fill('0'), ...tail]
  if (groups.length !== 8) {
    return undefined
  }
  return groups.every(isIPv6Group)
    ? groups.map(group => Number.parseInt(group, 16).toString(16))
    : undefined
}

const isIPv6Group = (group: string): boolean => /^[0-9a-f]{1,4}$/i.test(group)

const splitHeaderList = (value: string): string[] => {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item !== '')
}
