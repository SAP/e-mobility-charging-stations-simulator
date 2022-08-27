import type { JsonObject } from '../../JsonType';

export interface OCPP16ChargingProfile extends JsonObject {
  chargingProfileId: number;
  transactionId?: number;
  stackLevel: number;
  chargingProfilePurpose: ChargingProfilePurposeType;
  chargingProfileKind: ChargingProfileKindType;
  recurrencyKind?: RecurrencyKindType;
  validFrom?: Date;
  validTo?: Date;
  chargingSchedule: ChargingSchedule;
}

export interface ChargingSchedule extends JsonObject {
  duration?: number;
  startSchedule?: Date;
  chargingRateUnit: OCPP16ChargingRateUnitType;
  chargingSchedulePeriod: OCPP16ChargingSchedulePeriod[];
  minChargeRate?: number;
}

export interface OCPP16ChargingSchedulePeriod extends JsonObject {
  startPeriod: number;
  limit: number;
  numberPhases?: number;
}

export enum OCPP16ChargingRateUnitType {
  WATT = 'W',
  AMPERE = 'A',
}

export enum ChargingProfileKindType {
  ABSOLUTE = 'Absolute',
  RECURRING = 'Recurring',
  RELATIVE = 'Relative',
}

export enum ChargingProfilePurposeType {
  CHARGE_POINT_MAX_PROFILE = 'ChargePointMaxProfile',
  TX_DEFAULT_PROFILE = 'TxDefaultProfile',
  TX_PROFILE = 'TxProfile',
}

export enum RecurrencyKindType {
  DAILY = 'Daily',
  WEEKLY = 'Weekly',
  MONTHLY = 'Monthly',
}
