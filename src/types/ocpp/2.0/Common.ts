import type { JsonObject } from '../../JsonType.js'
import type { GenericStatus } from '../Common.js'
import type { VariableType } from './Variables.js'

export enum BootReasonEnumType {
  ApplicationReset = 'ApplicationReset',
  FirmwareUpdate = 'FirmwareUpdate',
  LocalReset = 'LocalReset',
  PowerUp = 'PowerUp',
  RemoteReset = 'RemoteReset',
  ScheduledReset = 'ScheduledReset',
  Triggered = 'Triggered',
  Unknown = 'Unknown',
  Watchdog = 'Watchdog',
}

export enum CertificateActionEnumType {
  Install = 'Install',
  Update = 'Update',
}

export enum CertificateSigningUseEnumType {
  ChargingStationCertificate = 'ChargingStationCertificate',
  V2GCertificate = 'V2GCertificate',
}

export enum CostKindEnumType {
  CarbonDioxideEmission = 'CarbonDioxideEmission',
  RelativePricePercentage = 'RelativePricePercentage',
  RenewableGenerationPercentage = 'RenewableGenerationPercentage',
}

export enum DataEnumType {
  boolean = 'boolean',
  dateTime = 'dateTime',
  decimal = 'decimal',
  integer = 'integer',
  MemberList = 'MemberList',
  OptionList = 'OptionList',
  SequenceList = 'SequenceList',
  string = 'string',
}

export enum DeleteCertificateStatusEnumType {
  Accepted = 'Accepted',
  Failed = 'Failed',
  NotFound = 'NotFound',
}

export enum GenericDeviceModelStatusEnumType {
  Accepted = 'Accepted',
  EmptyResultSet = 'EmptyResultSet',
  NotSupported = 'NotSupported',
  Rejected = 'Rejected',
}

export enum GetCertificateIdUseEnumType {
  CSMSRootCertificate = 'CSMSRootCertificate',
  ManufacturerRootCertificate = 'ManufacturerRootCertificate',
  MORootCertificate = 'MORootCertificate',
  V2GCertificateChain = 'V2GCertificateChain',
  V2GRootCertificate = 'V2GRootCertificate',
}

export enum GetCertificateStatusEnumType {
  Accepted = 'Accepted',
  Failed = 'Failed',
}

export enum GetInstalledCertificateStatusEnumType {
  Accepted = 'Accepted',
  NotFound = 'NotFound',
}

export enum HashAlgorithmEnumType {
  SHA256 = 'SHA256',
  SHA384 = 'SHA384',
  SHA512 = 'SHA512',
}

export enum IdTokenEnumType {
  Central = 'Central',
  eMAID = 'eMAID',
  ISO14443 = 'ISO14443',
  ISO15693 = 'ISO15693',
  KeyCode = 'KeyCode',
  Local = 'Local',
  MacAddress = 'MacAddress',
  NoAuthorization = 'NoAuthorization',
}

export enum InstallCertificateStatusEnumType {
  Accepted = 'Accepted',
  Failed = 'Failed',
  Rejected = 'Rejected',
}

