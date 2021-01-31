import { OCPP16StandardParametersKey } from './1.6/Configuration';

export type StandardParametersKey = OCPP16StandardParametersKey;

export const StandardParametersKey = {
  ...OCPP16StandardParametersKey
};

export interface OCPPConfigurationKey {
  key: string | StandardParametersKey;
  readonly: boolean;
  value?: string;
}
