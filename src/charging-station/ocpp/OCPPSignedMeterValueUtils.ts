import { BaseError } from '../../exception/index.js'
import {
  PublicKeyWithSignedMeterValueEnumType,
  type SampledValue,
  SigningMethodEnumType,
} from '../../types/index.js'

export interface SampledValueSigningConfig extends SigningConfig {
  enabled: boolean
  publicKeySentInTransaction: boolean
  timestamp?: Date
  transactionId: number | string
}

export interface SignedSampledValueResult<T extends SampledValue = SampledValue> {
  publicKeyIncluded: boolean
  sampledValue: T
}

export interface SigningConfig {
  meterSerialNumber: string
  publicKeyHex?: string
  publicKeyWithSignedMeterValue: PublicKeyWithSignedMeterValueEnumType
  signingMethod?: SigningMethodEnumType
}

// EC curve OID hex → SigningMethodEnumType (OCA Application Note Table 12)
const EC_CURVE_OID_MAP = new Map<string, SigningMethodEnumType>([
  ['06052b8104000a', SigningMethodEnumType.ECDSA_secp256k1_SHA256],
  ['06052b8104001f', SigningMethodEnumType.ECDSA_secp192k1_SHA256],
  ['06052b81040022', SigningMethodEnumType.ECDSA_secp384r1_SHA256],
  ['06082a8648ce3d030101', SigningMethodEnumType.ECDSA_secp192r1_SHA256],
  ['06082a8648ce3d030107', SigningMethodEnumType.ECDSA_secp256r1_SHA256],
  ['06092b240303020801010b', SigningMethodEnumType.ECDSA_brainpool384r1_SHA256],
  ['06092b2403030208010107', SigningMethodEnumType.ECDSA_brainpool256r1_SHA256],
])

export const deriveSigningMethodFromPublicKeyHex = (
  publicKeyHex: string
): SigningMethodEnumType | undefined => {
  const hex = publicKeyHex.toLowerCase().replace(/[^0-9a-f]/g, '')
  for (const [oid, method] of EC_CURVE_OID_MAP) {
    if (hex.includes(oid)) {
      return method
    }
  }
  return undefined
}

export interface SigningPrerequisiteResult {
  enabled: false
  reason: string
}

export interface SigningPrerequisiteSuccess {
  enabled: true
  signingMethod: SigningMethodEnumType
}

export const validateSigningPrerequisites = (
  publicKeyHex: string | undefined,
  configuredSigningMethod: SigningMethodEnumType | undefined
): SigningPrerequisiteResult | SigningPrerequisiteSuccess => {
  if (publicKeyHex == null || publicKeyHex.length === 0) {
    return { enabled: false, reason: 'Public key is not configured' }
  }

  const derivedMethod = deriveSigningMethodFromPublicKeyHex(publicKeyHex)

  if (derivedMethod == null) {
    return {
      enabled: false,
      reason: 'Cannot derive EC curve from public key hex — unsupported or malformed ASN.1 key',
    }
  }

  if (configuredSigningMethod != null && configuredSigningMethod !== derivedMethod) {
    return {
      enabled: false,
      reason:
        `SigningMethod mismatch: configured '${configuredSigningMethod}' ` +
        `but public key uses '${derivedMethod}'`,
    }
  }

  return { enabled: true, signingMethod: configuredSigningMethod ?? derivedMethod }
}

const PUBLIC_KEY_WITH_SIGNED_METER_VALUE_VALUES = new Set<string>(
  Object.values(PublicKeyWithSignedMeterValueEnumType)
)

export const parsePublicKeyWithSignedMeterValue = (
  value: string | undefined
): PublicKeyWithSignedMeterValueEnumType =>
  value != null && PUBLIC_KEY_WITH_SIGNED_METER_VALUE_VALUES.has(value)
    ? (value as PublicKeyWithSignedMeterValueEnumType)
    : PublicKeyWithSignedMeterValueEnumType.Never

export const shouldIncludePublicKey = (
  config: PublicKeyWithSignedMeterValueEnumType,
  publicKeySentInTransaction: boolean
): boolean => {
  switch (config) {
    case PublicKeyWithSignedMeterValueEnumType.EveryMeterValue:
      return true
    case PublicKeyWithSignedMeterValueEnumType.Never:
      return false
    case PublicKeyWithSignedMeterValueEnumType.OncePerTransaction:
      return !publicKeySentInTransaction
    default:
      throw new BaseError(
        `Unsupported PublicKeyWithSignedMeterValueEnumType value: ${String(config)}`
      )
  }
}
