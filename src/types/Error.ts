import type { JsonType } from './JsonType';

export type HandleErrorParams<T extends JsonType> = {
  throwError?: boolean;
  consoleOut?: boolean;
  errorResponse?: T;
};
