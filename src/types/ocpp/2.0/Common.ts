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

export enum OCPP20ComponentName {
  AlignedDataCtrlr = 'AlignedDataCtrlr',
  AuthCacheCtrlr = 'AuthCacheCtrlr',
  AuthCtrlr = 'AuthCtrlr',
  CHAdeMOCtrlr = 'CHAdeMOCtrlr',
  ClockCtrlr = 'ClockCtrlr',
  CustomizationCtrlr = 'CustomizationCtrlr',
  DeviceDataCtrlr = 'DeviceDataCtrlr',
  DisplayMessageCtrlr = 'DisplayMessageCtrlr',
  ISO15118Ctrlr = 'ISO15118Ctrlr',
  LocalAuthListCtrlr = 'LocalAuthListCtrlr',
  MonitoringCtrlr = 'MonitoringCtrlr',
  OCPPCommCtrlr = 'OCPPCommCtrlr',
  ReservationCtrlr = 'ReservationCtrlr',
  SampledDataCtrlr = 'SampledDataCtrlr',
  SecurityCtrlr = 'SecurityCtrlr',
  SmartChargingCtrlr = 'SmartChargingCtrlr',
  TariffCostCtrlr = 'TariffCostCtrlr',
  TxCtrlr = 'TxCtrlr',
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

export enum OperationalStatusEnumType {
  Inoperative = 'Inoperative',
  Operative = 'Operative',
}

export enum ReportBaseEnumType {
  ConfigurationInventory = 'ConfigurationInventory',
  FullInventory = 'FullInventory',
  SummaryInventory = 'SummaryInventory',
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

export interface EVSEType extends JsonObject {
  connectorId?: string
  id: number
}

export type GenericStatusEnumType = GenericStatus

export interface OCSPRequestDataType extends JsonObject {
  hashAlgorithm: HashAlgorithmEnumType
  issuerKeyHash: string
  issuerNameHash: string
  responderURL: string
  serialNumber: string
}

export interface ReportDataType extends JsonObject {
  component: ComponentType
  variable: VariableType
  variableAttribute?: VariableAttributeType[]
  variableCharacteristics?: VariableCharacteristicsType
}

export interface StatusInfoType extends JsonObject {
  additionalInfo?: string
  reasonCode: string
}

interface ModemType extends JsonObject {
  iccid?: string
  imsi?: string
}

interface VariableAttributeType extends JsonObject {
  type?: string
  value?: string
}

interface VariableCharacteristicsType extends JsonObject {
  dataType: string
  supportsMonitoring: boolean
}
