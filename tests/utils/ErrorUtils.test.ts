import { describe, it } from 'node:test'

import { expect } from 'expect'

import { FileType } from '../../src/types/index.js'
import { handleFileException, setDefaultErrorParams } from '../../src/utils/ErrorUtils.js'

await describe('ErrorUtils test suite', async () => {
  await it('Verify handleFileException()', () => {
    const error = new Error()
    error.code = 'ENOENT'
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix', {})
    }).toThrow(error)
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix', {
        throwError: false
      })
    }).not.toThrow()
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
