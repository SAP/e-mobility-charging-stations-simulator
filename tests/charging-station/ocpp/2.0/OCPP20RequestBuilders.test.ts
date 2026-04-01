/**
 * @file Tests for OCPP20RequestBuilders
 * @description Verifies OCPP 2.0 version-specific pure builders
 *
 * Covers:
 * - mapStopReasonToOCPP20 — maps OCPP 1.6 stop reasons to OCPP 2.0 equivalents
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { StopTransactionReason } from '../../../../src/types/index.js'

import { mapStopReasonToOCPP20 } from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestBuilders.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'

await describe('OCPP20RequestBuilders', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('mapStopReasonToOCPP20', async () => {
    await it('should map Other to Other/AbnormalCondition', () => {
      const result = mapStopReasonToOCPP20('Other' as StopTransactionReason)

      assert.strictEqual(result.stoppedReason, 'Other')
      assert.strictEqual(result.triggerReason, 'AbnormalCondition')
    })

    await it('should map undefined to Local/StopAuthorized', () => {
      const result = mapStopReasonToOCPP20(undefined)

      assert.strictEqual(result.stoppedReason, 'Local')
      assert.strictEqual(result.triggerReason, 'StopAuthorized')
    })

    await it('should map Remote to Remote/RemoteStop', () => {
      const result = mapStopReasonToOCPP20('Remote' as StopTransactionReason)

      assert.strictEqual(result.stoppedReason, 'Remote')
      assert.strictEqual(result.triggerReason, 'RemoteStop')
    })
  })
})
