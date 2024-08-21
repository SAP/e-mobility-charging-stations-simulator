import type { JsonObject } from './JsonType.js'
import type { OCPPConfigurationKey } from './ocpp/Configuration.js'

export interface ConfigurationKey extends OCPPConfigurationKey {
  reboot?: boolean
  visible?: boolean
}

export interface ChargingStationOcppConfiguration extends JsonObject {
  configurationKey?: ConfigurationKey[]
}
