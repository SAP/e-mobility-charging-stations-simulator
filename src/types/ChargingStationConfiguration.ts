import { JsonType } from './JsonType';
import { OCPPConfigurationKey } from './ocpp/Configuration';

export interface ConfigurationKey extends OCPPConfigurationKey {
  visible?: boolean;
  reboot?: boolean;
}

export default interface ChargingStationConfiguration extends JsonType {
  configurationKey: ConfigurationKey[];
}
