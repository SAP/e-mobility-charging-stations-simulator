import chalk from 'chalk'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { OCPP16AvailabilityType, OCPP16ChargePointStatus } from 'ui-common'

import {
  formatConnectors,
  fuzzyTime,
  statusIcon,
  truncateId,
  wsIcon,
} from '../src/output/format.js'

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

  await describe('formatConnectors', async () => {
    await it('formats connectors from evses', () => {
      const result = formatConnectors(
        [
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
                    status: OCPP16ChargePointStatus.OCCUPIED,
                  },
                },
              ],
            },
          },
        ],
        []
      )
      assert.ok(result.includes('1:A'))
      assert.ok(result.includes('2:O'))
    })

    await it('skips evseId 0', () => {
      const result = formatConnectors(
        [
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
        ],
        []
      )
      assert.ok(result.includes('–'))
    })

    await it('skips connectorId 0', () => {
      const result = formatConnectors(
        [
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
        ],
        []
      )
      assert.ok(result.includes('1:A'))
      assert.ok(!result.includes('0:'))
    })

    await it('falls back to connectors array when evses empty', () => {
      const result = formatConnectors(
        [],
        [
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
      )
      assert.ok(result.includes('1:A'))
      assert.ok(result.includes('2:C'))
    })

    await it('returns dash for empty arrays', () => {
      const result = formatConnectors([], [])
      assert.ok(result.includes('–'))
    })

    await it('uses two-letter abbreviations for ambiguous statuses', () => {
      const result = formatConnectors(
        [],
        [
          {
            connectorId: 1,
            connectorStatus: {
              availability: OCPP16AvailabilityType.OPERATIVE,
              status: OCPP16ChargePointStatus.SUSPENDED_EV,
            },
          },
          {
            connectorId: 2,
            connectorStatus: {
              availability: OCPP16AvailabilityType.OPERATIVE,
              status: OCPP16ChargePointStatus.SUSPENDED_EVSE,
            },
          },
          {
            connectorId: 3,
            connectorStatus: {
              availability: OCPP16AvailabilityType.OPERATIVE,
              status: OCPP16ChargePointStatus.FINISHING,
            },
          },
          {
            connectorId: 4,
            connectorStatus: {
              availability: OCPP16AvailabilityType.OPERATIVE,
              status: OCPP16ChargePointStatus.FAULTED,
            },
          },
        ]
      )
      assert.ok(result.includes('1:SE'))
      assert.ok(result.includes('2:SS'))
      assert.ok(result.includes('3:Fi'))
      assert.ok(result.includes('4:F'))
    })

    await it('handles undefined status', () => {
      const result = formatConnectors(
        [],
        [
          {
            connectorId: 1,
            connectorStatus: {
              availability: OCPP16AvailabilityType.OPERATIVE,
              status: undefined as unknown as OCPP16ChargePointStatus,
            },
          },
        ]
      )
      assert.ok(result.includes('1:?'))
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
