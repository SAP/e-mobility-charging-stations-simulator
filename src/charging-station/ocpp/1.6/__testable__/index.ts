/**
 * Testable interface for OCPP 1.6 IncomingRequestService and RequestService
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
  ChangeConfigurationRequest,
  ChangeConfigurationResponse,
  ClearCacheResponse,
  GenericResponse,
  GetConfigurationRequest,
  GetConfigurationResponse,
  GetDiagnosticsRequest,
  GetDiagnosticsResponse,
  JsonType,
  OCPP16CancelReservationRequest,
  OCPP16ChangeAvailabilityRequest,
  OCPP16ChangeAvailabilityResponse,
  OCPP16ClearChargingProfileRequest,
  OCPP16ClearChargingProfileResponse,
  OCPP16DataTransferRequest,
  OCPP16DataTransferResponse,
  OCPP16GetCompositeScheduleRequest,
  OCPP16GetCompositeScheduleResponse,
  OCPP16RequestCommand,
  OCPP16ReserveNowRequest,
  OCPP16ReserveNowResponse,
  OCPP16TriggerMessageRequest,
  OCPP16TriggerMessageResponse,
  OCPP16UpdateFirmwareRequest,
  OCPP16UpdateFirmwareResponse,
  RemoteStartTransactionRequest,
  RemoteStopTransactionRequest,
  ResetRequest,
  SetChargingProfileRequest,
  SetChargingProfileResponse,
  UnlockConnectorRequest,
  UnlockConnectorResponse,
} from '../../../../types/index.js'
import type { ChargingStation } from '../../../index.js'
import type { OCPP16IncomingRequestService } from '../OCPP16IncomingRequestService.js'
import type { OCPP16RequestService } from '../OCPP16RequestService.js'

/**
 * Interface exposing private handler methods of OCPP16IncomingRequestService for testing.
 * Each method signature matches the corresponding private method in the service class.
 */
export interface TestableOCPP16IncomingRequestService {
  /**
   * Handles OCPP 1.6 CancelReservation request from central system.
   * Cancels an existing reservation on the charging station.
   */
  handleRequestCancelReservation: (
    chargingStation: ChargingStation,
    commandPayload: OCPP16CancelReservationRequest
  ) => Promise<GenericResponse>

  /**
   * Handles OCPP 1.6 ChangeAvailability request from central system.
   * Changes availability status of a connector or the entire station.
   */
  handleRequestChangeAvailability: (
    chargingStation: ChargingStation,
    commandPayload: OCPP16ChangeAvailabilityRequest
  ) => Promise<OCPP16ChangeAvailabilityResponse>

  /**
   * Handles OCPP 1.6 ChangeConfiguration request from central system.
   * Changes the value of a configuration key.
   */
  handleRequestChangeConfiguration: (
    chargingStation: ChargingStation,
    commandPayload: ChangeConfigurationRequest
  ) => ChangeConfigurationResponse

  /**
   * Handles OCPP 1.6 ClearCache request by clearing the authorization cache.
   */
  handleRequestClearCache: (chargingStation: ChargingStation) => ClearCacheResponse

  /**
   * Handles OCPP 1.6 ClearChargingProfile request from central system.
   * Clears charging profiles matching the specified criteria.
   */
  handleRequestClearChargingProfile: (
    chargingStation: ChargingStation,
    commandPayload: OCPP16ClearChargingProfileRequest
  ) => OCPP16ClearChargingProfileResponse

  /**
   * Handles OCPP 1.6 DataTransfer request from central system.
   * Processes vendor-specific data transfer messages.
   */
  handleRequestDataTransfer: (
    chargingStation: ChargingStation,
    commandPayload: OCPP16DataTransferRequest
  ) => OCPP16DataTransferResponse

  /**
   * Handles OCPP 1.6 GetCompositeSchedule request from central system.
   * Returns the composite charging schedule for a connector.
   */
  handleRequestGetCompositeSchedule: (
    chargingStation: ChargingStation,
    commandPayload: OCPP16GetCompositeScheduleRequest
  ) => OCPP16GetCompositeScheduleResponse

  /**
   * Handles OCPP 1.6 GetConfiguration request from central system.
   * Returns configuration keys and their values.
   */
  handleRequestGetConfiguration: (
    chargingStation: ChargingStation,
    commandPayload: GetConfigurationRequest
  ) => GetConfigurationResponse

  /**
   * Handles OCPP 1.6 GetDiagnostics request from central system.
   * Uploads diagnostics data to the specified location.
   */
  handleRequestGetDiagnostics: (
    chargingStation: ChargingStation,
    commandPayload: GetDiagnosticsRequest
  ) => Promise<GetDiagnosticsResponse>

  /**
   * Handles OCPP 1.6 RemoteStartTransaction request from central system.
   * Initiates charging transaction on specified or available connector.
   */
  handleRequestRemoteStartTransaction: (
    chargingStation: ChargingStation,
    commandPayload: RemoteStartTransactionRequest
  ) => Promise<GenericResponse>

  /**
   * Handles OCPP 1.6 RemoteStopTransaction request from central system.
   * Stops an ongoing transaction by transaction ID.
   */
  handleRequestRemoteStopTransaction: (
    chargingStation: ChargingStation,
    commandPayload: RemoteStopTransactionRequest
  ) => GenericResponse

