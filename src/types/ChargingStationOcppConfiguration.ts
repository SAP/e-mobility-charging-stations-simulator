import type { JsonObject } from './JsonType.js'
import type { OCPPConfigurationKey } from './ocpp/Configuration.js'

export interface ConfigurationKey extends OCPPConfigurationKey {
  visible?: boolean
  reboot?: boolean
}

export interface ChargingStationOcppConfiguration extends JsonObject {
  configurationKey?: ConfigurationKey[]
}
