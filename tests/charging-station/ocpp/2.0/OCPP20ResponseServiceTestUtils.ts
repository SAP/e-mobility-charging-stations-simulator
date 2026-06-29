/**
 * @file OCPP20ResponseServiceTestUtils
 * @description Test-only payload builders for OCPP 2.0 response-service tests
 */
import type {
  OCPP20IdTokenType,
  OCPP20TransactionEventRequest,
  UUIDv4,
} from '../../../../src/types/index.js'

import {
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
} from '../../../../src/types/index.js'

/**
 * Build a minimal TransactionEvent request payload for response-service tests.
 * @param transactionId - Transaction id to embed in the request payload.
 * @param eventType - TransactionEvent type to use; defaults to Updated.
 * @param idToken - Optional idToken used by authorization-cache test cases
 *   (see `OCPP20IdTokenType` for field semantics).
 * @returns Minimal TransactionEvent request payload.
 */
export const buildTransactionEventRequest = (
  transactionId: UUIDv4,
  eventType: OCPP20TransactionEventEnumType = OCPP20TransactionEventEnumType.Updated,
  idToken?: OCPP20IdTokenType
): OCPP20TransactionEventRequest => ({
  eventType,
  ...(idToken != null ? { idToken } : {}),
  meterValue: [],
  seqNo: 0,
  timestamp: new Date(),
  transactionInfo: {
    transactionId,
  },
  triggerReason: OCPP20TriggerReasonEnumType.Authorized,
})
