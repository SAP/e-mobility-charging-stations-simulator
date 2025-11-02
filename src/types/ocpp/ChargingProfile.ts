import {
  type OCPP16ChargingProfile,
  OCPP16ChargingProfileKindType,
  OCPP16ChargingProfilePurposeType,
  OCPP16ChargingRateUnitType,
  type OCPP16ChargingSchedulePeriod,
  OCPP16RecurrencyKindType,
} from './1.6/ChargingProfile.js'
import {
  OCPP20ChargingProfileKindEnumType,
  OCPP20ChargingProfilePurposeEnumType,
  type OCPP20ChargingProfileType,
  OCPP20ChargingRateUnitEnumType,
  type OCPP20ChargingSchedulePeriodType,
  OCPP20RecurrencyKindEnumType,
} from './2.0/Transaction.js'

export type ChargingProfile = OCPP16ChargingProfile | OCPP20ChargingProfileType

export type ChargingSchedulePeriod = OCPP16ChargingSchedulePeriod | OCPP20ChargingSchedulePeriodType

export const ChargingProfilePurposeType = {
  ...OCPP16ChargingProfilePurposeType,
  ...OCPP20ChargingProfilePurposeEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChargingProfilePurposeType =
  | OCPP16ChargingProfilePurposeType
  | OCPP20ChargingProfilePurposeEnumType

export const ChargingProfileKindType = {
  ...OCPP16ChargingProfileKindType,
  ...OCPP20ChargingProfileKindEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChargingProfileKindType =
  | OCPP16ChargingProfileKindType
  | OCPP20ChargingProfileKindEnumType

export const RecurrencyKindType = {
  ...OCPP16RecurrencyKindType,
  ...OCPP20RecurrencyKindEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type RecurrencyKindType = OCPP16RecurrencyKindType | OCPP20RecurrencyKindEnumType

export const ChargingRateUnitType = {
  ...OCPP16ChargingRateUnitType,
  ...OCPP20ChargingRateUnitEnumType,
} as const
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ChargingRateUnitType = OCPP16ChargingRateUnitType | OCPP20ChargingRateUnitEnumType
