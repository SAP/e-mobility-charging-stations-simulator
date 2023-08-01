// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import type { JSONSchemaType } from 'ajv';

import { OCPP16Constants } from './OCPP16Constants';
import {
  type ChargingStation,
  hasFeatureProfile,
  hasReservationExpired,
} from '../../../charging-station';
import { OCPPError } from '../../../exception';
import {
  type ClearChargingProfileRequest,
  CurrentType,
  ErrorType,
  type GenericResponse,
  type JsonType,
  type MeasurandPerPhaseSampledValueTemplates,
  type MeasurandValues,
  MeterValueContext,
  MeterValueLocation,
  MeterValueUnit,
  OCPP16AuthorizationStatus,
  OCPP16AvailabilityType,
  type OCPP16ChangeAvailabilityResponse,
  OCPP16ChargePointStatus,
  type OCPP16ChargingProfile,
  type OCPP16IncomingRequestCommand,
  type OCPP16MeterValue,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValuePhase,
  OCPP16RequestCommand,
  type OCPP16SampledValue,
  OCPP16StandardParametersKey,
  OCPP16StopTransactionReason,
  type OCPP16SupportedFeatureProfiles,
  OCPPVersion,
  type SampledValueTemplate,
  Voltage,
} from '../../../types';
import {
  ACElectricUtils,
  Constants,
  DCElectricUtils,
  convertToFloat,
  convertToInt,
  getRandomFloatFluctuatedRounded,
  getRandomFloatRounded,
  getRandomInteger,
  isNotEmptyArray,
  isNullOrUndefined,
  isUndefined,
  logger,
  roundTo,
} from '../../../utils';
import { OCPPServiceUtils } from '../OCPPServiceUtils';

