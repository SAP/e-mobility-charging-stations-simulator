/**
 * @file Tests for OCPP16Constants state machine transitions
 * @description Unit tests for OCPP 1.6 connector status state machine (§3)
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import { OCPP16Constants } from '../../../../src/charging-station/ocpp/1.6/OCPP16Constants.js'
import { OCPP16ChargePointStatus } from '../../../../src/types/ocpp/1.6/ChargePointStatus.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'

await describe('OCPP16Constants', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('ChargePointStatusChargingStationTransitions', async () => {
    await it('should have valid station-level transitions array', () => {
      expect(OCPP16Constants.ChargePointStatusChargingStationTransitions).toBeDefined()
      expect(Array.isArray(OCPP16Constants.ChargePointStatusChargingStationTransitions)).toBe(true)
    })

    await it('should contain at least 9 station-level transitions', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      expect(transitions.length).toBe(9)
    })

    await it('should have transitions with correct structure (from/to properties)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      for (const transition of transitions) {
        expect(transition).toBeDefined()
        expect(transition.to).toBeDefined()
        if (transition.from !== undefined) {
          expect(typeof transition.from).toBe('string')
        }
        expect(typeof transition.to).toBe('string')
      }
    })

    await it('should include transition to Available (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInitialAvailable = transitions.some(t => t.to === OCPP16ChargePointStatus.Available && t.from === undefined)
      expect(hasInitialAvailable).toBe(true)
    })

    await it('should include transition to Unavailable (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInitialUnavailable = transitions.some(t => t.to === OCPP16ChargePointStatus.Unavailable && t.from === undefined)
      expect(hasInitialUnavailable).toBe(true)
    })

    await it('should include transition to Faulted (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInitialFaulted = transitions.some(t => t.to === OCPP16ChargePointStatus.Faulted && t.from === undefined)
      expect(hasInitialFaulted).toBe(true)
    })

    await it('should include Available → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Unavailable)
      expect(hasTransition).toBe(true)
    })

    await it('should include Available → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Faulted)
      expect(hasTransition).toBe(true)
    })

    await it('should include Unavailable → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.Available)
      expect(hasTransition).toBe(true)
    })

    await it('should include Unavailable → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.Faulted)
      expect(hasTransition).toBe(true)
    })

    await it('should include Faulted → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Available)
      expect(hasTransition).toBe(true)
    })

    await it('should include Faulted → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Unavailable)
      expect(hasTransition).toBe(true)
    })

    await it('should NOT include self-loop transitions (Available → Available)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasSelfLoop = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Available)
      expect(hasSelfLoop).toBe(false)
    })

    await it('should NOT include self-loop transitions (Unavailable → Unavailable)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasSelfLoop = transitions.some(t => t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.Unavailable)
      expect(hasSelfLoop).toBe(false)
    })

    await it('should NOT include self-loop transitions (Faulted → Faulted)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasSelfLoop = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Faulted)
      expect(hasSelfLoop).toBe(false)
    })

    await it('should NOT include invalid transitions (Available → Preparing)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInvalid = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Preparing)
      expect(hasInvalid).toBe(false)
    })

    await it('should NOT include invalid transitions (Available → Charging)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInvalid = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Charging)
      expect(hasInvalid).toBe(false)
    })

    await it('should NOT include invalid transitions (Available → Reserved)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      const hasInvalid = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Reserved)
      expect(hasInvalid).toBe(false)
    })

    await it('should be frozen (immutable)', () => {
      const transitions = OCPP16Constants.ChargePointStatusChargingStationTransitions
      expect(Object.isFrozen(transitions)).toBe(true)
    })
  })

  await describe('ChargePointStatusConnectorTransitions', async () => {
    await it('should have valid connector-level transitions array', () => {
      expect(OCPP16Constants.ChargePointStatusConnectorTransitions).toBeDefined()
      expect(Array.isArray(OCPP16Constants.ChargePointStatusConnectorTransitions)).toBe(true)
    })

    await it('should contain 56 connector-level transitions', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      expect(transitions.length).toBeGreaterThanOrEqual(56)
    })

    await it('should have transitions with correct structure', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      for (const transition of transitions) {
        expect(transition).toBeDefined()
        expect(transition.to).toBeDefined()
        if (transition.from !== undefined) {
          expect(typeof transition.from).toBe('string')
        }
        expect(typeof transition.to).toBe('string')
      }
    })

    await it('should include transition to Available (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInitial = transitions.some(t => t.to === OCPP16ChargePointStatus.Available && t.from === undefined)
      expect(hasInitial).toBe(true)
    })

    await it('should include transition to Unavailable (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInitial = transitions.some(t => t.to === OCPP16ChargePointStatus.Unavailable && t.from === undefined)
      expect(hasInitial).toBe(true)
    })

    await it('should include transition to Faulted (initial state)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInitial = transitions.some(t => t.to === OCPP16ChargePointStatus.Faulted && t.from === undefined)
      expect(hasInitial).toBe(true)
    })

    await it('should include Available → Preparing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Preparing)
      expect(hasTransition).toBe(true)
    })

    await it('should include Available → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Charging)
      expect(hasTransition).toBe(true)
    })

    await it('should include Available → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.SuspendedEV)
      expect(hasTransition).toBe(true)
    })

    await it('should include Available → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.SuspendedEVSE)
      expect(hasTransition).toBe(true)
    })

    await it('should include Available → Reserved transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Reserved)
      expect(hasTransition).toBe(true)
    })

    await it('should include Available → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Unavailable)
      expect(hasTransition).toBe(true)
    })

    await it('should include Available → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Faulted)
      expect(hasTransition).toBe(true)
    })

    await it('should include Preparing → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Available)
      expect(hasTransition).toBe(true)
    })

    await it('should include Preparing → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Charging)
      expect(hasTransition).toBe(true)
    })

    await it('should include Preparing → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.SuspendedEV)
      expect(hasTransition).toBe(true)
    })

    await it('should include Preparing → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.SuspendedEVSE)
      expect(hasTransition).toBe(true)
    })

    await it('should include Preparing → Finishing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Finishing)
      expect(hasTransition).toBe(true)
    })

    await it('should include Preparing → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Faulted)
      expect(hasTransition).toBe(true)
    })

    await it('should include Charging → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Available)
      expect(hasTransition).toBe(true)
    })

    await it('should include Charging → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.SuspendedEV)
      expect(hasTransition).toBe(true)
    })

    await it('should include Charging → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.SuspendedEVSE)
      expect(hasTransition).toBe(true)
    })

    await it('should include Charging → Finishing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Finishing)
      expect(hasTransition).toBe(true)
    })

    await it('should include Charging → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Unavailable)
      expect(hasTransition).toBe(true)
    })

    await it('should include Charging → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Faulted)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEV → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEV && t.to === OCPP16ChargePointStatus.Available)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEV → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEV && t.to === OCPP16ChargePointStatus.Charging)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEV → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEV && t.to === OCPP16ChargePointStatus.SuspendedEVSE)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEV → Finishing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEV && t.to === OCPP16ChargePointStatus.Finishing)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEV → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEV && t.to === OCPP16ChargePointStatus.Unavailable)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEV → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEV && t.to === OCPP16ChargePointStatus.Faulted)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEVSE → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEVSE && t.to === OCPP16ChargePointStatus.Available)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEVSE → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEVSE && t.to === OCPP16ChargePointStatus.Charging)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEVSE → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEVSE && t.to === OCPP16ChargePointStatus.SuspendedEV)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEVSE → Finishing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEVSE && t.to === OCPP16ChargePointStatus.Finishing)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEVSE → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEVSE && t.to === OCPP16ChargePointStatus.Unavailable)
      expect(hasTransition).toBe(true)
    })

    await it('should include SuspendedEVSE → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEVSE && t.to === OCPP16ChargePointStatus.Faulted)
      expect(hasTransition).toBe(true)
    })

    await it('should include Finishing → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Finishing && t.to === OCPP16ChargePointStatus.Available)
      expect(hasTransition).toBe(true)
    })

    await it('should include Finishing → Preparing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Finishing && t.to === OCPP16ChargePointStatus.Preparing)
      expect(hasTransition).toBe(true)
    })

    await it('should include Finishing → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Finishing && t.to === OCPP16ChargePointStatus.Unavailable)
      expect(hasTransition).toBe(true)
    })

    await it('should include Finishing → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Finishing && t.to === OCPP16ChargePointStatus.Faulted)
      expect(hasTransition).toBe(true)
    })

    await it('should include Reserved → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Reserved && t.to === OCPP16ChargePointStatus.Available)
      expect(hasTransition).toBe(true)
    })

    await it('should include Reserved → Preparing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Reserved && t.to === OCPP16ChargePointStatus.Preparing)
      expect(hasTransition).toBe(true)
    })

    await it('should include Reserved → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Reserved && t.to === OCPP16ChargePointStatus.Unavailable)
      expect(hasTransition).toBe(true)
    })

    await it('should include Reserved → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Reserved && t.to === OCPP16ChargePointStatus.Faulted)
      expect(hasTransition).toBe(true)
    })

    await it('should include Unavailable → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.Available)
      expect(hasTransition).toBe(true)
    })

    await it('should include Unavailable → Preparing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.Preparing)
      expect(hasTransition).toBe(true)
    })

    await it('should include Unavailable → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.Charging)
      expect(hasTransition).toBe(true)
    })

    await it('should include Unavailable → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.SuspendedEV)
      expect(hasTransition).toBe(true)
    })

    await it('should include Unavailable → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.SuspendedEVSE)
      expect(hasTransition).toBe(true)
    })

    await it('should include Unavailable → Faulted transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.Faulted)
      expect(hasTransition).toBe(true)
    })

    await it('should include Faulted → Available transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Available)
      expect(hasTransition).toBe(true)
    })

    await it('should include Faulted → Preparing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Preparing)
      expect(hasTransition).toBe(true)
    })

    await it('should include Faulted → Charging transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Charging)
      expect(hasTransition).toBe(true)
    })

    await it('should include Faulted → SuspendedEV transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.SuspendedEV)
      expect(hasTransition).toBe(true)
    })

    await it('should include Faulted → SuspendedEVSE transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.SuspendedEVSE)
      expect(hasTransition).toBe(true)
    })

    await it('should include Faulted → Finishing transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Finishing)
      expect(hasTransition).toBe(true)
    })

    await it('should include Faulted → Reserved transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Reserved)
      expect(hasTransition).toBe(true)
    })

    await it('should include Faulted → Unavailable transition', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasTransition = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Unavailable)
      expect(hasTransition).toBe(true)
    })

    await it('should NOT include invalid transition (Available → Finishing)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Finishing)
      expect(hasInvalid).toBe(false)
    })

    await it('should NOT include invalid transition (Preparing → Reserved)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(t => t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Reserved)
      expect(hasInvalid).toBe(false)
    })

    await it('should NOT include invalid transition (Charging → Preparing)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Preparing)
      expect(hasInvalid).toBe(false)
    })

    await it('should NOT include invalid transition (Charging → Reserved)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Reserved)
      expect(hasInvalid).toBe(false)
    })

    await it('should NOT include invalid transition (Reserved → Charging)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(t => t.from === OCPP16ChargePointStatus.Reserved && t.to === OCPP16ChargePointStatus.Charging)
      expect(hasInvalid).toBe(false)
    })

    await it('should NOT include invalid transition (Unavailable → Finishing)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(t => t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.Finishing)
      expect(hasInvalid).toBe(false)
    })

    await it('should NOT include invalid transition (Unavailable → Reserved)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      const hasInvalid = transitions.some(t => t.from === OCPP16ChargePointStatus.Unavailable && t.to === OCPP16ChargePointStatus.Reserved)
      expect(hasInvalid).toBe(false)
    })

    await it('should be frozen (immutable)', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions
      expect(Object.isFrozen(transitions)).toBe(true)
    })
  })

  await describe('Connector lifecycle verification', async () => {
    await it('should support complete charging lifecycle: Available → Preparing → Charging → Finishing → Available', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions

      const step1 = transitions.some(t => t.from === OCPP16ChargePointStatus.Available && t.to === OCPP16ChargePointStatus.Preparing)
      expect(step1).toBe(true)

      const step2 = transitions.some(t => t.from === OCPP16ChargePointStatus.Preparing && t.to === OCPP16ChargePointStatus.Charging)
      expect(step2).toBe(true)

      const step3 = transitions.some(t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.Finishing)
      expect(step3).toBe(true)

      const step4 = transitions.some(t => t.from === OCPP16ChargePointStatus.Finishing && t.to === OCPP16ChargePointStatus.Available)
      expect(step4).toBe(true)
    })

    await it('should support suspended state transitions during charging', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions

      const toSuspendedEV = transitions.some(t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.SuspendedEV)
      expect(toSuspendedEV).toBe(true)

      const resumeFromEV = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEV && t.to === OCPP16ChargePointStatus.Charging)
      expect(resumeFromEV).toBe(true)

      const toSuspendedEVSE = transitions.some(t => t.from === OCPP16ChargePointStatus.Charging && t.to === OCPP16ChargePointStatus.SuspendedEVSE)
      expect(toSuspendedEVSE).toBe(true)

      const resumeFromEVSE = transitions.some(t => t.from === OCPP16ChargePointStatus.SuspendedEVSE && t.to === OCPP16ChargePointStatus.Charging)
      expect(resumeFromEVSE).toBe(true)
    })

    await it('should support recovery from Faulted state to any active state', () => {
      const transitions = OCPP16Constants.ChargePointStatusConnectorTransitions

      const toAvailable = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Available)
      expect(toAvailable).toBe(true)

      const toPreparing = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Preparing)
      expect(toPreparing).toBe(true)

      const toCharging = transitions.some(t => t.from === OCPP16ChargePointStatus.Faulted && t.to === OCPP16ChargePointStatus.Charging)
      expect(toCharging).toBe(true)
    })
  })
})
