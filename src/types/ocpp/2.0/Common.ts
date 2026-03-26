import type { JsonObject } from '../../JsonType.js'
import type { GenericStatus } from '../Common.js'

export enum APNAuthenticationEnumType {
  AUTO = 'AUTO',
  CHAP = 'CHAP',
  NONE = 'NONE',
  PAP = 'PAP',
}

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

export enum ChangeAvailabilityStatusEnumType {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  Scheduled = 'Scheduled',
}

export enum CustomerInformationStatusEnumType {
  Accepted = 'Accepted',
  Invalid = 'Invalid',
  Rejected = 'Rejected',
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

export enum DataTransferStatusEnumType {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  UnknownMessageId = 'UnknownMessageId',
  UnknownVendorId = 'UnknownVendorId',
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

export enum Iso15118EVCertificateStatusEnumType {
  Accepted = 'Accepted',
  Failed = 'Failed',
}

export enum LogEnumType {
  DiagnosticsLog = 'DiagnosticsLog',
  SecurityLog = 'SecurityLog',
}

export enum LogStatusEnumType {
  Accepted = 'Accepted',
  AcceptedCanceled = 'AcceptedCanceled',
  Rejected = 'Rejected',
}

export enum MessageTriggerEnumType {
  BootNotification = 'BootNotification',
  FirmwareStatusNotification = 'FirmwareStatusNotification',
  Heartbeat = 'Heartbeat',
  LogStatusNotification = 'LogStatusNotification',
  MeterValues = 'MeterValues',
  PublishFirmwareStatusNotification = 'PublishFirmwareStatusNotification',
  SignChargingStationCertificate = 'SignChargingStationCertificate',
  SignCombinedCertificate = 'SignCombinedCertificate',
  SignV2GCertificate = 'SignV2GCertificate',
  StatusNotification = 'StatusNotification',
  TransactionEvent = 'TransactionEvent',
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
  FirmwareCtrlr = 'FirmwareCtrlr',
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

export enum OCPP20FirmwareStatusEnumType {
  Downloaded = 'Downloaded',
  DownloadFailed = 'DownloadFailed',
  Downloading = 'Downloading',
  DownloadPaused = 'DownloadPaused',
  DownloadScheduled = 'DownloadScheduled',
  Idle = 'Idle',
  InstallationFailed = 'InstallationFailed',
  Installed = 'Installed',
  Installing = 'Installing',
  InstallRebooting = 'InstallRebooting',
  InstallScheduled = 'InstallScheduled',
  InstallVerificationFailed = 'InstallVerificationFailed',
  InvalidSignature = 'InvalidSignature',
  SignatureVerified = 'SignatureVerified',
}

export enum OCPP20OperationalStatusEnumType {
  Inoperative = 'Inoperative',
  Operative = 'Operative',
}

export enum OCPP20UnitEnumType {
  AMP = 'A',
  ARBITRARY_STRENGTH_UNIT = 'ASU',
  BYTES = 'B',
  CELSIUS = 'Celsius',
  CHARS = 'chars', // Custom extension for character count measurements
  DECIBEL = 'dB',
  DECIBEL_MILLIWATT = 'dBm',
  DEGREES = 'Deg',
  FAHRENHEIT = 'Fahrenheit',
  HERTZ = 'Hz',
  KELVIN = 'K',
  KILO_PASCAL = 'kPa',
  KILO_VAR = 'kvar',
  KILO_VAR_HOUR = 'kvarh',
  KILO_VOLT_AMP = 'kVA',
  KILO_VOLT_AMP_HOUR = 'kVAh',
  KILO_WATT = 'kW',
  KILO_WATT_HOUR = 'kWh',
  LUX = 'lx',
  METER = 'm',
  METER_PER_SECOND_SQUARED = 'ms2',
  NEWTON = 'N',
  OHM = 'Ohm',
  PERCENT = 'Percent',
  RELATIVE_HUMIDITY = 'RH',
  REVOLUTIONS_PER_MINUTE = 'RPM',
  SECONDS = 's',
  VAR = 'var',
  VAR_HOUR = 'varh',
  VOLT = 'V',
  VOLT_AMP = 'VA',
  VOLT_AMP_HOUR = 'VAh',
  WATT = 'W',
  WATT_HOUR = 'Wh',
}

export enum OCPPInterfaceEnumType {
  Wired0 = 'Wired0',
  Wired1 = 'Wired1',
  Wired2 = 'Wired2',
  Wired3 = 'Wired3',
  Wireless0 = 'Wireless0',
  Wireless1 = 'Wireless1',
  Wireless2 = 'Wireless2',
  Wireless3 = 'Wireless3',
}

export enum OCPPTransportEnumType {
  JSON = 'JSON',
  SOAP = 'SOAP',
}

export enum OCPPVersionEnumType {
  OCPP12 = 'OCPP12',
  OCPP15 = 'OCPP15',
  OCPP16 = 'OCPP16',
  OCPP20 = 'OCPP20',
}

export enum ReasonCodeEnumType {
  CSNotAccepted = 'CSNotAccepted',
  DuplicateProfile = 'DuplicateProfile',
  DuplicateRequestId = 'DuplicateRequestId',
  FixedCable = 'FixedCable',
  FwUpdateInProgress = 'FwUpdateInProgress',
  InternalError = 'InternalError',
  InvalidCertificate = 'InvalidCertificate',
  InvalidConfSlot = 'InvalidConfSlot',
  InvalidCSR = 'InvalidCSR',
  InvalidIdToken = 'InvalidIdToken',
  InvalidMessageSeq = 'InvalidMessageSeq',
  InvalidNetworkConf = 'InvalidNetworkConf',
  InvalidProfile = 'InvalidProfile',
  InvalidSchedule = 'InvalidSchedule',
  InvalidStackLevel = 'InvalidStackLevel',
  InvalidURL = 'InvalidURL',
  InvalidValue = 'InvalidValue',
  MissingDevModelInfo = 'MissingDevModelInfo',
  MissingParam = 'MissingParam',
  NoCable = 'NoCable',
  NoError = 'NoError',
  NoSecurityDowngrade = 'NoSecurityDowngrade',
  NotEnabled = 'NotEnabled',
  NotFound = 'NotFound',
  NotSupported = 'NotSupported',
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

export enum ResetEnumType {
  Immediate = 'Immediate',
  OnIdle = 'OnIdle',
}

export enum ResetStatusEnumType {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  Scheduled = 'Scheduled',
}

export enum SetNetworkProfileStatusEnumType {
  Accepted = 'Accepted',
  Failed = 'Failed',
  Rejected = 'Rejected',
}

export enum TriggerMessageStatusEnumType {
  Accepted = 'Accepted',
  NotImplemented = 'NotImplemented',
  Rejected = 'Rejected',
}

export enum UnlockStatusEnumType {
  OngoingAuthorizedTransaction = 'OngoingAuthorizedTransaction',
  UnknownConnector = 'UnknownConnector',
  Unlocked = 'Unlocked',
  UnlockFailed = 'UnlockFailed',
}

export enum UpdateFirmwareStatusEnumType {
  Accepted = 'Accepted',
  AcceptedCanceled = 'AcceptedCanceled',
  InvalidCertificate = 'InvalidCertificate',
  Rejected = 'Rejected',
  RevokedCertificate = 'RevokedCertificate',
}

export enum UploadLogStatusEnumType {
  AcceptedCanceled = 'AcceptedCanceled',
  BadMessage = 'BadMessage',
  Idle = 'Idle',
  NotSupportedOperation = 'NotSupportedOperation',
  PermissionDenied = 'PermissionDenied',
  Uploaded = 'Uploaded',
  UploadFailure = 'UploadFailure',
  Uploading = 'Uploading',
}

export enum VPNEnumType {
  IKEv2 = 'IKEv2',
  IPSec = 'IPSec',
  L2TP = 'L2TP',
  PPTP = 'PPTP',
}

export interface APNType extends JsonObject {
  apn: string
  apnAuthentication: APNAuthenticationEnumType
  apnPassword?: string
  apnUserName?: string
  customData?: CustomDataType
  preferredNetwork?: string
  simPin?: number
  useOnlyPreferredNetwork?: boolean
}

export interface CertificateHashDataChainType extends JsonObject {
  certificateHashData: CertificateHashDataType
  certificateType: GetCertificateIdUseEnumType
  childCertificateHashData?: CertificateHashDataType[]
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

export interface CustomDataType extends JsonObject {
  vendorId: string
}

export interface FirmwareType extends JsonObject {
  customData?: CustomDataType
  installDateTime?: Date
  location: string
  retrieveDateTime: Date
  signature?: string
  signingCertificate?: string
}

export type GenericStatusEnumType = GenericStatus

export interface LogParametersType extends JsonObject {
  customData?: CustomDataType
  latestTimestamp?: Date
  oldestTimestamp?: Date
  remoteLocation: string
}

export interface ModemType extends JsonObject {
  customData?: CustomDataType
  iccid?: string
  imsi?: string
}

export interface NetworkConnectionProfileType extends JsonObject {
  apn?: APNType
  customData?: CustomDataType
  messageTimeout: number
  ocppCsmsUrl: string
  ocppInterface: OCPPInterfaceEnumType
  ocppTransport: OCPPTransportEnumType
  ocppVersion: OCPPVersionEnumType
  securityProfile: number
  vpn?: VPNType
}

export interface OCSPRequestDataType extends JsonObject {
  hashAlgorithm: HashAlgorithmEnumType
  issuerKeyHash: string
  issuerNameHash: string
  responderURL: string
  serialNumber: string
}

export interface StatusInfoType extends JsonObject {
  additionalInfo?: string
  customData?: CustomDataType
  reasonCode: ReasonCodeEnumType
}

export interface VPNType extends JsonObject {
  customData?: CustomDataType
  group?: string
  key: string
  password: string
  server: string
  type: VPNEnumType
  user: string
}
