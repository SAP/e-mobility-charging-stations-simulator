import type { UIServerConfigurationSection } from '../config/schema.js'

export interface ConfigurationData {
  skin?: 'classic' | 'modern'
  theme?: 'catppuccin-latte' | 'sap-horizon' | 'tokyo-night-storm'
  uiServer: UIServerConfigurationSection | UIServerConfigurationSection[]
}
