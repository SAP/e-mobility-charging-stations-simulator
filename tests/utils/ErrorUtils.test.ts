/**
 * @file Tests for ErrorUtils
 * @description Unit tests for error handling utilities
 */
import assert from 'node:assert/strict'
import process from 'node:process'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'

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
import { logger } from '../../src/utils/index.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../charging-station/ChargingStationTestConstants.js'
import { createMockChargingStation } from '../charging-station/helpers/StationHelpers.js'
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
    assert.throws(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {})
    }, error)
    assert.strictEqual(errorMock.mock.calls.length, 1)
  })

  await it('should log warning with logger when throwError is false', t => {
    const { warnMock } = createLoggerMocks(t, logger)
    const error = new Error() as NodeJS.ErrnoException
    error.code = 'ENOENT'
    assert.doesNotThrow(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        throwError: false,
      })
    })
    assert.strictEqual(warnMock.mock.calls.length, 1)
  })

  await it('should throw error with console output when consoleOut is true', t => {
    const { errorMock } = createConsoleMocks(t, { error: true })
    const error = new Error() as NodeJS.ErrnoException
    error.code = 'ENOENT'
    assert.throws(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        consoleOut: true,
      })
    }, error)
    assert.strictEqual(errorMock?.mock.calls.length, 1)
  })

  await it('should log console warning when consoleOut and throwError are false', t => {
    const { warnMock } = createConsoleMocks(t, { error: true, warn: true })
    const error = new Error() as NodeJS.ErrnoException
    error.code = 'ENOENT'
    assert.doesNotThrow(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        consoleOut: true,
        throwError: false,
      })
    })
    assert.strictEqual(warnMock?.mock.calls.length, 1)
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
    assert.strictEqual(warnMock.mock.calls.length, errorCodes.length)
    for (let i = 0; i < errorCodes.length; i++) {
      const logMessage = String(warnMock.mock.calls[i].arguments[0]).toLowerCase()
      assert.ok(logMessage.includes(errorCodes[i].expectedSubstring))
    }
  })

  await it('should register uncaught exception handler on process', t => {
    const onMock = t.mock.method(process, 'on')
    handleUncaughtException()
    assert.strictEqual(onMock.mock.calls.length, 1)
    assert.strictEqual(onMock.mock.calls[0].arguments[0], 'uncaughtException')
  })

  await it('should register unhandled rejection handler on process', t => {
    const onMock = t.mock.method(process, 'on')
    handleUnhandledRejection()
    assert.strictEqual(onMock.mock.calls.length, 1)
    assert.strictEqual(onMock.mock.calls[0].arguments[0], 'unhandledRejection')
  })

  await it('should log error and not throw for send message errors by default', t => {
    const { errorMock } = createLoggerMocks(t, logger)
    t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    assert.doesNotThrow(() => {
      handleSendMessageError(
        chargingStation,
        RequestCommand.BOOT_NOTIFICATION,
        MessageType.CALL_MESSAGE,
        error
      )
    })
    assert.strictEqual(errorMock.mock.calls.length, 1)
  })

  await it('should throw for send message errors when throwError is true', t => {
    const { errorMock } = createLoggerMocks(t, logger)
    t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    assert.throws(() => {
      handleSendMessageError(
        chargingStation,
        RequestCommand.BOOT_NOTIFICATION,
        MessageType.CALL_MESSAGE,
        error,
        { throwError: true }
      )
    }, error)
    assert.strictEqual(errorMock.mock.calls.length, 1)
  })

  await it('should log error and not throw for incoming request errors by default', t => {
    const { errorMock } = createLoggerMocks(t, logger)
    t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    assert.doesNotThrow(() => {
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error)
    })
    assert.strictEqual(errorMock.mock.calls.length, 1)
  })

  await it('should throw for incoming request errors when throwError is true', t => {
    createLoggerMocks(t, logger)
    t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    assert.throws(() => {
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error, {
        throwError: true,
      })
    })
  })

  await it('should return error response for incoming request errors', t => {
    const { errorMock } = createLoggerMocks(t, logger)
    t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    const errorResponse = {
      status: GenericStatus.Rejected,
    }
    assert.deepStrictEqual(
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error, {
        errorResponse,
      }),
      errorResponse
    )
    assert.strictEqual(errorMock.mock.calls.length, 1)
  })
})
