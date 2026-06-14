import { isIP } from 'node:net'

export const LOOPBACK_HOSTNAME = 'localhost'

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
 * Parse an IP literal (IPv4, IPv6, or IPv4-mapped IPv6) into a normalized
 * `family:value` pair.
 * @param address The address to normalize.
 * @returns The normalized IP literal, or `undefined` when not a valid IP.
 */
export const normalizeIPAddress = (
  address: string
): undefined | { family: 'ipv4' | 'ipv6'; value: string } => {
  const host = normalizeHost(address)
  if (host == null) {
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

/**
 * Strip a bracketed IPv6 wrapper and a trailing `:port` suffix, lowercase
 * the result, and drop a single trailing dot.
 * @param host The raw `Host` header or address value.
 * @returns The bare host, or `undefined` when the input is malformed.
 */
export const normalizeHost = (host: string): string | undefined => {
  const trimmedHost = host.trim().toLowerCase()
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
  const hostPart = parts[0].replace(/\.$/, '')
  if (hostPart === '') {
    return undefined
  }
  return HOSTNAME_PATTERN.test(hostPart) ? hostPart : undefined
}

export const isHostLiteralWithoutPort = (value: string): boolean => {
  const normalized = normalizeHost(value)
  if (normalized == null) {
    return false
  }
  const stripped = value.trim().toLowerCase().replace(/\.$/, '')
  return stripped === normalized || stripped === `[${normalized}]`
}

const HOSTNAME_PATTERN = /^[a-z0-9._-]+$/

const isValidPort = (port: string | undefined): boolean => {
  if (port == null) {
    return true
  }
  if (!/^\d+$/.test(port)) {
    return false
  }
  const parsedPort = Number.parseInt(port, 10)
  return parsedPort >= 1 && parsedPort <= 65535
}

/**
 * Split a comma-separated header list while honoring RFC 7239 / RFC 7230
 * double-quoted values. Commas inside `"…"` are preserved.
 * @param value Raw header value.
 * @returns Trimmed non-empty entries.
 */
export const splitHeaderList = (value: string): string[] => splitQuoted(value, ',')

/**
 * Split a string on `delimiter` while honoring RFC 7230 double-quoted values.
 * Delimiters inside `"…"` are preserved.
 * @param value Raw input.
 * @param delimiter Single-character delimiter.
 * @returns Trimmed non-empty entries.
 */
export const splitQuoted = (value: string, delimiter: string): string[] => {
  const entries: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of value) {
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
      continue
    }
    if (char === delimiter && !inQuotes) {
      const trimmed = current.trim()
      if (trimmed !== '') {
        entries.push(trimmed)
      }
      current = ''
      continue
    }
    current += char
  }
  const trimmed = current.trim()
  if (trimmed !== '') {
    entries.push(trimmed)
  }
  return entries
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
