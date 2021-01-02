import { StandardParametersKey } from './ocpp/1.6/Configuration';

export interface ConfigurationKey {
  key: string | StandardParametersKey;
  readonly?: boolean;
  value: string;
  visible?: boolean;
  reboot?: boolean;
}

export default interface ChargingStationConfiguration {
  configurationKey: ConfigurationKey[];
}
