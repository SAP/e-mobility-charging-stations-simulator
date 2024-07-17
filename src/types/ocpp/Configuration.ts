import type { JsonObject } from '../JsonType.js'
import {
  OCPP16StandardParametersKey,
  OCPP16SupportedFeatureProfiles,
  OCPP16VendorParametersKey,
} from './1.6/Configuration.js'
import {
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  OCPP20VendorVariableName,
} from './2.0/Variables.js'

export const StandardParametersKey = {
  ...OCPP16StandardParametersKey,
  ...OCPP20RequiredVariableName,
  ...OCPP20OptionalVariableName,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type StandardParametersKey = OCPP16StandardParametersKey

export const VendorParametersKey = {
  ...OCPP16VendorParametersKey,
  ...OCPP20VendorVariableName,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type VendorParametersKey = OCPP16VendorParametersKey

export const SupportedFeatureProfiles = {
  ...OCPP16SupportedFeatureProfiles,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SupportedFeatureProfiles = OCPP16SupportedFeatureProfiles

export enum ConnectorPhaseRotation {
  NotApplicable = 'NotApplicable',
  Unknown = 'Unknown',
  RST = 'RST',
  RTS = 'RTS',
  SRT = 'SRT',
  STR = 'STR',
  TRS = 'TRS',
  TSR = 'TSR'
}

export type ConfigurationKeyType = string | StandardParametersKey | VendorParametersKey

export interface OCPPConfigurationKey extends JsonObject {
  key: ConfigurationKeyType
  readonly: boolean
  value?: string
}
