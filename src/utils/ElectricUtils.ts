// Copyright Jerome Benoit. 2021. All Rights Reserved.

/**
 * Rationale: https://wiki.piment-noir.org/doku.php/en:cs:modelling_multi-phased_electrical_system_interconnexion
 */

/**
 * Targeted to AC related values calculation.
 */
export class ACElectricUtils {
  static amperageTotal(nbOfPhases: number, Iph: number): number {
    return nbOfPhases * Iph;
  }

  static powerPerPhase(V: number, Iph: number, cosPhi = 1): number {
    const powerPerPhase = V * Iph * cosPhi;
    if (cosPhi === 1) {
      return powerPerPhase;
    }
    return Math.round(powerPerPhase);
  }

  static powerTotal(nbOfPhases: number, V: number, Iph: number, cosPhi = 1): number {
    return nbOfPhases * ACElectricUtils.powerPerPhase(V, Iph, cosPhi);
  }

  static amperageTotalFromPower(P: number, V: number, cosPhi = 1): number {
    const amperage = P / (V * cosPhi);
    if (cosPhi === 1 && P % V === 0) {
      return amperage;
    }
    return Math.round(amperage);
  }

  static amperagePerPhaseFromPower(nbOfPhases: number, P: number, V: number, cosPhi = 1): number {
    const amperage = ACElectricUtils.amperageTotalFromPower(P, V, cosPhi);
    const amperagePerPhase = amperage / nbOfPhases;
    if (amperage % nbOfPhases === 0) {
      return amperagePerPhase;
    }
    return Math.round(amperagePerPhase);
  }
}

/**
 * Targeted to DC related values calculation.
 */
export class DCElectricUtils {
  static power(V: number, I: number): number {
    return V * I;
  }

  static amperage(P: number, V: number): number {
    const amperage = P / V;
    if (P % V === 0) {
      return amperage;
    }
    return Math.round(amperage);
  }
}
