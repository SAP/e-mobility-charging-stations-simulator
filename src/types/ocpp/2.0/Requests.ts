import type { EmptyObject } from '../../EmptyObject';
import type { JsonObject } from '../../JsonType';

export enum OCPP20RequestCommand {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
}

export enum OCPP20IncomingRequestCommand {
  CLEAR_CACHE = 'ClearCache',
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

export type ModemType = {
  iccid?: string;
  imsi?: string;
} & JsonObject;

export type ChargingStationType = {
  serialNumber?: string;
  model: string;
  vendorName: string;
  firmwareVersion?: string;
  modem?: ModemType;
} & JsonObject;

export type OCPP20BootNotificationRequest = {
  reason: BootReasonEnumType;
  chargingStation: ChargingStationType;
} & JsonObject;

export type OCPP20ClearCacheRequest = EmptyObject;