  /**
   * Handles OCPP 1.6 ReserveNow request from central system.
   * Creates a reservation on a connector for a specific ID tag.
   */
  handleRequestReserveNow: (
    chargingStation: ChargingStation,
    commandPayload: OCPP16ReserveNowRequest
  ) => Promise<OCPP16ReserveNowResponse>

  /**
   * Handles OCPP 1.6 Reset request from central system.
   * Performs immediate or scheduled reset of the charging station.
   */
  handleRequestReset: (
    chargingStation: ChargingStation,
    commandPayload: ResetRequest
  ) => GenericResponse

  /**
   * Handles OCPP 1.6 SetChargingProfile request from central system.
   * Sets or updates a charging profile on a connector.
   */
  handleRequestSetChargingProfile: (
    chargingStation: ChargingStation,
    commandPayload: SetChargingProfileRequest
  ) => SetChargingProfileResponse

  /**
   * Handles OCPP 1.6 TriggerMessage request from central system.
   * Triggers the station to send a specific message type.
   */
  handleRequestTriggerMessage: (
    chargingStation: ChargingStation,
    commandPayload: OCPP16TriggerMessageRequest
  ) => OCPP16TriggerMessageResponse

  /**
   * Handles OCPP 1.6 UnlockConnector request from central system.
   * Unlocks a connector and optionally stops any ongoing transaction.
   */
  handleRequestUnlockConnector: (
    chargingStation: ChargingStation,
    commandPayload: UnlockConnectorRequest
  ) => Promise<UnlockConnectorResponse>

  /**
   * Handles OCPP 1.6 UpdateFirmware request from central system.
   * Initiates firmware download and installation simulation.
   */
  handleRequestUpdateFirmware: (
    chargingStation: ChargingStation,
    commandPayload: OCPP16UpdateFirmwareRequest
  ) => OCPP16UpdateFirmwareResponse
}

/**
 * Interface exposing private methods of OCPP16RequestService for testing.
 * This allows type-safe testing without `as any` casts.
 */
export interface TestableOCPP16RequestService {
  /**
   * Build a request payload for the given OCPP 1.6 command.
   * Exposes the private `buildRequestPayload` method for testing.
   * @param chargingStation - The charging station instance
   * @param commandName - The OCPP 1.6 request command
   * @param commandParams - Optional command parameters
   * @returns The built request payload
   */
  buildRequestPayload: (
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType
  ) => JsonType
}

/**
 * Creates a testable wrapper around OCPP16IncomingRequestService.
 * Provides type-safe access to private handler methods without `as any` casts.
 * @param service - The OCPP16IncomingRequestService instance to wrap
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
export function createTestableIncomingRequestService(
  service: OCPP16IncomingRequestService
): TestableOCPP16IncomingRequestService {
  // Cast to unknown first to satisfy TypeScript while preserving runtime behavior
  const serviceImpl = service as unknown as TestableOCPP16IncomingRequestService

  return {
    handleRequestCancelReservation: serviceImpl.handleRequestCancelReservation.bind(service),
    handleRequestChangeAvailability: serviceImpl.handleRequestChangeAvailability.bind(service),
    handleRequestChangeConfiguration: serviceImpl.handleRequestChangeConfiguration.bind(service),
    handleRequestClearCache: serviceImpl.handleRequestClearCache.bind(service),
    handleRequestClearChargingProfile: serviceImpl.handleRequestClearChargingProfile.bind(service),
    handleRequestDataTransfer: serviceImpl.handleRequestDataTransfer.bind(service),
    handleRequestGetCompositeSchedule: serviceImpl.handleRequestGetCompositeSchedule.bind(service),
    handleRequestGetConfiguration: serviceImpl.handleRequestGetConfiguration.bind(service),
    handleRequestGetDiagnostics: serviceImpl.handleRequestGetDiagnostics.bind(service),
    handleRequestRemoteStartTransaction:
      serviceImpl.handleRequestRemoteStartTransaction.bind(service),
    handleRequestRemoteStopTransaction:
      serviceImpl.handleRequestRemoteStopTransaction.bind(service),
    handleRequestReserveNow: serviceImpl.handleRequestReserveNow.bind(service),
    handleRequestReset: serviceImpl.handleRequestReset.bind(service),
    handleRequestSetChargingProfile: serviceImpl.handleRequestSetChargingProfile.bind(service),
    handleRequestTriggerMessage: serviceImpl.handleRequestTriggerMessage.bind(service),
    handleRequestUnlockConnector: serviceImpl.handleRequestUnlockConnector.bind(service),
    handleRequestUpdateFirmware: serviceImpl.handleRequestUpdateFirmware.bind(service),
  }
}

/**
 * Creates a testable wrapper around OCPP16RequestService.
 * Provides type-safe access to the private `buildRequestPayload` method.
 * @param requestService - The OCPP16RequestService instance to wrap
 * @returns A typed interface exposing private methods
 * @example
 * ```typescript
 * const testable = createTestableOCPP16RequestService(requestService)
 * const payload = testable.buildRequestPayload(station, OCPP16RequestCommand.HEARTBEAT)
 * ```
 */
export function createTestableOCPP16RequestService(
  requestService: OCPP16RequestService
): TestableOCPP16RequestService {
  // Use type assertion at the boundary only, providing type-safe interface to tests
  const service = requestService as unknown as {
    buildRequestPayload: TestableOCPP16RequestService['buildRequestPayload']
  }
  return {
    buildRequestPayload: service.buildRequestPayload.bind(requestService),
  }
}
