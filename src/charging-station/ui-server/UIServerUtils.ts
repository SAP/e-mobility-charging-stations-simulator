import type { IncomingMessage } from 'node:http'

import { BaseError } from '../../exception/index.js'
import { Protocol, ProtocolVersion } from '../../types/index.js'
import { isEmpty, logger, logPrefix } from '../../utils/index.js'

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
    return [username, password]
  } catch (error) {
    next(new BaseError(`Invalid basic authentication token format: ${(error as Error).message}`))
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
  return /^localhost$|^127(?:\.\d+){0,2}\.\d+$|^(?:0*:)*?:?0*1$/i.test(address)
}
