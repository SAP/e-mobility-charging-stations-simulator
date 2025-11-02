import type { EmptyObject } from '../../EmptyObject.js'
import type { JsonObject } from '../../JsonType.js'
import type { CustomDataType } from './Common.js'
import type { OCPP20MeterValue } from './MeterValues.js'
export enum CostKindEnumType {
  CarbonDioxideEmission = 'CarbonDioxideEmission',
  RelativePricePercentage = 'RelativePricePercentage',
  RenewableGenerationPercentage = 'RenewableGenerationPercentage',
}

export enum OCPP20ChargingProfileKindEnumType {
  Absolute = 'Absolute',
  Recurring = 'Recurring',
  Relative = 'Relative',
}

export enum OCPP20ChargingProfilePurposeEnumType {
  ChargingStationExternalConstraints = 'ChargingStationExternalConstraints',
  ChargingStationMaxProfile = 'ChargingStationMaxProfile',
  TxDefaultProfile = 'TxDefaultProfile',
  TxProfile = 'TxProfile',
}

export enum OCPP20ChargingRateUnitEnumType {
  A = 'A',
  W = 'W',
}

export enum OCPP20ChargingStateEnumType {
  Charging = 'Charging',
  EVConnected = 'EVConnected',
  Idle = 'Idle',
  SuspendedEV = 'SuspendedEV',
  SuspendedEVSE = 'SuspendedEVSE',
}

export enum OCPP20ConnectorEnumType {
  cCCS1 = 'cCCS1',
  cCCS2 = 'cCCS2',
  cG105 = 'cG105',
  cTesla = 'cTesla',
  cType1 = 'cType1',
  cType2 = 'cType2',
  Other1PhMax16A = 'Other1PhMax16A',
  Other1PhOver16A = 'Other1PhOver16A',
  Other3Ph = 'Other3Ph',
  Pan = 'Pan',
  s309_1P_16A = 's309-1P-16A',
  s309_1P_32A = 's309-1P-32A',
  s309_3P_16A = 's309-3P-16A',
  s309_3P_32A = 's309-3P-32A',
  sBS1361 = 'sBS1361',
  sCEE_7_7 = 'sCEE-7-7',
  sType2 = 'sType2',
  sType3 = 'sType3',
  Undetermined = 'Undetermined',
  Unknown = 'Unknown',
  wInductive = 'wInductive',
  wResonant = 'wResonant',
}

export enum OCPP20ConnectorStatusEnumType {
  Available = 'Available',
  Faulted = 'Faulted',
  Occupied = 'Occupied',
  Reserved = 'Reserved',
  Unavailable = 'Unavailable',
}

export enum OCPP20IdTokenEnumType {
  Central = 'Central',
  eMAID = 'eMAID',
  ISO14443 = 'ISO14443',
  ISO15693 = 'ISO15693',
  KeyCode = 'KeyCode',
  Local = 'Local',
  MacAddress = 'MacAddress',
  NoAuthorization = 'NoAuthorization',
}

export enum OCPP20ReasonEnumType {
  DeAuthorized = 'DeAuthorized',
  EmergencyStop = 'EmergencyStop',
  EnergyLimitReached = 'EnergyLimitReached',
  EVDisconnected = 'EVDisconnected',
  GroundFault = 'GroundFault',
  ImmediateReset = 'ImmediateReset',
  Local = 'Local',
  LocalOutOfCredit = 'LocalOutOfCredit',
  MasterPass = 'MasterPass',
  Other = 'Other',
  OvercurrentFault = 'OvercurrentFault',
  PowerLoss = 'PowerLoss',
  PowerQuality = 'PowerQuality',
  Reboot = 'Reboot',
  Remote = 'Remote',
  SOCLimitReached = 'SOCLimitReached',
  StoppedByEV = 'StoppedByEV',
  TimeLimitReached = 'TimeLimitReached',
  Timeout = 'Timeout',
}

export enum OCPP20RecurrencyKindEnumType {
  Daily = 'Daily',
  Weekly = 'Weekly',
}

export enum OCPP20TransactionEventEnumType {
  Ended = 'Ended',
  Started = 'Started',
  Updated = 'Updated',
}

