import type { UIServerConfigurationSection } from '../config/schema.js'

export interface ConfigurationData {
  theme?: string
  uiServer: UIServerConfigurationSection | UIServerConfigurationSection[]
}
