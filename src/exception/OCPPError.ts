// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { BaseError } from './internal';
import {
  ErrorType,
  type IncomingRequestCommand,
  type JsonType,
  type RequestCommand,
} from '../types';
import { Constants } from '../utils';

export class OCPPError extends BaseError {
  code: ErrorType;
  command?: RequestCommand | IncomingRequestCommand;
  details?: JsonType;

  constructor(
    code: ErrorType,
    message: string,
    command?: RequestCommand | IncomingRequestCommand,
    details?: JsonType
  ) {
    super(message);

    this.code = code ?? ErrorType.GENERIC_ERROR;
    this.command = command;
    this.details = details ?? Constants.EMPTY_FREEZED_OBJECT;
  }
}
