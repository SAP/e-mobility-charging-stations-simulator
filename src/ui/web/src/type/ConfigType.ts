export interface BaseConfig {
  emobility: EMobilityConfig;
}

export interface EMobilityConfig {
  host: string;
  port: number;
  protocol: 'ui0.0.1';
}
