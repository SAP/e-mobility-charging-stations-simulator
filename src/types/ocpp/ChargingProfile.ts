import {
  type OCPP16ChargingProfile,
  OCPP16ChargingProfileKindType,
  OCPP16ChargingProfilePurposeType,
  OCPP16ChargingRateUnitType,
  type OCPP16ChargingSchedulePeriod,
  OCPP16RecurrencyKindType
} from './1.6/ChargingProfile.js'

export type ChargingProfile = OCPP16ChargingProfile

export type ChargingSchedulePeriod = OCPP16ChargingSchedulePeriod

export const ChargingProfilePurposeType = {
  ...OCPP16ChargingProfilePurposeType
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChargingProfilePurposeType = OCPP16ChargingProfilePurposeType

export const ChargingProfileKindType = {
  ...OCPP16ChargingProfileKindType
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChargingProfileKindType = OCPP16ChargingProfileKindType

export const RecurrencyKindType = {
  ...OCPP16RecurrencyKindType
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type RecurrencyKindType = OCPP16RecurrencyKindType

export const ChargingRateUnitType = {
  ...OCPP16ChargingRateUnitType
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChargingRateUnitType = OCPP16ChargingRateUnitType
