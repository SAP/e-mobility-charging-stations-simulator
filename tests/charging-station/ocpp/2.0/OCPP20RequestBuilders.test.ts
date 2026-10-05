/**
 * @file Tests for OCPP20RequestBuilders
 * @description Verifies OCPP 2.0 version-specific pure builders
 *
 * Covers:
 * - mapStopReasonToOCPP20 — maps OCPP 1.6 stop reasons to OCPP 2.0 equivalents
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  buildOCPP20SampledValue,
  mapStopReasonToOCPP20,
} from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestBuilders.js'
import { BaseError } from '../../../../src/exception/index.js'
import {
  OCPP16MeterValueMeasurand,
  OCPP16StopTransactionReason,
  type SampledValueTemplate,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'

await describe('OCPP20RequestBuilders', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('buildOCPP20SampledValue', async () => {
    await it('should reject an OCPP 1.6-only measurand', () => {
      assert.throws(
        () => buildOCPP20SampledValue({ measurand: OCPP16MeterValueMeasurand.FAN_RPM }, 1),
        (error: unknown) =>
          error instanceof BaseError && error.message.includes('sampled value measurand')
      )
    })

    await it('should reject an invalid measurand', () => {
      const template = { measurand: 'Invalid' } as unknown as SampledValueTemplate

      assert.throws(
        () => buildOCPP20SampledValue(template, 1),
        (error: unknown) =>
          error instanceof BaseError && error.message.includes('sampled value measurand')
      )
    })

    await it('should preserve a custom unit string', () => {
      const { sampledValue } = buildOCPP20SampledValue({ unit: 'custom-unit' }, 1)

      assert.deepStrictEqual(sampledValue.unitOfMeasure, { unit: 'custom-unit' })
    })
  })

  await describe('mapStopReasonToOCPP20', async () => {
    await it('should map Other to Other/AbnormalCondition', () => {
      const result = mapStopReasonToOCPP20(OCPP16StopTransactionReason.OTHER)

      assert.strictEqual(result.stoppedReason, 'Other')
      assert.strictEqual(result.triggerReason, 'AbnormalCondition')
    })

    await it('should map undefined to Local/StopAuthorized', () => {
      const result = mapStopReasonToOCPP20(undefined)

      assert.strictEqual(result.stoppedReason, 'Local')
      assert.strictEqual(result.triggerReason, 'StopAuthorized')
    })

    await it('should map Remote to Remote/RemoteStop', () => {
      const result = mapStopReasonToOCPP20(OCPP16StopTransactionReason.REMOTE)

      assert.strictEqual(result.stoppedReason, 'Remote')
      assert.strictEqual(result.triggerReason, 'RemoteStop')
    })
  })
})
