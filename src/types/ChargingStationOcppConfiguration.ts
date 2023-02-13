import type { OCPPConfigurationKey } from './internal';

export type ConfigurationKey = OCPPConfigurationKey & {
  visible?: boolean;
  reboot?: boolean;
};

export type ChargingStationOcppConfiguration = {
  configurationKey?: ConfigurationKey[];
};
