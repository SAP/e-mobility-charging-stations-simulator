/**
 * @file Tests for OCPP20ServiceUtils.enforceMessageLimits
 * @description Verifies message limit enforcement logic for OCPP 2.0 payloads
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { ReasonCodeEnumType } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'

interface MockLogger {
  debug: (...args: unknown[]) => void
  debugCalls: unknown[][]
}

interface RejectedResult {
  info: string
  original: TestItem
  reasonCode: string
}

interface TestItem {
  attributeValue?: string
  component: { name: string }
  variable: { name: string }
}

/**
 * @param name - Variable name for the test item
 * @param value - Optional attribute value
 * @returns A test item with the given variable name and optional value
 */
function makeItem (name: string, value?: string): TestItem {
  return {
    component: { name: 'TestComponent' },
    variable: { name },
    ...(value !== undefined ? { attributeValue: value } : {}),
  }
}

/** @returns A mock logger that captures debug calls */
function makeMockLogger (): MockLogger {
  const debugCalls: unknown[][] = []
  return {
    debug (...args: unknown[]) {
      debugCalls.push(args)
    },
    debugCalls,
  }
}

/** @returns A mock station with a logPrefix method */
function makeMockStation () {
  return { logPrefix: () => '[TestStation]' }
}

/** @returns A builder function that creates rejected result objects */
function makeRejectedBuilder () {
  return (item: TestItem, reason: { info: string; reasonCode: string }): RejectedResult => ({
    info: reason.info,
    original: item,
    reasonCode: reason.reasonCode,
  })
}

await describe('OCPP20ServiceUtils.enforceMessageLimits', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('no limits configured (both 0)', async () => {
    await it('should return rejected:false and empty results when both limits are 0', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const items = [makeItem('HeartbeatInterval', '30')]

      const result = OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        items,
        0,
        0,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(result.rejected, false)
      assert.deepStrictEqual(result.results, [])
    })

    await it('should return rejected:false for empty data array with both limits 0', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()

      const result = OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        [],
        0,
        0,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(result.rejected, false)
      assert.deepStrictEqual(result.results, [])
    })
  })

  await describe('itemsLimit enforcement', async () => {
    await it('should return rejected:false when data length is under the items limit', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const items = [makeItem('A'), makeItem('B'), makeItem('C')]

      const result = OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        items,
        5,
        0,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(result.rejected, false)
      assert.deepStrictEqual(result.results, [])
    })

    await it('should return rejected:false when data length equals the items limit', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const items = [makeItem('A')]

      const result = OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        items,
        1,
        0,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(result.rejected, false)
      assert.deepStrictEqual(result.results, [])
    })

    await it('should reject all items with TooManyElements when items limit is exceeded', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const items = [makeItem('A'), makeItem('B'), makeItem('C')]

      const result = OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        items,
        2,
        0,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(result.rejected, true)
      assert.strictEqual(result.results.length, 3)
      for (const r of result.results as RejectedResult[]) {
        assert.strictEqual(r.reasonCode, ReasonCodeEnumType.TooManyElements)
        assert.ok(r.info.includes('ItemsPerMessage limit 2'))
      }
    })

    await it('should reject exactly one-over-limit case with TooManyElements', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const items = [makeItem('A'), makeItem('B')]

      const result = OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        items,
        1,
        0,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(result.rejected, true)
      assert.strictEqual(result.results.length, 2)
      for (const r of result.results as RejectedResult[]) {
        assert.strictEqual(r.reasonCode, ReasonCodeEnumType.TooManyElements)
      }
    })

    await it('should log a debug message when items limit is exceeded', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const items = [makeItem('A'), makeItem('B'), makeItem('C')]

      OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'TestModule',
        'testContext',
        items,
        2,
        0,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(logger.debugCalls.length, 1)
      assert.ok(String(logger.debugCalls[0][0]).includes('ItemsPerMessage limit'))
    })
  })

  await describe('bytesLimit enforcement', async () => {
    await it('should return rejected:false when data size is under the bytes limit', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const items = [makeItem('HeartbeatInterval', '30')]

      const result = OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        items,
        0,
        999_999,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(result.rejected, false)
      assert.deepStrictEqual(result.results, [])
    })

    await it('should reject all items with TooLargeElement when bytes limit is exceeded', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const items = [makeItem('SomeVariable', 'someValue')]

      const result = OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        items,
        0,
        1,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(result.rejected, true)
      assert.strictEqual(result.results.length, 1)
      const r = (result.results as RejectedResult[])[0]
      assert.strictEqual(r.reasonCode, ReasonCodeEnumType.TooLargeElement)
      assert.ok(r.info.includes('BytesPerMessage limit 1'))
    })

    await it('should reject all items with TooLargeElement for multiple items over bytes limit', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const items = [makeItem('A', 'val'), makeItem('B', 'val')]

      const result = OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        items,
        0,
        1,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(result.rejected, true)
      assert.strictEqual(result.results.length, 2)
      for (const r of result.results as RejectedResult[]) {
        assert.strictEqual(r.reasonCode, ReasonCodeEnumType.TooLargeElement)
      }
    })

    await it('should log a debug message when bytes limit is exceeded', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const items = [makeItem('SomeVariable', 'someValue')]

      OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'TestModule',
        'testContext',
        items,
        0,
        1,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(logger.debugCalls.length, 1)
      assert.ok(String(logger.debugCalls[0][0]).includes('BytesPerMessage limit'))
    })
  })

  await describe('items limit takes precedence over bytes limit', async () => {
    await it('should apply items limit check before bytes limit check', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const items = [makeItem('A'), makeItem('B'), makeItem('C')]

      const result = OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        items,
        2,
        1,
        makeRejectedBuilder(),
        logger
      )

      assert.strictEqual(result.rejected, true)
      for (const r of result.results as RejectedResult[]) {
        assert.strictEqual(r.reasonCode, ReasonCodeEnumType.TooManyElements)
      }
    })
  })

  await describe('buildRejected callback', async () => {
    await it('should pass original item to buildRejected callback', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const item = makeItem('HeartbeatInterval', 'abc')
      const capturedItems: TestItem[] = []

      OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        [item],
        0,
        1,
        (i: TestItem, _reason) => {
          capturedItems.push(i)
          return { rejected: true }
        },
        logger
      )

      assert.strictEqual(capturedItems.length, 1)
      assert.strictEqual(capturedItems[0], item)
    })

    await it('should pass reason with info and reasonCode to buildRejected callback', () => {
      const station = makeMockStation()
      const logger = makeMockLogger()
      const item = makeItem('WebSocketPingInterval', 'xyz')
      const capturedReasons: { info: string; reasonCode: string }[] = []

      OCPP20ServiceUtils.enforceMessageLimits(
        station,
        'OCPP20ServiceUtils',
        'enforceMessageLimits',
        [item],
        0,
        1,
        (_i: TestItem, reason) => {
          capturedReasons.push(reason)
          return { rejected: true }
        },
        logger
      )

      assert.strictEqual(capturedReasons.length, 1)
      assert.strictEqual(capturedReasons[0].reasonCode, ReasonCodeEnumType.TooLargeElement)
      assert.strictEqual(typeof capturedReasons[0].info, 'string')
      assert.ok(capturedReasons[0].info.length > 0)
    })
  })
})
