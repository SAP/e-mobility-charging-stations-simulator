/**
 * @file Tests for ErrorUtils
 * @description Unit tests for error handling utilities
 */
import { expect } from '@std/expect'
import process from 'node:process'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

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
  handleUncaughtException,
  handleUnhandledRejection,
} from '../../src/utils/ErrorUtils.js'
import { logger } from '../../src/utils/Logger.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../charging-station/ChargingStationTestConstants.js'
import { createMockChargingStation } from '../charging-station/ChargingStationTestUtils.js'
import {
  createConsoleMocks,
  createLoggerMocks,
  standardCleanup,
} from '../helpers/TestLifecycleHelpers.js'

await describe('ErrorUtils', async () => {
  let chargingStation: ChargingStation

  beforeEach(() => {
    const { station } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
    })
    chargingStation = station
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should throw error with logger output when throwError is true', t => {
    const { errorMock } = createLoggerMocks(t, logger)
    const error = new Error() as NodeJS.ErrnoException
    error.code = 'ENOENT'
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {})
    }).toThrow(error)
    expect(errorMock.mock.calls.length).toBe(1)
  })

  await it('should log warning with logger when throwError is false', t => {
    const { warnMock } = createLoggerMocks(t, logger)
    const error = new Error() as NodeJS.ErrnoException
    error.code = 'ENOENT'
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        throwError: false,
      })
    }).not.toThrow()
    expect(warnMock.mock.calls.length).toBe(1)
  })

  await it('should throw error with console output when consoleOut is true', t => {
    const { errorMock } = createConsoleMocks(t, { error: true })
    const error = new Error() as NodeJS.ErrnoException
    error.code = 'ENOENT'
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        consoleOut: true,
      })
    }).toThrow(error)
    expect(errorMock?.mock.calls.length).toBe(1)
  })

  await it('should log console warning when consoleOut and throwError are false', t => {
    const { warnMock } = createConsoleMocks(t, { error: true, warn: true })
    const error = new Error() as NodeJS.ErrnoException
    error.code = 'ENOENT'
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        consoleOut: true,
        throwError: false,
      })
    }).not.toThrow()
    expect(warnMock?.mock.calls.length).toBe(1)
  })

  await it('should produce correct log message for each error code', t => {
    const { warnMock } = createLoggerMocks(t, logger)
    const errorCodes = [
      { code: 'ENOENT', expectedSubstring: 'not found' },
      { code: 'EACCES', expectedSubstring: 'access denied' },
      { code: 'EPERM', expectedSubstring: 'permission denied' },
      { code: 'EISDIR', expectedSubstring: 'is a directory' },
      { code: 'ENOSPC', expectedSubstring: 'no space left' },
      { code: 'ENOTDIR', expectedSubstring: 'not a directory' },
      { code: 'EEXIST', expectedSubstring: 'already exists' },
      { code: 'EROFS', expectedSubstring: 'read-only' },
      { code: 'UNKNOWN_CODE', expectedSubstring: 'error' },
    ]
    for (const { code } of errorCodes) {
      const error = new Error() as NodeJS.ErrnoException
      error.code = code
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        throwError: false,
      })
    }
    expect(warnMock.mock.calls.length).toBe(errorCodes.length)
    for (let i = 0; i < errorCodes.length; i++) {
      const call = warnMock.mock.calls[i] as unknown as { arguments: unknown[] }
      const logMessage = String(call.arguments[0]).toLowerCase()
      expect(logMessage.includes(errorCodes[i].expectedSubstring)).toBe(true)
    }
  })

  await it('should register uncaught exception handler on process', t => {
    const onMock = t.mock.method(process, 'on')
    handleUncaughtException()
    expect(onMock.mock.calls.length).toBe(1)
    expect(onMock.mock.calls[0].arguments[0]).toBe('uncaughtException')
  })

  await it('should register unhandled rejection handler on process', t => {
    const onMock = t.mock.method(process, 'on')
    handleUnhandledRejection()
    expect(onMock.mock.calls.length).toBe(1)
    expect(onMock.mock.calls[0].arguments[0]).toBe('unhandledRejection')
  })

  await it('should log error and not throw for send message errors by default', t => {
    const { errorMock } = createLoggerMocks(t, logger)
    t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    expect(() => {
      handleSendMessageError(
        chargingStation,
        RequestCommand.BOOT_NOTIFICATION,
        MessageType.CALL_MESSAGE,
        error
      )
    }).not.toThrow()
    expect(errorMock.mock.calls.length).toBe(1)
  })

  await it('should throw for send message errors when throwError is true', t => {
    const { errorMock } = createLoggerMocks(t, logger)
    t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    expect(() => {
      handleSendMessageError(
        chargingStation,
        RequestCommand.BOOT_NOTIFICATION,
        MessageType.CALL_MESSAGE,
        error,
        { throwError: true }
      )
    }).toThrow(error)
    expect(errorMock.mock.calls.length).toBe(1)
  })

  await it('should log error and not throw for incoming request errors by default', t => {
    const { errorMock } = createLoggerMocks(t, logger)
    t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    expect(() => {
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error)
    }).not.toThrow(error)
    expect(errorMock.mock.calls.length).toBe(1)
  })

  await it('should throw for incoming request errors when throwError is true', t => {
    createLoggerMocks(t, logger)
    t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    expect(() => {
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error, {
        throwError: true,
      })
    }).toThrow()
  })

  await it('should return error response for incoming request errors', t => {
    const { errorMock } = createLoggerMocks(t, logger)
    t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    const errorResponse = {
      status: GenericStatus.Rejected,
    }
    expect(
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error, {
        errorResponse,
      })
    ).toStrictEqual(errorResponse)
    expect(errorMock.mock.calls.length).toBe(1)
  })
})
