import { PublicKeyWithSignedMeterValueEnumType } from '../../types/ocpp/Configuration.js'

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
