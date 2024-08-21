import type { IncomingMessage } from 'node:http'

import { BaseError } from '../../exception/index.js'
import { Protocol, ProtocolVersion } from '../../types/index.js'
import { logger, logPrefix } from '../../utils/index.js'

export const getUsernameAndPasswordFromAuthorizationToken = (
  authorizationToken: string,
  next: (err?: Error) => void
): [string, string] => {
  if (
    !/^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/.test(authorizationToken)
  ) {
    next(new BaseError('Invalid basic authentication token format'))
  }
  const authentication = Buffer.from(authorizationToken, 'base64').toString()
  const authenticationParts = authentication.split(/:/)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return [authenticationParts.shift()!, authenticationParts.join(':')]
}

export const handleProtocols = (
  protocols: Set<string>,
  _request: IncomingMessage
): false | string => {
  let protocol: Protocol | undefined
  let version: ProtocolVersion | undefined
  if (protocols.size === 0) {
    return false
  }
  for (const fullProtocol of protocols) {
    if (isProtocolAndVersionSupported(fullProtocol)) {
      return fullProtocol
    }
  }
  logger.error(
    `${logPrefix(
      ' UI WebSocket Server |'
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    )} Unsupported protocol: '${protocol}' or protocol version: '${version}'`
  )
  return false
}

export const isProtocolAndVersionSupported = (protocolStr: string): boolean => {
  const [protocol, version] = getProtocolAndVersion(protocolStr)
  return (
    Object.values(Protocol).includes(protocol) && Object.values(ProtocolVersion).includes(version)
  )
}

export const getProtocolAndVersion = (protocolStr: string): [Protocol, ProtocolVersion] => {
  const protocolIndex = protocolStr.indexOf(Protocol.UI)
  const protocol = protocolStr.substring(
    protocolIndex,
    protocolIndex + Protocol.UI.length
  ) as Protocol
  const version = protocolStr.substring(protocolIndex + Protocol.UI.length) as ProtocolVersion
  return [protocol, version]
}

export const isLoopback = (address: string): boolean => {
  // eslint-disable-next-line no-useless-escape
  return /^localhost$|^127(?:\.\d+){0,2}\.\d+$|^(?:0*\:)*?:?0*1$/i.test(address)
}
