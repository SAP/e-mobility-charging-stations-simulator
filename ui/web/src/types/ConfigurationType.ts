import type { AuthenticationType, Protocol, ProtocolVersion } from './UIProtocol'

export interface ConfigurationData {
  uiServer: UIServerConfigurationSection | UIServerConfigurationSection[]
}

export interface UIServerConfigurationSection {
  authentication?: {
    enabled: boolean
    password?: string
    type: AuthenticationType
    username?: string
  }
  host: string
  name?: string
  port: number
  protocol: Protocol
  secure?: boolean
  version: ProtocolVersion
}
