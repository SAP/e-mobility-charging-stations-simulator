import { describe, it } from 'node:test'

import { expect } from 'expect'

import { FileType } from '../../src/types/index.js'
import { handleFileException } from '../../src/utils/ConfigurationUtils.js'

await describe('ConfigurationUtils test suite', async () => {
  await it('Verify handleFileException()', () => {
    const error = new Error()
    error.code = 'ENOENT'
    expect(() => {
      handleFileException('path/to/module.js', FileType.Authorization, error, 'log prefix |')
    }).toThrow(error)
  })
})
