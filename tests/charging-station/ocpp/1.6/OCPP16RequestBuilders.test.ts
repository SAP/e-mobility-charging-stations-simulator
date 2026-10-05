/**
 * @file Tests for OCPP16RequestBuilders
 * @description Verifies OCPP 1.6 version-specific pure builders
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildOCPP16SampledValue } from '../../../../src/charging-station/ocpp/1.6/OCPP16RequestBuilders.js'
import { BaseError } from '../../../../src/exception/index.js'
import {
  OCPP16MeterValueMeasurand,
  OCPP16MeterValueUnit,
  type SampledValueTemplate,
} from '../../../../src/types/index.js'

await describe('OCPP16RequestBuilders', async () => {
  await describe('buildOCPP16SampledValue', async () => {
    for (const unit of [OCPP16MeterValueUnit.TEMP_CELCIUS, OCPP16MeterValueUnit.TEMP_CELSIUS]) {
      await it(`should preserve the schema-supported ${unit} temperature unit`, () => {
        const sampledValue = buildOCPP16SampledValue({ unit }, 21)

        assert.strictEqual(sampledValue.unit, unit)
      })
    }

    await it('should omit the OCPP 2.0-only default unit for OCPP 1.6 Frequency', () => {
      const sampledValue = buildOCPP16SampledValue(
        { measurand: OCPP16MeterValueMeasurand.FREQUENCY },
        50
      )

      assert.strictEqual(sampledValue.unit, undefined)
    })

    await it('should reject an OCPP 2.0-only unit descriptor', () => {
      assert.throws(
        () =>
          buildOCPP16SampledValue(
            {
              unitOfMeasure: { multiplier: 3, unit: OCPP16MeterValueUnit.WATT_HOUR },
            },
            1
          ),
        (error: unknown) =>
          error instanceof BaseError && error.message.includes('sampled value unitOfMeasure')
      )
    })

    for (const fieldName of ['context', 'location', 'measurand', 'phase', 'unit'] as const) {
      await it(`should reject an invalid supplied ${fieldName}`, () => {
        const template = { [fieldName]: 'Invalid' } as unknown as SampledValueTemplate

        assert.throws(
          () => buildOCPP16SampledValue(template, 1),
          (error: unknown) =>
            error instanceof BaseError && error.message.includes(`sampled value ${fieldName}`)
        )
      })
    }
  })
})
