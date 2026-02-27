/**
 * @file Tests for ElectricUtils
 * @description Unit tests for electrical calculations (AC/DC power, amperage)
 */
import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { ACElectricUtils, DCElectricUtils } from '../../src/utils/ElectricUtils.js'

await describe('ElectricUtils test suite', async () => {
  await it('should verify DCElectricUtils.power()', () => {
    expect(DCElectricUtils.power(230, 1)).toBe(230)
  })
  await it('should verify DCElectricUtils.amperage()', () => {
    expect(DCElectricUtils.amperage(1, 230)).toBe(0)
  })
  await it('should verify ACElectricUtils.powerTotal()', () => {
    expect(ACElectricUtils.powerTotal(3, 230, 1)).toBe(690)
  })
  await it('should verify ACElectricUtils.powerPerPhase()', () => {
    expect(ACElectricUtils.powerPerPhase(230, 1)).toBe(230)
  })
  await it('should verify ACElectricUtils.amperageTotal()', () => {
    expect(ACElectricUtils.amperageTotal(3, 1)).toBe(3)
  })
  await it('should verify ACElectricUtils.amperageTotalFromPower()', () => {
    expect(ACElectricUtils.amperageTotalFromPower(690, 230)).toBe(3)
  })
  await it('should verify ACElectricUtils.amperagePerPhaseFromPower()', () => {
    expect(ACElectricUtils.amperagePerPhaseFromPower(3, 690, 230)).toBe(1)
  })
})
