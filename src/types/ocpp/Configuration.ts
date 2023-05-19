import {
  OCPP16StandardParametersKey,
  OCPP16SupportedFeatureProfiles,
  OCPP16VendorParametersKey,
} from './1.6/Configuration';
import {
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  OCPP20VendorVariableName,
} from './2.0/Variables';
import type { JsonObject } from '../JsonType';

export const StandardParametersKey = {
  ...OCPP16StandardParametersKey,
  ...OCPP20RequiredVariableName,
  ...OCPP20OptionalVariableName,
} as const;
export type StandardParametersKey = OCPP16StandardParametersKey;

export const VendorParametersKey = {
  ...OCPP16VendorParametersKey,
  ...OCPP20VendorVariableName,
} as const;
export type VendorParametersKey = OCPP16VendorParametersKey;

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

export type ConfigurationKeyType = string | StandardParametersKey | VendorParametersKey;

export type OCPPConfigurationKey = {
  key: ConfigurationKeyType;
  readonly: boolean;
  value?: string;
} & JsonObject;
