// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { MeterValueContext, MeterValueLocation, MeterValueUnit, OCPP16MeterValue, OCPP16MeterValueMeasurand, OCPP16MeterValuePhase, OCPP16SampledValue } from '../../../types/ocpp/1.6/MeterValues';

import ChargingStation from '../../ChargingStation';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import OCPPError from '../OCPPError';
import { RequestCommand } from '../../../types/ocpp/Requests';
import { SampledValueTemplate } from '../../../types/Connectors';
import Utils from '../../../utils/Utils';
import logger from '../../../utils/Logger';

export class OCPP16ServiceUtils {
  public static checkMeasurandPowerDivider(chargingStation: ChargingStation, measurandType: OCPP16MeterValueMeasurand): void {
    if (Utils.isUndefined(chargingStation.stationInfo.powerDivider)) {
      const errMsg = `${chargingStation.logPrefix()} MeterValues measurand ${measurandType ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider is undefined`;
      logger.error(errMsg);
      throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES);
    } else if (chargingStation.stationInfo?.powerDivider <= 0) {
      const errMsg = `${chargingStation.logPrefix()} MeterValues measurand ${measurandType ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider have zero or below value ${chargingStation.stationInfo.powerDivider}`;
      logger.error(errMsg);
      throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES);
    }
  }

  public static buildSampledValue(sampledValueTemplate: SampledValueTemplate, value: number, context?: MeterValueContext, phase?: OCPP16MeterValuePhase): OCPP16SampledValue {
    const sampledValueValue = value ?? (sampledValueTemplate?.value ?? null);
    const sampledValueContext = context ?? (sampledValueTemplate?.context ?? null);
    const sampledValueLocation = sampledValueTemplate?.location ?? OCPP16ServiceUtils.getMeasurandDefaultLocation(sampledValueTemplate?.measurand ?? null);
    const sampledValuePhase = phase ?? (sampledValueTemplate?.phase ?? null);
    return {
      ...!Utils.isNullOrUndefined(sampledValueTemplate.unit) && { unit: sampledValueTemplate.unit },
      ...!Utils.isNullOrUndefined(sampledValueContext) && { context: sampledValueContext },
      ...!Utils.isNullOrUndefined(sampledValueTemplate.measurand) && { measurand: sampledValueTemplate.measurand },
      ...!Utils.isNullOrUndefined(sampledValueLocation) && { location: sampledValueLocation },
      ...!Utils.isNullOrUndefined(sampledValueValue) && { value: sampledValueValue.toString() },
      ...!Utils.isNullOrUndefined(sampledValuePhase) && { phase: sampledValuePhase },
    };
  }

  public static getMeasurandDefaultUnit(measurandType: OCPP16MeterValueMeasurand): MeterValueUnit | undefined {
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

  public static getMeasurandDefaultLocation(measurandType: OCPP16MeterValueMeasurand): MeterValueLocation | undefined {
    switch (measurandType) {
      case OCPP16MeterValueMeasurand.STATE_OF_CHARGE:
        return MeterValueLocation.EV;
    }
  }

  public static buildTransactionBeginMeterValue(chargingStation: ChargingStation, connectorId: number, meterBegin: number): OCPP16MeterValue {
    const meterValue: OCPP16MeterValue = {
      timestamp: new Date().toISOString(),
      sampledValue: [],
    };
    // Energy.Active.Import.Register measurand (default)
    const sampledValueTemplate = chargingStation.getSampledValueTemplate(connectorId);
    const unitDivider = sampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
    meterValue.sampledValue.push(OCPP16ServiceUtils.buildSampledValue(sampledValueTemplate, Utils.roundTo(meterBegin / unitDivider, 4), MeterValueContext.TRANSACTION_BEGIN));
    return meterValue;
  }

  public static buildTransactionEndMeterValue(chargingStation: ChargingStation, connectorId: number, meterEnd: number): OCPP16MeterValue {
    const meterValue: OCPP16MeterValue = {
      timestamp: new Date().toISOString(),
      sampledValue: [],
    };
    // Energy.Active.Import.Register measurand (default)
    const sampledValueTemplate = chargingStation.getSampledValueTemplate(connectorId);
    const unitDivider = sampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
    meterValue.sampledValue.push(OCPP16ServiceUtils.buildSampledValue(sampledValueTemplate, Utils.roundTo(meterEnd / unitDivider, 4), MeterValueContext.TRANSACTION_END));
    return meterValue;
  }

  public static buildTransactionDataMeterValues(transactionBeginMeterValue: OCPP16MeterValue, transactionEndMeterValue: OCPP16MeterValue): OCPP16MeterValue[] {
    const meterValues: OCPP16MeterValue[] = [];
    meterValues.push(transactionBeginMeterValue);
    meterValues.push(transactionEndMeterValue);
    return meterValues;
  }
}
