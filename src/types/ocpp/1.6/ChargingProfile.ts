import type { JsonObject } from '../../JsonType.js'

export interface OCPP16ChargingProfile extends JsonObject {
  chargingProfileId: number
  transactionId?: number
  stackLevel: number
  chargingProfilePurpose: OCPP16ChargingProfilePurposeType
  chargingProfileKind: OCPP16ChargingProfileKindType
  recurrencyKind?: OCPP16RecurrencyKindType
  validFrom?: Date
  validTo?: Date
  chargingSchedule: OCPP16ChargingSchedule
}

export interface OCPP16ChargingSchedule extends JsonObject {
  startSchedule?: Date
  duration?: number
  chargingRateUnit: OCPP16ChargingRateUnitType
  chargingSchedulePeriod: OCPP16ChargingSchedulePeriod[]
  minChargeRate?: number
}

export interface OCPP16ChargingSchedulePeriod extends JsonObject {
  startPeriod: number
  limit: number
  numberPhases?: number
}

export enum OCPP16ChargingRateUnitType {
  WATT = 'W',
  AMPERE = 'A'
}

export enum OCPP16ChargingProfileKindType {
  ABSOLUTE = 'Absolute',
  RECURRING = 'Recurring',
  RELATIVE = 'Relative'
}

export enum OCPP16ChargingProfilePurposeType {
  CHARGE_POINT_MAX_PROFILE = 'ChargePointMaxProfile',
  TX_DEFAULT_PROFILE = 'TxDefaultProfile',
  TX_PROFILE = 'TxProfile'
}

export enum OCPP16RecurrencyKindType {
  DAILY = 'Daily',
  WEEKLY = 'Weekly'
}
