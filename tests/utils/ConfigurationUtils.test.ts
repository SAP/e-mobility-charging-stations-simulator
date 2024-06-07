/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it } from 'node:test'

import { expect } from 'expect'

import { FileType } from '../../src/types/index.js'
import { handleFileException } from '../../src/utils/ConfigurationUtils.js'

await describe('ConfigurationUtils test suite', async () => {
  await it('Verify handleFileException()', t => {
    t.mock.method(console, 'error')
    const error = new Error()
    error.code = 'ENOENT'
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |')
    }).toThrow(error)
    expect(console.error.mock.calls.length).toBe(1)
  })
})
