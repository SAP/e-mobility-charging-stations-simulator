// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { IncomingRequestCommand, RequestCommand } from '../types/ocpp/Requests';

import BaseError from './BaseError';
import { ErrorType } from '../types/ocpp/ErrorType';
import { JsonObject } from '../types/JsonType';

export default class OCPPError extends BaseError {
  code: ErrorType;
  command?: RequestCommand | IncomingRequestCommand;
  details?: JsonObject;

  constructor(
    code: ErrorType,
    message: string,
    command?: RequestCommand | IncomingRequestCommand,
    details?: JsonObject
  ) {
    super(message);

    this.code = code ?? ErrorType.GENERIC_ERROR;
    this.command = command;
    this.details = details ?? {};
  }
}
