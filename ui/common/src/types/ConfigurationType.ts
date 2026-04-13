import type { AuthenticationType } from './UIProtocol.js'

export interface AuthenticationConfiguration {
  enabled: boolean
  password?: string
  type: AuthenticationType
  username?: string
}

export interface UIServerConfigurationSection {
  authentication?: AuthenticationConfiguration
  host: string
  name?: string
  port: number
  protocol: string
  secure?: boolean
  version: string
}
