export interface OCPP16ChargingProfile {
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

export interface ChargingSchedule {
  duration?: number;
  startSchedule?: Date;
  chargingRateUnit: ChargingRateUnitType;
  chargingSchedulePeriod: ChargingSchedulePeriod[];
  minChargeRate?: number;
}

export interface ChargingSchedulePeriod {
  startPeriod: number;
  limit: number;
  numberPhases?: number;
}

export enum ChargingRateUnitType {
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
}
