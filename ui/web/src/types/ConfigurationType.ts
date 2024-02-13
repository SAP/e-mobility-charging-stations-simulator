export type ConfigurationData = {
  uiServer: UIServerConfigurationSection
}

type UIServerConfigurationSection = {
  host: string
  port: number
  protocol: string
  username?: string
  password?: string
}
