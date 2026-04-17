import chalk from 'chalk'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { OCPP16AvailabilityType, OCPP16ChargePointStatus } from 'ui-common'

import { countConnectors, fuzzyTime, statusIcon, truncateId, wsIcon } from '../src/output/format.js'

await describe('format helpers', async () => {
  await describe('truncateId', async () => {
    await it('truncates string longer than default len (12) and appends ellipsis', () => {
      const result = truncateId('abcdefghijklmnop')
      assert.strictEqual(result, 'abcdefghijkl…')
    })

    await it('returns string as-is when shorter than default len', () => {
      const result = truncateId('short')
      assert.strictEqual(result, 'short')
    })

    await it('returns string as-is when exactly default len', () => {
      const result = truncateId('abcdefghijkl')
      assert.strictEqual(result, 'abcdefghijkl')
    })

    await it('works with custom len parameter', () => {
      const result = truncateId('hello world', 5)
      assert.strictEqual(result, 'hello…')
    })

    await it('returns string as-is when shorter than custom len', () => {
      const result = truncateId('hi', 5)
      assert.strictEqual(result, 'hi')
    })
  })

  await describe('statusIcon', async () => {
    await it('returns green icon for true', () => {
      const result = statusIcon(true)
      assert.strictEqual(result, chalk.green('●'))
      assert.ok(result.includes('●'))
    })

    await it('returns dim icon for false', () => {
      const result = statusIcon(false)
      assert.strictEqual(result, chalk.dim('○'))
      assert.ok(result.includes('○'))
    })

    await it('returns dim icon for undefined', () => {
      const result = statusIcon(undefined)
      assert.strictEqual(result, chalk.dim('○'))
      assert.ok(result.includes('○'))
    })
  })

  await describe('wsIcon', async () => {
    await it('returns yellow icon for state 0 (CONNECTING)', () => {
      const result = wsIcon(0)
      assert.strictEqual(result, chalk.yellow('…'))
      assert.ok(result.includes('…'))
    })

    await it('returns green icon for state 1 (OPEN)', () => {
      const result = wsIcon(1)
      assert.strictEqual(result, chalk.green('✓'))
      assert.ok(result.includes('✓'))
    })

    await it('returns red icon for state 2 (CLOSING)', () => {
      const result = wsIcon(2)
      assert.strictEqual(result, chalk.red('✗'))
      assert.ok(result.includes('✗'))
    })

    await it('returns red icon for state 3 (CLOSED)', () => {
      const result = wsIcon(3)
      assert.strictEqual(result, chalk.red('✗'))
      assert.ok(result.includes('✗'))
    })

    await it('returns dim icon for undefined', () => {
      const result = wsIcon(undefined)
      assert.strictEqual(result, chalk.dim('–'))
      assert.ok(result.includes('–'))
    })

    await it('returns dim icon for unknown state', () => {
      const result = wsIcon(99)
      assert.strictEqual(result, chalk.dim('–'))
    })
  })

  await describe('countConnectors', async () => {
    await it('counts from evses when evses present (evseId > 0, connectorId > 0)', () => {
      const evses = [
        {
          evseId: 1,
          evseStatus: {
            availability: OCPP16AvailabilityType.OPERATIVE,
            connectors: [
              {
                connectorId: 1,
                connectorStatus: {
                  availability: OCPP16AvailabilityType.OPERATIVE,
                  status: OCPP16ChargePointStatus.AVAILABLE,
                },
              },
              {
                connectorId: 2,
                connectorStatus: {
                  availability: OCPP16AvailabilityType.OPERATIVE,
                  status: OCPP16ChargePointStatus.CHARGING,
                },
              },
            ],
          },
        },
      ]
      const result = countConnectors(evses, [])
      assert.deepStrictEqual(result, { available: 1, total: 2 })
    })

    await it('skips evseId 0', () => {
      const evses = [
        {
          evseId: 0,
          evseStatus: {
            availability: OCPP16AvailabilityType.OPERATIVE,
            connectors: [
              {
                connectorId: 1,
                connectorStatus: {
                  availability: OCPP16AvailabilityType.OPERATIVE,
                  status: OCPP16ChargePointStatus.AVAILABLE,
                },
              },
            ],
          },
        },
        {
          evseId: 1,
          evseStatus: {
            availability: OCPP16AvailabilityType.OPERATIVE,
            connectors: [
              {
                connectorId: 1,
                connectorStatus: {
                  availability: OCPP16AvailabilityType.OPERATIVE,
                  status: OCPP16ChargePointStatus.AVAILABLE,
                },
              },
            ],
          },
        },
      ]
      const result = countConnectors(evses, [])
      assert.deepStrictEqual(result, { available: 1, total: 1 })
    })

    await it('skips connectorId 0 within evses', () => {
      const evses = [
        {
          evseId: 1,
          evseStatus: {
            availability: OCPP16AvailabilityType.OPERATIVE,
            connectors: [
              {
                connectorId: 0,
                connectorStatus: {
                  availability: OCPP16AvailabilityType.OPERATIVE,
                  status: OCPP16ChargePointStatus.AVAILABLE,
                },
              },
              {
                connectorId: 1,
                connectorStatus: {
                  availability: OCPP16AvailabilityType.OPERATIVE,
                  status: OCPP16ChargePointStatus.AVAILABLE,
                },
              },
            ],
          },
        },
      ]
      const result = countConnectors(evses, [])
      assert.deepStrictEqual(result, { available: 1, total: 1 })
    })

    await it('counts available connectors (status === AVAILABLE)', () => {
      const evses = [
        {
          evseId: 1,
          evseStatus: {
            availability: OCPP16AvailabilityType.OPERATIVE,
            connectors: [
              {
                connectorId: 1,
                connectorStatus: {
                  availability: OCPP16AvailabilityType.OPERATIVE,
                  status: OCPP16ChargePointStatus.AVAILABLE,
                },
              },
              {
                connectorId: 2,
                connectorStatus: {
                  availability: OCPP16AvailabilityType.OPERATIVE,
                  status: OCPP16ChargePointStatus.UNAVAILABLE,
                },
              },
              {
                connectorId: 3,
                connectorStatus: {
                  availability: OCPP16AvailabilityType.OPERATIVE,
                  status: OCPP16ChargePointStatus.FAULTED,
                },
              },
            ],
          },
        },
      ]
      const result = countConnectors(evses, [])
      assert.deepStrictEqual(result, { available: 1, total: 3 })
    })

    await it('falls back to connectors array when evses empty', () => {
      const connectors = [
        {
          connectorId: 1,
          connectorStatus: {
            availability: OCPP16AvailabilityType.OPERATIVE,
            status: OCPP16ChargePointStatus.AVAILABLE,
          },
        },
        {
          connectorId: 2,
          connectorStatus: {
            availability: OCPP16AvailabilityType.OPERATIVE,
            status: OCPP16ChargePointStatus.CHARGING,
          },
        },
      ]
      const result = countConnectors([], connectors)
      assert.deepStrictEqual(result, { available: 1, total: 2 })
    })

    await it('skips connectorId 0 in connectors fallback', () => {
      const connectors = [
        {
          connectorId: 0,
          connectorStatus: {
            availability: OCPP16AvailabilityType.OPERATIVE,
            status: OCPP16ChargePointStatus.AVAILABLE,
          },
        },
        {
          connectorId: 1,
          connectorStatus: {
            availability: OCPP16AvailabilityType.OPERATIVE,
            status: OCPP16ChargePointStatus.AVAILABLE,
          },
        },
      ]
      const result = countConnectors([], connectors)
      assert.deepStrictEqual(result, { available: 1, total: 1 })
    })

    await it('returns {available: 0, total: 0} for empty arrays', () => {
      const result = countConnectors([], [])
      assert.deepStrictEqual(result, { available: 0, total: 0 })
    })
  })

  await describe('fuzzyTime', async () => {
    await it('returns dim dash for undefined', () => {
      const result = fuzzyTime(undefined)
      assert.strictEqual(result, chalk.dim('–'))
    })

    await it('returns just now for timestamps within last 60 seconds', () => {
      const thirtySecondsAgo = Date.now() - 30_000
      const result = fuzzyTime(thirtySecondsAgo)
      assert.strictEqual(result, chalk.dim('just now'))
    })

    await it('returns just now for ts = Date.now()', () => {
      const result = fuzzyTime(Date.now())
      assert.strictEqual(result, chalk.dim('just now'))
    })

    await it('clamps future timestamps to just now', () => {
      const oneMinuteInFuture = Date.now() + 60_000
      const result = fuzzyTime(oneMinuteInFuture)
      assert.strictEqual(result, chalk.dim('just now'))
    })

    await it('returns minutes format for timestamps 1-59 minutes ago', () => {
      const fiveMinutesAgo = Date.now() - 5 * 60_000
      const result = fuzzyTime(fiveMinutesAgo)
      assert.strictEqual(result, chalk.dim('5m ago'))
    })

    await it('returns minutes format for exactly 1 minute ago', () => {
      const sixtySecondsAgo = Date.now() - 60_000
      const result = fuzzyTime(sixtySecondsAgo)
      assert.strictEqual(result, chalk.dim('1m ago'))
    })

    await it('returns hours format for timestamps 1-23 hours ago', () => {
      const threeHoursAgo = Date.now() - 3 * 60 * 60_000
      const result = fuzzyTime(threeHoursAgo)
      assert.strictEqual(result, chalk.dim('3h ago'))
    })

    await it('returns hours format for exactly 1 hour ago', () => {
      const sixtyMinutesAgo = Date.now() - 60 * 60_000
      const result = fuzzyTime(sixtyMinutesAgo)
      assert.strictEqual(result, chalk.dim('1h ago'))
    })

    await it('returns days format for timestamps 24+ hours ago', () => {
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60_000
      const result = fuzzyTime(twoDaysAgo)
      assert.strictEqual(result, chalk.dim('2d ago'))
    })

    await it('returns days format for exactly 24 hours ago', () => {
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60_000
      const result = fuzzyTime(twentyFourHoursAgo)
      assert.strictEqual(result, chalk.dim('1d ago'))
    })
  })
})
