/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { expect } from '@std/expect'
import { describe, it } from 'node:test'

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
} from '../../src/utils/ErrorUtils.js'
import { logger } from '../../src/utils/Logger.js'

await describe('ErrorUtils test suite', async () => {
  const chargingStation = {
    logPrefix: () => 'CS-TEST |',
  } as ChargingStation

  await it('Verify handleFileException()', t => {
    t.mock.method(console, 'warn')
    t.mock.method(console, 'error')
    t.mock.method(logger, 'warn')
    t.mock.method(logger, 'error')
    const error = new Error()
    error.code = 'ENOENT'
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {})
    }).toThrow(error)
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        throwError: false,
      })
    }).not.toThrow()
    expect(logger.warn.mock.calls.length).toBe(1)
    expect(logger.error.mock.calls.length).toBe(1)
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
    expect(console.warn.mock.calls.length).toBe(1)
    expect(console.error.mock.calls.length).toBe(1)
  })

  await it('Verify handleSendMessageError()', t => {
    t.mock.method(logger, 'error')
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
    expect(() => {
      handleSendMessageError(
        chargingStation,
        RequestCommand.BOOT_NOTIFICATION,
        MessageType.CALL_MESSAGE,
        error,
        { throwError: true }
      )
    }).toThrow(error)
    expect(chargingStation.logPrefix.mock.calls.length).toBe(2)
    expect(logger.error.mock.calls.length).toBe(2)
  })

  await it('Verify handleIncomingRequestError()', t => {
    t.mock.method(logger, 'error')
    t.mock.method(chargingStation, 'logPrefix')
    const error = new Error()
    expect(() => {
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error)
    }).toThrow(error)
    expect(() => {
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error, {
        throwError: false,
      })
    }).not.toThrow()
    const errorResponse = {
      status: GenericStatus.Rejected,
    }
    expect(
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error, {
        errorResponse,
        throwError: false,
      })
    ).toStrictEqual(errorResponse)
    expect(chargingStation.logPrefix.mock.calls.length).toBe(3)
    expect(logger.error.mock.calls.length).toBe(3)
  })
})
