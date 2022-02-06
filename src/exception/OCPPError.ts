// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { IncomingRequestCommand, RequestCommand } from '../types/ocpp/Requests';

import BaseError from './BaseError';
import { ErrorType } from '../types/ocpp/ErrorType';
import { JsonType } from '../types/JsonType';

export default class OCPPError extends BaseError {
  code: ErrorType | IncomingRequestCommand;
  command?: RequestCommand | IncomingRequestCommand;
  details?: JsonType;

  constructor(code: ErrorType | IncomingRequestCommand, message: string, command?: RequestCommand | IncomingRequestCommand, details?: JsonType) {
    super(message);

    this.code = code ?? ErrorType.GENERIC_ERROR;
    this.command = command;
    this.details = details ?? {};
  }
}
