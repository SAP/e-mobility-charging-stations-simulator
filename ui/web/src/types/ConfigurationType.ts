export type BaseConfig = {
  uiServer: UIServerConfig;
};

type UIServerConfig = {
  host: string;
  port: number;
  protocol: string;
  username?: string;
  password?: string;
};
