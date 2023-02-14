import type { JsonObject } from '../../internal';

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

export enum OCPP20ConnectorStatusEnumType {
  AVAILABLE = 'Available',
  OCCUPIED = 'Occupied',
  RESERVED = 'Reserved',
  UNAVAILABLE = 'Unavailable',
  FAULTED = 'Faulted',
}

export type StatusInfoType = {
  reasonCode: string;
  additionalInfo?: string;
} & JsonObject;

export type EVSEType = {
  id: number;
  connectorId?: string;
} & JsonObject;
