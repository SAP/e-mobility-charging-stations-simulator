import { expect } from 'expect'
import { describe, it } from 'node:test'

import { ACElectricUtils, DCElectricUtils } from '../../src/utils/ElectricUtils.js'

await describe('ElectricUtils test suite', async () => {
  await it('Verify DCElectricUtils.power()', () => {
    expect(DCElectricUtils.power(230, 1)).toBe(230)
  })
  await it('Verify DCElectricUtils.amperage()', () => {
    expect(DCElectricUtils.amperage(1, 230)).toBe(0)
  })
  await it('Verify ACElectricUtils.powerTotal()', () => {
    expect(ACElectricUtils.powerTotal(3, 230, 1)).toBe(690)
  })
  await it('Verify ACElectricUtils.powerPerPhase()', () => {
    expect(ACElectricUtils.powerPerPhase(230, 1)).toBe(230)
  })
  await it('Verify ACElectricUtils.amperageTotal()', () => {
    expect(ACElectricUtils.amperageTotal(3, 1)).toBe(3)
  })
  await it('Verify ACElectricUtils.amperageTotalFromPower()', () => {
    expect(ACElectricUtils.amperageTotalFromPower(690, 230)).toBe(3)
  })
  await it('Verify ACElectricUtils.amperagePerPhaseFromPower()', () => {
    expect(ACElectricUtils.amperagePerPhaseFromPower(3, 690, 230)).toBe(1)
  })
})
