import type { UIServerConfigurationSection } from '../config/schema.js'

export interface ConfigurationData {
  skin?: string
  theme?: string
  uiServer: UIServerConfigurationSection | UIServerConfigurationSection[]
}
