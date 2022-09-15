import type { OCPPConfigurationKey } from './ocpp/Configuration';

export interface ConfigurationKey extends OCPPConfigurationKey {
  visible?: boolean;
  reboot?: boolean;
}

export type ChargingStationOcppConfiguration = {
  configurationKey?: ConfigurationKey[];
};
