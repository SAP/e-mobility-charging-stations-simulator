import { describe, it } from 'node:test'

import { expect } from 'expect'

import type { ChargingStation } from '../../src/charging-station/index.js'
import {
  FileType,
  GenericStatus,
  IncomingRequestCommand,
  MessageType,
  RequestCommand
} from '../../src/types/index.js'
import {
  handleFileException,
  handleIncomingRequestError,
  handleSendMessageError,
  setDefaultErrorParams
} from '../../src/utils/ErrorUtils.js'

await describe('ErrorUtils test suite', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const chargingStation = {
    logPrefix: () => 'CS-TEST |'
  } as ChargingStation

  await it('Verify handleFileException()', () => {
    const error = new Error()
    error.code = 'ENOENT'
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {})
    }).toThrow(error)
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |', {
        throwError: false
      })
    }).not.toThrow()
  })

  await it('Verify handleSendMessageError()', () => {
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
  })

  await it('Verify handleIncomingRequestError()', () => {
    const error = new Error()
    expect(() => {
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error)
    }).toThrow(error)
    expect(() => {
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error, {
        throwError: false
      })
    }).not.toThrow()
    const errorResponse = {
      status: GenericStatus.Rejected
    }
    expect(
      handleIncomingRequestError(chargingStation, IncomingRequestCommand.CLEAR_CACHE, error, {
        throwError: false,
        errorResponse
      })
    ).toStrictEqual(errorResponse)
  })

  await it('Verify setDefaultErrorParams()', () => {
    expect(setDefaultErrorParams({})).toStrictEqual({ throwError: true, consoleOut: false })
    expect(setDefaultErrorParams({ throwError: false })).toStrictEqual({
      throwError: false,
      consoleOut: false
    })
    expect(setDefaultErrorParams({ throwError: false, consoleOut: true })).toStrictEqual({
      throwError: false,
      consoleOut: true
    })
    expect(setDefaultErrorParams({ throwError: true, consoleOut: true })).toStrictEqual({
      throwError: true,
      consoleOut: true
    })
    expect(setDefaultErrorParams({}, { throwError: false, consoleOut: false })).toStrictEqual({
      throwError: false,
      consoleOut: false
    })
  })
})