export class OCPP16ServiceUtils extends OCPPServiceUtils {
  public static checkFeatureProfile(
    chargingStation: ChargingStation,
    featureProfile: OCPP16SupportedFeatureProfiles,
    command: OCPP16RequestCommand | OCPP16IncomingRequestCommand,
  ): boolean {
    if (!hasFeatureProfile(chargingStation, featureProfile)) {
      logger.warn(
        `${chargingStation.logPrefix()} Trying to '${command}' without '${featureProfile}' feature enabled in ${
          OCPP16StandardParametersKey.SupportedFeatureProfiles
        } in configuration`,
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
    debug = false,
  ): OCPP16MeterValue {
    const meterValue: OCPP16MeterValue = {
      timestamp: new Date(),
      sampledValue: [],
    };
    const connector = chargingStation.getConnectorStatus(connectorId);
    // SoC measurand
    const socSampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId,
      OCPP16MeterValueMeasurand.STATE_OF_CHARGE,
    );
    if (socSampledValueTemplate) {
      const socMaximumValue = 100;
      const socMinimumValue = socSampledValueTemplate.minimumValue ?? 0;
      const socSampledValueTemplateValue = socSampledValueTemplate.value
        ? getRandomFloatFluctuatedRounded(
            parseInt(socSampledValueTemplate.value),
            socSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT,
          )
        : getRandomInteger(socMaximumValue, socMinimumValue);
      meterValue.sampledValue.push(
        OCPP16ServiceUtils.buildSampledValue(socSampledValueTemplate, socSampledValueTemplateValue),
      );
      const sampledValuesIndex = meterValue.sampledValue.length - 1;
      if (
        convertToInt(meterValue.sampledValue[sampledValuesIndex].value) > socMaximumValue ||
        convertToInt(meterValue.sampledValue[sampledValuesIndex].value) < socMinimumValue ||
        debug
      ) {
        logger.error(
          `${chargingStation.logPrefix()} MeterValues measurand ${
            meterValue.sampledValue[sampledValuesIndex].measurand ??
            OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
          }: connector id ${connectorId}, transaction id ${connector?.transactionId}, value: ${socMinimumValue}/${
            meterValue.sampledValue[sampledValuesIndex].value
          }/${socMaximumValue}}`,
        );
      }
    }
    // Voltage measurand
    const voltageSampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId,
      OCPP16MeterValueMeasurand.VOLTAGE,
    );
    if (voltageSampledValueTemplate) {
      const voltageSampledValueTemplateValue = voltageSampledValueTemplate.value
        ? parseInt(voltageSampledValueTemplate.value)
        : chargingStation.getVoltageOut();
      const fluctuationPercent =
        voltageSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT;
      const voltageMeasurandValue = getRandomFloatFluctuatedRounded(
        voltageSampledValueTemplateValue,
        fluctuationPercent,
      );
      if (
        chargingStation.getNumberOfPhases() !== 3 ||
        (chargingStation.getNumberOfPhases() === 3 && chargingStation.getMainVoltageMeterValues())
      ) {
        meterValue.sampledValue.push(
          OCPP16ServiceUtils.buildSampledValue(voltageSampledValueTemplate, voltageMeasurandValue),
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
            phaseLineToNeutralValue as OCPP16MeterValuePhase,
          );
        let voltagePhaseLineToNeutralMeasurandValue: number | undefined;
        if (voltagePhaseLineToNeutralSampledValueTemplate) {
          const voltagePhaseLineToNeutralSampledValueTemplateValue =
            voltagePhaseLineToNeutralSampledValueTemplate.value
              ? parseInt(voltagePhaseLineToNeutralSampledValueTemplate.value)
              : chargingStation.getVoltageOut();
          const fluctuationPhaseToNeutralPercent =
            voltagePhaseLineToNeutralSampledValueTemplate.fluctuationPercent ??
            Constants.DEFAULT_FLUCTUATION_PERCENT;
          voltagePhaseLineToNeutralMeasurandValue = getRandomFloatFluctuatedRounded(
            voltagePhaseLineToNeutralSampledValueTemplateValue,
            fluctuationPhaseToNeutralPercent,
          );
        }
        meterValue.sampledValue.push(
          OCPP16ServiceUtils.buildSampledValue(
            voltagePhaseLineToNeutralSampledValueTemplate ?? voltageSampledValueTemplate,
            voltagePhaseLineToNeutralMeasurandValue ?? voltageMeasurandValue,
            undefined,
            phaseLineToNeutralValue as OCPP16MeterValuePhase,
          ),
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
              phaseLineToLineValue as OCPP16MeterValuePhase,
            );
          let voltagePhaseLineToLineMeasurandValue: number | undefined;
          if (voltagePhaseLineToLineSampledValueTemplate) {
            const voltagePhaseLineToLineSampledValueTemplateValue =
              voltagePhaseLineToLineSampledValueTemplate.value
                ? parseInt(voltagePhaseLineToLineSampledValueTemplate.value)
                : Voltage.VOLTAGE_400;
            const fluctuationPhaseLineToLinePercent =
              voltagePhaseLineToLineSampledValueTemplate.fluctuationPercent ??
              Constants.DEFAULT_FLUCTUATION_PERCENT;
            voltagePhaseLineToLineMeasurandValue = getRandomFloatFluctuatedRounded(
              voltagePhaseLineToLineSampledValueTemplateValue,
              fluctuationPhaseLineToLinePercent,
            );
          }
          const defaultVoltagePhaseLineToLineMeasurandValue = getRandomFloatFluctuatedRounded(
            Voltage.VOLTAGE_400,
            fluctuationPercent,
          );
          meterValue.sampledValue.push(
            OCPP16ServiceUtils.buildSampledValue(
              voltagePhaseLineToLineSampledValueTemplate ?? voltageSampledValueTemplate,
              voltagePhaseLineToLineMeasurandValue ?? defaultVoltagePhaseLineToLineMeasurandValue,
              undefined,
              phaseLineToLineValue as OCPP16MeterValuePhase,
            ),
          );
        }
      }
    }
    // Power.Active.Import measurand
    const powerSampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId,
      OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT,
    );
    let powerPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {};
    if (chargingStation.getNumberOfPhases() === 3) {
      powerPerPhaseSampledValueTemplates = {
        L1: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
          connectorId,
          OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          OCPP16MeterValuePhase.L1_N,
        ),
        L2: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
          connectorId,
          OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          OCPP16MeterValuePhase.L2_N,
        ),
        L3: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
          connectorId,
          OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          OCPP16MeterValuePhase.L3_N,
        ),
      };
    }
    if (powerSampledValueTemplate) {
      OCPP16ServiceUtils.checkMeasurandPowerDivider(
        chargingStation,
        powerSampledValueTemplate.measurand!,
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
      const powerMeasurandValues: MeasurandValues = {} as MeasurandValues;
      const unitDivider = powerSampledValueTemplate?.unit === MeterValueUnit.KILO_WATT ? 1000 : 1;
      const connectorMaximumAvailablePower =
        chargingStation.getConnectorMaximumAvailablePower(connectorId);
      const connectorMaximumPower = Math.round(connectorMaximumAvailablePower);
      const connectorMaximumPowerPerPhase = Math.round(
        connectorMaximumAvailablePower / chargingStation.getNumberOfPhases(),
      );
      const connectorMinimumPower = Math.round(powerSampledValueTemplate.minimumValue!) ?? 0;
      const connectorMinimumPowerPerPhase = Math.round(
        connectorMinimumPower / chargingStation.getNumberOfPhases(),
      );
      switch (chargingStation.getCurrentOutType()) {
        case CurrentType.AC:
          if (chargingStation.getNumberOfPhases() === 3) {
            const defaultFluctuatedPowerPerPhase =
              powerSampledValueTemplate.value &&
              getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  powerSampledValueTemplate.value,
                  connectorMaximumPower / unitDivider,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                ) / chargingStation.getNumberOfPhases(),
                powerSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT,
              );
            const phase1FluctuatedValue =
              powerPerPhaseSampledValueTemplates.L1?.value &&
              getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  powerPerPhaseSampledValueTemplates.L1.value,
                  connectorMaximumPowerPerPhase / unitDivider,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                ),
                powerPerPhaseSampledValueTemplates.L1.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT,
              );
            const phase2FluctuatedValue =
              powerPerPhaseSampledValueTemplates.L2?.value &&
              getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  powerPerPhaseSampledValueTemplates.L2.value,
                  connectorMaximumPowerPerPhase / unitDivider,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                ),
                powerPerPhaseSampledValueTemplates.L2.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT,
              );
            const phase3FluctuatedValue =
              powerPerPhaseSampledValueTemplates.L3?.value &&
              getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  powerPerPhaseSampledValueTemplates.L3.value,
                  connectorMaximumPowerPerPhase / unitDivider,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                ),
                powerPerPhaseSampledValueTemplates.L3.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT,
              );
            powerMeasurandValues.L1 =
              (phase1FluctuatedValue as number) ??
              (defaultFluctuatedPowerPerPhase as number) ??
              getRandomFloatRounded(
                connectorMaximumPowerPerPhase / unitDivider,
                connectorMinimumPowerPerPhase / unitDivider,
              );
            powerMeasurandValues.L2 =
              (phase2FluctuatedValue as number) ??
              (defaultFluctuatedPowerPerPhase as number) ??
              getRandomFloatRounded(
                connectorMaximumPowerPerPhase / unitDivider,
                connectorMinimumPowerPerPhase / unitDivider,
              );
            powerMeasurandValues.L3 =
              (phase3FluctuatedValue as number) ??
              (defaultFluctuatedPowerPerPhase as number) ??
              getRandomFloatRounded(
                connectorMaximumPowerPerPhase / unitDivider,
                connectorMinimumPowerPerPhase / unitDivider,
              );
          } else {
            powerMeasurandValues.L1 = powerSampledValueTemplate.value
              ? getRandomFloatFluctuatedRounded(
                  OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                    powerSampledValueTemplate.value,
                    connectorMaximumPower / unitDivider,
                    { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                  ),
                  powerSampledValueTemplate.fluctuationPercent ??
                    Constants.DEFAULT_FLUCTUATION_PERCENT,
                )
              : getRandomFloatRounded(
                  connectorMaximumPower / unitDivider,
                  connectorMinimumPower / unitDivider,
                );
            powerMeasurandValues.L2 = 0;
            powerMeasurandValues.L3 = 0;
          }
          powerMeasurandValues.allPhases = roundTo(
            powerMeasurandValues.L1 + powerMeasurandValues.L2 + powerMeasurandValues.L3,
            2,
          );
          break;
        case CurrentType.DC:
          powerMeasurandValues.allPhases = powerSampledValueTemplate.value
            ? getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  powerSampledValueTemplate.value,
                  connectorMaximumPower / unitDivider,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                ),
                powerSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT,
              )
            : getRandomFloatRounded(
                connectorMaximumPower / unitDivider,
                connectorMinimumPower / unitDivider,
              );
          break;
        default:
          logger.error(`${chargingStation.logPrefix()} ${errMsg}`);
          throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, OCPP16RequestCommand.METER_VALUES);
      }
      meterValue.sampledValue.push(
        OCPP16ServiceUtils.buildSampledValue(
          powerSampledValueTemplate,
          powerMeasurandValues.allPhases,
        ),
      );
      const sampledValuesIndex = meterValue.sampledValue.length - 1;
      const connectorMaximumPowerRounded = roundTo(connectorMaximumPower / unitDivider, 2);
      const connectorMinimumPowerRounded = roundTo(connectorMinimumPower / unitDivider, 2);
      if (
        convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) >
          connectorMaximumPowerRounded ||
        convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) <
          connectorMinimumPowerRounded ||
        debug
      ) {
        logger.error(
          `${chargingStation.logPrefix()} MeterValues measurand ${
            meterValue.sampledValue[sampledValuesIndex].measurand ??
            OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
          }: connector id ${connectorId}, transaction id ${connector?.transactionId}, value: ${connectorMinimumPowerRounded}/${
            meterValue.sampledValue[sampledValuesIndex].value
          }/${connectorMaximumPowerRounded}`,
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
            powerPerPhaseSampledValueTemplates[
              `L${phase}` as keyof MeasurandPerPhaseSampledValueTemplates
            ]! ?? powerSampledValueTemplate,
            powerMeasurandValues[`L${phase}` as keyof MeasurandPerPhaseSampledValueTemplates],
            undefined,
            phaseValue as OCPP16MeterValuePhase,
          ),
        );
        const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1;
        const connectorMaximumPowerPerPhaseRounded = roundTo(
          connectorMaximumPowerPerPhase / unitDivider,
          2,
        );
        const connectorMinimumPowerPerPhaseRounded = roundTo(
          connectorMinimumPowerPerPhase / unitDivider,
          2,
        );
        if (
          convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) >
            connectorMaximumPowerPerPhaseRounded ||
          convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) <
            connectorMinimumPowerPerPhaseRounded ||
          debug
        ) {
          logger.error(
            `${chargingStation.logPrefix()} MeterValues measurand ${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].measurand ??
              OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
            }: phase ${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].phase
            }, connector id ${connectorId}, transaction id ${connector?.transactionId}, value: ${connectorMinimumPowerPerPhaseRounded}/${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].value
            }/${connectorMaximumPowerPerPhaseRounded}`,
          );
        }
      }
    }
    // Current.Import measurand
    const currentSampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId,
      OCPP16MeterValueMeasurand.CURRENT_IMPORT,
    );
    let currentPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {};
    if (chargingStation.getNumberOfPhases() === 3) {
      currentPerPhaseSampledValueTemplates = {
        L1: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
          connectorId,
          OCPP16MeterValueMeasurand.CURRENT_IMPORT,
          OCPP16MeterValuePhase.L1,
        ),
        L2: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
          connectorId,
          OCPP16MeterValueMeasurand.CURRENT_IMPORT,
          OCPP16MeterValuePhase.L2,
        ),
        L3: OCPP16ServiceUtils.getSampledValueTemplate(
          chargingStation,
          connectorId,
          OCPP16MeterValueMeasurand.CURRENT_IMPORT,
          OCPP16MeterValuePhase.L3,
        ),
      };
    }
    if (currentSampledValueTemplate) {
      OCPP16ServiceUtils.checkMeasurandPowerDivider(
        chargingStation,
        currentSampledValueTemplate.measurand!,
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
      const connectorMinimumAmperage = currentSampledValueTemplate.minimumValue ?? 0;
      let connectorMaximumAmperage: number;
      switch (chargingStation.getCurrentOutType()) {
        case CurrentType.AC:
          connectorMaximumAmperage = ACElectricUtils.amperagePerPhaseFromPower(
            chargingStation.getNumberOfPhases(),
            connectorMaximumAvailablePower,
            chargingStation.getVoltageOut(),
          );
          if (chargingStation.getNumberOfPhases() === 3) {
            const defaultFluctuatedAmperagePerPhase =
              currentSampledValueTemplate.value &&
              getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  currentSampledValueTemplate.value,
                  connectorMaximumAmperage,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                ),
                currentSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT,
              );
            const phase1FluctuatedValue =
              currentPerPhaseSampledValueTemplates.L1?.value &&
              getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  currentPerPhaseSampledValueTemplates.L1.value,
                  connectorMaximumAmperage,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                ),
                currentPerPhaseSampledValueTemplates.L1.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT,
              );
            const phase2FluctuatedValue =
              currentPerPhaseSampledValueTemplates.L2?.value &&
              getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  currentPerPhaseSampledValueTemplates.L2.value,
                  connectorMaximumAmperage,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                ),
                currentPerPhaseSampledValueTemplates.L2.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT,
              );
            const phase3FluctuatedValue =
              currentPerPhaseSampledValueTemplates.L3?.value &&
              getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  currentPerPhaseSampledValueTemplates.L3.value,
                  connectorMaximumAmperage,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                ),
                currentPerPhaseSampledValueTemplates.L3.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT,
              );
            currentMeasurandValues.L1 =
              (phase1FluctuatedValue as number) ??
              (defaultFluctuatedAmperagePerPhase as number) ??
              getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage);
            currentMeasurandValues.L2 =
              (phase2FluctuatedValue as number) ??
              (defaultFluctuatedAmperagePerPhase as number) ??
              getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage);
            currentMeasurandValues.L3 =
              (phase3FluctuatedValue as number) ??
              (defaultFluctuatedAmperagePerPhase as number) ??
              getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage);
          } else {
            currentMeasurandValues.L1 = currentSampledValueTemplate.value
              ? getRandomFloatFluctuatedRounded(
                  OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                    currentSampledValueTemplate.value,
                    connectorMaximumAmperage,
                    { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                  ),
                  currentSampledValueTemplate.fluctuationPercent ??
                    Constants.DEFAULT_FLUCTUATION_PERCENT,
                )
              : getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage);
            currentMeasurandValues.L2 = 0;
            currentMeasurandValues.L3 = 0;
          }
          currentMeasurandValues.allPhases = roundTo(
            (currentMeasurandValues.L1 + currentMeasurandValues.L2 + currentMeasurandValues.L3) /
              chargingStation.getNumberOfPhases(),
            2,
          );
          break;
        case CurrentType.DC:
          connectorMaximumAmperage = DCElectricUtils.amperage(
            connectorMaximumAvailablePower,
            chargingStation.getVoltageOut(),
          );
          currentMeasurandValues.allPhases = currentSampledValueTemplate.value
            ? getRandomFloatFluctuatedRounded(
                OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
                  currentSampledValueTemplate.value,
                  connectorMaximumAmperage,
                  { limitationEnabled: chargingStation.getCustomValueLimitationMeterValues() },
                ),
                currentSampledValueTemplate.fluctuationPercent ??
                  Constants.DEFAULT_FLUCTUATION_PERCENT,
              )
            : getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage);
          break;
        default:
          logger.error(`${chargingStation.logPrefix()} ${errMsg}`);
          throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, OCPP16RequestCommand.METER_VALUES);
      }
      meterValue.sampledValue.push(
        OCPP16ServiceUtils.buildSampledValue(
          currentSampledValueTemplate,
          currentMeasurandValues.allPhases,
        ),
      );
      const sampledValuesIndex = meterValue.sampledValue.length - 1;
      if (
        convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) >
          connectorMaximumAmperage ||
        convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) <
          connectorMinimumAmperage ||
        debug
      ) {
        logger.error(
          `${chargingStation.logPrefix()} MeterValues measurand ${
            meterValue.sampledValue[sampledValuesIndex].measurand ??
            OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
          }: connector id ${connectorId}, transaction id ${connector?.transactionId}, value: ${connectorMinimumAmperage}/${
            meterValue.sampledValue[sampledValuesIndex].value
          }/${connectorMaximumAmperage}`,
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
            currentPerPhaseSampledValueTemplates[
              phaseValue as keyof MeasurandPerPhaseSampledValueTemplates
            ]! ?? currentSampledValueTemplate,
            currentMeasurandValues[phaseValue as keyof MeasurandPerPhaseSampledValueTemplates],
            undefined,
            phaseValue as OCPP16MeterValuePhase,
          ),
        );
        const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1;
        if (
          convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) >
            connectorMaximumAmperage ||
          convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) <
            connectorMinimumAmperage ||
          debug
        ) {
          logger.error(
            `${chargingStation.logPrefix()} MeterValues measurand ${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].measurand ??
              OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
            }: phase ${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].phase
            }, connector id ${connectorId}, transaction id ${connector?.transactionId}, value: ${connectorMinimumAmperage}/${
              meterValue.sampledValue[sampledValuesPerPhaseIndex].value
            }/${connectorMaximumAmperage}`,
          );
        }
      }
    }
    // Energy.Active.Import.Register measurand (default)
    const energySampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId,
    );
    if (energySampledValueTemplate) {
      OCPP16ServiceUtils.checkMeasurandPowerDivider(
        chargingStation,
        energySampledValueTemplate.measurand!,
      );
      const unitDivider =
        energySampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
      const connectorMaximumAvailablePower =
        chargingStation.getConnectorMaximumAvailablePower(connectorId);
      const connectorMaximumEnergyRounded = roundTo(
        (connectorMaximumAvailablePower * interval) / (3600 * 1000),
        2,
      );
      const energyValueRounded = energySampledValueTemplate.value
        ? // Cumulate the fluctuated value around the static one
          getRandomFloatFluctuatedRounded(
            OCPP16ServiceUtils.getLimitFromSampledValueTemplateCustomValue(
              energySampledValueTemplate.value,
              connectorMaximumEnergyRounded,
              {
                limitationEnabled: chargingStation.getCustomValueLimitationMeterValues(),
                unitMultiplier: unitDivider,
              },
            ),
            energySampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT,
          )
        : getRandomFloatRounded(connectorMaximumEnergyRounded);
      // Persist previous value on connector
      if (connector) {
        if (
          isNullOrUndefined(connector.energyActiveImportRegisterValue) === false &&
          connector.energyActiveImportRegisterValue! >= 0 &&
          isNullOrUndefined(connector.transactionEnergyActiveImportRegisterValue) === false &&
          connector.transactionEnergyActiveImportRegisterValue! >= 0
        ) {
          connector.energyActiveImportRegisterValue! += energyValueRounded;
          connector.transactionEnergyActiveImportRegisterValue! += energyValueRounded;
        } else {
          connector.energyActiveImportRegisterValue = 0;
          connector.transactionEnergyActiveImportRegisterValue = 0;
        }
      }
      meterValue.sampledValue.push(
        OCPP16ServiceUtils.buildSampledValue(
          energySampledValueTemplate,
          roundTo(
            chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId) /
              unitDivider,
            2,
          ),
        ),
      );
      const sampledValuesIndex = meterValue.sampledValue.length - 1;
      if (energyValueRounded > connectorMaximumEnergyRounded || debug) {
        logger.error(
          `${chargingStation.logPrefix()} MeterValues measurand ${
            meterValue.sampledValue[sampledValuesIndex].measurand ??
            OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
          }: connector id ${connectorId}, transaction id ${connector?.transactionId}, value: ${energyValueRounded}/${connectorMaximumEnergyRounded}, duration: ${interval}ms`,
        );
      }
    }
    return meterValue;
  }

  public static buildTransactionBeginMeterValue(
    chargingStation: ChargingStation,
    connectorId: number,
    meterStart: number,
  ): OCPP16MeterValue {
    const meterValue: OCPP16MeterValue = {
      timestamp: new Date(),
      sampledValue: [],
    };
    // Energy.Active.Import.Register measurand (default)
    const sampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId,
    );
    const unitDivider = sampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
    meterValue.sampledValue.push(
      OCPP16ServiceUtils.buildSampledValue(
        sampledValueTemplate!,
        roundTo((meterStart ?? 0) / unitDivider, 4),
        MeterValueContext.TRANSACTION_BEGIN,
      ),
    );
    return meterValue;
  }

  public static buildTransactionEndMeterValue(
    chargingStation: ChargingStation,
    connectorId: number,
    meterStop: number,
  ): OCPP16MeterValue {
    const meterValue: OCPP16MeterValue = {
      timestamp: new Date(),
      sampledValue: [],
    };
    // Energy.Active.Import.Register measurand (default)
    const sampledValueTemplate = OCPP16ServiceUtils.getSampledValueTemplate(
      chargingStation,
      connectorId,
    );
    const unitDivider = sampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
    meterValue.sampledValue.push(
      OCPP16ServiceUtils.buildSampledValue(
        sampledValueTemplate!,
        roundTo((meterStop ?? 0) / unitDivider, 4),
        MeterValueContext.TRANSACTION_END,
      ),
    );
    return meterValue;
  }

  public static buildTransactionDataMeterValues(
    transactionBeginMeterValue: OCPP16MeterValue,
    transactionEndMeterValue: OCPP16MeterValue,
  ): OCPP16MeterValue[] {
    const meterValues: OCPP16MeterValue[] = [];
    meterValues.push(transactionBeginMeterValue);
    meterValues.push(transactionEndMeterValue);
    return meterValues;
  }

  public static remoteStopTransaction = async (
    chargingStation: ChargingStation,
    connectorId: number,
  ): Promise<GenericResponse> => {
    await OCPP16ServiceUtils.sendAndSetConnectorStatus(
      chargingStation,
      connectorId,
      OCPP16ChargePointStatus.Finishing,
    );
    const stopResponse = await chargingStation.stopTransactionOnConnector(
      connectorId,
      OCPP16StopTransactionReason.REMOTE,
    );
    if (stopResponse.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
      return OCPP16Constants.OCPP_RESPONSE_ACCEPTED;
    }
    return OCPP16Constants.OCPP_RESPONSE_REJECTED;
  };

  public static changeAvailability = async (
    chargingStation: ChargingStation,
    connectorIds: number[],
    chargePointStatus: OCPP16ChargePointStatus,
    availabilityType: OCPP16AvailabilityType,
  ): Promise<OCPP16ChangeAvailabilityResponse> => {
    const responses: OCPP16ChangeAvailabilityResponse[] = [];
    for (const connectorId of connectorIds) {
      let response: OCPP16ChangeAvailabilityResponse =
        OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED;
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)!;
      if (connectorStatus?.transactionStarted === true) {
        response = OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED;
      }
      connectorStatus.availability = availabilityType;
      if (response === OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED) {
        await OCPP16ServiceUtils.sendAndSetConnectorStatus(
          chargingStation,
          connectorId,
          chargePointStatus,
        );
      }
      responses.push(response);
    }
    if (responses.includes(OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED)) {
      return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED;
    }
    return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED;
  };

  public static setChargingProfile(
    chargingStation: ChargingStation,
    connectorId: number,
    cp: OCPP16ChargingProfile,
  ): void {
    if (isNullOrUndefined(chargingStation.getConnectorStatus(connectorId)?.chargingProfiles)) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set a charging profile on connector id ${connectorId} with an uninitialized charging profiles array attribute, applying deferred initialization`,
      );
      chargingStation.getConnectorStatus(connectorId)!.chargingProfiles = [];
    }
    if (
      Array.isArray(chargingStation.getConnectorStatus(connectorId)?.chargingProfiles) === false
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set a charging profile on connector id ${connectorId} with an improper attribute type for the charging profiles array, applying proper type deferred initialization`,
      );
      chargingStation.getConnectorStatus(connectorId)!.chargingProfiles = [];
    }
    let cpReplaced = false;
    if (isNotEmptyArray(chargingStation.getConnectorStatus(connectorId)?.chargingProfiles)) {
      chargingStation
        .getConnectorStatus(connectorId)
        ?.chargingProfiles?.forEach((chargingProfile: OCPP16ChargingProfile, index: number) => {
          if (
            chargingProfile.chargingProfileId === cp.chargingProfileId ||
            (chargingProfile.stackLevel === cp.stackLevel &&
              chargingProfile.chargingProfilePurpose === cp.chargingProfilePurpose)
          ) {
            chargingStation.getConnectorStatus(connectorId)!.chargingProfiles![index] = cp;
            cpReplaced = true;
          }
        });
    }
    !cpReplaced && chargingStation.getConnectorStatus(connectorId)?.chargingProfiles?.push(cp);
  }

  public static clearChargingProfiles = (
    chargingStation: ChargingStation,
    commandPayload: ClearChargingProfileRequest,
    chargingProfiles: OCPP16ChargingProfile[] | undefined,
  ): boolean => {
    const { id, chargingProfilePurpose, stackLevel } = commandPayload;
    let clearedCP = false;
    if (isNotEmptyArray(chargingProfiles)) {
      chargingProfiles?.forEach((chargingProfile: OCPP16ChargingProfile, index: number) => {
        let clearCurrentCP = false;
        if (chargingProfile.chargingProfileId === id) {
          clearCurrentCP = true;
        }
        if (!chargingProfilePurpose && chargingProfile.stackLevel === stackLevel) {
          clearCurrentCP = true;
        }
        if (!stackLevel && chargingProfile.chargingProfilePurpose === chargingProfilePurpose) {
          clearCurrentCP = true;
        }
        if (
          chargingProfile.stackLevel === stackLevel &&
          chargingProfile.chargingProfilePurpose === chargingProfilePurpose
        ) {
          clearCurrentCP = true;
        }
        if (clearCurrentCP) {
          chargingProfiles.splice(index, 1);
          logger.debug(
            `${chargingStation.logPrefix()} Matching charging profile(s) cleared: %j`,
            chargingProfile,
          );
          clearedCP = true;
        }
      });
    }
    return clearedCP;
  };

  public static hasReservation = (
    chargingStation: ChargingStation,
    connectorId: number,
    idTag: string,
  ): boolean => {
    const connectorReservation = chargingStation.getReservationBy('connectorId', connectorId);
    const chargingStationReservation = chargingStation.getReservationBy('connectorId', 0);
    if (
      (chargingStation.getConnectorStatus(connectorId)?.status ===
        OCPP16ChargePointStatus.Reserved &&
        connectorReservation &&
        !hasReservationExpired(connectorReservation) &&
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        connectorReservation?.idTag === idTag) ||
      (chargingStation.getConnectorStatus(0)?.status === OCPP16ChargePointStatus.Reserved &&
        chargingStationReservation &&
        !hasReservationExpired(chargingStationReservation) &&
        chargingStationReservation?.idTag === idTag)
    ) {
      return true;
    }
    return false;
  };

  public static parseJsonSchemaFile<T extends JsonType>(
    relativePath: string,
    moduleName?: string,
    methodName?: string,
  ): JSONSchemaType<T> {
    return super.parseJsonSchemaFile<T>(
      relativePath,
      OCPPVersion.VERSION_16,
      moduleName,
      methodName,
    );
  }

  private static buildSampledValue(
    sampledValueTemplate: SampledValueTemplate,
    value: number,
    context?: MeterValueContext,
    phase?: OCPP16MeterValuePhase,
  ): OCPP16SampledValue {
    const sampledValueValue = value ?? sampledValueTemplate?.value ?? null;
    const sampledValueContext = context ?? sampledValueTemplate?.context ?? null;
    const sampledValueLocation =
      sampledValueTemplate?.location ??
      OCPP16ServiceUtils.getMeasurandDefaultLocation(sampledValueTemplate.measurand!);
    const sampledValuePhase = phase ?? sampledValueTemplate?.phase ?? null;
    return {
      ...(!isNullOrUndefined(sampledValueTemplate.unit) && {
        unit: sampledValueTemplate.unit,
      }),
      ...(!isNullOrUndefined(sampledValueContext) && { context: sampledValueContext }),
      ...(!isNullOrUndefined(sampledValueTemplate.measurand) && {
        measurand: sampledValueTemplate.measurand,
      }),
      ...(!isNullOrUndefined(sampledValueLocation) && { location: sampledValueLocation }),
      ...(!isNullOrUndefined(sampledValueValue) && { value: sampledValueValue.toString() }),
      ...(!isNullOrUndefined(sampledValuePhase) && { phase: sampledValuePhase }),
    } as OCPP16SampledValue;
  }

  private static checkMeasurandPowerDivider(
    chargingStation: ChargingStation,
    measurandType: OCPP16MeterValueMeasurand,
  ): void {
    if (isUndefined(chargingStation.powerDivider)) {
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
    measurandType: OCPP16MeterValueMeasurand,
  ): MeterValueLocation | undefined {
    switch (measurandType) {
      case OCPP16MeterValueMeasurand.STATE_OF_CHARGE:
        return MeterValueLocation.EV;
    }
  }

  // private static getMeasurandDefaultUnit(
  //   measurandType: OCPP16MeterValueMeasurand,
  // ): MeterValueUnit | undefined {
  //   switch (measurandType) {
  //     case OCPP16MeterValueMeasurand.CURRENT_EXPORT:
  //     case OCPP16MeterValueMeasurand.CURRENT_IMPORT:
  //     case OCPP16MeterValueMeasurand.CURRENT_OFFERED:
  //       return MeterValueUnit.AMP;
  //     case OCPP16MeterValueMeasurand.ENERGY_ACTIVE_EXPORT_REGISTER:
  //     case OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER:
  //       return MeterValueUnit.WATT_HOUR;
  //     case OCPP16MeterValueMeasurand.POWER_ACTIVE_EXPORT:
  //     case OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT:
  //     case OCPP16MeterValueMeasurand.POWER_OFFERED:
  //       return MeterValueUnit.WATT;
  //     case OCPP16MeterValueMeasurand.STATE_OF_CHARGE:
  //       return MeterValueUnit.PERCENT;
  //     case OCPP16MeterValueMeasurand.VOLTAGE:
  //       return MeterValueUnit.VOLT;
  //   }
  // }
}
