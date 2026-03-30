/**
 * Testable wrapper for OCPP 2.0 RequestService
 *
 * This module provides type-safe testing utilities for OCPP20RequestService.
 * It enables mocking of the protected sendMessage method and provides access
 * to buildRequestPayload and requestHandler for testing the single-path architecture.
 * @example
 * ```typescript
 * import {
 *   createTestableRequestService,
 *   type SendMessageMock,
 * } from './__testable__/OCPP20RequestServiceTestable.js'
 *
 * const { sendMessageMock, service } = createTestableRequestService({
 *   sendMessageResponse: { status: GenericStatus.Accepted }
 * })
 * const response = await service.requestHandler(station, OCPP20RequestCommand.HEARTBEAT)
 * expect(sendMessageMock.mock.calls.length).toBe(1)
 * ```
 */

import { mock } from 'node:test'

import type { JsonType, OCPP20RequestCommand, RequestParams } from '../../../../types/index.js'
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
  buildRequestPayload: (
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: JsonType
  ) => JsonType

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  requestHandler: <RequestType extends JsonType, ResponseType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP20RequestCommand,
    commandParams?: RequestType,
    params?: RequestParams
  ) => Promise<ResponseType>
}

/**
 * Configuration options for creating a testable request service
 */
export interface TestableRequestServiceOptions<T extends JsonType = JsonType> {
  sendMessageResponse?: Partial<T>
}

/**
 * Result of creating a testable request service
 */
export interface TestableRequestServiceResult {
  sendMessageMock: SendMessageMock
  service: TestableOCPP20RequestService
}

/**
 * Creates a testable OCPP20RequestService with mocked sendMessage.
 *
 * This factory function creates an OCPP20RequestService instance with its
 * protected sendMessage method replaced by a mock that returns configured
 * responses. This allows testing through requestHandler without making
 * actual network calls.
 * @template T - The expected response type
 * @param options - Configuration for the testable service
 * @returns Object containing the testable service and sendMessage mock
 * @example
 * ```typescript
 * const { sendMessageMock, service } = createTestableRequestService({
 *   sendMessageResponse: { status: GenericStatus.Accepted }
 * })
 *
 * const response = await service.requestHandler(
 *   mockStation,
 *   OCPP20RequestCommand.HEARTBEAT
 * )
 *
 * expect(sendMessageMock.mock.calls.length).toBe(1)
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
