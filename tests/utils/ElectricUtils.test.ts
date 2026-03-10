/**
 * @file Tests for ElectricUtils
 * @description Unit tests for electrical calculations (AC/DC power, amperage)
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { ACElectricUtils, DCElectricUtils } from '../../src/utils/ElectricUtils.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

const COS_PHI_RESIDENTIAL = 0.85
const COS_PHI_POOR = 0.9
const COS_PHI_INDUSTRIAL = 0.95

await describe('ElectricUtils', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should calculate DC power from voltage and current', () => {
    assert.strictEqual(DCElectricUtils.power(230, 1), 230)
  })

  await it('should calculate DC amperage from power and voltage', () => {
    assert.strictEqual(DCElectricUtils.amperage(1, 230), 0)
  })

  await it('should calculate total AC power for all phases', () => {
    assert.strictEqual(ACElectricUtils.powerTotal(3, 230, 1), 690)
  })

  await it('should calculate AC power per phase', () => {
    assert.strictEqual(ACElectricUtils.powerPerPhase(230, 1), 230)
  })

  await it('should calculate total AC amperage for all phases', () => {
    assert.strictEqual(ACElectricUtils.amperageTotal(3, 1), 3)
  })

  await it('should calculate total AC amperage from power and voltage', () => {
    assert.strictEqual(ACElectricUtils.amperageTotalFromPower(690, 230), 3)
  })

  await it('should calculate AC amperage per phase from power', () => {
    assert.strictEqual(ACElectricUtils.amperagePerPhaseFromPower(3, 690, 230), 1)
  })

  await it('should return 0 for DC amperage when voltage is zero', () => {
    assert.strictEqual(DCElectricUtils.amperage(1000, 0), 0)
  })

  await it('should return 0 for AC amperage when voltage is zero', () => {
    assert.strictEqual(ACElectricUtils.amperageTotalFromPower(1000, 0), 0)
  })

  await it('should return 0 for AC amperage when cosPhi is zero', () => {
    assert.strictEqual(ACElectricUtils.amperageTotalFromPower(1000, 230, 0), 0)
  })

  await it('should return 0 for AC amperage per phase when phases is zero or negative', () => {
    assert.strictEqual(ACElectricUtils.amperagePerPhaseFromPower(0, 690, 230), 0)
    assert.strictEqual(ACElectricUtils.amperagePerPhaseFromPower(-1, 690, 230), 0)
  })

  await it('should round AC power per phase with non-unity cosPhi', () => {
    assert.strictEqual(ACElectricUtils.powerPerPhase(230, 10, COS_PHI_RESIDENTIAL), 1955)
  })

  await it('should round DC amperage when power is not evenly divisible by voltage', () => {
    assert.strictEqual(DCElectricUtils.amperage(100, 3), 33)
  })

  await it('should calculate DC power as voltage times current', () => {
    assert.strictEqual(DCElectricUtils.power(0, 10), 0)
    assert.strictEqual(DCElectricUtils.power(400, 0), 0)
  })

  await it('should calculate 7.4 kW single-phase AC home charger values', () => {
    // 230V × 32A × 1 phase × cosPhi=1 = 7360W
    assert.strictEqual(ACElectricUtils.powerPerPhase(230, 32), 7360)
    assert.strictEqual(ACElectricUtils.powerTotal(1, 230, 32), 7360)
    assert.strictEqual(ACElectricUtils.amperageTotalFromPower(7360, 230), 32)
    assert.strictEqual(ACElectricUtils.amperagePerPhaseFromPower(1, 7360, 230), 32)
  })

  await it('should calculate 22 kW three-phase AC wall box values', () => {
    // 230V × 32A × 3 phases × cosPhi=1 = 22080W
    assert.strictEqual(ACElectricUtils.powerPerPhase(230, 32), 7360)
    assert.strictEqual(ACElectricUtils.powerTotal(3, 230, 32), 22080)
    assert.strictEqual(ACElectricUtils.amperageTotalFromPower(22080, 230), 96)
    assert.strictEqual(ACElectricUtils.amperagePerPhaseFromPower(3, 22080, 230), 32)
  })

  await it('should calculate 50 kW DC fast charger values', () => {
    assert.strictEqual(DCElectricUtils.power(400, 125), 50000)
    assert.strictEqual(DCElectricUtils.amperage(50000, 400), 125)
  })

  await it('should calculate 150 kW DC high-power charger values', () => {
    assert.strictEqual(DCElectricUtils.power(500, 300), 150000)
    assert.strictEqual(DCElectricUtils.amperage(150000, 500), 300)
  })

  await it('should handle industrial cosPhi values for AC calculations', () => {
    assert.strictEqual(ACElectricUtils.powerPerPhase(230, 32, COS_PHI_INDUSTRIAL), 6992)
    assert.strictEqual(ACElectricUtils.powerTotal(3, 230, 32, COS_PHI_INDUSTRIAL), 20976)
    assert.strictEqual(ACElectricUtils.amperageTotalFromPower(6992, 230, COS_PHI_INDUSTRIAL), 32)
    assert.strictEqual(ACElectricUtils.powerPerPhase(230, 32, COS_PHI_POOR), 6624)
    assert.strictEqual(ACElectricUtils.amperageTotalFromPower(6624, 230, COS_PHI_POOR), 32)
  })
})
