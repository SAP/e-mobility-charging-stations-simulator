import { StandardParametersKey } from './1.6/Configuration';

export interface OCPPConfigurationKey {
  key: string | StandardParametersKey;
  readonly: boolean;
  value?: string;
}
