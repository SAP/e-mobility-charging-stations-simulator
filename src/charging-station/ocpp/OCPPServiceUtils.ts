import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DefinedError, ErrorObject, JSONSchemaType } from 'ajv';
import { isDate } from 'date-fns';

import { OCPP16Constants } from './1.6/OCPP16Constants.js';
import { OCPP20Constants } from './2.0/OCPP20Constants.js';
import { OCPPConstants } from './OCPPConstants.js';
import {
  type ChargingStation,
  getConfigurationKey,
  getIdTagsFile,
} from '../../charging-station/index.js';
import { BaseError, OCPPError } from '../../exception/index.js';
import {
  AuthorizationStatus,
  type AuthorizeRequest,
  type AuthorizeResponse,
  ChargePointErrorCode,
  ChargingStationEvents,
  type ConnectorStatus,
  type ConnectorStatusEnum,
  CurrentType,
  ErrorType,
  FileType,
  IncomingRequestCommand,
  type JsonType,
  type MeasurandPerPhaseSampledValueTemplates,
  type MeasurandValues,
  MessageTrigger,
  MessageType,
  type MeterValue,
  MeterValueContext,
  MeterValueLocation,
  MeterValueMeasurand,
  MeterValuePhase,
  MeterValueUnit,
  type OCPP16StatusNotificationRequest,
  type OCPP20StatusNotificationRequest,
  OCPPVersion,
  RequestCommand,
  type SampledValue,
  type SampledValueTemplate,
  StandardParametersKey,
  type StatusNotificationRequest,
  type StatusNotificationResponse,
} from '../../types/index.js';
import {
  ACElectricUtils,
  Constants,
  DCElectricUtils,
  convertToFloat,
  convertToInt,
  getRandomFloatFluctuatedRounded,
  getRandomFloatRounded,
  getRandomInteger,
  handleFileException,
  isNotEmptyArray,
  isNotEmptyString,
  isNullOrUndefined,
  isUndefined,
  logPrefix,
  logger,
  max,
  min,
  roundTo,
} from '../../utils/index.js';

export const getMessageTypeString = (messageType: MessageType): string => {
  switch (messageType) {
    case MessageType.CALL_MESSAGE:
      return 'request';
    case MessageType.CALL_RESULT_MESSAGE:
      return 'response';
    case MessageType.CALL_ERROR_MESSAGE:
      return 'error';
    default:
      return 'unknown';
  }
};

export const buildStatusNotificationRequest = (
  chargingStation: ChargingStation,
  connectorId: number,
  status: ConnectorStatusEnum,
  evseId?: number,
): StatusNotificationRequest => {
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      return {
        connectorId,
        status,
        errorCode: ChargePointErrorCode.NO_ERROR,
      } as OCPP16StatusNotificationRequest;
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      return {
        timestamp: new Date(),
        connectorStatus: status,
        connectorId,
        evseId,
      } as OCPP20StatusNotificationRequest;
    default:
      throw new BaseError('Cannot build status notification payload: OCPP version not supported');
  }
};

export const isIdTagAuthorized = async (
  chargingStation: ChargingStation,
  connectorId: number,
  idTag: string,
): Promise<boolean> => {
  if (
    !chargingStation.getLocalAuthListEnabled() &&
    !chargingStation.stationInfo?.remoteAuthorization
  ) {
    logger.warn(
      `${chargingStation.logPrefix()} The charging station expects to authorize RFID tags but nor local authorization nor remote authorization are enabled. Misbehavior may occur`,
    );
  }
  if (
    chargingStation.getLocalAuthListEnabled() === true &&
    isIdTagLocalAuthorized(chargingStation, idTag)
  ) {
    const connectorStatus: ConnectorStatus = chargingStation.getConnectorStatus(connectorId)!;
    connectorStatus.localAuthorizeIdTag = idTag;
    connectorStatus.idTagLocalAuthorized = true;
    return true;
  } else if (chargingStation.stationInfo?.remoteAuthorization) {
    return await isIdTagRemoteAuthorized(chargingStation, connectorId, idTag);
  }
  return false;
};

const isIdTagLocalAuthorized = (chargingStation: ChargingStation, idTag: string): boolean => {
  return (
    chargingStation.hasIdTags() === true &&
    isNotEmptyString(
      chargingStation.idTagsCache
        .getIdTags(getIdTagsFile(chargingStation.stationInfo)!)
        ?.find((tag) => tag === idTag),
    )
  );
};

const isIdTagRemoteAuthorized = async (
  chargingStation: ChargingStation,
  connectorId: number,
  idTag: string,
): Promise<boolean> => {
  chargingStation.getConnectorStatus(connectorId)!.authorizeIdTag = idTag;
  return (
    (
      await chargingStation.ocppRequestService.requestHandler<AuthorizeRequest, AuthorizeResponse>(
        chargingStation,
        RequestCommand.AUTHORIZE,
        {
          idTag,
        },
      )
    )?.idTagInfo?.status === AuthorizationStatus.ACCEPTED
  );
};

export const sendAndSetConnectorStatus = async (
  chargingStation: ChargingStation,
  connectorId: number,
  status: ConnectorStatusEnum,
  evseId?: number,
  options?: { send: boolean },
): Promise<void> => {
  options = { send: true, ...options };
  if (options.send) {
    checkConnectorStatusTransition(chargingStation, connectorId, status);
    await chargingStation.ocppRequestService.requestHandler<
      StatusNotificationRequest,
      StatusNotificationResponse
    >(
      chargingStation,
      RequestCommand.STATUS_NOTIFICATION,
      buildStatusNotificationRequest(chargingStation, connectorId, status, evseId),
    );
  }
  chargingStation.getConnectorStatus(connectorId)!.status = status;
  chargingStation.emit(ChargingStationEvents.connectorStatusChanged, {
    connectorId,
    ...chargingStation.getConnectorStatus(connectorId),
  });
};

