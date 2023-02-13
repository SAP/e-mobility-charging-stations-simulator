import {
  type JsonObject,
  OCPP16StandardParametersKey,
  OCPP16SupportedFeatureProfiles,
  OCPP16VendorDefaultParametersKey,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  OCPP20VendorVariableName,
} from '../internal';

export const StandardParametersKey = {
  ...OCPP16StandardParametersKey,
  ...OCPP20RequiredVariableName,
  ...OCPP20OptionalVariableName,
} as const;
export type StandardParametersKey = OCPP16StandardParametersKey;

export const VendorDefaultParametersKey = {
  ...OCPP16VendorDefaultParametersKey,
  ...OCPP20VendorVariableName,
} as const;
export type VendorDefaultParametersKey = OCPP16VendorDefaultParametersKey;

export const SupportedFeatureProfiles = {
  ...OCPP16SupportedFeatureProfiles,
} as const;
export type SupportedFeatureProfiles = OCPP16SupportedFeatureProfiles;

export enum ConnectorPhaseRotation {
  NotApplicable = 'NotApplicable',
  Unknown = 'Unknown',
  RST = 'RST',
  RTS = 'RTS',
  SRT = 'SRT',
  STR = 'STR',
  TRS = 'TRS',
  TSR = 'TSR',
}

export type OCPPConfigurationKey = {
  key: string | StandardParametersKey;
  readonly: boolean;
  value?: string;
} & JsonObject;
