import { IncomingRequestCommand } from './1.6/Requests';
import { MessageType } from './MessageType';
import OCPPError from '../../charging-station/OcppError';

export default interface Requests {
  [id: string]: Request;
}

export type Request = [(payload?: Record<string, unknown>, requestPayload?: Record<string, unknown>) => void, (error?: OCPPError) => void, Record<string, unknown>];

export type IncomingRequest = [MessageType, string, IncomingRequestCommand, Record<string, unknown> | string, Record<string, unknown>];