const checkConnectorStatusTransition = (
  chargingStation: ChargingStation,
  connectorId: number,
  status: ConnectorStatusEnum,
): boolean => {
  const fromStatus = chargingStation.getConnectorStatus(connectorId)!.status;
  let transitionAllowed = false;
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      if (
        (connectorId === 0 &&
          OCPP16Constants.ChargePointStatusChargingStationTransitions.findIndex(
            (transition) => transition.from === fromStatus && transition.to === status,
          ) !== -1) ||
        (connectorId > 0 &&
          OCPP16Constants.ChargePointStatusConnectorTransitions.findIndex(
            (transition) => transition.from === fromStatus && transition.to === status,
          ) !== -1)
      ) {
        transitionAllowed = true;
      }
      break;
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
      if (
        (connectorId === 0 &&
          OCPP20Constants.ChargingStationStatusTransitions.findIndex(
            (transition) => transition.from === fromStatus && transition.to === status,
          ) !== -1) ||
        (connectorId > 0 &&
          OCPP20Constants.ConnectorStatusTransitions.findIndex(
            (transition) => transition.from === fromStatus && transition.to === status,
          ) !== -1)
      ) {
        transitionAllowed = true;
      }
      break;
    default:
      throw new BaseError(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot check connector status transition: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`,
      );
  }
  if (transitionAllowed === false) {
    logger.warn(
      `${chargingStation.logPrefix()} OCPP ${chargingStation.stationInfo
        ?.ocppVersion} connector id ${connectorId} status transition from '${
        chargingStation.getConnectorStatus(connectorId)!.status
      }' to '${status}' is not allowed`,
    );
  }
  return transitionAllowed;
};

