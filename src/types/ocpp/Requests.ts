import { IncomingRequestCommand } from './1.6/Requests';
import { MessageType } from './MessageType';
import OCPPError from '../../charging-station/OcppError';

export default interface Requests {
  [id: string]: Request;
}

export type Request = [(payload?, requestPayload?) => void, (error?: OCPPError) => void, Record<string, unknown>];

export type IncomingRequest = [MessageType, string, IncomingRequestCommand, string, string];
