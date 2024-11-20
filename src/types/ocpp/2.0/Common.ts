import type { JsonObject } from '../../JsonType.js'
import type { GenericStatus } from '../Common.js'

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

export interface StatusInfoType extends JsonObject {
  additionalInfo?: string
  reasonCode: string
}
