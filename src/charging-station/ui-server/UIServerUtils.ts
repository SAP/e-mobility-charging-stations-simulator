import type { IncomingMessage } from 'node:http'

import { Protocol, ProtocolVersion } from '../../types/index.js'
import { isEmpty, logger, logPrefix } from '../../utils/index.js'

export enum HttpMethod {
  DELETE = 'DELETE',
  GET = 'GET',
  PATCH = 'PATCH',
  POST = 'POST',
  PUT = 'PUT',
}

export const getUsernameAndPasswordFromAuthorizationToken = (
  authorizationToken: string
): [string, string] | undefined => {
  try {
    const authentication = Buffer.from(authorizationToken, 'base64').toString('utf8')
    const separatorIndex = authentication.indexOf(':')
    if (separatorIndex === -1) {
      return undefined
    }
    const username = authentication.slice(0, separatorIndex)
    const password = authentication.slice(separatorIndex + 1)
    if (isEmpty(username) || isEmpty(password)) {
      return undefined
    }
    return [username, password]
  } catch {
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
