import { AuthenticationType, type ConfigurationData, Protocol, ProtocolVersion } from '@/types'

const configuration: ConfigurationData = {
  uiServer: {
    host: 'localhost',
    port: 8080,
    protocol: Protocol.UI,
    version: ProtocolVersion['0.0.1'],
    authentication: {
      enabled: false,
      type: AuthenticationType.BASIC_AUTH,
      username: 'admin',
      password: 'admin'
    }
  }
}

export default configuration