export enum OCPP20TriggerReasonEnumType {
  AbnormalCondition = 'AbnormalCondition',
  Authorized = 'Authorized',
  CablePluggedIn = 'CablePluggedIn',
  ChargingRateChanged = 'ChargingRateChanged',
  ChargingStateChanged = 'ChargingStateChanged',
  Deauthorized = 'Deauthorized',
  EnergyLimitReached = 'EnergyLimitReached',
  EVCommunicationLost = 'EVCommunicationLost',
  EVConnectTimeout = 'EVConnectTimeout',
  EVDeparted = 'EVDeparted',
  EVDetected = 'EVDetected',
  MeterValueClock = 'MeterValueClock',
  MeterValuePeriodic = 'MeterValuePeriodic',
  RemoteStart = 'RemoteStart',
  RemoteStop = 'RemoteStop',
  ResetCommand = 'ResetCommand',
  SignedDataReceived = 'SignedDataReceived',
  StopAuthorized = 'StopAuthorized',
  TimeLimitReached = 'TimeLimitReached',
  Trigger = 'Trigger',
  UnlockCommand = 'UnlockCommand',
}

export enum RequestStartStopStatusEnumType {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
}

export enum TransactionComponentNameType {
  AuthCacheCtrlr = 'AuthCacheCtrlr',
  AuthCtrlr = 'AuthCtrlr',
  LocalAuthListCtrlr = 'LocalAuthListCtrlr',
  ReservationCtrlr = 'ReservationCtrlr',
  TokenReader = 'TokenReader',
  TxCtrlr = 'TxCtrlr',
}

export enum TransactionReasonCodeEnumType {
  InvalidIdToken = 'InvalidIdToken',
  TxInProgress = 'TxInProgress',
  TxNotFound = 'TxNotFound',
  TxStarted = 'TxStarted',
  UnknownTxId = 'UnknownTxId',
}

export interface AdditionalInfoType extends JsonObject {
  additionalIdToken: string
  customData?: CustomDataType
  type: string
}

export interface ComponentType extends JsonObject {
  customData?: CustomDataType
  evse?: OCPP20EVSEType
  instance?: string
  name: string
}

export interface ConsumptionCostType extends JsonObject {
  cost: CostType[]
  customData?: CustomDataType
  startValue: number
}

export interface CostType extends JsonObject {
  amount: number
  amountMultiplier?: number
  costKind: CostKindEnumType
  customData?: CustomDataType
}

export interface OCPP20ChargingProfileType extends JsonObject {
  chargingProfileKind: OCPP20ChargingProfileKindEnumType
  chargingProfilePurpose: OCPP20ChargingProfilePurposeEnumType
  chargingSchedule: OCPP20ChargingScheduleType[]
  customData?: CustomDataType
  id: number
  recurrencyKind?: OCPP20RecurrencyKindEnumType
  stackLevel: number
  transactionId?: string
  validFrom?: Date
  validTo?: Date
}

export interface OCPP20ChargingSchedulePeriodType extends JsonObject {
  customData?: CustomDataType
  limit: number
  numberPhases?: number
  phaseToUse?: number
  startPeriod: number
}

export interface OCPP20ChargingScheduleType extends JsonObject {
  chargingRateUnit: OCPP20ChargingRateUnitEnumType
  chargingSchedulePeriod: OCPP20ChargingSchedulePeriodType[]
  customData?: CustomDataType
  duration?: number
  id: number
  minChargingRate?: number
  startSchedule?: Date
}

export interface OCPP20EVSEType extends JsonObject {
  connectorId?: number
  customData?: CustomDataType
  id: number
}

export interface OCPP20IdTokenType extends JsonObject {
  additionalInfo?: AdditionalInfoType[]
  customData?: CustomDataType
  idToken: string
  type: OCPP20IdTokenEnumType
}

export interface OCPP20TransactionEventRequest extends JsonObject {
  cableMaxCurrent?: number
  customData?: CustomDataType
  eventType: OCPP20TransactionEventEnumType
  evse?: OCPP20EVSEType
  idToken?: OCPP20IdTokenType
  meterValue?: OCPP20MeterValue[]
  numberOfPhasesUsed?: number
  offline?: boolean
  reservationId?: number
  seqNo: number
  timestamp: Date
  transactionInfo: OCPP20TransactionType
  triggerReason: OCPP20TriggerReasonEnumType
}

export type OCPP20TransactionEventResponse = EmptyObject

export interface OCPP20TransactionType extends JsonObject {
  chargingState?: OCPP20ChargingStateEnumType
  customData?: CustomDataType
  remoteStartId?: number
  stoppedReason?: OCPP20ReasonEnumType
  timeSpentCharging?: number
  transactionId: string
}

export interface RelativeTimeIntervalType extends JsonObject {
  customData?: CustomDataType
  duration?: number
  start: number
}

export interface SalesTariffEntryType extends JsonObject {
  consumptionCost?: ConsumptionCostType[]
  customData?: CustomDataType
  relativeTimeInterval: RelativeTimeIntervalType
}

export interface SalesTariffType extends JsonObject {
  customData?: CustomDataType
  id: number
  numEPriceLevels?: number
  salesTariffDescription?: string
  salesTariffEntry: SalesTariffEntryType[]
}
