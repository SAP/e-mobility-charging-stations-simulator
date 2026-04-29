import type { SKIN_IDS, THEME_IDS, UIServerConfigurationSection } from '../config/schema.js'

export interface ConfigurationData {
  skin?: (typeof SKIN_IDS)[number]
  theme?: (typeof THEME_IDS)[number]
  uiServer: UIServerConfigurationSection | UIServerConfigurationSection[]
}
