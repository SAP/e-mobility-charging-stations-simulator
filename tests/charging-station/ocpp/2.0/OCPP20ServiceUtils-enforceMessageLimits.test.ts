import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'

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
 *
 * @param name
 * @param value
 */
function makeItem (name: string, value?: string): TestItem {
  return {
    component: { name: 'TestComponent' },
    variable: { name },
    ...(value !== undefined ? { attributeValue: value } : {}),
  }
}

/**
 *
 */
function makeMockLogger (): MockLogger {
  const debugCalls: unknown[][] = []
  return {
    debug (...args: unknown[]) {
      debugCalls.push(args)
    },
    debugCalls,
  }
}

/**
 *
 */
function makeMockStation () {
  return { logPrefix: () => '[TestStation]' }
}

/**
 *
 */
function makeRejectedBuilder () {
  return (item: TestItem, reason: { info: string; reasonCode: string }): RejectedResult => ({
    info: reason.info,
    original: item,
    reasonCode: reason.reasonCode,
  })
}

await describe('OCPP20ServiceUtils.enforceMessageLimits', async () => {
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

      expect(result.rejected).toBe(false)
      expect(result.results).toStrictEqual([])
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

      expect(result.rejected).toBe(false)
      expect(result.results).toStrictEqual([])
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

      expect(result.rejected).toBe(false)
      expect(result.results).toStrictEqual([])
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

      expect(result.rejected).toBe(false)
      expect(result.results).toStrictEqual([])
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

      expect(result.rejected).toBe(true)
      expect(result.results).toHaveLength(3)
      for (const r of result.results as RejectedResult[]) {
        expect(r.reasonCode).toBe('TooManyElements')
        expect(r.info).toContain('ItemsPerMessage limit 2')
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

      expect(result.rejected).toBe(true)
      expect(result.results).toHaveLength(2)
      for (const r of result.results as RejectedResult[]) {
        expect(r.reasonCode).toBe('TooManyElements')
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

      expect(logger.debugCalls).toHaveLength(1)
      expect(String(logger.debugCalls[0][0])).toContain('ItemsPerMessage limit')
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

      expect(result.rejected).toBe(false)
      expect(result.results).toStrictEqual([])
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

      expect(result.rejected).toBe(true)
      expect(result.results).toHaveLength(1)
      const r = (result.results as RejectedResult[])[0]
      expect(r.reasonCode).toBe('TooLargeElement')
      expect(r.info).toContain('BytesPerMessage limit 1')
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

      expect(result.rejected).toBe(true)
      expect(result.results).toHaveLength(2)
      for (const r of result.results as RejectedResult[]) {
        expect(r.reasonCode).toBe('TooLargeElement')
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

      expect(logger.debugCalls).toHaveLength(1)
      expect(String(logger.debugCalls[0][0])).toContain('BytesPerMessage limit')
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

      expect(result.rejected).toBe(true)
      for (const r of result.results as RejectedResult[]) {
        expect(r.reasonCode).toBe('TooManyElements')
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

      expect(capturedItems).toHaveLength(1)
      expect(capturedItems[0]).toBe(item)
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

      expect(capturedReasons).toHaveLength(1)
      expect(capturedReasons[0].reasonCode).toBe('TooLargeElement')
      expect(typeof capturedReasons[0].info).toBe('string')
      expect(capturedReasons[0].info.length).toBeGreaterThan(0)
    })
  })
})
