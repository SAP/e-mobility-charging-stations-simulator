/**
 * @file Tests for cross-version MeterValue type guards
 * @description Verifies that protocol-specific guards remain disjoint at runtime
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isOCPP16MeterValue,
  isOCPP20MeterValue,
  type MeterValue,
} from '../../../src/types/index.js'

await describe('MeterValue type guards', async () => {
  await it('should classify an empty sampled-value list only as OCPP 1.6', () => {
    const meterValue: MeterValue = {
      sampledValue: [],
      timestamp: new Date(),
    }

    assert.strictEqual(isOCPP16MeterValue(meterValue), true)
    assert.strictEqual(isOCPP20MeterValue(meterValue), false)
  })
})
