import type { AuthenticationType, Protocol, ProtocolVersion } from './UIProtocol'

export interface ConfigurationData {
  uiServer: UIServerConfigurationSection | UIServerConfigurationSection[]
}

export interface UIServerConfigurationSection {
  name?: string
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