export const buildMeterValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  transactionId: number,
  interval: number,
  debug = false,
): MeterValue => {
  const connector = chargingStation.getConnectorStatus(connectorId);
  let meterValue: MeterValue;
  let socSampledValueTemplate: SampledValueTemplate | undefined;
  let voltageSampledValueTemplate: SampledValueTemplate | undefined;
  let powerSampledValueTemplate: SampledValueTemplate | undefined;
  let powerPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {};
  let currentSampledValueTemplate: SampledValueTemplate | undefined;
  let currentPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {};
  let energySampledValueTemplate: SampledValueTemplate | undefined;
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      meterValue = {
        timestamp: new Date(),
        sampledValue: [],
      };
      // SoC measurand
      socSampledValueTemplate = getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.STATE_OF_CHARGE,
      );
      if (socSampledValueTemplate) {
        const socMaximumValue = 100;
        const socMinimumValue = socSampledValueTemplate.minimumValue ?? 0;
        const socSampledValueTemplateValue = isNotEmptyString(socSampledValueTemplate.value)
          ? getRandomFloatFluctuatedRounded(
              parseInt(socSampledValueTemplate.value),
              socSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT,
            )
          : getRandomInteger(socMaximumValue, socMinimumValue);
        meterValue.sampledValue.push(
          buildSampledValue(socSampledValueTemplate, socSampledValueTemplateValue),
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
              MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
            }: connector id ${connectorId}, transaction id ${connector?.transactionId}, value: ${socMinimumValue}/${
              meterValue.sampledValue[sampledValuesIndex].value
            }/${socMaximumValue}`,
          );
        }
      }
      // Voltage measurand
      voltageSampledValueTemplate = getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.VOLTAGE,
      );
      if (voltageSampledValueTemplate) {
        const voltageSampledValueTemplateValue = isNotEmptyString(voltageSampledValueTemplate.value)
          ? parseInt(voltageSampledValueTemplate.value)
          : chargingStation.stationInfo.voltageOut!;
        const fluctuationPercent =
          voltageSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT;
        const voltageMeasurandValue = getRandomFloatFluctuatedRounded(
          voltageSampledValueTemplateValue,
          fluctuationPercent,
        );
        if (
          chargingStation.getNumberOfPhases() !== 3 ||
          (chargingStation.getNumberOfPhases() === 3 &&
            chargingStation.stationInfo?.mainVoltageMeterValues)
        ) {
          meterValue.sampledValue.push(
            buildSampledValue(voltageSampledValueTemplate, voltageMeasurandValue),
          );
        }
        for (
          let phase = 1;
          chargingStation.getNumberOfPhases() === 3 && phase <= chargingStation.getNumberOfPhases();
          phase++
        ) {
          const phaseLineToNeutralValue = `L${phase}-N`;
          const voltagePhaseLineToNeutralSampledValueTemplate = getSampledValueTemplate(
            chargingStation,
            connectorId,
            MeterValueMeasurand.VOLTAGE,
            phaseLineToNeutralValue as MeterValuePhase,
          );
          let voltagePhaseLineToNeutralMeasurandValue: number | undefined;
          if (voltagePhaseLineToNeutralSampledValueTemplate) {
            const voltagePhaseLineToNeutralSampledValueTemplateValue = isNotEmptyString(
              voltagePhaseLineToNeutralSampledValueTemplate.value,
            )
              ? parseInt(voltagePhaseLineToNeutralSampledValueTemplate.value)
              : chargingStation.stationInfo.voltageOut!;
            const fluctuationPhaseToNeutralPercent =
              voltagePhaseLineToNeutralSampledValueTemplate.fluctuationPercent ??
              Constants.DEFAULT_FLUCTUATION_PERCENT;
            voltagePhaseLineToNeutralMeasurandValue = getRandomFloatFluctuatedRounded(
              voltagePhaseLineToNeutralSampledValueTemplateValue,
              fluctuationPhaseToNeutralPercent,
            );
          }
          meterValue.sampledValue.push(
            buildSampledValue(
              voltagePhaseLineToNeutralSampledValueTemplate ?? voltageSampledValueTemplate,
              voltagePhaseLineToNeutralMeasurandValue ?? voltageMeasurandValue,
              undefined,
              phaseLineToNeutralValue as MeterValuePhase,
            ),
          );
          if (chargingStation.stationInfo?.phaseLineToLineVoltageMeterValues) {
            const phaseLineToLineValue = `L${phase}-L${
              (phase + 1) % chargingStation.getNumberOfPhases() !== 0
                ? (phase + 1) % chargingStation.getNumberOfPhases()
                : chargingStation.getNumberOfPhases()
            }`;
            const voltagePhaseLineToLineValueRounded = roundTo(
              Math.sqrt(chargingStation.getNumberOfPhases()) *
                chargingStation.stationInfo.voltageOut!,
              2,
            );
            const voltagePhaseLineToLineSampledValueTemplate = getSampledValueTemplate(
              chargingStation,
              connectorId,
              MeterValueMeasurand.VOLTAGE,
              phaseLineToLineValue as MeterValuePhase,
            );
            let voltagePhaseLineToLineMeasurandValue: number | undefined;
            if (voltagePhaseLineToLineSampledValueTemplate) {
              const voltagePhaseLineToLineSampledValueTemplateValue = isNotEmptyString(
                voltagePhaseLineToLineSampledValueTemplate.value,
              )
                ? parseInt(voltagePhaseLineToLineSampledValueTemplate.value)
                : voltagePhaseLineToLineValueRounded;
              const fluctuationPhaseLineToLinePercent =
                voltagePhaseLineToLineSampledValueTemplate.fluctuationPercent ??
                Constants.DEFAULT_FLUCTUATION_PERCENT;
              voltagePhaseLineToLineMeasurandValue = getRandomFloatFluctuatedRounded(
                voltagePhaseLineToLineSampledValueTemplateValue,
                fluctuationPhaseLineToLinePercent,
              );
            }
            const defaultVoltagePhaseLineToLineMeasurandValue = getRandomFloatFluctuatedRounded(
              voltagePhaseLineToLineValueRounded,
              fluctuationPercent,
            );
            meterValue.sampledValue.push(
              buildSampledValue(
                voltagePhaseLineToLineSampledValueTemplate ?? voltageSampledValueTemplate,
                voltagePhaseLineToLineMeasurandValue ?? defaultVoltagePhaseLineToLineMeasurandValue,
                undefined,
                phaseLineToLineValue as MeterValuePhase,
              ),
            );
          }
        }
      }
      // Power.Active.Import measurand
      powerSampledValueTemplate = getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.POWER_ACTIVE_IMPORT,
      );
      if (chargingStation.getNumberOfPhases() === 3) {
        powerPerPhaseSampledValueTemplates = {
          L1: getSampledValueTemplate(
            chargingStation,
            connectorId,
            MeterValueMeasurand.POWER_ACTIVE_IMPORT,
            MeterValuePhase.L1_N,
          ),
          L2: getSampledValueTemplate(
            chargingStation,
            connectorId,
            MeterValueMeasurand.POWER_ACTIVE_IMPORT,
            MeterValuePhase.L2_N,
          ),
          L3: getSampledValueTemplate(
            chargingStation,
            connectorId,
            MeterValueMeasurand.POWER_ACTIVE_IMPORT,
            MeterValuePhase.L3_N,
          ),
        };
      }
      if (powerSampledValueTemplate) {
        checkMeasurandPowerDivider(chargingStation, powerSampledValueTemplate.measurand!);
        const errMsg = `MeterValues measurand ${
          powerSampledValueTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        }: Unknown ${chargingStation.stationInfo?.currentOutType} currentOutType in template file ${
          chargingStation.templateFile
        }, cannot calculate ${
          powerSampledValueTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        } measurand value`;
        const powerMeasurandValues: MeasurandValues = {} as MeasurandValues;
        const unitDivider = powerSampledValueTemplate?.unit === MeterValueUnit.KILO_WATT ? 1000 : 1;
        const connectorMaximumAvailablePower =
          chargingStation.getConnectorMaximumAvailablePower(connectorId);
        const connectorMaximumPower = Math.round(connectorMaximumAvailablePower);
        const connectorMaximumPowerPerPhase = Math.round(
          connectorMaximumAvailablePower / chargingStation.getNumberOfPhases(),
        );
        const connectorMinimumPower = Math.round(powerSampledValueTemplate.minimumValue ?? 0);
        const connectorMinimumPowerPerPhase = Math.round(
          connectorMinimumPower / chargingStation.getNumberOfPhases(),
        );
        switch (chargingStation.stationInfo?.currentOutType) {
          case CurrentType.AC:
            if (chargingStation.getNumberOfPhases() === 3) {
              const defaultFluctuatedPowerPerPhase = isNotEmptyString(
                powerSampledValueTemplate.value,
              )
                ? getRandomFloatFluctuatedRounded(
                    getLimitFromSampledValueTemplateCustomValue(
                      powerSampledValueTemplate.value,
                      connectorMaximumPower / unitDivider,
                      connectorMinimumPower / unitDivider,
                      {
                        limitationEnabled:
                          chargingStation.stationInfo?.customValueLimitationMeterValues,
                        fallbackValue: connectorMinimumPower / unitDivider,
                      },
                    ) / chargingStation.getNumberOfPhases(),
                    powerSampledValueTemplate.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT,
                  )
                : undefined;
              const phase1FluctuatedValue = isNotEmptyString(
                powerPerPhaseSampledValueTemplates.L1?.value,
              )
                ? getRandomFloatFluctuatedRounded(
                    getLimitFromSampledValueTemplateCustomValue(
                      powerPerPhaseSampledValueTemplates.L1?.value,
                      connectorMaximumPowerPerPhase / unitDivider,
                      connectorMinimumPowerPerPhase / unitDivider,
                      {
                        limitationEnabled:
                          chargingStation.stationInfo?.customValueLimitationMeterValues,
                        fallbackValue: connectorMinimumPowerPerPhase / unitDivider,
                      },
                    ),
                    powerPerPhaseSampledValueTemplates.L1?.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT,
                  )
                : undefined;
              const phase2FluctuatedValue = isNotEmptyString(
                powerPerPhaseSampledValueTemplates.L2?.value,
              )
                ? getRandomFloatFluctuatedRounded(
                    getLimitFromSampledValueTemplateCustomValue(
                      powerPerPhaseSampledValueTemplates.L2?.value,
                      connectorMaximumPowerPerPhase / unitDivider,
                      connectorMinimumPowerPerPhase / unitDivider,
                      {
                        limitationEnabled:
                          chargingStation.stationInfo?.customValueLimitationMeterValues,
                        fallbackValue: connectorMinimumPowerPerPhase / unitDivider,
                      },
                    ),
                    powerPerPhaseSampledValueTemplates.L2?.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT,
                  )
                : undefined;
              const phase3FluctuatedValue = isNotEmptyString(
                powerPerPhaseSampledValueTemplates.L3?.value,
              )
                ? getRandomFloatFluctuatedRounded(
                    getLimitFromSampledValueTemplateCustomValue(
                      powerPerPhaseSampledValueTemplates.L3?.value,
                      connectorMaximumPowerPerPhase / unitDivider,
                      connectorMinimumPowerPerPhase / unitDivider,
                      {
                        limitationEnabled:
                          chargingStation.stationInfo?.customValueLimitationMeterValues,
                        fallbackValue: connectorMinimumPowerPerPhase / unitDivider,
                      },
                    ),
                    powerPerPhaseSampledValueTemplates.L3?.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT,
                  )
                : undefined;
              powerMeasurandValues.L1 =
                phase1FluctuatedValue ??
                defaultFluctuatedPowerPerPhase ??
                getRandomFloatRounded(
                  connectorMaximumPowerPerPhase / unitDivider,
                  connectorMinimumPowerPerPhase / unitDivider,
                );
              powerMeasurandValues.L2 =
                phase2FluctuatedValue ??
                defaultFluctuatedPowerPerPhase ??
                getRandomFloatRounded(
                  connectorMaximumPowerPerPhase / unitDivider,
                  connectorMinimumPowerPerPhase / unitDivider,
                );
              powerMeasurandValues.L3 =
                phase3FluctuatedValue ??
                defaultFluctuatedPowerPerPhase ??
                getRandomFloatRounded(
                  connectorMaximumPowerPerPhase / unitDivider,
                  connectorMinimumPowerPerPhase / unitDivider,
                );
            } else {
              powerMeasurandValues.L1 = isNotEmptyString(powerSampledValueTemplate.value)
                ? getRandomFloatFluctuatedRounded(
                    getLimitFromSampledValueTemplateCustomValue(
                      powerSampledValueTemplate.value,
                      connectorMaximumPower / unitDivider,
                      connectorMinimumPower / unitDivider,
                      {
                        limitationEnabled:
                          chargingStation.stationInfo?.customValueLimitationMeterValues,
                        fallbackValue: connectorMinimumPower / unitDivider,
                      },
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
            powerMeasurandValues.allPhases = isNotEmptyString(powerSampledValueTemplate.value)
              ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    powerSampledValueTemplate.value,
                    connectorMaximumPower / unitDivider,
                    connectorMinimumPower / unitDivider,
                    {
                      limitationEnabled:
                        chargingStation.stationInfo?.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumPower / unitDivider,
                    },
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
            throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES);
        }
        meterValue.sampledValue.push(
          buildSampledValue(powerSampledValueTemplate, powerMeasurandValues.allPhases),
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
              MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
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
            buildSampledValue(
              powerPerPhaseSampledValueTemplates[
                `L${phase}` as keyof MeasurandPerPhaseSampledValueTemplates
              ] ?? powerSampledValueTemplate,
              powerMeasurandValues[`L${phase}` as keyof MeasurandPerPhaseSampledValueTemplates],
              undefined,
              phaseValue as MeterValuePhase,
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
                MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
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
      currentSampledValueTemplate = getSampledValueTemplate(
        chargingStation,
        connectorId,
        MeterValueMeasurand.CURRENT_IMPORT,
      );
      if (chargingStation.getNumberOfPhases() === 3) {
        currentPerPhaseSampledValueTemplates = {
          L1: getSampledValueTemplate(
            chargingStation,
            connectorId,
            MeterValueMeasurand.CURRENT_IMPORT,
            MeterValuePhase.L1,
          ),
          L2: getSampledValueTemplate(
            chargingStation,
            connectorId,
            MeterValueMeasurand.CURRENT_IMPORT,
            MeterValuePhase.L2,
          ),
          L3: getSampledValueTemplate(
            chargingStation,
            connectorId,
            MeterValueMeasurand.CURRENT_IMPORT,
            MeterValuePhase.L3,
          ),
        };
      }
      if (currentSampledValueTemplate) {
        checkMeasurandPowerDivider(chargingStation, currentSampledValueTemplate.measurand!);
        const errMsg = `MeterValues measurand ${
          currentSampledValueTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        }: Unknown ${chargingStation.stationInfo?.currentOutType} currentOutType in template file ${
          chargingStation.templateFile
        }, cannot calculate ${
          currentSampledValueTemplate.measurand ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        } measurand value`;
        const currentMeasurandValues: MeasurandValues = {} as MeasurandValues;
        const connectorMaximumAvailablePower =
          chargingStation.getConnectorMaximumAvailablePower(connectorId);
        const connectorMinimumAmperage = currentSampledValueTemplate.minimumValue ?? 0;
        let connectorMaximumAmperage: number;
        switch (chargingStation.stationInfo?.currentOutType) {
          case CurrentType.AC:
            connectorMaximumAmperage = ACElectricUtils.amperagePerPhaseFromPower(
              chargingStation.getNumberOfPhases(),
              connectorMaximumAvailablePower,
              chargingStation.stationInfo.voltageOut!,
            );
            if (chargingStation.getNumberOfPhases() === 3) {
              const defaultFluctuatedAmperagePerPhase = isNotEmptyString(
                currentSampledValueTemplate.value,
              )
                ? getRandomFloatFluctuatedRounded(
                    getLimitFromSampledValueTemplateCustomValue(
                      currentSampledValueTemplate.value,
                      connectorMaximumAmperage,
                      connectorMinimumAmperage,
                      {
                        limitationEnabled:
                          chargingStation.stationInfo?.customValueLimitationMeterValues,
                        fallbackValue: connectorMinimumAmperage,
                      },
                    ),
                    currentSampledValueTemplate.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT,
                  )
                : undefined;
              const phase1FluctuatedValue = isNotEmptyString(
                currentPerPhaseSampledValueTemplates.L1?.value,
              )
                ? getRandomFloatFluctuatedRounded(
                    getLimitFromSampledValueTemplateCustomValue(
                      currentPerPhaseSampledValueTemplates.L1?.value,
                      connectorMaximumAmperage,
                      connectorMinimumAmperage,
                      {
                        limitationEnabled:
                          chargingStation.stationInfo?.customValueLimitationMeterValues,
                        fallbackValue: connectorMinimumAmperage,
                      },
                    ),
                    currentPerPhaseSampledValueTemplates.L1?.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT,
                  )
                : undefined;
              const phase2FluctuatedValue = isNotEmptyString(
                currentPerPhaseSampledValueTemplates.L2?.value,
              )
                ? getRandomFloatFluctuatedRounded(
                    getLimitFromSampledValueTemplateCustomValue(
                      currentPerPhaseSampledValueTemplates.L2?.value,
                      connectorMaximumAmperage,
                      connectorMinimumAmperage,
                      {
                        limitationEnabled:
                          chargingStation.stationInfo?.customValueLimitationMeterValues,
                        fallbackValue: connectorMinimumAmperage,
                      },
                    ),
                    currentPerPhaseSampledValueTemplates.L2?.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT,
                  )
                : undefined;
              const phase3FluctuatedValue = isNotEmptyString(
                currentPerPhaseSampledValueTemplates.L3?.value,
              )
                ? getRandomFloatFluctuatedRounded(
                    getLimitFromSampledValueTemplateCustomValue(
                      currentPerPhaseSampledValueTemplates.L3?.value,
                      connectorMaximumAmperage,
                      connectorMinimumAmperage,
                      {
                        limitationEnabled:
                          chargingStation.stationInfo?.customValueLimitationMeterValues,
                        fallbackValue: connectorMinimumAmperage,
                      },
                    ),
                    currentPerPhaseSampledValueTemplates.L3?.fluctuationPercent ??
                      Constants.DEFAULT_FLUCTUATION_PERCENT,
                  )
                : undefined;
              currentMeasurandValues.L1 =
                phase1FluctuatedValue ??
                defaultFluctuatedAmperagePerPhase ??
                getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage);
              currentMeasurandValues.L2 =
                phase2FluctuatedValue ??
                defaultFluctuatedAmperagePerPhase ??
                getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage);
              currentMeasurandValues.L3 =
                phase3FluctuatedValue ??
                defaultFluctuatedAmperagePerPhase ??
                getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage);
            } else {
              currentMeasurandValues.L1 = isNotEmptyString(currentSampledValueTemplate.value)
                ? getRandomFloatFluctuatedRounded(
                    getLimitFromSampledValueTemplateCustomValue(
                      currentSampledValueTemplate.value,
                      connectorMaximumAmperage,
                      connectorMinimumAmperage,
                      {
                        limitationEnabled:
                          chargingStation.stationInfo?.customValueLimitationMeterValues,
                        fallbackValue: connectorMinimumAmperage,
                      },
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
              chargingStation.stationInfo.voltageOut!,
            );
            currentMeasurandValues.allPhases = isNotEmptyString(currentSampledValueTemplate.value)
              ? getRandomFloatFluctuatedRounded(
                  getLimitFromSampledValueTemplateCustomValue(
                    currentSampledValueTemplate.value,
                    connectorMaximumAmperage,
                    connectorMinimumAmperage,
                    {
                      limitationEnabled:
                        chargingStation.stationInfo?.customValueLimitationMeterValues,
                      fallbackValue: connectorMinimumAmperage,
                    },
                  ),
                  currentSampledValueTemplate.fluctuationPercent ??
                    Constants.DEFAULT_FLUCTUATION_PERCENT,
                )
              : getRandomFloatRounded(connectorMaximumAmperage, connectorMinimumAmperage);
            break;
          default:
            logger.error(`${chargingStation.logPrefix()} ${errMsg}`);
            throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES);
        }
        meterValue.sampledValue.push(
          buildSampledValue(currentSampledValueTemplate, currentMeasurandValues.allPhases),
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
              MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
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
            buildSampledValue(
              currentPerPhaseSampledValueTemplates[
                phaseValue as keyof MeasurandPerPhaseSampledValueTemplates
              ] ?? currentSampledValueTemplate,
              currentMeasurandValues[phaseValue as keyof MeasurandPerPhaseSampledValueTemplates],
              undefined,
              phaseValue as MeterValuePhase,
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
                MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
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
      energySampledValueTemplate = getSampledValueTemplate(chargingStation, connectorId);
      if (energySampledValueTemplate) {
        checkMeasurandPowerDivider(chargingStation, energySampledValueTemplate.measurand!);
        const unitDivider =
          energySampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
        const connectorMaximumAvailablePower =
          chargingStation.getConnectorMaximumAvailablePower(connectorId);
        const connectorMaximumEnergyRounded = roundTo(
          (connectorMaximumAvailablePower * interval) / (3600 * 1000),
          2,
        );
        const connectorMinimumEnergyRounded = roundTo(
          energySampledValueTemplate.minimumValue ?? 0,
          2,
        );
        const energyValueRounded = isNotEmptyString(energySampledValueTemplate.value)
          ? getRandomFloatFluctuatedRounded(
              getLimitFromSampledValueTemplateCustomValue(
                energySampledValueTemplate.value,
                connectorMaximumEnergyRounded,
                connectorMinimumEnergyRounded,
                {
                  limitationEnabled: chargingStation.stationInfo?.customValueLimitationMeterValues,
                  fallbackValue: connectorMinimumEnergyRounded,
                  unitMultiplier: unitDivider,
                },
              ),
              energySampledValueTemplate.fluctuationPercent ??
                Constants.DEFAULT_FLUCTUATION_PERCENT,
            )
          : getRandomFloatRounded(connectorMaximumEnergyRounded, connectorMinimumEnergyRounded);
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
          buildSampledValue(
            energySampledValueTemplate,
            roundTo(
              chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId) /
                unitDivider,
              2,
            ),
          ),
        );
        const sampledValuesIndex = meterValue.sampledValue.length - 1;
        if (
          energyValueRounded > connectorMaximumEnergyRounded ||
          energyValueRounded < connectorMinimumEnergyRounded ||
          debug
        ) {
          logger.error(
            `${chargingStation.logPrefix()} MeterValues measurand ${
              meterValue.sampledValue[sampledValuesIndex].measurand ??
              MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
            }: connector id ${connectorId}, transaction id ${connector?.transactionId}, value: ${connectorMinimumEnergyRounded}/${energyValueRounded}/${connectorMaximumEnergyRounded}, duration: ${interval}ms`,
          );
        }
      }
      return meterValue;
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
    default:
      throw new BaseError(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot build meterValue: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`,
      );
  }
};

