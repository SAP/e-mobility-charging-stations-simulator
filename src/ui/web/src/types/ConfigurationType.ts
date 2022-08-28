export interface BaseConfig {
  emobility: EMobilityConfig;
}

export interface EMobilityConfig {
  host: string;
  port: number;
  protocol: string;
}
