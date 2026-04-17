/** @file Unit tests for CLI output formatters (JSON and table) */

import assert from 'node:assert'
import { describe, it } from 'node:test'
import { ResponseStatus } from 'ui-common'

import { createFormatter } from '../src/output/formatter.js'
import { printError } from '../src/output/human.js'
import { outputJson, outputJsonError } from '../src/output/json.js'
import { outputTable } from '../src/output/table.js'
import { captureStream } from './helpers.js'

await describe('output formatters', async () => {
  await it('should create JSON formatter when jsonMode is true', () => {
    const formatter = createFormatter(true)
    assert.strictEqual(typeof formatter.output, 'function')
    assert.strictEqual(typeof formatter.error, 'function')
  })

  await it('should create table formatter when jsonMode is false', () => {
    const formatter = createFormatter(false)
    assert.strictEqual(typeof formatter.output, 'function')
    assert.strictEqual(typeof formatter.error, 'function')
  })

  await it('should write valid JSON to stdout for success payload', () => {
    const payload = {
      hashIdsSucceeded: ['cs-001', 'cs-002'],
      status: ResponseStatus.SUCCESS,
    }
    const output = captureStream('stdout', () => {
      outputJson(payload)
    })
    const parsed = JSON.parse(output) as typeof payload
    assert.strictEqual(parsed.status, ResponseStatus.SUCCESS)
    assert.deepStrictEqual(parsed.hashIdsSucceeded, ['cs-001', 'cs-002'])
  })

  await it('should write valid JSON to stdout for failure payload', () => {
    const payload = { status: ResponseStatus.FAILURE }
    const output = captureStream('stdout', () => {
      outputJson(payload)
    })
    const parsed = JSON.parse(output) as typeof payload
    assert.strictEqual(parsed.status, ResponseStatus.FAILURE)
  })

  await it('should write error JSON to stdout', () => {
    const output = captureStream('stdout', () => {
      outputJsonError(new Error('test error'))
    })
    const parsed = JSON.parse(output) as { error: boolean; message: string; status: string }
    assert.strictEqual(parsed.error, true)
    assert.strictEqual(parsed.message, 'test error')
    assert.strictEqual(parsed.status, ResponseStatus.FAILURE)
  })

  await it('should handle non-Error objects in JSON error output', () => {
    const output = captureStream('stdout', () => {
      outputJsonError('string error')
    })
    const parsed = JSON.parse(output) as { message: string }
    assert.strictEqual(parsed.message, 'string error')
  })

  await it('should write table output for payload with hash IDs', () => {
    const payload = {
      hashIdsSucceeded: ['cs-001'],
      status: ResponseStatus.SUCCESS,
    }
    const output = captureStream('stdout', () => {
      outputTable(payload)
    })
    assert.ok(output.includes('cs-001'))
  })

  await it('should display generic payload when no hash IDs present', () => {
    const payload = { state: { version: '1.0' }, status: ResponseStatus.SUCCESS }
    const output = captureStream('stdout', () => {
      outputTable(payload)
    })
    assert.ok(output.includes('version'))
  })

  await it('should write generic success when no hash IDs in table mode', () => {
    const payload = { status: ResponseStatus.SUCCESS }
    const output = captureStream('stdout', () => {
      outputTable(payload)
    })
    assert.ok(output.includes('Success'))
  })

  await it('should write error message via printError', () => {
    const output = captureStream('stderr', () => {
      printError('oops')
    })
    assert.ok(output.includes('oops'))
  })

  await it('should output JSON when using JSON formatter', () => {
    const formatter = createFormatter(true)
    const payload = {
      hashIdsSucceeded: ['cs-100'],
      status: ResponseStatus.SUCCESS,
    }
    const output = captureStream('stdout', () => {
      formatter.output(payload)
    })
    const parsed = JSON.parse(output) as typeof payload
    assert.strictEqual(parsed.status, ResponseStatus.SUCCESS)
  })

  await it('should output table when using table formatter', () => {
    const formatter = createFormatter(false)
    const payload = {
      hashIdsSucceeded: ['cs-200'],
      status: ResponseStatus.SUCCESS,
    }
    const output = captureStream('stdout', () => {
      formatter.output(payload)
    })
    assert.ok(output.includes('cs-200'))
  })

  await it('should handle error with JSON formatter', () => {
    const formatter = createFormatter(true)
    const output = captureStream('stdout', () => {
      formatter.error(new Error('json err'))
    })
    const parsed = JSON.parse(output) as { message: string }
    assert.strictEqual(parsed.message, 'json err')
  })

  await it('should handle error with table formatter', () => {
    const formatter = createFormatter(false)
    const output = captureStream('stderr', () => {
      formatter.error(new Error('table err'))
    })
    assert.ok(output.includes('table err'))
  })

  await it('should display responsesFailed with errorMessage in two-column table', () => {
    const payload = {
      hashIdsFailed: ['cs-001'],
      responsesFailed: [
        {
          command: 'startChargingStation',
          errorMessage: 'Station not found',
          hashId: 'cs-001',
          status: ResponseStatus.FAILURE,
        },
      ],
      status: ResponseStatus.FAILURE,
    }
    const output = captureStream('stderr', () => {
      outputTable(payload)
    })
    assert.ok(output.includes('Station not found'))
    assert.ok(output.includes('cs-001'))
    assert.ok(output.includes('ERROR'))
  })

  await it('should display responsesFailed with missing errorMessage as Unknown error', () => {
    const payload = {
      hashIdsFailed: ['cs-002'],
      responsesFailed: [
        {
          command: 'stopChargingStation',
          hashId: 'cs-002',
          status: ResponseStatus.FAILURE,
        },
      ],
      status: ResponseStatus.FAILURE,
    }
    const output = captureStream('stderr', () => {
      outputTable(payload)
    })
    assert.ok(output.includes('Unknown error'))
    assert.ok(output.includes('cs-002'))
  })

  await it('should display responsesFailed with undefined hashId as (unknown)', () => {
    const payload = {
      hashIdsFailed: ['cs-003'],
      responsesFailed: [
        {
          command: 'openConnection',
          errorMessage: 'Timeout',
          hashId: undefined,
          status: ResponseStatus.FAILURE,
        },
      ],
      status: ResponseStatus.FAILURE,
    }
    const output = captureStream('stderr', () => {
      outputTable(payload)
    })
    assert.ok(output.includes('(unknown)'))
    assert.ok(output.includes('Timeout'))
  })

  await it('should display hashIdsFailed without responsesFailed as single-column table', () => {
    const payload = {
      hashIdsFailed: ['cs-001'],
      status: ResponseStatus.FAILURE,
    }
    const output = captureStream('stderr', () => {
      outputTable(payload)
    })
    assert.ok(output.includes('cs-001'))
    assert.ok(!output.includes('Error'))
  })

  await it('should display generic failure status on stderr', () => {
    const output = captureStream('stderr', () => {
      outputTable({ status: ResponseStatus.FAILURE })
    })
    assert.ok(output.includes('Failure'))
  })
})