export const buildTransactionEndMeterValue = (
  chargingStation: ChargingStation,
  connectorId: number,
  meterStop: number,
): MeterValue => {
  let meterValue: MeterValue;
  let sampledValueTemplate: SampledValueTemplate | undefined;
  let unitDivider: number;
  switch (chargingStation.stationInfo?.ocppVersion) {
    case OCPPVersion.VERSION_16:
      meterValue = {
        timestamp: new Date(),
        sampledValue: [],
      };
      // Energy.Active.Import.Register measurand (default)
      sampledValueTemplate = getSampledValueTemplate(chargingStation, connectorId);
      unitDivider = sampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
      meterValue.sampledValue.push(
        buildSampledValue(
          sampledValueTemplate!,
          roundTo((meterStop ?? 0) / unitDivider, 4),
          MeterValueContext.TRANSACTION_END,
        ),
      );
      return meterValue;
    case OCPPVersion.VERSION_20:
    case OCPPVersion.VERSION_201:
    default:
      throw new BaseError(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Cannot build meterValue: OCPP version ${chargingStation.stationInfo?.ocppVersion} not supported`,
      );
  }
};

const checkMeasurandPowerDivider = (
  chargingStation: ChargingStation,
  measurandType: MeterValueMeasurand,
): void => {
  if (isUndefined(chargingStation.powerDivider)) {
    const errMsg = `MeterValues measurand ${
      measurandType ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
    }: powerDivider is undefined`;
    logger.error(`${chargingStation.logPrefix()} ${errMsg}`);
    throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES);
  } else if (chargingStation?.powerDivider <= 0) {
    const errMsg = `MeterValues measurand ${
      measurandType ?? MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
    }: powerDivider have zero or below value ${chargingStation.powerDivider}`;
    logger.error(`${chargingStation.logPrefix()} ${errMsg}`);
    throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, RequestCommand.METER_VALUES);
  }
};

const getLimitFromSampledValueTemplateCustomValue = (
  value: string | undefined,
  maxLimit: number,
  minLimit: number,
  options?: { limitationEnabled?: boolean; fallbackValue?: number; unitMultiplier?: number },
): number => {
  options = {
    ...{
      limitationEnabled: false,
      unitMultiplier: 1,
      fallbackValue: 0,
    },
    ...options,
  };
  const parsedValue = parseInt(value ?? '');
  if (options?.limitationEnabled) {
    return max(
      min((!isNaN(parsedValue) ? parsedValue : Infinity) * options.unitMultiplier!, maxLimit),
      minLimit,
    );
  }
  return (!isNaN(parsedValue) ? parsedValue : options.fallbackValue!) * options.unitMultiplier!;
};

const getSampledValueTemplate = (
  chargingStation: ChargingStation,
  connectorId: number,
  measurand: MeterValueMeasurand = MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
  phase?: MeterValuePhase,
): SampledValueTemplate | undefined => {
  const onPhaseStr = phase ? `on phase ${phase} ` : '';
  if (OCPPConstants.OCPP_MEASURANDS_SUPPORTED.includes(measurand) === false) {
    logger.warn(
      `${chargingStation.logPrefix()} Trying to get unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId}`,
    );
    return;
  }
  if (
    measurand !== MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER &&
    getConfigurationKey(
      chargingStation,
      StandardParametersKey.MeterValuesSampledData,
    )?.value?.includes(measurand) === false
  ) {
    logger.debug(
      `${chargingStation.logPrefix()} Trying to get MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId} not found in '${
        StandardParametersKey.MeterValuesSampledData
      }' OCPP parameter`,
    );
    return;
  }
  const sampledValueTemplates: SampledValueTemplate[] =
    chargingStation.getConnectorStatus(connectorId)!.MeterValues;
  for (
    let index = 0;
    isNotEmptyArray(sampledValueTemplates) === true && index < sampledValueTemplates.length;
    index++
  ) {
    if (
      OCPPConstants.OCPP_MEASURANDS_SUPPORTED.includes(
        sampledValueTemplates[index]?.measurand ??
          MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
      ) === false
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} Unsupported MeterValues measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId}`,
      );
    } else if (
      phase &&
      sampledValueTemplates[index]?.phase === phase &&
      sampledValueTemplates[index]?.measurand === measurand &&
      getConfigurationKey(
        chargingStation,
        StandardParametersKey.MeterValuesSampledData,
      )?.value?.includes(measurand) === true
    ) {
      return sampledValueTemplates[index];
    } else if (
      !phase &&
      !sampledValueTemplates[index]?.phase &&
      sampledValueTemplates[index]?.measurand === measurand &&
      getConfigurationKey(
        chargingStation,
        StandardParametersKey.MeterValuesSampledData,
      )?.value?.includes(measurand) === true
    ) {
      return sampledValueTemplates[index];
    } else if (
      measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER &&
      (!sampledValueTemplates[index]?.measurand ||
        sampledValueTemplates[index]?.measurand === measurand)
    ) {
      return sampledValueTemplates[index];
    }
  }
  if (measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) {
    const errorMsg = `Missing MeterValues for default measurand '${measurand}' in template on connector id ${connectorId}`;
    logger.error(`${chargingStation.logPrefix()} ${errorMsg}`);
    throw new BaseError(errorMsg);
  }
  logger.debug(
    `${chargingStation.logPrefix()} No MeterValues for measurand '${measurand}' ${onPhaseStr}in template on connector id ${connectorId}`,
  );
};

const buildSampledValue = (
  sampledValueTemplate: SampledValueTemplate,
  value: number,
  context?: MeterValueContext,
  phase?: MeterValuePhase,
): SampledValue => {
  const sampledValueContext = context ?? sampledValueTemplate?.context;
  const sampledValueLocation =
    sampledValueTemplate?.location ?? getMeasurandDefaultLocation(sampledValueTemplate.measurand!);
  const sampledValuePhase = phase ?? sampledValueTemplate?.phase;
  return {
    ...(!isNullOrUndefined(sampledValueTemplate.unit) && {
      unit: sampledValueTemplate.unit,
    }),
    ...(!isNullOrUndefined(sampledValueContext) && { context: sampledValueContext }),
    ...(!isNullOrUndefined(sampledValueTemplate.measurand) && {
      measurand: sampledValueTemplate.measurand,
    }),
    ...(!isNullOrUndefined(sampledValueLocation) && { location: sampledValueLocation }),
    ...(!isNullOrUndefined(value) && { value: value.toString() }),
    ...(!isNullOrUndefined(sampledValuePhase) && { phase: sampledValuePhase }),
  } as SampledValue;
};

const getMeasurandDefaultLocation = (
  measurandType: MeterValueMeasurand,
): MeterValueLocation | undefined => {
  switch (measurandType) {
    case MeterValueMeasurand.STATE_OF_CHARGE:
      return MeterValueLocation.EV;
  }
};

// const getMeasurandDefaultUnit = (
//   measurandType: MeterValueMeasurand,
// ): MeterValueUnit | undefined => {
//   switch (measurandType) {
//     case MeterValueMeasurand.CURRENT_EXPORT:
//     case MeterValueMeasurand.CURRENT_IMPORT:
//     case MeterValueMeasurand.CURRENT_OFFERED:
//       return MeterValueUnit.AMP;
//     case MeterValueMeasurand.ENERGY_ACTIVE_EXPORT_REGISTER:
//     case MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER:
//       return MeterValueUnit.WATT_HOUR;
//     case MeterValueMeasurand.POWER_ACTIVE_EXPORT:
//     case MeterValueMeasurand.POWER_ACTIVE_IMPORT:
//     case MeterValueMeasurand.POWER_OFFERED:
//       return MeterValueUnit.WATT;
//     case MeterValueMeasurand.STATE_OF_CHARGE:
//       return MeterValueUnit.PERCENT;
//     case MeterValueMeasurand.VOLTAGE:
//       return MeterValueUnit.VOLT;
//   }
// };

export class OCPPServiceUtils {
  public static getMessageTypeString = getMessageTypeString;
  public static sendAndSetConnectorStatus = sendAndSetConnectorStatus;
  public static isIdTagAuthorized = isIdTagAuthorized;
  public static buildTransactionEndMeterValue = buildTransactionEndMeterValue;
  protected static getSampledValueTemplate = getSampledValueTemplate;
  protected static buildSampledValue = buildSampledValue;

  protected constructor() {
    // This is intentional
  }

  public static ajvErrorsToErrorType(errors: ErrorObject[] | null | undefined): ErrorType {
    if (isNotEmptyArray(errors) === true) {
      for (const error of errors as DefinedError[]) {
        switch (error.keyword) {
          case 'type':
            return ErrorType.TYPE_CONSTRAINT_VIOLATION;
          case 'dependencies':
          case 'required':
            return ErrorType.OCCURRENCE_CONSTRAINT_VIOLATION;
          case 'pattern':
          case 'format':
            return ErrorType.PROPERTY_CONSTRAINT_VIOLATION;
        }
      }
    }
    return ErrorType.FORMAT_VIOLATION;
  }

  public static isRequestCommandSupported(
    chargingStation: ChargingStation,
    command: RequestCommand,
  ): boolean {
    const isRequestCommand = Object.values<RequestCommand>(RequestCommand).includes(command);
    if (
      isRequestCommand === true &&
      !chargingStation.stationInfo?.commandsSupport?.outgoingCommands
    ) {
      return true;
    } else if (
      isRequestCommand === true &&
      chargingStation.stationInfo?.commandsSupport?.outgoingCommands?.[command]
    ) {
      return chargingStation.stationInfo?.commandsSupport?.outgoingCommands[command];
    }
    logger.error(`${chargingStation.logPrefix()} Unknown outgoing OCPP command '${command}'`);
    return false;
  }

  public static isIncomingRequestCommandSupported(
    chargingStation: ChargingStation,
    command: IncomingRequestCommand,
  ): boolean {
    const isIncomingRequestCommand =
      Object.values<IncomingRequestCommand>(IncomingRequestCommand).includes(command);
    if (
      isIncomingRequestCommand === true &&
      !chargingStation.stationInfo?.commandsSupport?.incomingCommands
    ) {
      return true;
    } else if (
      isIncomingRequestCommand === true &&
      chargingStation.stationInfo?.commandsSupport?.incomingCommands?.[command]
    ) {
      return chargingStation.stationInfo?.commandsSupport?.incomingCommands[command];
    }
    logger.error(`${chargingStation.logPrefix()} Unknown incoming OCPP command '${command}'`);
    return false;
  }

  public static isMessageTriggerSupported(
    chargingStation: ChargingStation,
    messageTrigger: MessageTrigger,
  ): boolean {
    const isMessageTrigger = Object.values(MessageTrigger).includes(messageTrigger);
    if (isMessageTrigger === true && !chargingStation.stationInfo?.messageTriggerSupport) {
      return true;
    } else if (
      isMessageTrigger === true &&
      chargingStation.stationInfo?.messageTriggerSupport?.[messageTrigger]
    ) {
      return chargingStation.stationInfo?.messageTriggerSupport[messageTrigger];
    }
    logger.error(
      `${chargingStation.logPrefix()} Unknown incoming OCPP message trigger '${messageTrigger}'`,
    );
    return false;
  }

  public static isConnectorIdValid(
    chargingStation: ChargingStation,
    ocppCommand: IncomingRequestCommand,
    connectorId: number,
  ): boolean {
    if (connectorId < 0) {
      logger.error(
        `${chargingStation.logPrefix()} ${ocppCommand} incoming request received with invalid connector id ${connectorId}`,
      );
      return false;
    }
    return true;
  }

  public static convertDateToISOString<T extends JsonType>(obj: T): void {
    for (const key in obj) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      if (isDate(obj![key])) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        (obj![key] as string) = (obj![key] as Date).toISOString();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      } else if (obj![key] !== null && typeof obj![key] === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        OCPPServiceUtils.convertDateToISOString<T>(obj![key] as T);
      }
    }
  }

  public static startHeartbeatInterval(chargingStation: ChargingStation, interval: number): void {
    if (chargingStation.heartbeatSetInterval === undefined) {
      chargingStation.startHeartbeat();
    } else if (chargingStation.getHeartbeatInterval() !== interval) {
      chargingStation.restartHeartbeat();
    }
  }

  protected static parseJsonSchemaFile<T extends JsonType>(
    relativePath: string,
    ocppVersion: OCPPVersion,
    moduleName?: string,
    methodName?: string,
  ): JSONSchemaType<T> {
    const filePath = join(dirname(fileURLToPath(import.meta.url)), relativePath);
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as JSONSchemaType<T>;
    } catch (error) {
      handleFileException(
        filePath,
        FileType.JsonSchema,
        error as NodeJS.ErrnoException,
        OCPPServiceUtils.logPrefix(ocppVersion, moduleName, methodName),
        { throwError: false },
      );
      return {} as JSONSchemaType<T>;
    }
  }

  private static logPrefix = (
    ocppVersion: OCPPVersion,
    moduleName?: string,
    methodName?: string,
  ): string => {
    const logMsg =
      isNotEmptyString(moduleName) && isNotEmptyString(methodName)
        ? ` OCPP ${ocppVersion} | ${moduleName}.${methodName}:`
        : ` OCPP ${ocppVersion} |`;
    return logPrefix(logMsg);
  };
}
