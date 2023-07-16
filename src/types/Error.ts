import type { JsonType } from './JsonType';

export interface HandleErrorParams<T extends JsonType> {
  throwError?: boolean;
  consoleOut?: boolean;
  errorResponse?: T;
}
