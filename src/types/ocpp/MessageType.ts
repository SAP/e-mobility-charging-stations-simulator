export enum MessageType {
  CALL_MESSAGE = 2, // Caller to Callee
  CALL_RESULT_MESSAGE = 3, // Callee to Caller
  // eslint-disable-next-line perfectionist/sort-enums
  CALL_ERROR_MESSAGE = 4, // Callee to Caller
}
