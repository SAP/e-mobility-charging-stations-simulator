import type { JsonObject } from '../../JsonType.js'

export enum OCPP16ChargingProfileKindType {
  ABSOLUTE = 'Absolute',
  RECURRING = 'Recurring',
  RELATIVE = 'Relative',
}

export enum OCPP16ChargingProfilePurposeType {
  CHARGE_POINT_MAX_PROFILE = 'ChargePointMaxProfile',
  TX_DEFAULT_PROFILE = 'TxDefaultProfile',
  TX_PROFILE = 'TxProfile',
}

export enum OCPP16ChargingRateUnitType {
  AMPERE = 'A',
  WATT = 'W',
}

export enum OCPP16RecurrencyKindType {
  DAILY = 'Daily',
  WEEKLY = 'Weekly',
}

export interface OCPP16ChargingProfile extends JsonObject {
  chargingProfileId: number
  chargingProfileKind: OCPP16ChargingProfileKindType
  chargingProfilePurpose: OCPP16ChargingProfilePurposeType
  chargingSchedule: OCPP16ChargingSchedule
  recurrencyKind?: OCPP16RecurrencyKindType
  stackLevel: number
  transactionId?: number
  validFrom?: Date
  validTo?: Date
}

export interface OCPP16ChargingSchedule extends JsonObject {
  chargingRateUnit: OCPP16ChargingRateUnitType
  chargingSchedulePeriod: OCPP16ChargingSchedulePeriod[]
  duration?: number
  minChargeRate?: number
  startSchedule?: Date
}

export interface OCPP16ChargingSchedulePeriod extends JsonObject {
  limit: number
  numberPhases?: number
  startPeriod: number
}
