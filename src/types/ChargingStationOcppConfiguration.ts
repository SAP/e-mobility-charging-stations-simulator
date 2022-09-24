import type { OCPPConfigurationKey } from './ocpp/Configuration';

export type ConfigurationKey = OCPPConfigurationKey & {
  visible?: boolean;
  reboot?: boolean;
};

export type ChargingStationOcppConfiguration = {
  configurationKey?: ConfigurationKey[];
};
