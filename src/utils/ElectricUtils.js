/**
 * Targeted to AC related values calculation.
 * To use for DC, always consider cosPhi = 1 and do not use per phase helpers
 */
export default class ElectricUtils {
  static ampTotal(nbOfPhases, Iph) {
    return nbOfPhases * Iph;
  }

  static powerPerPhase(V, Iph, cosPhi = 1) {
    const powerPerPhase = V * Iph * cosPhi;
    if (cosPhi === 1) {
      return powerPerPhase;
    }
    return Math.round(powerPerPhase);
  }

  static powerTotal(nbOfPhases, V, Iph, cosPhi = 1) {
    return nbOfPhases * ElectricUtils.powerPerPhase(V, Iph, cosPhi);
  }

  static ampTotalFromPower(P, V, cosPhi = 1) {
    const power = P / (V * cosPhi);
    if (cosPhi === 1 && P % V === 0) {
      return power;
    }
    return Math.round(power);
  }

  static ampPerPhaseFromPower(nbOfPhases, P, V, cosPhi = 1) {
    const power = ElectricUtils.ampTotalFromPower(P, V, cosPhi);
    const powerPerPhase = power / nbOfPhases;
    if (power % nbOfPhases === 0) {
      return powerPerPhase;
    }
    return Math.round(powerPerPhase);
  }
}
