import {
  OCPP16ChargingProfile,
  OCPP16ChargingRateUnitType,
  OCPP16ChargingSchedulePeriod,
} from './1.6/ChargingProfile';

export type ChargingProfile = OCPP16ChargingProfile;

export type ChargingSchedulePeriod = OCPP16ChargingSchedulePeriod;

export type ChargingRateUnitType = OCPP16ChargingRateUnitType;

export const ChargingRateUnitType = {
  ...OCPP16ChargingRateUnitType,
};
