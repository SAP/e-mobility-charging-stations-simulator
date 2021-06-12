import { MeterValueContext, MeterValueLocation, MeterValuePhase, MeterValueUnit, OCPP16MeterValueMeasurand, OCPP16SampledValue } from '../../../types/ocpp/1.6/MeterValues';

import ChargingStation from '../../ChargingStation';
import Utils from '../../../utils/Utils';
import logger from '../../../utils/Logger';

export class OCPP16ServiceUtils {
  public static checkMeasurandPowerDivider(chargingStation: ChargingStation, measurandType: OCPP16MeterValueMeasurand): void {
    if (Utils.isUndefined(chargingStation.stationInfo.powerDivider)) {
      const errMsg = `${chargingStation.logPrefix()} MeterValues measurand ${measurandType ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider is undefined`;
      logger.error(errMsg);
      throw Error(errMsg);
    } else if (chargingStation.stationInfo.powerDivider && chargingStation.stationInfo.powerDivider <= 0) {
      const errMsg = `${chargingStation.logPrefix()} MeterValues measurand ${measurandType ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider have zero or below value ${chargingStation.stationInfo.powerDivider}`;
      logger.error(errMsg);
      throw Error(errMsg);
    }
  }

  public static buildSampledValue(sampledValueTemplate: OCPP16SampledValue, value: number, context?: MeterValueContext, phase?: MeterValuePhase): OCPP16SampledValue {
    const sampledValueContext = context ?? (sampledValueTemplate.context ?? null);
    const sampledValueLocation = sampledValueTemplate.location
      ? sampledValueTemplate.location
      : (OCPP16ServiceUtils.getMeasurandDefaultLocation(sampledValueTemplate.measurand ?? null));
    const sampledValuePhase = phase ?? (sampledValueTemplate.phase ?? null);
    return {
      ...!Utils.isNullOrUndefined(sampledValueTemplate.unit) && { unit: sampledValueTemplate.unit },
      ...!Utils.isNullOrUndefined(sampledValueContext) && { context: sampledValueContext },
      ...!Utils.isNullOrUndefined(sampledValueTemplate.measurand) && { measurand: sampledValueTemplate.measurand },
      ...!Utils.isNullOrUndefined(sampledValueLocation) && { location: sampledValueLocation },
      ...!Utils.isNullOrUndefined(sampledValueTemplate.value) ? { value: sampledValueTemplate.value } : { value: value.toString() },
      ...!Utils.isNullOrUndefined(sampledValuePhase) && { phase: sampledValuePhase },
    };
  }

  public static getMeasurandDefaultUnit(measurandType: OCPP16MeterValueMeasurand): MeterValueUnit {
    switch (measurandType) {
      case OCPP16MeterValueMeasurand.CURRENT_EXPORT:
      case OCPP16MeterValueMeasurand.CURRENT_IMPORT:
      case OCPP16MeterValueMeasurand.CURRENT_OFFERED:
        return MeterValueUnit.AMP;
      case OCPP16MeterValueMeasurand.ENERGY_ACTIVE_EXPORT_REGISTER:
      case OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER:
        return MeterValueUnit.WATT_HOUR;
      case OCPP16MeterValueMeasurand.POWER_ACTIVE_EXPORT:
      case OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT:
      case OCPP16MeterValueMeasurand.POWER_OFFERED:
        return MeterValueUnit.WATT;
      case OCPP16MeterValueMeasurand.STATE_OF_CHARGE:
        return MeterValueUnit.PERCENT;
      case OCPP16MeterValueMeasurand.VOLTAGE:
        return MeterValueUnit.VOLT;
    }
  }

  public static getMeasurandDefaultLocation(measurandType: OCPP16MeterValueMeasurand): MeterValueLocation {
    switch (measurandType) {
      case OCPP16MeterValueMeasurand.STATE_OF_CHARGE:
        return MeterValueLocation.EV;
    }
  }
}
