// Copyright Jerome Benoit. 2021-2024. All Rights Reserved.

/**
 * Rationale: https://wiki.piment-noir.org/doku.php/en:cs:modelling_multi-phased_electrical_system_interconnexion
 */

/**
 * Targeted to AC related values calculation.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ACElectricUtils {
  private constructor () {
    // This is intentional
  }

  static amperagePerPhaseFromPower (nbOfPhases: number, P: number, V: number, cosPhi = 1): number {
    if (nbOfPhases <= 0) {
      return 0
    }
    const amperage = ACElectricUtils.amperageTotalFromPower(P, V, cosPhi)
    const amperagePerPhase = amperage / nbOfPhases
    if (amperage % nbOfPhases === 0) {
      return amperagePerPhase
    }
    return Math.round(amperagePerPhase)
  }

  static amperageTotal (nbOfPhases: number, Iph: number): number {
    return nbOfPhases * Iph
  }

  static amperageTotalFromPower (P: number, V: number, cosPhi = 1): number {
    if (V === 0 || cosPhi === 0) {
      return 0
    }
    const amperage = P / (V * cosPhi)
    if (cosPhi === 1 && P % V === 0) {
      return amperage
    }
    return Math.round(amperage)
  }

  static powerPerPhase (V: number, Iph: number, cosPhi = 1): number {
    const powerPerPhase = V * Iph * cosPhi
    if (cosPhi === 1) {
      return powerPerPhase
    }
    return Math.round(powerPerPhase)
  }

  static powerTotal (nbOfPhases: number, V: number, Iph: number, cosPhi = 1): number {
    return nbOfPhases * ACElectricUtils.powerPerPhase(V, Iph, cosPhi)
  }
}

/**
 * Targeted to DC related values calculation.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DCElectricUtils {
  private constructor () {
    // This is intentional
  }

  static amperage (P: number, V: number): number {
    if (V === 0) {
      return 0
    }
    const amperage = P / V
    if (P % V === 0) {
      return amperage
    }
    return Math.round(amperage)
  }

  static power (V: number, I: number): number {
    return V * I
  }
}
