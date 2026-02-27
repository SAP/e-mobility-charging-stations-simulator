/**
 * @file Tests for ElectricUtils
 * @description Unit tests for electrical calculations (AC/DC power, amperage)
 */
import { expect } from '@std/expect'
import { afterEach, describe, it, mock } from 'node:test'

import { ACElectricUtils, DCElectricUtils } from '../../src/utils/ElectricUtils.js'

await describe('ElectricUtils test suite', async () => {
  afterEach(() => {
    mock.restoreAll()
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
})
