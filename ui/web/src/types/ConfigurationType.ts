import type { AuthenticationType, Protocol, ProtocolVersion } from './UIProtocol'

export type ConfigurationData = {
  uiServer: UIServerConfigurationSection | UIServerConfigurationSection[]
}

export type UIServerConfigurationSection = {
  host: string
  port: number
  secure?: boolean
  protocol: Protocol
  version: ProtocolVersion
  authentication?: {
    enabled: boolean
    type: AuthenticationType
    username?: string
    password?: string
  }
}
