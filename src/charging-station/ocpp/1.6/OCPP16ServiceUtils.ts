// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import OCPPError from '../../../exception/OCPPError';
import { CurrentType, Voltage } from '../../../types/ChargingStationTemplate';
import type {
  MeasurandPerPhaseSampledValueTemplates,
  SampledValueTemplate,
} from '../../../types/MeasurandPerPhaseSampledValueTemplates';
import type { MeasurandValues } from '../../../types/MeasurandValues';
import type { OCPP16ChargingProfile } from '../../../types/ocpp/1.6/ChargingProfile';
import {
  OCPP16StandardParametersKey,
  OCPP16SupportedFeatureProfiles,
} from '../../../types/ocpp/1.6/Configuration';
import {
  MeterValueContext,
  MeterValueLocation,
  MeterValueUnit,
  OCPP16MeterValue,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValuePhase,
  OCPP16SampledValue,
} from '../../../types/ocpp/1.6/MeterValues';
import {
  OCPP16IncomingRequestCommand,
  OCPP16RequestCommand,
} from '../../../types/ocpp/1.6/Requests';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import Constants from '../../../utils/Constants';
import { ACElectricUtils, DCElectricUtils } from '../../../utils/ElectricUtils';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';
import type ChargingStation from '../../ChargingStation';
import { OCPPServiceUtils } from '../OCPPServiceUtils';

