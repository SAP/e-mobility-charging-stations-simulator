/**
 * @file Tests for ElectricUtils
 * @description Unit tests for electrical calculations (AC/DC power, amperage)
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import { ACElectricUtils, DCElectricUtils } from '../../src/utils/ElectricUtils.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

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
    expect(ACElectricUtils.powerPerPhase(230, 10, 0.85)).toBe(1955)
  })
  await it('should round DC amperage when power is not evenly divisible by voltage', () => {
    expect(DCElectricUtils.amperage(100, 3)).toBe(33)
  })
  await it('should calculate DC power as voltage times current', () => {
    expect(DCElectricUtils.power(0, 10)).toBe(0)
    expect(DCElectricUtils.power(400, 0)).toBe(0)
  })
})
