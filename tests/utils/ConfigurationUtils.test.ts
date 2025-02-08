/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { FileType } from '../../src/types/index.js'
import { handleFileException, logPrefix } from '../../src/utils/ConfigurationUtils.js'

await describe('ConfigurationUtils test suite', async () => {
  await it('Verify logPrefix()', () => {
    expect(logPrefix()).toContain(' Simulator configuration |')
  })

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
