import type { OCPPConfigurationKey } from './ocpp/Configuration.js'

export interface ChargingStationOcppConfiguration {
  configurationKey?: ConfigurationKey[]
}

export interface ConfigurationKey extends OCPPConfigurationKey {
  reboot?: boolean
  visible?: boolean
}
