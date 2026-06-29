import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import type {
  OCPP20IdTokenType,
  OCPP20TransactionEventRequest,
  OCPP20TransactionEventResponse,
  UUIDv4,
} from '../../../../src/types/index.js'

import {
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
} from '../../../../src/types/index.js'

export interface TestableOCPP20ResponseService {
  handleResponseTransactionEvent: (
    chargingStation: ChargingStation,
    payload: OCPP20TransactionEventResponse,
    requestPayload: OCPP20TransactionEventRequest
  ) => Promise<void>
}

/**
 * Build a minimal TransactionEvent request payload for response-service tests.
 * @param transactionId - Transaction id to embed in the request payload.
 * @param eventType - TransactionEvent type to use; defaults to Updated.
 * @param idToken - Optional idToken used by authorization-cache test cases.
 * @returns Minimal TransactionEvent request payload.
 */
export function buildTransactionEventRequest (
  transactionId: UUIDv4,
  eventType: OCPP20TransactionEventEnumType = OCPP20TransactionEventEnumType.Updated,
  idToken?: OCPP20IdTokenType
): OCPP20TransactionEventRequest {
  return {
    eventType,
    ...(idToken != null ? { idToken } : {}),
    meterValue: [],
    seqNo: 0,
    timestamp: new Date(),
    transactionInfo: {
      transactionId,
    },
    triggerReason: OCPP20TriggerReasonEnumType.Authorized,
  }
}

/**
 * Expose OCPP20ResponseService private handlers through a typed test wrapper.
 * @param service - Response service instance to wrap.
 * @returns Test wrapper exposing private handler methods.
 */
export function createTestableOCPP20ResponseService (
  service: OCPP20ResponseService
): TestableOCPP20ResponseService {
  const serviceImpl = service as unknown as TestableOCPP20ResponseService
  return {
    handleResponseTransactionEvent: serviceImpl.handleResponseTransactionEvent.bind(service),
  }
}
