/**
 * @file Tests for ElectricUtils
 * @description Unit tests for electrical calculations (AC/DC power, amperage)
 */
import { expect } from '@std/expect'
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
    expect(DCElectricUtils.power(230, 1)).toBe(230)
  })

  await it('should calculate DC amperage from power and voltage', () => {
    expect(DCElectricUtils.amperage(1, 230)).toBe(0)
  })

  await it('should calculate total AC power for all phases', () => {
    expect(ACElectricUtils.powerTotal(3, 230, 1)).toBe(690)
  })

  await it('should calculate AC power per phase', () => {
    expect(ACElectricUtils.powerPerPhase(230, 1)).toBe(230)
  })

  await it('should calculate total AC amperage for all phases', () => {
    expect(ACElectricUtils.amperageTotal(3, 1)).toBe(3)
  })

  await it('should calculate total AC amperage from power and voltage', () => {
    expect(ACElectricUtils.amperageTotalFromPower(690, 230)).toBe(3)
  })

  await it('should calculate AC amperage per phase from power', () => {
    expect(ACElectricUtils.amperagePerPhaseFromPower(3, 690, 230)).toBe(1)
  })

  await it('should return 0 for DC amperage when voltage is zero', () => {
    expect(DCElectricUtils.amperage(1000, 0)).toBe(0)
  })

  await it('should return 0 for AC amperage when voltage is zero', () => {
    expect(ACElectricUtils.amperageTotalFromPower(1000, 0)).toBe(0)
  })

  await it('should return 0 for AC amperage when cosPhi is zero', () => {
    expect(ACElectricUtils.amperageTotalFromPower(1000, 230, 0)).toBe(0)
  })

  await it('should return 0 for AC amperage per phase when phases is zero or negative', () => {
    expect(ACElectricUtils.amperagePerPhaseFromPower(0, 690, 230)).toBe(0)
    expect(ACElectricUtils.amperagePerPhaseFromPower(-1, 690, 230)).toBe(0)
  })

  await it('should round AC power per phase with non-unity cosPhi', () => {
    expect(ACElectricUtils.powerPerPhase(230, 10, COS_PHI_RESIDENTIAL)).toBe(1955)
  })

  await it('should round DC amperage when power is not evenly divisible by voltage', () => {
    expect(DCElectricUtils.amperage(100, 3)).toBe(33)
  })

  await it('should calculate DC power as voltage times current', () => {
    expect(DCElectricUtils.power(0, 10)).toBe(0)
    expect(DCElectricUtils.power(400, 0)).toBe(0)
  })

  await it('should calculate 7.4 kW single-phase AC home charger values', () => {
    // 230V × 32A × 1 phase × cosPhi=1 = 7360W
    expect(ACElectricUtils.powerPerPhase(230, 32)).toBe(7360)
    expect(ACElectricUtils.powerTotal(1, 230, 32)).toBe(7360)
    expect(ACElectricUtils.amperageTotalFromPower(7360, 230)).toBe(32)
    expect(ACElectricUtils.amperagePerPhaseFromPower(1, 7360, 230)).toBe(32)
  })

  await it('should calculate 22 kW three-phase AC wall box values', () => {
    // 230V × 32A × 3 phases × cosPhi=1 = 22080W
    expect(ACElectricUtils.powerPerPhase(230, 32)).toBe(7360)
    expect(ACElectricUtils.powerTotal(3, 230, 32)).toBe(22080)
    expect(ACElectricUtils.amperageTotalFromPower(22080, 230)).toBe(96)
    expect(ACElectricUtils.amperagePerPhaseFromPower(3, 22080, 230)).toBe(32)
  })

  await it('should calculate 50 kW DC fast charger values', () => {
    expect(DCElectricUtils.power(400, 125)).toBe(50000)
    expect(DCElectricUtils.amperage(50000, 400)).toBe(125)
  })

  await it('should calculate 150 kW DC high-power charger values', () => {
    expect(DCElectricUtils.power(500, 300)).toBe(150000)
    expect(DCElectricUtils.amperage(150000, 500)).toBe(300)
  })

  await it('should handle industrial cosPhi values for AC calculations', () => {
    expect(ACElectricUtils.powerPerPhase(230, 32, COS_PHI_INDUSTRIAL)).toBe(6992)
    expect(ACElectricUtils.powerTotal(3, 230, 32, COS_PHI_INDUSTRIAL)).toBe(20976)
    expect(ACElectricUtils.amperageTotalFromPower(6992, 230, COS_PHI_INDUSTRIAL)).toBe(32)
    expect(ACElectricUtils.powerPerPhase(230, 32, COS_PHI_POOR)).toBe(6624)
    expect(ACElectricUtils.amperageTotalFromPower(6624, 230, COS_PHI_POOR)).toBe(32)
  })
})
