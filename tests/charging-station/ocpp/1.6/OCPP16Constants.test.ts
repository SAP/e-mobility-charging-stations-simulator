/**
 * @file Tests for OCPP16Constants state machine transitions
 * @description Unit tests for OCPP 1.6 connector status state machine (§3)
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { OCPP16Constants } from '../../../../src/charging-station/ocpp/1.6/OCPP16Constants.js'
import { OCPP16ChargePointStatus } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'

await describe('OCPP16Constants', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('ChargePointStatusChargingStationTransitions', async () => {
    await it('should have valid station-level transitions array', () => {
      assert.notStrictEqual(OCPP16Constants.ChargePointStatusChargingStationTransitions, undefined)
      assert.strictEqual(
        Array.isArray(OCPP16Constants.ChargePointStatusChargingStationTransitions),
        true
      )
    })

    await it('should contain at least 9 station-level transitions', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      assert.strictEqual(transitions.length, 9)
    })

    await it('should have transitions with correct structure (from/to properties)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      for (const transition of transitions) {
        assert.notStrictEqual(transition, undefined)
        assert.notStrictEqual(transition.to, undefined)
        if (transition.from !== undefined) {
          assert.strictEqual(typeof transition.from, 'string')
        }
        assert.strictEqual(typeof transition.to, 'string')
      }
    })

    await it('should include transition to Available (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInitialAvailable = transitions.some(
        t => t.to === OCPP16ChargePointStatus.Available && t.from === undefined
      )
      assert.strictEqual(hasInitialAvailable, true)
    })

    await it('should include transition to Unavailable (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInitialUnavailable = transitions.some(
        t => t.to === OCPP16ChargePointStatus.Unavailable && t.from === undefined
      )
      assert.strictEqual(hasInitialUnavailable, true)
    })

    await it('should include transition to Faulted (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInitialFaulted = transitions.some(
        t => t.to === OCPP16ChargePointStatus.Faulted && t.from === undefined
      )
      assert.strictEqual(hasInitialFaulted, true)
    })

    await it('should include Available → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available &&
          t.to === OCPP16ChargePointStatus.Unavailable
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Available → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Faulted
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Unavailable → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Unavailable &&
          t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Unavailable → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.Faulted
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Faulted → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Faulted → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Unavailable
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should NOT include self-loop transitions (Available → Available)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasSelfLoop = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(hasSelfLoop, false)
    })

    await it('should NOT include self-loop transitions (Unavailable → Unavailable)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasSelfLoop = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Unavailable &&
          t.to === OCPP16ChargePointStatus.Unavailable
      )
      assert.strictEqual(hasSelfLoop, false)
    })

    await it('should NOT include self-loop transitions (Faulted → Faulted)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasSelfLoop = transitions.some(
        t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Faulted
      )
      assert.strictEqual(hasSelfLoop, false)
    })

    await it('should NOT include invalid transitions (Available → Preparing)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInvalid = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Preparing
      )
      assert.strictEqual(hasInvalid, false)
    })

    await it('should NOT include invalid transitions (Available → Charging)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInvalid = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(hasInvalid, false)
    })

    await it('should NOT include invalid transitions (Available → Reserved)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInvalid = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Reserved
      )
      assert.strictEqual(hasInvalid, false)
    })

    await it('should be frozen (immutable)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      assert.strictEqual(Object.isFrozen(transitions), true)
    })
  })

  await describe('ChargePointStatusConnectorTransitions', async () => {
    await it('should have valid connector-level transitions array', () => {
      assert.notStrictEqual(OCPP16Constants.ChargePointStatusConnectorTransitions, undefined)
      assert.strictEqual(Array.isArray(OCPP16Constants.ChargePointStatusConnectorTransitions), true)
    })

    await it('should contain 56 connector-level transitions', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      assert.ok(transitions.length >= 56, 'should contain at least 56 connector-level transitions')
    })

    await it('should have transitions with correct structure', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      for (const transition of transitions) {
        assert.notStrictEqual(transition, undefined)
        assert.notStrictEqual(transition.to, undefined)
        if (transition.from !== undefined) {
          assert.strictEqual(typeof transition.from, 'string')
        }
        assert.strictEqual(typeof transition.to, 'string')
      }
    })

    await it('should include transition to Available (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInitial = transitions.some(
        t => t.to === OCPP16ChargePointStatus.Available && t.from === undefined
      )
      assert.strictEqual(hasInitial, true)
    })

    await it('should include transition to Unavailable (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInitial = transitions.some(
        t => t.to === OCPP16ChargePointStatus.Unavailable && t.from === undefined
      )
      assert.strictEqual(hasInitial, true)
    })

    await it('should include transition to Faulted (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInitial = transitions.some(
        t => t.to === OCPP16ChargePointStatus.Faulted && t.from === undefined
      )
      assert.strictEqual(hasInitial, true)
    })

    await it('should include Available → Preparing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Preparing
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Available → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Available → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available &&
          t.to === OCPP16ChargePointStatus.SuspendedEV
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Available → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available &&
          t.to === OCPP16ChargePointStatus.SuspendedEVSE
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Available → Reserved transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Reserved
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Available → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available &&
          t.to === OCPP16ChargePointStatus.Unavailable
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Available → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Faulted
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Preparing → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Preparing → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Preparing → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Preparing &&
          t.to === OCPP16ChargePointStatus.SuspendedEV
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Preparing → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Preparing &&
          t.to === OCPP16ChargePointStatus.SuspendedEVSE
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Preparing → Finishing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Finishing
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Preparing → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Faulted
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Charging → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Charging → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Charging &&
          t.to === OCPP16ChargePointStatus.SuspendedEV
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Charging → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Charging &&
          t.to === OCPP16ChargePointStatus.SuspendedEVSE
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Charging → Finishing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Finishing
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Charging → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Charging &&
          t.to === OCPP16ChargePointStatus.Unavailable
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Charging → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Faulted
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEV → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEV &&
          t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEV → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEV &&
          t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEV → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEV &&
          t.to === OCPP16ChargePointStatus.SuspendedEVSE
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEV → Finishing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEV &&
          t.to === OCPP16ChargePointStatus.Finishing
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEV → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEV &&
          t.to === OCPP16ChargePointStatus.Unavailable
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEV → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEV && t.to === OCPP16ChargePointStatus.Faulted
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEVSE → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEVSE &&
          t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEVSE → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEVSE &&
          t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEVSE → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEVSE &&
          t.to === OCPP16ChargePointStatus.SuspendedEV
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEVSE → Finishing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEVSE &&
          t.to === OCPP16ChargePointStatus.Finishing
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEVSE → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEVSE &&
          t.to === OCPP16ChargePointStatus.Unavailable
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include SuspendedEVSE → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEVSE &&
          t.to === OCPP16ChargePointStatus.Faulted
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Finishing → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Finishing && t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Finishing → Preparing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Finishing && t.to === OCPP16ChargePointStatus.Preparing
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Finishing → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Finishing &&
          t.to === OCPP16ChargePointStatus.Unavailable
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Finishing → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Finishing && t.to === OCPP16ChargePointStatus.Faulted
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Reserved → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Reserved && t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Reserved → Preparing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Reserved && t.to === OCPP16ChargePointStatus.Preparing
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Reserved → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Reserved &&
          t.to === OCPP16ChargePointStatus.Unavailable
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Reserved → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t => t.from === OCPP16ChargePointStatus.Reserved && t.to === OCPP16ChargePointStatus.Faulted
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Unavailable → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Unavailable &&
          t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Unavailable → Preparing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Unavailable &&
          t.to === OCPP16ChargePointStatus.Preparing
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Unavailable → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Unavailable &&
          t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Unavailable → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Unavailable &&
          t.to === OCPP16ChargePointStatus.SuspendedEV
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Unavailable → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Unavailable &&
          t.to === OCPP16ChargePointStatus.SuspendedEVSE
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Unavailable → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.Faulted
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Faulted → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Faulted → Preparing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Preparing
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Faulted → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Faulted → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.SuspendedEV
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Faulted → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Faulted &&
          t.to === OCPP16ChargePointStatus.SuspendedEVSE
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Faulted → Finishing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Finishing
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Faulted → Reserved transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Reserved
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should include Faulted → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Unavailable
      )
      assert.strictEqual(hasTransition, true)
    })

    await it('should NOT include invalid transition (Available → Finishing)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Finishing
      )
      assert.strictEqual(hasInvalid, false)
    })

    await it('should NOT include invalid transition (Preparing → Reserved)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Reserved
      )
      assert.strictEqual(hasInvalid, false)
    })

    await it('should NOT include invalid transition (Charging → Preparing)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Preparing
      )
      assert.strictEqual(hasInvalid, false)
    })

    await it('should NOT include invalid transition (Charging → Reserved)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Reserved
      )
      assert.strictEqual(hasInvalid, false)
    })

    await it('should NOT include invalid transition (Reserved → Charging)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Reserved && t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(hasInvalid, false)
    })

    await it('should NOT include invalid transition (Unavailable → Finishing)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Unavailable &&
          t.to === OCPP16ChargePointStatus.Finishing
      )
      assert.strictEqual(hasInvalid, false)
    })

    await it('should NOT include invalid transition (Unavailable → Reserved)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Unavailable &&
          t.to === OCPP16ChargePointStatus.Reserved
      )
      assert.strictEqual(hasInvalid, false)
    })

    await it('should be frozen (immutable)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      assert.strictEqual(Object.isFrozen(transitions), true)
    })
  })

  await describe('Connector lifecycle verification', async () => {
    await it('should support complete charging lifecycle: Available → Preparing → Charging → Finishing → Available', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions

      const step1 = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Preparing
      )
      assert.strictEqual(step1, true)

      const step2 = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(step2, true)

      const step3 = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Finishing
      )
      assert.strictEqual(step3, true)

      const step4 = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Finishing && t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(step4, true)
    })

    await it('should support suspended state transitions during charging', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions

      const toSuspendedEV = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Charging &&
          t.to === OCPP16ChargePointStatus.SuspendedEV
      )
      assert.strictEqual(toSuspendedEV, true)

      const resumeFromEV = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEV &&
          t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(resumeFromEV, true)

      const toSuspendedEVSE = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Charging &&
          t.to === OCPP16ChargePointStatus.SuspendedEVSE
      )
      assert.strictEqual(toSuspendedEVSE, true)

      const resumeFromEVSE = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.SuspendedEVSE &&
          t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(resumeFromEVSE, true)
    })

    await it('should support recovery from Faulted state to any active state', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions

      const toAvailable = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Available
      )
      assert.strictEqual(toAvailable, true)

      const toPreparing = transitions.some(
        t =>
          t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Preparing
      )
      assert.strictEqual(toPreparing, true)

      const toCharging = transitions.some(
        t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Charging
      )
      assert.strictEqual(toCharging, true)
    })
  })
})
