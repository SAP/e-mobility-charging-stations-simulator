import { PublicKeyWithSignedMeterValueEnumType } from '../../types/ocpp/Configuration.js'

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
      throw new TypeError(
        `Unsupported PublicKeyWithSignedMeterValueEnumType value: ${String(config)}`
      )
  }
}
