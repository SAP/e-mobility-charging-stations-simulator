import type { UIServerConfigurationSection } from '../config/schema.js'

export interface ConfigurationData {
  skin?: 'classic' | 'modern'
  theme?: 'tokyo-night-storm' | 'catppuccin-latte' | 'sap-horizon'
  uiServer: UIServerConfigurationSection | UIServerConfigurationSection[]
}
