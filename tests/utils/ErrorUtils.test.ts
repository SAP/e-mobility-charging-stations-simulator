/**
 * @file Tests for ErrorUtils
 * @description Unit tests for error handling utilities
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import {
  FileType,
  GenericStatus,
  IncomingRequestCommand,
  MessageType,
  RequestCommand,
} from '../../src/types/index.js'
import {
  handleFileException,
  handleIncomingRequestError,
  handleSendMessageError,
} from '../../src/utils/ErrorUtils.js'
import { logger } from '../../src/utils/Logger.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../charging-station/ChargingStationTestConstants.js'
import { createMockChargingStation } from '../charging-station/ChargingStationTestUtils.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('ErrorUtils', async () => {
  const { station: chargingStation } = createMockChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should throw or warn based on error code and options', t => {
    const consoleWarnMock = t.mock.method(console, 'warn')
    const consoleErrorMock = t.mock.method(console, 'error')
    const warnMock = t.mock.method(logger, 'warn')
    const errorMock = t.mock.method(logger, 'error')
    const error = new Error() as NodeJS.ErrnoException
    error.code = 'ENOENT'
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {})
    }).toThrow(error)
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        throwError: false,
      })
    }).not.toThrow()
    expect(warnMock.mock.calls.length).toBe(1)
    expect(errorMock.mock.calls.length).toBe(1)
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        consoleOut: true,
      })
    }).toThrow(error)
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        consoleOut: true,
        throwError: false,
      })
    }).not.toThrow()
    expect(consoleWarnMock.mock.calls.length).toBe(1)
    expect(consoleErrorMock.mock.calls.length).toBe(1)
  })

  await it('should log error and optionally throw for send message errors', t => {
    const errorMock = t.mock.method(logger, 'error')
    const logPrefixMock = t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    expect(() => {
      handleSendMessageError(
        chargingStation,
        RequestCommand.BOOT_NOTIFICATION,
        MessageType.CALL_MESSAGE,
        error
      )
    }).not.toThrow()
    expect(() => {
      handleSendMessageError(
        chargingStation,
        RequestCommand.BOOT_NOTIFICATION,
        MessageType.CALL_MESSAGE,
        error,
        { throwError: true }
      )
    }).toThrow(error)
    expect(logPrefixMock.mock.calls.length).toBe(2)
    expect(errorMock.mock.calls.length).toBe(2)
  })

  await it('should log error and return error response for incoming requests', t => {
    const errorMock = t.mock.method(logger, 'error')
    const logPrefixMock = t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    expect(() => {
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error)
    }).not.toThrow(error)
    expect(() => {
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error, {
        throwError: true,
      })
    }).toThrow()
    const errorResponse = {
      status: GenericStatus.Rejected,
    }
    expect(
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error, {
        errorResponse,
      })
    ).toStrictEqual(errorResponse)
    expect(logPrefixMock.mock.calls.length).toBe(3)
    expect(errorMock.mock.calls.length).toBe(3)
  })
})
