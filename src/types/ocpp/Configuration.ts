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

export enum ConnectorPhaseRotation {
  NotApplicable = 'NotApplicable',
  RST = 'RST',
  RTS = 'RTS',
  SRT = 'SRT',
  STR = 'STR',
  TRS = 'TRS',
  TSR = 'TSR',
  Unknown = 'Unknown',
}

export enum EncodingMethodEnumType {
  EDL = 'EDL',
  OCMF = 'OCMF',
}

export enum PublicKeyWithSignedMeterValueEnumType {
  EveryMeterValue = 'EveryMeterValue',
  Never = 'Never',
  OncePerTransaction = 'OncePerTransaction',
}

export enum SigningMethodEnumType {
  ECDSA_brainpool256r1_SHA256 = 'ECDSA-brainpool256r1-SHA256',
  ECDSA_brainpool384r1_SHA256 = 'ECDSA-brainpool384r1-SHA256',
  ECDSA_secp192k1_SHA256 = 'ECDSA-secp192k1-SHA256',
  ECDSA_secp192r1_SHA256 = 'ECDSA-secp192r1-SHA256',
  ECDSA_secp256k1_SHA256 = 'ECDSA-secp256k1-SHA256',
  ECDSA_secp256r1_SHA256 = 'ECDSA-secp256r1-SHA256',
  ECDSA_secp384r1_SHA256 = 'ECDSA-secp384r1-SHA256',
}

export type ConfigurationKeyType = StandardParametersKey | string | VendorParametersKey

export interface OCPPConfigurationKey extends JsonObject {
  key: ConfigurationKeyType
  readonly: boolean
  value?: string
}

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
