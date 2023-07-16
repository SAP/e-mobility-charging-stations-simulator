import type { OCPPConfigurationKey } from './ocpp/Configuration';

export type ConfigurationKey = OCPPConfigurationKey & {
  visible?: boolean;
  reboot?: boolean;
};

export interface ChargingStationOcppConfiguration {
  configurationKey?: ConfigurationKey[];
}
