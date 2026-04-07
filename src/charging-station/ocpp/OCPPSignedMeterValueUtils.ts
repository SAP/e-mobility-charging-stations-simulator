import { BaseError } from '../../exception/index.js'
import { PublicKeyWithSignedMeterValueEnumType, type SampledValue } from '../../types/index.js'

export interface SignedSampledValueResult<T extends SampledValue = SampledValue> {
  publicKeyIncluded: boolean
  sampledValue: T
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
