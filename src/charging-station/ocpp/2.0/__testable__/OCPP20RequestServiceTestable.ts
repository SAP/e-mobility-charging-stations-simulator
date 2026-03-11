/**
 * Testable wrapper for OCPP 2.0 RequestService
 *
 * This module provides type-safe testing utilities for OCPP20RequestService.
 * It enables mocking of the protected sendMessage method and provides access
 * to public request methods for testing ISO 15118 certificate and OCSP flows.
 * @example
 * ```typescript
 * import {
 *   createTestableRequestService,
 *   type SendMessageMock,
 * } from './__testable__/OCPP20RequestServiceTestable.js'
 *
 * const { sendMessageMock, service } = createTestableRequestService({
 *   sendMessageResponse: { status: Iso15118EVCertificateStatusEnumType.Accepted }
 * })
 * const response = await service.requestGet15118EVCertificate(station, schema, action, exi)
 * expect(sendMessageMock.mock.calls.length).toBe(1)
 * ```
 */

import { mock } from 'node:test'

import type {
  CertificateActionEnumType,
  CertificateSigningUseEnumType,
  JsonType,
  OCPP20Get15118EVCertificateResponse,
  OCPP20GetCertificateStatusResponse,
  OCPP20RequestCommand,
  OCPP20SecurityEventNotificationResponse,
  OCPP20SignCertificateResponse,
  OCSPRequestDataType,
  RequestParams,
} from '../../../../types/index.js'
import type { ChargingStation } from '../../../index.js'

import { OCPP20RequestService } from '../OCPP20RequestService.js'
import { OCPP20ResponseService } from '../OCPP20ResponseService.js'

/**
 * Type definition for sendMessage mock function.
 * Matches the protected sendMessage signature in OCPPRequestService.
 */
export type SendMessageFn = (
  chargingStation: ChargingStation,
  messageId: string,
  messagePayload: JsonType,
  commandName: string,
  params?: RequestParams
) => Promise<JsonType>

/**
 * Interface for the mock function with call tracking
 */
export interface SendMessageMock {
  fn: SendMessageFn
  mock: {
    calls: {
      arguments: [ChargingStation, string, JsonType, string, RequestParams?]
    }[]
  }
}

/**
 * Interface exposing OCPP20RequestService methods for testing.
 */
export interface TestableOCPP20RequestService {
  /**
   * Build request payload for OCPP 2.0 commands.
   * Used internally to construct command-specific payloads.
   */
  buildRequestPayload: (
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: JsonType
  ) => JsonType

  /**
   * Request an ISO 15118 EV certificate from the CSMS.
   * Forwards EXI-encoded certificate request from EV to CSMS.
   */
  requestGet15118EVCertificate: (
    chargingStation: ChargingStation,
    iso15118SchemaVersion: string,
    action: CertificateActionEnumType,
    exiRequest: string
  ) => Promise<OCPP20Get15118EVCertificateResponse>

  /**
   * Request OCSP certificate status from the CSMS.
   * Sends OCSP request to check certificate revocation status.
   */
  requestGetCertificateStatus: (
    chargingStation: ChargingStation,
    ocspRequestData: OCSPRequestDataType
  ) => Promise<OCPP20GetCertificateStatusResponse>
  /**
   * Send a SecurityEventNotification to the CSMS.
   * Notifies the CSMS about a security event at the charging station (A04).
   */
  requestSecurityEventNotification: (
    chargingStation: ChargingStation,
    type: string,
    timestamp: Date,
    techInfo?: string
  ) => Promise<OCPP20SecurityEventNotificationResponse>
  /**
   * Request certificate signing from the CSMS.
   * Generates a CSR and sends it to CSMS for signing.
   */
  requestSignCertificate: (
    chargingStation: ChargingStation,
    certificateType?: CertificateSigningUseEnumType
  ) => Promise<OCPP20SignCertificateResponse>
}

/**
 * Configuration options for creating a testable request service
 */
export interface TestableRequestServiceOptions<T extends JsonType = JsonType> {
  /**
   * Response to return from mocked sendMessage.
   * Can be a partial response that will be spread into the result.
   */
  sendMessageResponse?: Partial<T>
}

/**
 * Result of creating a testable request service
 */
export interface TestableRequestServiceResult {
  /**
   * The mock function for sendMessage with call tracking
   */
  sendMessageMock: SendMessageMock
  /**
   * The testable service with mocked sendMessage
   */
  service: TestableOCPP20RequestService
}

/**
 * Creates a testable OCPP20RequestService with mocked sendMessage.
 *
 * This factory function creates an OCPP20RequestService instance with its
 * protected sendMessage method replaced by a mock that returns configured
 * responses. This allows testing the public request methods without making
 * actual network calls.
 * @template T - The expected response type
 * @param options - Configuration for the testable service
 * @returns Object containing the testable service and sendMessage mock
 * @example
 * ```typescript
 * // Create service with mocked response
 * const { sendMessageMock, service } = createTestableRequestService({
 *   sendMessageResponse: {
 *     status: Iso15118EVCertificateStatusEnumType.Accepted,
 *     exiResponse: 'base64EncodedResponse'
 *   }
 * })
 *
 * // Call the public method
 * const response = await service.requestGet15118EVCertificate(
 *   mockStation,
 *   schemaVersion,
 *   CertificateActionEnumType.Install,
 *   exiRequest
 * )
 *
 * // Verify the call
 * expect(sendMessageMock.mock.calls.length).toBe(1)
 * const sentPayload = sendMessageMock.mock.calls[0].arguments[2]
 * expect(sentPayload.action).toBe(CertificateActionEnumType.Install)
 * ```
 */
export function createTestableRequestService<T extends JsonType = JsonType> (
  options: TestableRequestServiceOptions<T> = {}
): TestableRequestServiceResult {
  const responseService = new OCPP20ResponseService()
  const requestService = new OCPP20RequestService(responseService)

  // Create mock function with call tracking
  const mockFn = mock.fn(() =>
    Promise.resolve({
      ...options.sendMessageResponse,
    } as JsonType)
  )

  // Replace protected sendMessage with mock
  // Use Object.defineProperty to override the protected method
  Object.defineProperty(requestService, 'sendMessage', {
    configurable: true,
    value: mockFn,
    writable: true,
  })

  // Create typed wrapper for the mock
  const sendMessageMock: SendMessageMock = {
    fn: mockFn as unknown as SendMessageFn,
    mock: mockFn.mock as unknown as SendMessageMock['mock'],
  }

  return {
    sendMessageMock,
    service: requestService as unknown as TestableOCPP20RequestService,
  }
}
