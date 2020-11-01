/**
 * Targeted to AC related values calculation.
 * To use for DC, always consider cosPhi = 1 and do not use per phase helpers
 */
export default class ElectricUtils {
  static ampTotal(nbOfPhases: number, Iph: number): number {
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
    return nbOfPhases * ElectricUtils.powerPerPhase(V, Iph, cosPhi);
  }

  static ampTotalFromPower(P: number, V: number, cosPhi = 1): number {
    const power = P / (V * cosPhi);
    if (cosPhi === 1 && P % V === 0) {
      return power;
    }
    return Math.round(power);
  }

  static ampPerPhaseFromPower(nbOfPhases: number, P: number, V: number, cosPhi = 1): number {
    const power = ElectricUtils.ampTotalFromPower(P, V, cosPhi);
    const powerPerPhase = power / nbOfPhases;
    if (power % nbOfPhases === 0) {
      return powerPerPhase;
    }
    return Math.round(powerPerPhase);
  }
}
