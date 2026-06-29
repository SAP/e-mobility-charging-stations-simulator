/**
 * Testable wrapper for OCPP 2.0 ResponseService
 *
 * This module provides type-safe access to private handler methods of
 * OCPP20ResponseService for testing purposes. It replaces ad hoc
 * `as unknown as` casts at test sites with a properly typed interface,
 * enabling:
 * - Type-safe method invocations in tests
 * - IntelliSense and autocompletion for handler parameters and returns
 * - Compile-time checking for test code
 * @example
 * ```typescript
 * import { createTestableResponseService } from './__testable__/index.js'
 *
 * const testable = createTestableResponseService(new OCPP20ResponseService())
 * await testable.handleResponseTransactionEvent(station, payload, requestPayload)
 * ```
 */

import type {
  OCPP20TransactionEventRequest,
  OCPP20TransactionEventResponse,
} from '../../../../types/index.js'
import type { ChargingStation } from '../../../index.js'
import type { OCPP20ResponseService } from '../OCPP20ResponseService.js'

/**
 * Interface exposing private handler methods of OCPP20ResponseService for testing.
 * Each method signature matches the corresponding private method in the service class.
 */
export interface TestableOCPP20ResponseService {
  handleResponseTransactionEvent: (
    chargingStation: ChargingStation,
    payload: OCPP20TransactionEventResponse,
    requestPayload: OCPP20TransactionEventRequest
  ) => Promise<void>
}

/**
 * Creates a testable wrapper around OCPP20ResponseService.
 * Provides type-safe access to private handler methods without `as any` casts.
 * @param service - The OCPP20ResponseService instance to wrap
 * @returns A typed interface exposing private handler methods
 * @example
 * ```typescript
 * // Before (with as any cast):
 * await (service as any).handleResponseTransactionEvent(station, payload, requestPayload)
 *
 * // After (with testable interface):
 * const testable = createTestableResponseService(service)
 * await testable.handleResponseTransactionEvent(station, payload, requestPayload)
 * ```
 */
export function createTestableResponseService (
  service: OCPP20ResponseService
): TestableOCPP20ResponseService {
  // Cast to unknown first to satisfy TypeScript while preserving runtime behavior
  const serviceImpl = service as unknown as TestableOCPP20ResponseService

  return {
    handleResponseTransactionEvent: serviceImpl.handleResponseTransactionEvent.bind(service),
  }
}