export class OCPP16ServiceUtils extends OCPPServiceUtils {
  public static checkFeatureProfile(
    chargingStation: ChargingStation,
    featureProfile: OCPP16SupportedFeatureProfiles,
    command: OCPP16RequestCommand | OCPP16IncomingRequestCommand
  ): boolean {
    if (!chargingStation.hasFeatureProfile(featureProfile)) {
      logger.warn(
        `${chargingStation.logPrefix()} Trying to '${command}' without '${featureProfile}' feature enabled in ${
          OCPP16StandardParametersKey.SupportedFeatureProfiles
        } in configuration`
      );
      return false;
    }
    return true;
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
    const socSampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
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
    const voltageSampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
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
          OCPP16ServiceUtils.getSampledValueTemplate(
            chargingStation,
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
            OCPP16ServiceUtils.getSampledValueTemplate(
              chargingStation,
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
    const powerSampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId,
      OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT
    );
    let powerPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {};
    if (chargingStation.getNumberOfPhases() === 3) {
      powerPerPhaseSampledValueTemplates = {
        L1: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
          connectorId,
          OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          OCPP16MeterValuePhase.L1_N
        ),
        L2: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
          connectorId,
          OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          OCPP16MeterValuePhase.L2_N
        ),
        L3: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
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
      const errMsg = `MeterValues measurand ${
        powerSampledValueTemplate.measurand ??
        OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      }: Unknown ${chargingStation.getCurrentOutType()} currentOutType in template file ${
        chargingStation.templateFile
      }, cannot calculate ${
        powerSampledValueTemplate.measurand ??
        OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      } measurand value`;
      const powerMeasurandValues = {} as MeasurandValues;
      const unitDivider = powerSampledValueTemplate?.unit === MeterValueUnit.KILO_WATT ? 1000 : 1;
      const connectorMaximumAvailablePower =
        chargingStation.getConnectorMaximumAvailablePower(connectorId);
      const connectorMaximumPower = Math.round(connectorMaximumAvailablePower);
      const connectorMaximumPowerPerPhase = Math.round(
        connectorMaximumAvailablePower / chargingStation.getNumberOfPhases()
      );
      switch (chargingStation.getCurrentOutType()) {
        case CurrentType.AC:
          if (chargingStation.getNumberOfPhases() === 3) {
            const defaultFluctuatedPowerPerPhase =
              powerSampledValueTemplate.value &&
              Utils.getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  powerSampledValueTemplate.value,
                  connectorMaximumPower / unitDivider,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                ) / chargingStation.getNumberOfPhases(),
                powerSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase1FluctuatedValue =
              powerPerPhaseSampledValueTemplates?.L1?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  powerPerPhaseSampledValueTemplates.L1.value,
                  connectorMaximumPowerPerPhase / unitDivider,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                ),
                powerPerPhaseSampledValueTemplates.L1.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase2FluctuatedValue =
              powerPerPhaseSampledValueTemplates?.L2?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  powerPerPhaseSampledValueTemplates.L2.value,
                  connectorMaximumPowerPerPhase / unitDivider,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                ),
                powerPerPhaseSampledValueTemplates.L2.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase3FluctuatedValue =
              powerPerPhaseSampledValueTemplates?.L3?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  powerPerPhaseSampledValueTemplates.L3.value,
                  connectorMaximumPowerPerPhase / unitDivider,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                ),
                powerPerPhaseSampledValueTemplates.L3.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            powerMeasurandValues.L1 =
              phase1FluctuatedValue ??
              defaultFluctuatedPowerPerPhase ??
              Utils.getRandomFloatRounded(connectorMaximumPowerPerPhase / unitDivider);
            powerMeasurandValues.L2 =
              phase2FluctuatedValue ??
              defaultFluctuatedPowerPerPhase ??
              Utils.getRandomFloatRounded(connectorMaximumPowerPerPhase / unitDivider);
            powerMeasurandValues.L3 =
              phase3FluctuatedValue ??
              defaultFluctuatedPowerPerPhase ??
              Utils.getRandomFloatRounded(connectorMaximumPowerPerPhase / unitDivider);
          } else {
            powerMeasurandValues.L1 = powerSampledValueTemplate.value
              ? Utils.getRandomFloatFluctuatedRounded(
                  OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                    powerSampledValueTemplate.value,
                    connectorMaximumPower / unitDivider,
                    { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                  ),
                  powerSampledValueTemplate.fluctuationPercent ??
                    Constants.DEFAULT_FLUCTUATION_PERCENT
                )
              : Utils.getRandomFloatRounded(connectorMaximumPower / unitDivider);
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
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  powerSampledValueTemplate.value,
                  connectorMaximumPower / unitDivider,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                ),
                powerSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              )
            : Utils.getRandomFloatRounded(connectorMaximumPower / unitDivider);
          break;
        default:
          logger.error(`${chargingStation.logPrefix()} ${errMsg}`);
          throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, OCPP16RequestCommand.METER_VALUES);
      }
      meterValue.sampledValue.push(
        OCPP16ServiceUtils.buildSampledValue(
          powerSampledValueTemplate,
          powerMeasurandValues.allPhases
        )
      );
      const sampledValuesIndex = meterValue.sampledValue.length - 1;
      const connectorMaximumPowerRounded = Utils.roundTo(connectorMaximumPower / unitDivider, 2);
      if (
        Utils.convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) >
          connectorMaximumPowerRounded ||
        debug
      ) {
        logger.error(
          `${chargingStation.logPrefix()} MeterValues measurand ${
            meterValue.sampledValue[sampledValuesIndex].measurand ??
            OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
          }: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${
            meterValue.sampledValue[sampledValuesIndex].value
          }/${connectorMaximumPowerRounded}`
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
        const connectorMaximumPowerPerPhaseRounded = Utils.roundTo(
          connectorMaximumPowerPerPhase / unitDivider,
          2
        );
        if (
          Utils.convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) >
            connectorMaximumPowerPerPhaseRounded ||
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
            }/${connectorMaximumPowerPerPhaseRounded}`
          );
        }
      }
    }
    // Current.Import measurand
    const currentSampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId,
      OCPP16MeterValueMeasurand.CURRENT_IMPORT
    );
    let currentPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {};
    if (chargingStation.getNumberOfPhases() === 3) {
      currentPerPhaseSampledValueTemplates = {
        L1: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
          connectorId,
          OCPP16MeterValueMeasurand.CURRENT_IMPORT,
          OCPP16MeterValuePhase.L1
        ),
        L2: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
          connectorId,
          OCPP16MeterValueMeasurand.CURRENT_IMPORT,
          OCPP16MeterValuePhase.L2
        ),
        L3: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
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
      const errMsg = `MeterValues measurand ${
        currentSampledValueTemplate.measurand ??
        OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      }: Unknown ${chargingStation.getCurrentOutType()} currentOutType in template file ${
        chargingStation.templateFile
      }, cannot calculate ${
        currentSampledValueTemplate.measurand ??
        OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      } measurand value`;
      const currentMeasurandValues: MeasurandValues = {} as MeasurandValues;
      const connectorMaximumAvailablePower =
        chargingStation.getConnectorMaximumAvailablePower(connectorId);
      let connectorMaximumAmperage: number;
      switch (chargingStation.getCurrentOutType()) {
        case CurrentType.AC:
          connectorMaximumAmperage = ACElectricUtils.amperagePerPhaseFromPower(
            chargingStation.getNumberOfPhases(),
            connectorMaximumAvailablePower,
            chargingStation.getVoltageOut()
          );
          if (chargingStation.getNumberOfPhases() === 3) {
            const defaultFluctuatedAmperagePerPhase =
              currentSampledValueTemplate.value &&
              Utils.getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  currentSampledValueTemplate.value,
                  connectorMaximumAmperage,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                ),
                currentSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase1FluctuatedValue =
              currentPerPhaseSampledValueTemplates?.L1?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  currentPerPhaseSampledValueTemplates.L1.value,
                  connectorMaximumAmperage,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                ),
                currentPerPhaseSampledValueTemplates.L1.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase2FluctuatedValue =
              currentPerPhaseSampledValueTemplates?.L2?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  currentPerPhaseSampledValueTemplates.L2.value,
                  connectorMaximumAmperage,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                ),
                currentPerPhaseSampledValueTemplates.L2.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            const phase3FluctuatedValue =
              currentPerPhaseSampledValueTemplates?.L3?.value &&
              Utils.getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  currentPerPhaseSampledValueTemplates.L3.value,
                  connectorMaximumAmperage,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                ),
                currentPerPhaseSampledValueTemplates.L3.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              );
            currentMeasurandValues.L1 =
              phase1FluctuatedValue ??
              defaultFluctuatedAmperagePerPhase ??
              Utils.getRandomFloatRounded(connectorMaximumAmperage);
            currentMeasurandValues.L2 =
              phase2FluctuatedValue ??
              defaultFluctuatedAmperagePerPhase ??
              Utils.getRandomFloatRounded(connectorMaximumAmperage);
            currentMeasurandValues.L3 =
              phase3FluctuatedValue ??
              defaultFluctuatedAmperagePerPhase ??
              Utils.getRandomFloatRounded(connectorMaximumAmperage);
          } else {
            currentMeasurandValues.L1 = currentSampledValueTemplate.value
              ? Utils.getRandomFloatFluctuatedRounded(
                  OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                    currentSampledValueTemplate.value,
                    connectorMaximumAmperage,
                    { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                  ),
                  currentSampledValueTemplate.fluctuationPercent ??
                    Constants.DEFAULT_FLUCTUATION_PERCENT
                )
              : Utils.getRandomFloatRounded(connectorMaximumAmperage);
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
          connectorMaximumAmperage = DCElectricUtils.amperage(
            connectorMaximumAvailablePower,
            chargingStation.getVoltageOut()
          );
          currentMeasurandValues.allPhases = currentSampledValueTemplate.value
            ? Utils.getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  currentSampledValueTemplate.value,
                  connectorMaximumAmperage,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() }
                ),
                currentSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT
              )
            : Utils.getRandomFloatRounded(connectorMaximumAmperage);
          break;
        default:
          logger.error(`${chargingStation.logPrefix()} ${errMsg}`);
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
        Utils.convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) >
          connectorMaximumAmperage ||
        debug
      ) {
        logger.error(
          `${chargingStation.logPrefix()} MeterValues measurand ${
            meterValue.sampledValue[sampledValuesIndex].measurand ??
            OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
          }: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${
            meterValue.sampledValue[sampledValuesIndex].value
          }/${connectorMaximumAmperage}`
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
            connectorMaximumAmperage ||
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
            }/${connectorMaximumAmperage}`
          );
        }
      }
    }
    // Energy.Active.Import.Register measurand (default)
    const energySampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId
    );
    if (energySampledValueTemplate) {
      OCPP16ServiceUtils.checkMeasurandPowerDivider(
        chargingStation,
        energySampledValueTemplate.measurand
      );
      const unitDivider =
        energySampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
      const connectorMaximumAvailablePower =
        chargingStation.getConnectorMaximumAvailablePower(connectorId);
      const connectorMaximumEnergyRounded = Utils.roundTo(
        (connectorMaximumAvailablePower * interval) / (3600 * 1000),
        2
      );
      const energyValueRounded = energySampledValueTemplate.value
        ? // Cumulate the fluctuated value around the static one
          Utils.getRandomFloatFluctuatedRounded(
            OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
              energySampledValueTemplate.value,
              connectorMaximumEnergyRounded,
              {
                limitationEnabled: chargingStation.getCustomValueLimitationMeterValues(),
                unitMultiplier: unitDivider,
              }
            ),
            energySampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT
          )
        : Utils.getRandomFloatRounded(connectorMaximumEnergyRounded);
      // Persist previous value on connector
      if (
        connector &&
        Utils.isNullOrUndefined(connector.energyActiveImportRegisterValue) === false &&
        connector.energyActiveImportRegisterValue >= 0 &&
        Utils.isNullOrUndefined(connector.transactionEnergyActiveImportRegisterValue) === false &&
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
      if (energyValueRounded > connectorMaximumEnergyRounded || debug) {
        logger.error(
          `${chargingStation.logPrefix()} MeterValues measurand ${
            meterValue.sampledValue[sampledValuesIndex].measurand ??
            OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
          }: connectorId ${connectorId}, transaction ${
            connector.transactionId
          }, value: ${energyValueRounded}/${connectorMaximumEnergyRounded}, duration: ${Utils.roundTo(
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
    const sampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId
    );
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
    const sampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId
    );
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

  public static setChargingProfile(
    chargingStation: ChargingStation,
    connectorId: number,
    cp: OCPP16ChargingProfile
  ): void {
    if (Utils.isNullOrUndefined(chargingStation.getConnectorStatus(connectorId).chargingProfiles)) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set a charging profile on connectorId ${connectorId} with an uninitialized charging profiles array attribute, applying deferred initialization`
      );
      chargingStation.getConnectorStatus(connectorId).chargingProfiles = [];
    }
    if (Array.isArray(chargingStation.getConnectorStatus(connectorId).chargingProfiles) === false) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set a charging profile on connectorId ${connectorId} with an improper attribute type for the charging profiles array, applying proper type initialization`
      );
      chargingStation.getConnectorStatus(connectorId).chargingProfiles = [];
    }
    let cpReplaced = false;
    if (!Utils.isEmptyArray(chargingStation.getConnectorStatus(connectorId).chargingProfiles)) {
      chargingStation
        .getConnectorStatus(connectorId)
        .chargingProfiles?.forEach((chargingProfile: OCPP16ChargingProfile, index: number) => {
          if (
            chargingProfile.chargingProfileId === cp.chargingProfileId ||
            (chargingProfile.stackLevel === cp.stackLevel &&
              chargingProfile.chargingProfilePurpose === cp.chargingProfilePurpose)
          ) {
            chargingStation.getConnectorStatus(connectorId).chargingProfiles[index] = cp;
            cpReplaced = true;
          }
        });
    }
    !cpReplaced && chargingStation.getConnectorStatus(connectorId).chargingProfiles?.push(cp);
  }

  private static buildSampledValue(
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

  private static checkMeasurandPowerDivider(
    chargingStation: ChargingStation,
    measurandType: OCPP16MeterValueMeasurand
  ): void {
    if (Utils.isUndefined(chargingStation.powerDivider)) {
      const errMsg = `MeterValues measurand ${
        measurandType ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      }: powerDivider is undefined`;
      logger.error(`${chargingStation.logPrefix()} ${errMsg}`);
      throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, OCPP16RequestCommand.METER_VALUES);
    } else if (chargingStation?.powerDivider <= 0) {
      const errMsg = `MeterValues measurand ${
        measurandType ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
      }: powerDivider have zero or below value ${chargingStation.powerDivider}`;
      logger.error(`${chargingStation.logPrefix()} ${errMsg}`);
      throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, OCPP16RequestCommand.METER_VALUES);
    }
  }

  private static getMeasurandDefaultLocation(
    measurandType: OCPP16MeterValueMeasurand
  ): MeterValueLocation | undefined {
    switch (measurandType) {
      case OCPP16MeterValueMeasurand.STATE_OF_CHARGE:
        return MeterValueLocation.EV;
    }
  }

  private static getMeasurandDefaultUnit(
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
}
