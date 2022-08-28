export interface BaseConfig {
  uiServer: UIServerConfig;
}

interface UIServerConfig {
  host: string;
  port: number;
  protocol: string;
}
