import { ChargePointErrorCode } from './ChargePointErrorCode';
import { ChargePointStatus } from './ChargePointStatus';
import { ChargingProfile } from './ChargingProfile';
import OCPPError from '../../../charging-station/OcppError';

export default interface Requests {
  [id: string]: [(payload?, requestPayload?) => void, (error?: OCPPError) => void, Record<string, unknown>];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface HeartbeatRequest {}

export interface BootNotificationRequest {
  chargeBoxSerialNumber?: string;
  chargePointModel: string;
  chargePointSerialNumber?: string;
  chargePointVendor: string;
  firmwareVersion?: string;
  iccid?: string;
  imsi?: string;
  meterSerialNumber?: string;
  meterType?: string;
}

export interface StatusNotificationRequest {
  connectorId: number;
  errorCode: ChargePointErrorCode;
  info?: string;
  status: ChargePointStatus;
  timestamp?: string;
  vendorId?: string;
  vendorErrorCode?: string;
}

export interface ChangeConfigurationRequest {
  key: string;
  value: string;
}

export interface RemoteStartTransactionRequest {
  connectorId: number;
  idTag: string;
  chargingProfile?: ChargingProfile;
}

export interface RemoteStopTransactionRequest {
  transactionId: number;
}

export interface UnlockConnectorRequest {
  connectorId: number;
}

export interface GetConfigurationRequest {
  key?: string[];
}

export enum ResetType {
  HARD = 'Hard',
  SOFT = 'Soft'
}

export interface ResetRequest {
  type: ResetType;
}