export enum InstallCertificateUseEnumType {
  CSMSRootCertificate = 'CSMSRootCertificate',
  ManufacturerRootCertificate = 'ManufacturerRootCertificate',
  MORootCertificate = 'MORootCertificate',
  V2GRootCertificate = 'V2GRootCertificate',
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

export enum OCPP20ComponentName {
  // Physical and Logical Components
  AccessBarrier = 'AccessBarrier',
  AcDcConverter = 'AcDcConverter',
  AcPhaseSelector = 'AcPhaseSelector',
  Actuator = 'Actuator',
  AirCoolingSystem = 'AirCoolingSystem',
  AlignedDataCtrlr = 'AlignedDataCtrlr',
  AreaVentilation = 'AreaVentilation',
  AuthCacheCtrlr = 'AuthCacheCtrlr',
  AuthCtrlr = 'AuthCtrlr',
  BayOccupancySensor = 'BayOccupancySensor',
  BeaconLighting = 'BeaconLighting',
  CableBreakawaySensor = 'CableBreakawaySensor',
  CaseAccessSensor = 'CaseAccessSensor',
  CHAdeMOCtrlr = 'CHAdeMOCtrlr',
  ChargingStation = 'ChargingStation',
  ChargingStatusIndicator = 'ChargingStatusIndicator',
  ClockCtrlr = 'ClockCtrlr',
  ConnectedEV = 'ConnectedEV',
  Connector = 'Connector',
  ConnectorHolsterRelease = 'ConnectorHolsterRelease',
  ConnectorHolsterSensor = 'ConnectorHolsterSensor',
  ConnectorPlugRetentionLock = 'ConnectorPlugRetentionLock',
  ConnectorProtectionRelease = 'ConnectorProtectionRelease',
  Controller = 'Controller',
  ControlMetering = 'ControlMetering',
  CPPWMController = 'CPPWMController',
  CustomizationCtrlr = 'CustomizationCtrlr',
  DataLink = 'DataLink',
  DeviceDataCtrlr = 'DeviceDataCtrlr',
  Display = 'Display',
  DisplayMessageCtrlr = 'DisplayMessageCtrlr',
  DistributionPanel = 'DistributionPanel',
  ElectricalFeed = 'ElectricalFeed',
  ELVSupply = 'ELVSupply',
  EmergencyStopSensor = 'EmergencyStopSensor',
  EnvironmentalLighting = 'EnvironmentalLighting',
  EVRetentionLock = 'EVRetentionLock',
  EVSE = 'EVSE',
  ExternalTemperatureSensor = 'ExternalTemperatureSensor',
  FiscalMetering = 'FiscalMetering',
  FloodSensor = 'FloodSensor',
  GroundIsolationProtection = 'GroundIsolationProtection',
  Heater = 'Heater',
  HumiditySensor = 'HumiditySensor',
  ISO15118Ctrlr = 'ISO15118Ctrlr',
  LightSensor = 'LightSensor',
  LiquidCoolingSystem = 'LiquidCoolingSystem',
  LocalAuthListCtrlr = 'LocalAuthListCtrlr',
  LocalAvailabilitySensor = 'LocalAvailabilitySensor',
  LocalController = 'LocalController',
  LocalEnergyStorage = 'LocalEnergyStorage',
  MonitoringCtrlr = 'MonitoringCtrlr',
  OCPPCommCtrlr = 'OCPPCommCtrlr',
  OverCurrentProtection = 'OverCurrentProtection',
  OverCurrentProtectionRecloser = 'OverCurrentProtectionRecloser',
  PowerContactor = 'PowerContactor',
  RCD = 'RCD',
  RCDRecloser = 'RCDRecloser',
  RealTimeClock = 'RealTimeClock',
  ReservationCtrlr = 'ReservationCtrlr',
  SampledDataCtrlr = 'SampledDataCtrlr',
  SecurityCtrlr = 'SecurityCtrlr',
  ShockSensor = 'ShockSensor',
  SmartChargingCtrlr = 'SmartChargingCtrlr',
  SpacesCountSignage = 'SpacesCountSignage',
  Switch = 'Switch',
  TariffCostCtrlr = 'TariffCostCtrlr',
  TemperatureSensor = 'TemperatureSensor',
  TiltSensor = 'TiltSensor',
  TokenReader = 'TokenReader',
  TxCtrlr = 'TxCtrlr',
  UIInput = 'UIInput',
  UpstreamProtectionTrigger = 'UpstreamProtectionTrigger',
  VehicleIdSensor = 'VehicleIdSensor',
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

export enum OCPP20MeasurandEnumType {
  CURRENT_EXPORT = 'Current.Export',
  CURRENT_IMPORT = 'Current.Import',
  CURRENT_OFFERED = 'Current.Offered',
  ENERGY_ACTIVE_EXPORT_INTERVAL = 'Energy.Active.Export.Interval',
  ENERGY_ACTIVE_EXPORT_REGISTER = 'Energy.Active.Export.Register',
  ENERGY_ACTIVE_IMPORT_INTERVAL = 'Energy.Active.Import.Interval',
  ENERGY_ACTIVE_IMPORT_REGISTER = 'Energy.Active.Import.Register',
  ENERGY_ACTIVE_NET = 'Energy.Active.Net',
  ENERGY_APPARENT_EXPORT = 'Energy.Apparent.Export',
  ENERGY_APPARENT_IMPORT = 'Energy.Apparent.Import',
  ENERGY_APPARENT_NET = 'Energy.Apparent.Net',
  ENERGY_REACTIVE_EXPORT_INTERVAL = 'Energy.Reactive.Export.Interval',
  ENERGY_REACTIVE_EXPORT_REGISTER = 'Energy.Reactive.Export.Register',
  ENERGY_REACTIVE_IMPORT_INTERVAL = 'Energy.Reactive.Import.Interval',
  ENERGY_REACTIVE_IMPORT_REGISTER = 'Energy.Reactive.Import.Register',
  ENERGY_REACTIVE_NET = 'Energy.Reactive.Net',
  FREQUENCY = 'Frequency',
  POWER_ACTIVE_EXPORT = 'Power.Active.Export',
  POWER_ACTIVE_IMPORT = 'Power.Active.Import',
  POWER_FACTOR = 'Power.Factor',
  POWER_OFFERED = 'Power.Offered',
  POWER_REACTIVE_EXPORT = 'Power.Reactive.Export',
  POWER_REACTIVE_IMPORT = 'Power.Reactive.Import',
  STATE_OF_CHARGE = 'SoC',
  VOLTAGE = 'Voltage',
}

export enum OCPP20RecurrencyKindEnumType {
  Daily = 'Daily',
  Weekly = 'Weekly',
}

export enum OperationalStatusEnumType {
  Inoperative = 'Inoperative',
  Operative = 'Operative',
}

export enum ReasonCodeEnumType {
  CSNotAccepted = 'CSNotAccepted',
  DuplicateProfile = 'DuplicateProfile',
  DuplicateRequestId = 'DuplicateRequestId',
  FixedCable = 'FixedCable',
  FwUpdateInProgress = 'FwUpdateInProgress',
  InternalError = 'InternalError',
  InvalidCertificate = 'InvalidCertificate',
  InvalidCSR = 'InvalidCSR',
  InvalidIdToken = 'InvalidIdToken',
  InvalidMessageSeq = 'InvalidMessageSeq',
  InvalidProfile = 'InvalidProfile',
  InvalidSchedule = 'InvalidSchedule',
  InvalidStackLevel = 'InvalidStackLevel',
  InvalidURL = 'InvalidURL',
  InvalidValue = 'InvalidValue',
  MissingDevModelInfo = 'MissingDevModelInfo',
  MissingParam = 'MissingParam',
  NoCable = 'NoCable',
  NoError = 'NoError',
  NotEnabled = 'NotEnabled',
  NotFound = 'NotFound',
  OutOfMemory = 'OutOfMemory',
  OutOfStorage = 'OutOfStorage',
  ReadOnly = 'ReadOnly',
  TooLargeElement = 'TooLargeElement',
  TooManyElements = 'TooManyElements',
  TxInProgress = 'TxInProgress',
  TxNotFound = 'TxNotFound',
  TxStarted = 'TxStarted',
  UnknownConnectorId = 'UnknownConnectorId',
  UnknownConnectorType = 'UnknownConnectorType',
  UnknownEvse = 'UnknownEvse',
  UnknownTxId = 'UnknownTxId',
  Unspecified = 'Unspecified',
  UnsupportedParam = 'UnsupportedParam',
  UnsupportedRateUnit = 'UnsupportedRateUnit',
  UnsupportedRequest = 'UnsupportedRequest',
  ValueOutOfRange = 'ValueOutOfRange',
  ValuePositiveOnly = 'ValuePositiveOnly',
  ValueTooHigh = 'ValueTooHigh',
  ValueTooLow = 'ValueTooLow',
  ValueZeroNotAllowed = 'ValueZeroNotAllowed',
  WriteOnly = 'WriteOnly',
}

export enum ReportBaseEnumType {
  ConfigurationInventory = 'ConfigurationInventory',
  FullInventory = 'FullInventory',
  SummaryInventory = 'SummaryInventory',
}

export enum RequestStartStopStatusEnumType {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
}

export enum ResetEnumType {
  Immediate = 'Immediate',
  OnIdle = 'OnIdle',
}

export enum ResetStatusEnumType {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  Scheduled = 'Scheduled',
}

export interface AdditionalInfoType extends JsonObject {
  additionalIdToken: string
  customData?: CustomDataType
  type: string
}

export interface CertificateHashDataChainType extends JsonObject {
  certificateHashData: CertificateHashDataType
  certificateType: GetCertificateIdUseEnumType
  childCertificateHashData?: CertificateHashDataType
}

export interface CertificateHashDataType extends JsonObject {
  hashAlgorithm: HashAlgorithmEnumType
  issuerKeyHash: string
  issuerNameHash: string
  serialNumber: string
}

export type CertificateSignedStatusEnumType = GenericStatusEnumType

export interface ChargingStationType extends JsonObject {
  customData?: CustomDataType
  firmwareVersion?: string
  model: string
  modem?: ModemType
  serialNumber?: string
  vendorName: string
}

export interface ComponentType extends JsonObject {
  evse?: EVSEType
  instance?: string
  name: OCPP20ComponentName | string
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

export interface CustomDataType extends JsonObject {
  vendorId: string
}

export type GenericStatusEnumType = GenericStatus

export interface IdTokenType extends JsonObject {
  additionalInfo?: AdditionalInfoType[]
  customData?: CustomDataType
  idToken: string
  type: IdTokenEnumType
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
  salesTariff?: SalesTariffType
  startSchedule?: Date
}

export interface OCSPRequestDataType extends JsonObject {
  hashAlgorithm: HashAlgorithmEnumType
  issuerKeyHash: string
  issuerNameHash: string
  responderURL: string
  serialNumber: string
}

export interface RelativeTimeIntervalType extends JsonObject {
  customData?: CustomDataType
  duration?: number
  start: number
}

export interface ReportDataType extends JsonObject {
  component: ComponentType
  variable: VariableType
  variableAttribute?: VariableAttributeType[]
  variableCharacteristics?: VariableCharacteristicsType
}

export interface SalesTariffEntryType extends JsonObject {
  consumptionCost?: ConsumptionCostType[]
  customData?: CustomDataType
  ePriceLevel?: number
  relativeTimeInterval: RelativeTimeIntervalType
}

export interface SalesTariffType extends JsonObject {
  customData?: CustomDataType
  id: number
  numEPriceLevels?: number
  salesTariffDescription?: string
  salesTariffEntry: SalesTariffEntryType[]
}

export interface StatusInfoType extends JsonObject {
  additionalInfo?: string
  customData?: CustomDataType
  reasonCode: ReasonCodeEnumType
}

interface EVSEType extends JsonObject {
  connectorId?: number
  id: number
}

interface ModemType extends JsonObject {
  customData?: CustomDataType
  iccid?: string
  imsi?: string
}

interface VariableAttributeType extends JsonObject {
  type?: string
  value?: string
}

interface VariableCharacteristicsType extends JsonObject {
  dataType: DataEnumType
  supportsMonitoring: boolean
}
