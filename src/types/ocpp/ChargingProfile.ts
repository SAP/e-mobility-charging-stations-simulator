import {
  type OCPP16ChargingProfile,
  OCPP16ChargingProfileKindType,
  OCPP16ChargingRateUnitType,
  type OCPP16ChargingSchedulePeriod,
  OCPP16RecurrencyKindType,
} from './1.6/ChargingProfile';

export type ChargingProfile = OCPP16ChargingProfile;

export type ChargingSchedulePeriod = OCPP16ChargingSchedulePeriod;

export const ChargingProfileKindType = {
  ...OCPP16ChargingProfileKindType,
} as const;
export type ChargingProfileKindType = OCPP16ChargingProfileKindType;

export const RecurrencyKindType = {
  ...OCPP16RecurrencyKindType,
} as const;
export type RecurrencyKindType = OCPP16RecurrencyKindType;

export const ChargingRateUnitType = {
  ...OCPP16ChargingRateUnitType,
} as const;
export type ChargingRateUnitType = OCPP16ChargingRateUnitType;
