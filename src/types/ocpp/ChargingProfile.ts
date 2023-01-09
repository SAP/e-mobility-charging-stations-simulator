import {
  type OCPP16ChargingProfile,
  OCPP16ChargingRateUnitType,
  type OCPP16ChargingSchedulePeriod,
} from './1.6/ChargingProfile';

export type ChargingProfile = OCPP16ChargingProfile;

export type ChargingSchedulePeriod = OCPP16ChargingSchedulePeriod;

export const ChargingRateUnitType = {
  ...OCPP16ChargingRateUnitType,
} as const;
export type ChargingRateUnitType = OCPP16ChargingRateUnitType;
