import type { JsonObject } from '../../JsonType.js'
import type { GenericStatus } from '../Common.js'

export enum DataEnumType {
  string = 'string',
  decimal = 'decimal',
  integer = 'integer',
  dateTime = 'dateTime',
  boolean = 'boolean',
  OptionList = 'OptionList',
  SequenceList = 'SequenceList',
  MemberList = 'MemberList'
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
  Watchdog = 'Watchdog'
}

export enum OperationalStatusEnumType {
  Operative = 'Operative',
  Inoperative = 'Inoperative'
}

export enum OCPP20ConnectorStatusEnumType {
  Available = 'Available',
  Occupied = 'Occupied',
  Reserved = 'Reserved',
  Unavailable = 'Unavailable',
  Faulted = 'Faulted'
}

export type GenericStatusEnumType = GenericStatus

export enum HashAlgorithmEnumType {
  SHA256 = 'SHA256',
  SHA384 = 'SHA384',
  SHA512 = 'SHA512'
}

export enum GetCertificateIdUseEnumType {
  V2GRootCertificate = 'V2GRootCertificate',
  MORootCertificate = 'MORootCertificate',
  CSMSRootCertificate = 'CSMSRootCertificate',
  V2GCertificateChain = 'V2GCertificateChain',
  ManufacturerRootCertificate = 'ManufacturerRootCertificate'
}

export enum GetCertificateStatusEnumType {
  Accepted = 'Accepted',
  Failed = 'Failed'
}

export enum GetInstalledCertificateStatusEnumType {
  Accepted = 'Accepted',
  NotFound = 'NotFound'
}

export enum InstallCertificateStatusEnumType {
  Accepted = 'Accepted',
  Rejected = 'Rejected',
  Failed = 'Failed'
}

export enum InstallCertificateUseEnumType {
  V2GRootCertificate = 'V2GRootCertificate',
  MORootCertificate = 'MORootCertificate',
  CSMSRootCertificate = 'CSMSRootCertificate',
  ManufacturerRootCertificate = 'ManufacturerRootCertificate'
}

export enum DeleteCertificateStatusEnumType {
  Accepted = 'Accepted',
  Failed = 'Failed',
  NotFound = 'NotFound'
}

export enum CertificateActionEnumType {
  Install = 'Install',
  Update = 'Update'
}

export enum CertificateSigningUseEnumType {
  ChargingStationCertificate = 'ChargingStationCertificate',
  V2GCertificate = 'V2GCertificate'
}

export type CertificateSignedStatusEnumType = GenericStatusEnumType

export interface CertificateHashDataType extends JsonObject {
  hashAlgorithm: HashAlgorithmEnumType
  issuerNameHash: string
  issuerKeyHash: string
  serialNumber: string
}

export interface CertificateHashDataChainType extends JsonObject {
  certificateType: GetCertificateIdUseEnumType
  certificateHashData: CertificateHashDataType
  childCertificateHashData?: CertificateHashDataType
}

export interface OCSPRequestDataType extends JsonObject {
  hashAlgorithm: HashAlgorithmEnumType
  issuerNameHash: string
  issuerKeyHash: string
  serialNumber: string
  responderURL: string
}

export interface StatusInfoType extends JsonObject {
  reasonCode: string
  additionalInfo?: string
}

export interface EVSEType extends JsonObject {
  id: number
  connectorId?: string
}
