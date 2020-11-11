export interface ConfigurationKey {
  key: string;
  readonly?: boolean;
  value: string;
  visible?: boolean;
  reboot?: boolean;
}

export default interface ChargingStationConfiguration {
  configurationKey: ConfigurationKey[];
}
