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

const LOOPBACK_HOSTNAMES = new Set(['localhost'])
const FORWARDED_HEADER_NAMES = [
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
]
const SECURE_FORWARDED_PROTOCOLS = new Set(['https', 'wss'])
const WILDCARD_HOSTS = new Set(['', '0.0.0.0', '::'])

export interface UIServerAccessDecision {
  readonly allowed: boolean
  readonly clientAddress: string
  readonly reason?: string
}

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
  if (LOOPBACK_HOSTNAMES.has(address.trim().toLowerCase())) {
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

export const evaluateUIServerAccess = (
  req: IncomingMessage,
  uiServerConfiguration: UIServerConfiguration
): UIServerAccessDecision => {
  const accessPolicy = uiServerConfiguration.accessPolicy
  const allowLoopbackProxy = accessPolicy?.allowLoopbackProxy ?? false
  const requireTlsForNonLoopback = accessPolicy?.requireTlsForNonLoopback ?? true
  const trustedProxies = accessPolicy?.trustedProxies ?? []
  const remoteAddress = req.socket.remoteAddress ?? ''
  const remoteAddressIsLoopback = isLoopback(remoteAddress)
  const remoteAddressIsTrustedProxy = isTrustedProxy(remoteAddress, trustedProxies)
  const forwardedHeadersPresent = hasForwardedHeaders(req)
  const forwardedProtocol = getForwardedProtocol(req)
  const forwardedClientAddress = getForwardedClientAddress(req, remoteAddressIsTrustedProxy)
  const clientAddress = forwardedClientAddress.value ?? remoteAddress

  if (hasDuplicateHeaders(req, [...FORWARDED_HEADER_NAMES, 'host', 'origin'])) {
    return deny(clientAddress, 'Duplicate gateway security headers are not allowed')
  }
  if (forwardedProtocol.error != null) {
    return deny(clientAddress, forwardedProtocol.error)
  }
  if (forwardedClientAddress.error != null) {
    return deny(clientAddress, forwardedClientAddress.error)
  }
  if (forwardedHeadersPresent && !remoteAddressIsTrustedProxy) {
    return deny(clientAddress, 'Forwarded headers are only accepted from trusted proxies')
  }
  if (forwardedHeadersPresent && remoteAddressIsLoopback && !allowLoopbackProxy) {
    return deny(clientAddress, 'Loopback proxy forwarding requires allowLoopbackProxy')
  }
  if (!isHostAllowed(req, uiServerConfiguration, remoteAddressIsTrustedProxy)) {
    return deny(clientAddress, 'Host header is not allowed')
  }
  if (!isOriginAllowed(req, uiServerConfiguration)) {
    return deny(clientAddress, 'Origin header is not allowed')
  }

  const secureForwardedProtocol = isSecureForwardedProtocol(forwardedProtocol.value)
  if (requireTlsForNonLoopback && forwardedHeadersPresent && !secureForwardedProtocol) {
    return deny(clientAddress, 'Trusted proxy requests must use a secure forwarded protocol')
  }
  const secure = isDirectTLSRequest(req) || secureForwardedProtocol
  if (requireTlsForNonLoopback && !remoteAddressIsLoopback && !secure) {
    return deny(clientAddress, 'TLS is required for non-loopback UI server access')
  }

  return { allowed: true, clientAddress }
}

export const getUIServerAccessClientAddress = (
  req: IncomingMessage,
  uiServerConfiguration: UIServerConfiguration
): string => {
  return evaluateUIServerAccess(req, uiServerConfiguration).clientAddress || 'unknown'
}

const deny = (clientAddress: string, reason: string): UIServerAccessDecision => {
  return { allowed: false, clientAddress, reason }
}

const getForwardedClientAddress = (
  req: IncomingMessage,
  trustedProxy: boolean
): { error?: string; value?: string } => {
  if (!trustedProxy) {
    return {}
  }
  const forwarded = parseSingleForwardedHeader(req)
  const xForwardedFor = getSingleHeaderValue(req, 'x-forwarded-for')
  if (forwarded.error != null) {
    return { error: forwarded.error }
  }
  if (forwarded.params?.for != null && xForwardedFor != null) {
    return { error: 'Ambiguous forwarded client address headers are not allowed' }
  }
  const forwardedFor = forwarded.params?.for ?? xForwardedFor
  if (forwardedFor == null) {
    return {}
  }
  const addresses = splitHeaderList(forwardedFor)
  if (addresses.length === 0) {
    return {}
  }
  if (addresses.length !== 1) {
    return { error: 'Ambiguous X-Forwarded-For header is not allowed' }
  }
  const normalizedAddress = normalizeIPAddress(addresses[0])
  return normalizedAddress != null
    ? { value: normalizedAddress.value }
    : { error: 'Invalid X-Forwarded-For header is not allowed' }
}

const getForwardedProtocol = (req: IncomingMessage): { error?: string; value?: string } => {
  const forwarded = parseSingleForwardedHeader(req)
  const xForwardedProtocol = getSingleHeaderValue(req, 'x-forwarded-proto')
  if (forwarded.error != null) {
    return { error: forwarded.error }
  }
  if (forwarded.params?.proto != null && xForwardedProtocol != null) {
    return { error: 'Ambiguous forwarded protocol headers are not allowed' }
  }
  if (xForwardedProtocol != null) {
    const protocols = splitHeaderList(xForwardedProtocol)
    if (protocols.length !== 1) {
      return { error: 'Ambiguous X-Forwarded-Proto header is not allowed' }
    }
    return { value: protocols[0].toLowerCase() }
  }
  return forwarded.params?.proto != null ? { value: forwarded.params.proto.toLowerCase() } : {}
}

const parseSingleForwardedHeader = (
  req: IncomingMessage
): { error?: string; params?: Record<string, string> } => {
  const forwarded = getSingleHeaderValue(req, 'forwarded')
  if (forwarded == null) {
    return {}
  }
  const entries = splitHeaderList(forwarded)
  if (entries.length !== 1) {
    return { error: 'Ambiguous Forwarded header is not allowed' }
  }
  const params: Record<string, string> = {}
  for (const part of entries[0].split(';')) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }
    const key = part.slice(0, separatorIndex).trim().toLowerCase()
    const value = part.slice(separatorIndex + 1).trim().replace(/^"|"$/g, '')
    if (key === '') {
      continue
    }
    if (Object.hasOwn(params, key)) {
      return { error: `Ambiguous Forwarded ${key} parameter is not allowed` }
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

const hasDuplicateHeaders = (req: IncomingMessage, headerNames: string[]): boolean => {
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

const isTrustedProxy = (remoteAddress: string, trustedProxies: string[]): boolean => {
  const normalizedRemoteAddress = normalizeIPAddress(remoteAddress)
  if (normalizedRemoteAddress == null) {
    return false
  }
  return trustedProxies.some(proxy => {
    const normalizedProxy = normalizeIPAddress(proxy)
    return (
      normalizedProxy?.family === normalizedRemoteAddress.family &&
      normalizedProxy.value === normalizedRemoteAddress.value
    )
  })
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
  if (LOOPBACK_HOSTNAMES.has(host)) {
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
