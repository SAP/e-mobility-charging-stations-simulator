// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { ACElectricUtils, DCElectricUtils } from '../../../utils/ElectricUtils';
import { CurrentType, Voltage } from '../../../types/ChargingStationTemplate';
import MeasurandPerPhaseSampledValueTemplates, {
  SampledValueTemplate,
} from '../../../types/MeasurandPerPhaseSampledValueTemplates';
import {
  MeterValueContext,
  MeterValueLocation,
  MeterValueUnit,
  OCPP16MeterValue,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValuePhase,
  OCPP16SampledValue,
} from '../../../types/ocpp/1.6/MeterValues';

import type ChargingStation from '../../ChargingStation';
import Constants from '../../../utils/Constants';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import MeasurandValues from '../../../types/MeasurandValues';
import { OCPP16RequestCommand } from '../../../types/ocpp/1.6/Requests';
import OCPPError from '../../../exception/OCPPError';
import { RequestCommand } from '../../../types/ocpp/Requests';
import Utils from '../../../utils/Utils';
import logger from '../../../utils/Logger';

export class OCPP16ServiceUtils {
  public static checkMeasurandPowerDivider(
    chargingStation: ChargingStation,
    measurandType: OCPP16MeterValueMeasurand
  ): void {
    if (Utils.isUndefined(chargingStation.stationInfo.powerDivider)) {
      const errMsg = `${chargingStation.logPrefix()} MeterValues measurand ${
        measurandType ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      }: powerDivider is undefined`;
      logger.error(errMsg);
      throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES);
    } else if (chargingStation.stationInfo?.powerDivider <= 0) {
      const errMsg = `${chargingStation.logPrefix()} MeterValues measurand ${
        measurandType ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      }: powerDivider have zero or below value ${chargingStation.stationInfo.powerDivider}`;
      logger.error(errMsg);
      throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES);
    }
  }

  public static buildSampledValue(
    sampledValueTemplate: SampledValueTemplate,
    value: number,
    context?: MeterValueContext,
    phase?: OCPP16MeterValuePhase
  ): OCPP16SampledValue {
    const sampledValueValue = value ?? sampledValueTemplate?.value ?? null;
    const sampledValueContext = context ?? sampledValueTemplate?.context ?? null;
    const sampledValueLocation =
      sampledValueTemplate?.location ??
      OCPP16ServiceUtils.getMeasurandDefaultLocation(sampledValueTemplate?.measurand ?? null);
    const sampledValuePhase = phase ?? sampledValueTemplate?.phase ?? null;
    return {
      ...(!Utils.isNullOrUndefined(sampledValueTemplate.unit) && {
        unit: sampledValueTemplate.unit,
      }),
      ...(!Utils.isNullOrUndefined(sampledValueContext) && { context: sampledValueContext }),
      ...(!Utils.isNullOrUndefined(sampledValueTemplate.measurand) && {
        measurand: sampledValueTemplate.measurand,
      }),
      ...(!Utils.isNullOrUndefined(sampledValueLocation) && { location: sampledValueLocation }),
      ...(!Utils.isNullOrUndefined(sampledValueValue) && { value: sampledValueValue.toString() }),
      ...(!Utils.isNullOrUndefined(sampledValuePhase) && { phase: sampledValuePhase }),
    };
  }

  public static getMeasurandDefaultUnit(
    measurandType: OCPP16MeterValueMeasurand
  ): MeterValueUnit | undefined {
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

  public static getMeasurandDefaultLocation(
    measurandType: OCPP16MeterValueMeasurand
  ): MeterValueLocation | undefined {
    switch (measurandType) {
      case OCPP16MeterValueMeasurand.STATE_OF_CHARGE:
        return MeterValueLocation.EV;
    }
  }

  public static buildMeterValue(
    chargingStation: ChargingStation,
    connectorId: number,
    transactionId: number,
    interval: number,
    debug = false
  ): OCPP16MeterValue {
    const meterValue: OCPP16MeterValue = {
      timestamp: new Date().toISOString(),
      sampledValue: [],
    };
    const connector = chargingStation.getConnectorStatus(connectorId);
    // SoC measurand
    const socSampledValueTemplate = chargingStation.getSampledValueTemplate(
      connectorId,
      OCPP16MeterValueMeasurand.STATE_OF_CHARGE
    );
    if (socSampledValueTemplate) {
      const socSampledValueTemplateValue = socSampledValueTemplate.value
        ? Utils.getRandomFloatFluctuatedRounded(
            parseInt(socSampledValueTemplate.value),
            socSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
        : Utils.getRandomInteger(100);
      meterValue.sampledValue.push(
        OCPP16ServiceUtils.buildSampledValue(socSampledValueTemplate, socSampledValueTemplateValue)
      );
      const sampledValuesIndex = meterValue.sampledValue.length - 1;
      if (Utils.convertToInt(meterValue.sampledValue[sampledValuesIndex].value) > 100 || debug) {
        logger.error(
          `${chargingStation.logPrefix()} MeterValues measurand ${
            meterValue.sampledValue[sampledValuesIndex].measurand ??
            OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
          }: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${
            meterValue.sampledValue[sampledValuesIndex].value
          }/100`
        );
      }
    }
    // Voltage measurand
    const voltageSampledValueTemplate = chargingStation.getSampledValueTemplate(
      connectorId,
      OCPP16MeterValueMeasurand.VOLTAGE
    );
    if (voltageSampledValueTemplate) {
      const voltageSampledValueTemplateValue = voltageSampledValueTemplate.value
        ? parseInt(voltageSampledValueTemplate.value)
        : chargingStation.getVoltageOut();
      const fluctuationPercent =
        voltageSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT;
      const voltageMeasurandValue = Utils.getRandomFloatFluctuatedRounded(
        voltageSampledValueTemplateValue,
        fluctuationPercent
      );
      if (
        chargingStation.getNumberOfPhases() !== 3 ||
        (chargingStation.getNumberOfPhases() === 3 && chargingStation.getMainVoltageMeterValues())
      ) {
        meterValue.sampledValue.push(
          OCPP16ServiceUtils.buildSampledValue(voltageSampledValueTemplate, voltageMeasurandValue)
        );
      }
      for (
        let phase = 1;
        chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
        phase++
      ) {
        const phaseLineToNeutralValue = `L${phase}-N`;
        const voltagePhaseLineToNeutralSampledValueTemplate =
          chargingStation.getSampledValueTemplate(
            connectorId,
            OCPP16MeterValueMeasurand.VOLTAGE,
            phaseLineToNeutralValue as OCPP16MeterValuePhase
          );
        let voltagePhaseLineToNeutralMeasurandValue: number;
        if (voltagePhaseLineToNeutralSampledValueTemplate) {
          const voltagePhaseLineToNeutralSampledValueTemplateValue =
            voltagePhaseLineToNeutralSampledValueTemplate.value
              ? parseInt(voltagePhaseLineToNeutralSampledValueTemplate.value)
              : chargingStation.getVoltageOut();
          const fluctuationPhaseToNeutralPercent =
            voltagePhaseLineToNeutralSampledValueTemplate.fluctuationPercent ??
            Constants.DEFAULT_FLUCTUATION_PERCENT;
          voltagePhaseLineToNeutralMeasurandValue = Utils.getRandomFloatFluctuatedRounded(
            voltagePhaseLineToNeutralSampledValueTemplateValue,
            fluctuationPhaseToNeutralPercent
          );
        }
        meterValue.sampledValue.push(
          OCPP16ServiceUtils.buildSampledValue(
            voltagePhaseLineToNeutralSampledValueTemplate ?? voltageSampledValueTemplate,
            voltagePhaseLineToNeutralMeasurandValue ?? voltageMeasurandValue,
            null,
            phaseLineToNeutralValue as OCPP16MeterValuePhase
          )
        );
        if (chargingStation.getPhaseLineToLineVoltageMeterValues()) {
          const phaseLineToLineValue = `L${phase}-L${
            (phase + 1) % chargingStation.getNumberOfPhases() !== 0
              ? (phase + 1) % chargingStation.getNumberOfPhases()
              : chargingStation.getNumberOfPhases()
          }`;
          const voltagePhaseLineToLineSampledValueTemplate =
            chargingStation.getSampledValueTemplate(
              connectorId,
              OCPP16MeterValueMeasurand.VOLTAGE,
              phaseLineToLineValue as OCPP16MeterValuePhase
            );
          let voltagePhaseLineToLineMeasurandValue: number;
          if (voltagePhaseLineToLineSampledValueTemplate) {
            const voltagePhaseLineToLineSampledValueTemplateValue =
              voltagePhaseLineToLineSampledValueTemplate.value
                ? parseInt(voltagePhaseLineToLineSampledValueTemplate.value)
                : Voltage.VOLTAGE_400;
            const fluctuationPhaseLineToLinePercent =
              voltagePhaseLineToLineSampledValueTemplate.fluctuationPercent ??
              Constants.DEFAULT_FLUCTUATION_PERCENT;
            voltagePhaseLineToLineMeasurandValue = Utils.getRandomFloatFluctuatedRounded(
              voltagePhaseLineToLineSampledValueTemplateValue,
              fluctuationPhaseLineToLinePercent
            );
          }
          const defaultVoltagePhaseLineToLineMeasurandValue = Utils.getRandomFloatFluctuatedRounded(
            Voltage.VOLTAGE_400,
            fluctuationPercent
          );
          meterValue.sampledValue.push(
            OCPP16ServiceUtils.buildSampledValue(
              voltagePhaseLineToLineSampledValueTemplate ?? voltageSampledValueTemplate,
              voltagePhaseLineToLineMeasurandValue ?? defaultVoltagePhaseLineToLineMeasurandValue,
              null,
              phaseLineToLineValue as OCPP16MeterValuePhase
            )
          );
        }
      }
    }
    // Power.Active.Import measurand
    const powerSampledValueTemplate = chargingStation.getSampledValueTemplate(
      connectorId,
      OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT
    );
    let powerPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {};
    if (chargingStation.getNumberOfPhases() === 3) {
      powerPerPhaseSampledValueTemplates = {
        L1: chargingStation.getSampledValueTemplate(
          connectorId,
          OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          OCPP16MeterValuePhase.L1_N
        ),
        L2: chargingStation.getSampledValueTemplate(
          connectorId,
          OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          OCPP16MeterValuePhase.L2_N
        ),
        L3: chargingStation.getSampledValueTemplate(
          connectorId,
          OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          OCPP16MeterValuePhase.L3_N
        ),
      };
    }
    if (powerSampledValueTemplate) {
      OCPP16ServiceUtils.checkMeasurandPowerDivider(
        chargingStation,
        powerSampledValueTemplate.measurand
      );
      const errMsg = `${chargingStation.logPrefix()} MeterValues measurand ${
        powerSampledValueTemplate.measurand ??
        OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      }: Unknown ${chargingStation.getCurrentOutType()} currentOutType in template file ${
        chargingStation.stationTemplateFile
      }, cannot calculate ${
        powerSampledValueTemplate.measurand ??
        OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      } measurand value`;
      const powerMeasurandValues = {} as MeasurandValues;
      const unitDivider = powerSampledValueTemplate?.unit === MeterValueUnit.KILO_WATT ? 1000 : 1;
      const maxPower = Math.round(
        chargingStation.stationInfo.maxPower / chargingStation.stationInfo.powerDivider
      );
      const maxPowerPerPhase = Math.round(
        chargingStation.stationInfo.maxPower /
          chargingStation.stationInfo.powerDivider /
          chargingStation.getNumberOfPhases()
      );
      switch (chargingStation.getCurrentOutType()) {
        case CurrentType.AC:
          if (chargingStation.getNumberOfPhases() === 3) {
            const defaultFluctuatedPowerPerPhase =
              powerSampledValueTemplate.value &&
              Utils.getRandomFloatFluctuatedRounded(
                parseInt(powerSampledValueTemplate.value) / chargingStation.getNumberOfPhases(),
                powerSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase1FluctuatedValue =
              powerPerPhaseSampledValueTemplates?.L1?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                parseInt(powerPerPhaseSampledValueTemplates.L1.value),
                powerPerPhaseSampledValueTemplates.L1.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase2FluctuatedValue =
              powerPerPhaseSampledValueTemplates?.L2?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                parseInt(powerPerPhaseSampledValueTemplates.L2.value),
                powerPerPhaseSampledValueTemplates.L2.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase3FluctuatedValue =
              powerPerPhaseSampledValueTemplates?.L3?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                parseInt(powerPerPhaseSampledValueTemplates.L3.value),
                powerPerPhaseSampledValueTemplates.L3.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            powerMeasurandValues.L1 =
              phase1FluctuatedValue ??
              defaultFluctuatedPowerPerPhase ??
              Utils.getRandomFloatRounded(maxPowerPerPhase / unitDivider);
            powerMeasurandValues.L2 =
              phase2FluctuatedValue ??
              defaultFluctuatedPowerPerPhase ??
              Utils.getRandomFloatRounded(maxPowerPerPhase / unitDivider);
            powerMeasurandValues.L3 =
              phase3FluctuatedValue ??
              defaultFluctuatedPowerPerPhase ??
              Utils.getRandomFloatRounded(maxPowerPerPhase / unitDivider);
          } else {
            powerMeasurandValues.L1 = powerSampledValueTemplate.value
              ? Utils.getRandomFloatFluctuatedRounded(
                  parseInt(powerSampledValueTemplate.value),
                  powerSampledValueTemplate.fluctuationPercent ??
                    Constants.DEFAULT_FLUCTUATION_PERCENT
                )
              : Utils.getRandomFloatRounded(maxPower / unitDivider);
            powerMeasurandValues.L2 = 0;
            powerMeasurandValues.L3 = 0;
          }
          powerMeasurandValues.allPhases = Utils.roundTo(
            powerMeasurandValues.L1 + powerMeasurandValues.L2 + powerMeasurandValues.L3,
            2
          );
          break;
        case CurrentType.DC:
          powerMeasurandValues.allPhases = powerSampledValueTemplate.value
            ? Utils.getRandomFloatFluctuatedRounded(
                parseInt(powerSampledValueTemplate.value),
                powerSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              )
            : Utils.getRandomFloatRounded(maxPower / unitDivider);
          break;
        default:
          logger.error(errMsg);
          throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, OCPP16RequestCommand.METER_VALUES);
      }
      meterValue.sampledValue.push(
        OCPP16ServiceUtils.buildSampledValue(
          powerSampledValueTemplate,
          powerMeasurandValues.allPhases
        )
      );
      const sampledValuesIndex = meterValue.sampledValue.length - 1;
      const maxPowerRounded = Utils.roundTo(maxPower / unitDivider, 2);
      if (
        Utils.convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) > maxPowerRounded ||
        debug
      ) {
        logger.error(
          `${chargingStation.logPrefix()} MeterValues measurand ${
            meterValue.sampledValue[sampledValuesIndex].measurand ??
            OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
          }: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${
            meterValue.sampledValue[sampledValuesIndex].value
          }/${maxPowerRounded}`
        );
      }
      for (
        let phase = 1;
        chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
        phase++
      ) {
        const phaseValue = `L${phase}-N`;
        meterValue.sampledValue.push(
          OCPP16ServiceUtils.buildSampledValue(
            (powerPerPhaseSampledValueTemplates[`L${phase}`] as SampledValueTemplate) ??
              powerSampledValueTemplate,
            powerMeasurandValues[`L${phase}`] as number,
            null,
            phaseValue as OCPP16MeterValuePhase
          )
        );
        const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1;
        const maxPowerPerPhaseRounded = Utils.roundTo(maxPowerPerPhase / unitDivider, 2);
        if (
          Utils.convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) >
            maxPowerPerPhaseRounded ||
          debug
        ) {
          logger.error(
            `${chargingStation.logPrefix()} MeterValues measurand ${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].measurand ??
              OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
            }: phase ${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].phase
            }, connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].value
            }/${maxPowerPerPhaseRounded}`
          );
        }
      }
    }
    // Current.Import measurand
    const currentSampledValueTemplate = chargingStation.getSampledValueTemplate(
      connectorId,
      OCPP16MeterValueMeasurand.CURRENT_IMPORT
    );
    let currentPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {};
    if (chargingStation.getNumberOfPhases() === 3) {
      currentPerPhaseSampledValueTemplates = {
        L1: chargingStation.getSampledValueTemplate(
          connectorId,
          OCPP16MeterValueMeasurand.CURRENT_IMPORT,
          OCPP16MeterValuePhase.L1
        ),
        L2: chargingStation.getSampledValueTemplate(
          connectorId,
          OCPP16MeterValueMeasurand.CURRENT_IMPORT,
          OCPP16MeterValuePhase.L2
        ),
        L3: chargingStation.getSampledValueTemplate(
          connectorId,
          OCPP16MeterValueMeasurand.CURRENT_IMPORT,
          OCPP16MeterValuePhase.L3
        ),
      };
    }
    if (currentSampledValueTemplate) {
      OCPP16ServiceUtils.checkMeasurandPowerDivider(
        chargingStation,
        currentSampledValueTemplate.measurand
      );
      const errMsg = `${chargingStation.logPrefix()} MeterValues measurand ${
        currentSampledValueTemplate.measurand ??
        OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      }: Unknown ${chargingStation.getCurrentOutType()} currentOutType in template file ${
        chargingStation.stationTemplateFile
      }, cannot calculate ${
        currentSampledValueTemplate.measurand ??
        OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      } measurand value`;
      const currentMeasurandValues: MeasurandValues = {} as MeasurandValues;
      let maxAmperage: number;
      switch (chargingStation.getCurrentOutType()) {
        case CurrentType.AC:
          maxAmperage = ACElectricUtils.amperagePerPhaseFromPower(
            chargingStation.getNumberOfPhases(),
            chargingStation.stationInfo.maxPower / chargingStation.stationInfo.powerDivider,
            chargingStation.getVoltageOut()
          );
          if (chargingStation.getNumberOfPhases() === 3) {
            const defaultFluctuatedAmperagePerPhase =
              currentSampledValueTemplate.value &&
              Utils.getRandomFloatFluctuatedRounded(
                parseInt(currentSampledValueTemplate.value),
                currentSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase1FluctuatedValue =
              currentPerPhaseSampledValueTemplates?.L1?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                parseInt(currentPerPhaseSampledValueTemplates.L1.value),
                currentPerPhaseSampledValueTemplates.L1.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase2FluctuatedValue =
              currentPerPhaseSampledValueTemplates?.L2?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                parseInt(currentPerPhaseSampledValueTemplates.L2.value),
                currentPerPhaseSampledValueTemplates.L2.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase3FluctuatedValue =
              currentPerPhaseSampledValueTemplates?.L3?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                parseInt(currentPerPhaseSampledValueTemplates.L3.value),
                currentPerPhaseSampledValueTemplates.L3.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            currentMeasurandValues.L1 =
              phase1FluctuatedValue ??
              defaultFluctuatedAmperagePerPhase ??
              Utils.getRandomFloatRounded(maxAmperage);
            currentMeasurandValues.L2 =
              phase2FluctuatedValue ??
              defaultFluctuatedAmperagePerPhase ??
              Utils.getRandomFloatRounded(maxAmperage);
            currentMeasurandValues.L3 =
              phase3FluctuatedValue ??
              defaultFluctuatedAmperagePerPhase ??
              Utils.getRandomFloatRounded(maxAmperage);
          } else {
            currentMeasurandValues.L1 = currentSampledValueTemplate.value
              ? Utils.getRandomFloatFluctuatedRounded(
                  parseInt(currentSampledValueTemplate.value),
                  currentSampledValueTemplate.fluctuationPercent ??
                    Constants.DEFAULT_FLUCTUATION_PERCENT
                )
              : Utils.getRandomFloatRounded(maxAmperage);
            currentMeasurandValues.L2 = 0;
            currentMeasurandValues.L3 = 0;
          }
          currentMeasurandValues.allPhases = Utils.roundTo(
            (currentMeasurandValues.L1 + currentMeasurandValues.L2 + currentMeasurandValues.L3) /
              chargingStation.getNumberOfPhases(),
            2
          );
          break;
        case CurrentType.DC:
          maxAmperage = DCElectricUtils.amperage(
            chargingStation.stationInfo.maxPower / chargingStation.stationInfo.powerDivider,
            chargingStation.getVoltageOut()
          );
          currentMeasurandValues.allPhases = currentSampledValueTemplate.value
            ? Utils.getRandomFloatFluctuatedRounded(
                parseInt(currentSampledValueTemplate.value),
                currentSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              )
            : Utils.getRandomFloatRounded(maxAmperage);
          break;
        default:
          logger.error(errMsg);
          throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, OCPP16RequestCommand.METER_VALUES);
      }
      meterValue.sampledValue.push(
        OCPP16ServiceUtils.buildSampledValue(
          currentSampledValueTemplate,
          currentMeasurandValues.allPhases
        )
      );
      const sampledValuesIndex = meterValue.sampledValue.length - 1;
      if (
        Utils.convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) > maxAmperage ||
        debug
      ) {
        logger.error(
          `${chargingStation.logPrefix()} MeterValues measurand ${
            meterValue.sampledValue[sampledValuesIndex].measurand ??
            OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
          }: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${
            meterValue.sampledValue[sampledValuesIndex].value
          }/${maxAmperage}`
        );
      }
      for (
        let phase = 1;
        chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
        phase++
      ) {
        const phaseValue = `L${phase}`;
        meterValue.sampledValue.push(
          OCPP16ServiceUtils.buildSampledValue(
            (currentPerPhaseSampledValueTemplates[phaseValue] as SampledValueTemplate) ??
              currentSampledValueTemplate,
            currentMeasurandValues[phaseValue] as number,
            null,
            phaseValue as OCPP16MeterValuePhase
          )
        );
        const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1;
        if (
          Utils.convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) >
            maxAmperage ||
          debug
        ) {
          logger.error(
            `${chargingStation.logPrefix()} MeterValues measurand ${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].measurand ??
              OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
            }: phase ${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].phase
            }, connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].value
            }/${maxAmperage}`
          );
        }
      }
    }
    // Energy.Active.Import.Register measurand (default)
    const energySampledValueTemplate = chargingStation.getSampledValueTemplate(connectorId);
    if (energySampledValueTemplate) {
      OCPP16ServiceUtils.checkMeasurandPowerDivider(
        chargingStation,
        energySampledValueTemplate.measurand
      );
      const unitDivider =
        energySampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
      const maxEnergyRounded = Utils.roundTo(
        ((chargingStation.stationInfo.maxPower / chargingStation.stationInfo.powerDivider) *
          interval) /
          (3600 * 1000),
        2
      );
      const energyValueRounded = energySampledValueTemplate.value
        ? // Cumulate the fluctuated value around the static one
          Utils.getRandomFloatFluctuatedRounded(
            parseInt(energySampledValueTemplate.value),
            energySampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
        : Utils.getRandomFloatRounded(maxEnergyRounded);
      // Persist previous value on connector
      if (
        connector &&
        !Utils.isNullOrUndefined(connector.energyActiveImportRegisterValue) &&
        connector.energyActiveImportRegisterValue >= 0 &&
        !Utils.isNullOrUndefined(connector.transactionEnergyActiveImportRegisterValue) &&
        connector.transactionEnergyActiveImportRegisterValue >= 0
      ) {
        connector.energyActiveImportRegisterValue += energyValueRounded;
        connector.transactionEnergyActiveImportRegisterValue += energyValueRounded;
      } else {
        connector.energyActiveImportRegisterValue = 0;
        connector.transactionEnergyActiveImportRegisterValue = 0;
      }
      meterValue.sampledValue.push(
        OCPP16ServiceUtils.buildSampledValue(
          energySampledValueTemplate,
          Utils.roundTo(
            chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId) /
              unitDivider,
            2
          )
        )
      );
      const sampledValuesIndex = meterValue.sampledValue.length - 1;
      if (energyValueRounded > maxEnergyRounded || debug) {
        logger.error(
          `${chargingStation.logPrefix()} MeterValues measurand ${
            meterValue.sampledValue[sampledValuesIndex].measurand ??
            OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
          }: connectorId ${connectorId}, transaction ${
            connector.transactionId
          }, value: ${energyValueRounded}/${maxEnergyRounded}, duration: ${Utils.roundTo(
            interval / (3600 * 1000),
            4
          )}h`
        );
      }
    }
    return meterValue;
  }

  public static buildTransactionBeginMeterValue(
    chargingStation: ChargingStation,
    connectorId: number,
    meterStart: number
  ): OCPP16MeterValue {
    const meterValue: OCPP16MeterValue = {
      timestamp: new Date().toISOString(),
      sampledValue: [],
    };
    // Energy.Active.Import.Register measurand (default)
    const sampledValueTemplate = chargingStation.getSampledValueTemplate(connectorId);
    const unitDivider = sampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
    meterValue.sampledValue.push(
      OCPP16ServiceUtils.buildSampledValue(
        sampledValueTemplate,
        Utils.roundTo(meterStart / unitDivider, 4),
        MeterValueContext.TRANSACTION_BEGIN
      )
    );
    return meterValue;
  }

  public static buildTransactionEndMeterValue(
    chargingStation: ChargingStation,
    connectorId: number,
    meterStop: number
  ): OCPP16MeterValue {
    const meterValue: OCPP16MeterValue = {
      timestamp: new Date().toISOString(),
      sampledValue: [],
    };
    // Energy.Active.Import.Register measurand (default)
    const sampledValueTemplate = chargingStation.getSampledValueTemplate(connectorId);
    const unitDivider = sampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
    meterValue.sampledValue.push(
      OCPP16ServiceUtils.buildSampledValue(
        sampledValueTemplate,
        Utils.roundTo(meterStop / unitDivider, 4),
        MeterValueContext.TRANSACTION_END
      )
    );
    return meterValue;
  }

  public static buildTransactionDataMeterValues(
    transactionBeginMeterValue: OCPP16MeterValue,
    transactionEndMeterValue: OCPP16MeterValue
  ): OCPP16MeterValue[] {
    const meterValues: OCPP16MeterValue[] = [];
    meterValues.push(transactionBeginMeterValue);
    meterValues.push(transactionEndMeterValue);
    return meterValues;
  }
}
