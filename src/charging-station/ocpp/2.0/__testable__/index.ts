/**
 * Testable interface for OCPP 2.0 IncomingRequestService
 *
 * This module provides type-safe access to private handler methods for testing purposes.
 * It replaces `as any` casts with a properly typed interface, enabling:
 * - Type-safe method invocations in tests
 * - IntelliSense and autocompletion for handler parameters/returns
 * - Compile-time checking for test code
 * @example
 * ```typescript
 * import { createTestableIncomingRequestService } from './__testable__/index.js'
 *
 * const testable = createTestableIncomingRequestService(incomingRequestService)
 * const response = await testable.handleRequestReset(mockChargingStation, resetRequest)
 * ```
 */

import type {
  OCPP20CertificateSignedRequest,
  OCPP20CertificateSignedResponse,
  OCPP20ClearCacheResponse,
  OCPP20DeleteCertificateRequest,
  OCPP20DeleteCertificateResponse,
  OCPP20GetBaseReportRequest,
  OCPP20GetBaseReportResponse,
  OCPP20GetInstalledCertificateIdsRequest,
  OCPP20GetInstalledCertificateIdsResponse,
  OCPP20GetVariablesRequest,
  OCPP20GetVariablesResponse,
  OCPP20InstallCertificateRequest,
  OCPP20InstallCertificateResponse,
  OCPP20RequestStartTransactionRequest,
  OCPP20RequestStartTransactionResponse,
  OCPP20RequestStopTransactionRequest,
  OCPP20RequestStopTransactionResponse,
  OCPP20ResetRequest,
  OCPP20ResetResponse,
  OCPP20SetVariablesRequest,
  OCPP20SetVariablesResponse,
} from '../../../../types/index.js'
import type { ChargingStation } from '../../../index.js'
import type { OCPP20IncomingRequestService } from '../OCPP20IncomingRequestService.js'

/**
 * Interface exposing private handler methods of OCPP20IncomingRequestService for testing.
 * Each method signature matches the corresponding private method in the service class.
 */
export interface TestableOCPP20IncomingRequestService {
  /**
   * Handles OCPP 2.0 CertificateSigned request from central system.
   * Receives signed certificate chain from CSMS and stores it in the charging station.
   */
  handleRequestCertificateSigned: (
    chargingStation: ChargingStation,
    commandPayload: OCPP20CertificateSignedRequest
  ) => Promise<OCPP20CertificateSignedResponse>

  /**
   * Handles OCPP 2.0.1 ClearCache request by clearing the Authorization Cache.
   * Per C11.FR.04: Returns Rejected if AuthCacheEnabled is false.
   */
  handleRequestClearCache: (chargingStation: ChargingStation) => Promise<OCPP20ClearCacheResponse>

  /**
   * Handles OCPP 2.0 DeleteCertificate request from central system.
   * Deletes a certificate matching the provided hash data from the charging station.
   */
  handleRequestDeleteCertificate: (
    chargingStation: ChargingStation,
    commandPayload: OCPP20DeleteCertificateRequest
  ) => Promise<OCPP20DeleteCertificateResponse>

  /**
   * Handles OCPP 2.0 GetBaseReport request.
   * Returns device model report based on the requested report base type.
   */
  handleRequestGetBaseReport: (
    chargingStation: ChargingStation,
    commandPayload: OCPP20GetBaseReportRequest
  ) => OCPP20GetBaseReportResponse

  /**
   * Handles OCPP 2.0 GetInstalledCertificateIds request from central system.
   * Returns list of installed certificates matching the optional filter types.
   */
  handleRequestGetInstalledCertificateIds: (
    chargingStation: ChargingStation,
    commandPayload: OCPP20GetInstalledCertificateIdsRequest
  ) => Promise<OCPP20GetInstalledCertificateIdsResponse>

  /**
   * Handles OCPP 2.0 GetVariables request.
   * Returns values for requested variables from the device model.
   */
  handleRequestGetVariables: (
    chargingStation: ChargingStation,
    commandPayload: OCPP20GetVariablesRequest
  ) => OCPP20GetVariablesResponse

  /**
   * Handles OCPP 2.0 InstallCertificate request from central system.
   * Installs a certificate of the specified type in the charging station.
   */
  handleRequestInstallCertificate: (
    chargingStation: ChargingStation,
    commandPayload: OCPP20InstallCertificateRequest
  ) => Promise<OCPP20InstallCertificateResponse>

  /**
   * Handles OCPP 2.0 Reset request.
   * Performs immediate or scheduled reset of charging station or specific EVSE.
   */
  handleRequestReset: (
    chargingStation: ChargingStation,
    commandPayload: OCPP20ResetRequest
  ) => Promise<OCPP20ResetResponse>

  /**
   * Handles OCPP 2.0 SetVariables request.
   * Sets values for requested variables in the device model.
   */
  handleRequestSetVariables: (
    chargingStation: ChargingStation,
    commandPayload: OCPP20SetVariablesRequest
  ) => OCPP20SetVariablesResponse

  /**
   * Handles OCPP 2.0 RequestStartTransaction request from central system.
   * Initiates charging transaction on specified EVSE with enhanced authorization.
   */
  handleRequestStartTransaction: (
    chargingStation: ChargingStation,
    commandPayload: OCPP20RequestStartTransactionRequest
  ) => Promise<OCPP20RequestStartTransactionResponse>

  /**
   * Handles OCPP 2.0 RequestStopTransaction request from central system.
   * Stops an ongoing transaction on the charging station.
   */
  handleRequestStopTransaction: (
    chargingStation: ChargingStation,
    commandPayload: OCPP20RequestStopTransactionRequest
  ) => Promise<OCPP20RequestStopTransactionResponse>
}

/**
 * Creates a testable wrapper around OCPP20IncomingRequestService.
 * Provides type-safe access to private handler methods without `as any` casts.
 * @param service - The OCPP20IncomingRequestService instance to wrap
 * @returns A typed interface exposing private handler methods
 * @example
 * ```typescript
 * // Before (with as any cast):
 * const response = await (service as any).handleRequestReset(station, request)
 *
 * // After (with testable interface):
 * const testable = createTestableIncomingRequestService(service)
 * const response = await testable.handleRequestReset(station, request)
 * ```
 */
export function createTestableIncomingRequestService (
  service: OCPP20IncomingRequestService
): TestableOCPP20IncomingRequestService {
  // Cast to unknown first to satisfy TypeScript while preserving runtime behavior
  const serviceImpl = service as unknown as TestableOCPP20IncomingRequestService

  return {
    handleRequestCertificateSigned: serviceImpl.handleRequestCertificateSigned.bind(service),
    handleRequestClearCache: serviceImpl.handleRequestClearCache.bind(service),
    handleRequestDeleteCertificate: serviceImpl.handleRequestDeleteCertificate.bind(service),
    handleRequestGetBaseReport: serviceImpl.handleRequestGetBaseReport.bind(service),
    handleRequestGetInstalledCertificateIds:
      serviceImpl.handleRequestGetInstalledCertificateIds.bind(service),
    handleRequestGetVariables: serviceImpl.handleRequestGetVariables.bind(service),
    handleRequestInstallCertificate: serviceImpl.handleRequestInstallCertificate.bind(service),
    handleRequestReset: serviceImpl.handleRequestReset.bind(service),
    handleRequestSetVariables: serviceImpl.handleRequestSetVariables.bind(service),
    handleRequestStartTransaction: serviceImpl.handleRequestStartTransaction.bind(service),
    handleRequestStopTransaction: serviceImpl.handleRequestStopTransaction.bind(service),
  }
}
