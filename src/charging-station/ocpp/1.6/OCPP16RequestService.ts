// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { ACElectricUtils, DCElectricUtils } from '../../../utils/ElectricUtils';
import { AuthorizeRequest, OCPP16AuthorizeResponse, OCPP16StartTransactionResponse, OCPP16StopTransactionReason, OCPP16StopTransactionResponse, StartTransactionRequest, StopTransactionRequest } from '../../../types/ocpp/1.6/Transaction';
import { CurrentType, Voltage } from '../../../types/ChargingStationTemplate';
import { DiagnosticsStatusNotificationRequest, HeartbeatRequest, OCPP16BootNotificationRequest, OCPP16IncomingRequestCommand, OCPP16RequestCommand, StatusNotificationRequest } from '../../../types/ocpp/1.6/Requests';
import { MeterValueUnit, MeterValuesRequest, OCPP16MeterValue, OCPP16MeterValueMeasurand, OCPP16MeterValuePhase } from '../../../types/ocpp/1.6/MeterValues';

import ChargingStation from '../../ChargingStation';
import Constants from '../../../utils/Constants';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { JsonType } from '../../../types/JsonType';
import MeasurandPerPhaseSampledValueTemplates from '../../../types/MeasurandPerPhaseSampledValueTemplates';
import MeasurandValues from '../../../types/MeasurandValues';
import { MessageType } from '../../../types/ocpp/MessageType';
import { OCPP16BootNotificationResponse } from '../../../types/ocpp/1.6/Responses';
import { OCPP16ChargePointErrorCode } from '../../../types/ocpp/1.6/ChargePointErrorCode';
import { OCPP16ChargePointStatus } from '../../../types/ocpp/1.6/ChargePointStatus';
import { OCPP16DiagnosticsStatus } from '../../../types/ocpp/1.6/DiagnosticsStatus';
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';
import OCPPError from '../../../exception/OCPPError';
import OCPPRequestService from '../OCPPRequestService';
import OCPPResponseService from '../OCPPResponseService';
import { SendParams } from '../../../types/ocpp/Requests';
import Utils from '../../../utils/Utils';
import logger from '../../../utils/Logger';

export default class OCPP16RequestService extends OCPPRequestService {
  public constructor(chargingStation: ChargingStation, ocppResponseService: OCPPResponseService) {
    if (new.target?.name === 'OCPP16RequestService') {
      throw new TypeError('Cannot construct OCPP16RequestService instances directly');
    }
    super(chargingStation, ocppResponseService);
  }

  public async sendHeartbeat(params?: SendParams): Promise<void> {
    try {
      const payload: HeartbeatRequest = {};
      await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.HEARTBEAT, params);
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.HEARTBEAT, error as Error);
    }
  }

  public async sendBootNotification(chargePointModel: string, chargePointVendor: string, chargeBoxSerialNumber?: string, firmwareVersion?: string,
      chargePointSerialNumber?: string, iccid?: string, imsi?: string, meterSerialNumber?: string, meterType?: string,
      params?: SendParams): Promise<OCPP16BootNotificationResponse> {
    try {
      const payload: OCPP16BootNotificationRequest = {
        chargePointModel,
        chargePointVendor,
        ...!Utils.isUndefined(chargeBoxSerialNumber) && { chargeBoxSerialNumber },
        ...!Utils.isUndefined(chargePointSerialNumber) && { chargePointSerialNumber },
        ...!Utils.isUndefined(firmwareVersion) && { firmwareVersion },
        ...!Utils.isUndefined(iccid) && { iccid },
        ...!Utils.isUndefined(imsi) && { imsi },
        ...!Utils.isUndefined(meterSerialNumber) && { meterSerialNumber },
        ...!Utils.isUndefined(meterType) && { meterType }
      };
      return await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE,
        OCPP16RequestCommand.BOOT_NOTIFICATION, { ...params, skipBufferingOnError: true }) as OCPP16BootNotificationResponse;
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.BOOT_NOTIFICATION, error as Error);
    }
  }

  public async sendStatusNotification(connectorId: number, status: OCPP16ChargePointStatus,
      errorCode: OCPP16ChargePointErrorCode = OCPP16ChargePointErrorCode.NO_ERROR): Promise<void> {
    try {
      const payload: StatusNotificationRequest = {
        connectorId,
        errorCode,
        status,
      };
      await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.STATUS_NOTIFICATION);
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.STATUS_NOTIFICATION, error as Error);
    }
  }

  public async sendAuthorize(connectorId: number, idTag?: string): Promise<OCPP16AuthorizeResponse> {
    try {
      const payload: AuthorizeRequest = {
        ...!Utils.isUndefined(idTag) ? { idTag } : { idTag: Constants.TRANSACTION_DEFAULT_IDTAG },
      };
      this.chargingStation.getConnectorStatus(connectorId).authorizeIdTag = idTag;
      return await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.AUTHORIZE) as OCPP16AuthorizeResponse;
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.AUTHORIZE, error as Error);
    }
  }

  public async sendStartTransaction(connectorId: number, idTag?: string): Promise<OCPP16StartTransactionResponse> {
    try {
      const payload: StartTransactionRequest = {
        connectorId,
        ...!Utils.isUndefined(idTag) ? { idTag } : { idTag: Constants.TRANSACTION_DEFAULT_IDTAG },
        meterStart: this.chargingStation.getEnergyActiveImportRegisterByConnectorId(connectorId),
        timestamp: new Date().toISOString(),
      };
      return await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.START_TRANSACTION) as OCPP16StartTransactionResponse;
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.START_TRANSACTION, error as Error);
    }
  }

  public async sendStopTransaction(transactionId: number, meterStop: number, idTag?: string,
      reason: OCPP16StopTransactionReason = OCPP16StopTransactionReason.NONE): Promise<OCPP16StopTransactionResponse> {
    try {
      let connectorId: number;
      for (const id of this.chargingStation.connectors.keys()) {
        if (id > 0 && this.chargingStation.getConnectorStatus(id)?.transactionId === transactionId) {
          connectorId = id;
          break;
        }
      }
      const transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(this.chargingStation, connectorId, meterStop);
      // FIXME: should be a callback, each OCPP commands implementation must do only one job
      (this.chargingStation.getBeginEndMeterValues() && this.chargingStation.getOcppStrictCompliance() && !this.chargingStation.getOutOfOrderEndMeterValues())
        && await this.sendTransactionEndMeterValues(connectorId, transactionId, transactionEndMeterValue);
      const payload: StopTransactionRequest = {
        transactionId,
        ...!Utils.isUndefined(idTag) && { idTag },
        meterStop,
        timestamp: new Date().toISOString(),
        ...reason && { reason },
        ...this.chargingStation.getTransactionDataMeterValues() && { transactionData: OCPP16ServiceUtils.buildTransactionDataMeterValues(this.chargingStation.getConnectorStatus(connectorId).transactionBeginMeterValue, transactionEndMeterValue) },
      };
      return await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.STOP_TRANSACTION) as OCPP16StartTransactionResponse;
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.STOP_TRANSACTION, error as Error);
    }
  }

  public async sendMeterValues(connectorId: number, transactionId: number, interval: number, debug = false): Promise<void> {
    try {
      const meterValue: OCPP16MeterValue = {
        timestamp: new Date().toISOString(),
        sampledValue: [],
      };
      const connector = this.chargingStation.getConnectorStatus(connectorId);
      // SoC measurand
      const socSampledValueTemplate = this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.STATE_OF_CHARGE);
      if (socSampledValueTemplate) {
        const socSampledValueTemplateValue = socSampledValueTemplate.value
          ? Utils.getRandomFloatFluctuatedRounded(parseInt(socSampledValueTemplate.value), socSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT)
          : Utils.getRandomInteger(100);
        meterValue.sampledValue.push(OCPP16ServiceUtils.buildSampledValue(socSampledValueTemplate, socSampledValueTemplateValue));
        const sampledValuesIndex = meterValue.sampledValue.length - 1;
        if (Utils.convertToInt(meterValue.sampledValue[sampledValuesIndex].value) > 100 || debug) {
          logger.error(`${this.chargingStation.logPrefix()} MeterValues measurand ${meterValue.sampledValue[sampledValuesIndex].measurand ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${meterValue.sampledValue[sampledValuesIndex].value}/100`);
        }
      }
      // Voltage measurand
      const voltageSampledValueTemplate = this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.VOLTAGE);
      if (voltageSampledValueTemplate) {
        const voltageSampledValueTemplateValue = voltageSampledValueTemplate.value ? parseInt(voltageSampledValueTemplate.value) : this.chargingStation.getVoltageOut();
        const fluctuationPercent = voltageSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT;
        const voltageMeasurandValue = Utils.getRandomFloatFluctuatedRounded(voltageSampledValueTemplateValue, fluctuationPercent);
        if (this.chargingStation.getNumberOfPhases() !== 3 || (this.chargingStation.getNumberOfPhases() === 3 && this.chargingStation.getMainVoltageMeterValues())) {
          meterValue.sampledValue.push(OCPP16ServiceUtils.buildSampledValue(voltageSampledValueTemplate, voltageMeasurandValue));
        }
        for (let phase = 1; this.chargingStation.getNumberOfPhases() === 3 && phase <= this.chargingStation.getNumberOfPhases(); phase++) {
          const phaseLineToNeutralValue = `L${phase}-N`;
          const voltagePhaseLineToNeutralSampledValueTemplate = this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.VOLTAGE,
            phaseLineToNeutralValue as OCPP16MeterValuePhase);
          let voltagePhaseLineToNeutralMeasurandValue: number;
          if (voltagePhaseLineToNeutralSampledValueTemplate) {
            const voltagePhaseLineToNeutralSampledValueTemplateValue = voltagePhaseLineToNeutralSampledValueTemplate.value ? parseInt(voltagePhaseLineToNeutralSampledValueTemplate.value) : this.chargingStation.getVoltageOut();
            const fluctuationPhaseToNeutralPercent = voltagePhaseLineToNeutralSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT;
            voltagePhaseLineToNeutralMeasurandValue = Utils.getRandomFloatFluctuatedRounded(voltagePhaseLineToNeutralSampledValueTemplateValue, fluctuationPhaseToNeutralPercent);
          }
          meterValue.sampledValue.push(OCPP16ServiceUtils.buildSampledValue(voltagePhaseLineToNeutralSampledValueTemplate ?? voltageSampledValueTemplate,
            voltagePhaseLineToNeutralMeasurandValue ?? voltageMeasurandValue, null, phaseLineToNeutralValue as OCPP16MeterValuePhase));
          if (this.chargingStation.getPhaseLineToLineVoltageMeterValues()) {
            const phaseLineToLineValue = `L${phase}-L${(phase + 1) % this.chargingStation.getNumberOfPhases() !== 0 ? (phase + 1) % this.chargingStation.getNumberOfPhases() : this.chargingStation.getNumberOfPhases()}`;
            const voltagePhaseLineToLineSampledValueTemplate = this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.VOLTAGE, phaseLineToLineValue as OCPP16MeterValuePhase);
            let voltagePhaseLineToLineMeasurandValue: number;
            if (voltagePhaseLineToLineSampledValueTemplate) {
              const voltagePhaseLineToLineSampledValueTemplateValue = voltagePhaseLineToLineSampledValueTemplate.value ? parseInt(voltagePhaseLineToLineSampledValueTemplate.value) : Voltage.VOLTAGE_400;
              const fluctuationPhaseLineToLinePercent = voltagePhaseLineToLineSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT;
              voltagePhaseLineToLineMeasurandValue = Utils.getRandomFloatFluctuatedRounded(voltagePhaseLineToLineSampledValueTemplateValue, fluctuationPhaseLineToLinePercent);
            }
            const defaultVoltagePhaseLineToLineMeasurandValue = Utils.getRandomFloatFluctuatedRounded(Voltage.VOLTAGE_400, fluctuationPercent);
            meterValue.sampledValue.push(OCPP16ServiceUtils.buildSampledValue(voltagePhaseLineToLineSampledValueTemplate ?? voltageSampledValueTemplate,
              voltagePhaseLineToLineMeasurandValue ?? defaultVoltagePhaseLineToLineMeasurandValue, null, phaseLineToLineValue as OCPP16MeterValuePhase));
          }
        }
      }
      // Power.Active.Import measurand
      const powerSampledValueTemplate = this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT);
      let powerPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {};
      if (this.chargingStation.getNumberOfPhases() === 3) {
        powerPerPhaseSampledValueTemplates = {
          L1: this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT, OCPP16MeterValuePhase.L1_N),
          L2: this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT, OCPP16MeterValuePhase.L2_N),
          L3: this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT, OCPP16MeterValuePhase.L3_N),
        };
      }
      if (powerSampledValueTemplate) {
        OCPP16ServiceUtils.checkMeasurandPowerDivider(this.chargingStation, powerSampledValueTemplate.measurand);
        const errMsg = `${this.chargingStation.logPrefix()} MeterValues measurand ${powerSampledValueTemplate.measurand ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: Unknown ${this.chargingStation.getCurrentOutType()} currentOutType in template file ${this.chargingStation.stationTemplateFile}, cannot calculate ${powerSampledValueTemplate.measurand ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER} measurand value`;
        const powerMeasurandValues = {} as MeasurandValues;
        const unitDivider = powerSampledValueTemplate?.unit === MeterValueUnit.KILO_WATT ? 1000 : 1;
        const maxPower = Math.round(this.chargingStation.stationInfo.maxPower / this.chargingStation.stationInfo.powerDivider);
        const maxPowerPerPhase = Math.round((this.chargingStation.stationInfo.maxPower / this.chargingStation.stationInfo.powerDivider) / this.chargingStation.getNumberOfPhases());
        switch (this.chargingStation.getCurrentOutType()) {
          case CurrentType.AC:
            if (this.chargingStation.getNumberOfPhases() === 3) {
              const defaultFluctuatedPowerPerPhase = powerSampledValueTemplate.value
                && Utils.getRandomFloatFluctuatedRounded(parseInt(powerSampledValueTemplate.value) / this.chargingStation.getNumberOfPhases(), powerSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT);
              const phase1FluctuatedValue = powerPerPhaseSampledValueTemplates?.L1?.value
                && Utils.getRandomFloatFluctuatedRounded(parseInt(powerPerPhaseSampledValueTemplates.L1.value), powerPerPhaseSampledValueTemplates.L1.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT);
              const phase2FluctuatedValue = powerPerPhaseSampledValueTemplates?.L2?.value
                && Utils.getRandomFloatFluctuatedRounded(parseInt(powerPerPhaseSampledValueTemplates.L2.value), powerPerPhaseSampledValueTemplates.L2.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT);
              const phase3FluctuatedValue = powerPerPhaseSampledValueTemplates?.L3?.value
                && Utils.getRandomFloatFluctuatedRounded(parseInt(powerPerPhaseSampledValueTemplates.L3.value), powerPerPhaseSampledValueTemplates.L3.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT);
              powerMeasurandValues.L1 = (phase1FluctuatedValue ?? defaultFluctuatedPowerPerPhase) ?? Utils.getRandomFloatRounded(maxPowerPerPhase / unitDivider);
              powerMeasurandValues.L2 = (phase2FluctuatedValue ?? defaultFluctuatedPowerPerPhase) ?? Utils.getRandomFloatRounded(maxPowerPerPhase / unitDivider);
              powerMeasurandValues.L3 = (phase3FluctuatedValue ?? defaultFluctuatedPowerPerPhase) ?? Utils.getRandomFloatRounded(maxPowerPerPhase / unitDivider);
            } else {
              powerMeasurandValues.L1 = powerSampledValueTemplate.value
                ? Utils.getRandomFloatFluctuatedRounded(parseInt(powerSampledValueTemplate.value), powerSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT)
                : Utils.getRandomFloatRounded(maxPower / unitDivider);
              powerMeasurandValues.L2 = 0;
              powerMeasurandValues.L3 = 0;
            }
            powerMeasurandValues.allPhases = Utils.roundTo(powerMeasurandValues.L1 + powerMeasurandValues.L2 + powerMeasurandValues.L3, 2);
            break;
          case CurrentType.DC:
            powerMeasurandValues.allPhases = powerSampledValueTemplate.value
              ? Utils.getRandomFloatFluctuatedRounded(parseInt(powerSampledValueTemplate.value), powerSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT)
              : Utils.getRandomFloatRounded(maxPower / unitDivider);
            break;
          default:
            logger.error(errMsg);
            throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, OCPP16RequestCommand.METER_VALUES);
        }
        meterValue.sampledValue.push(OCPP16ServiceUtils.buildSampledValue(powerSampledValueTemplate, powerMeasurandValues.allPhases));
        const sampledValuesIndex = meterValue.sampledValue.length - 1;
        const maxPowerRounded = Utils.roundTo(maxPower / unitDivider, 2);
        if (Utils.convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) > maxPowerRounded || debug) {
          logger.error(`${this.chargingStation.logPrefix()} MeterValues measurand ${meterValue.sampledValue[sampledValuesIndex].measurand ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${meterValue.sampledValue[sampledValuesIndex].value}/${maxPowerRounded}`);
        }
        for (let phase = 1; this.chargingStation.getNumberOfPhases() === 3 && phase <= this.chargingStation.getNumberOfPhases(); phase++) {
          const phaseValue = `L${phase}-N`;
          meterValue.sampledValue.push(OCPP16ServiceUtils.buildSampledValue(powerPerPhaseSampledValueTemplates[`L${phase}`] ?? powerSampledValueTemplate, powerMeasurandValues[`L${phase}`], null,
            phaseValue as OCPP16MeterValuePhase));
          const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1;
          const maxPowerPerPhaseRounded = Utils.roundTo(maxPowerPerPhase / unitDivider, 2);
          if (Utils.convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) > maxPowerPerPhaseRounded || debug) {
            logger.error(`${this.chargingStation.logPrefix()} MeterValues measurand ${meterValue.sampledValue[sampledValuesPerPhaseIndex].measurand ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: phase ${meterValue.sampledValue[sampledValuesPerPhaseIndex].phase}, connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${meterValue.sampledValue[sampledValuesPerPhaseIndex].value}/${maxPowerPerPhaseRounded}`);
          }
        }
      }
      // Current.Import measurand
      const currentSampledValueTemplate = this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.CURRENT_IMPORT);
      let currentPerPhaseSampledValueTemplates: MeasurandPerPhaseSampledValueTemplates = {};
      if (this.chargingStation.getNumberOfPhases() === 3) {
        currentPerPhaseSampledValueTemplates = {
          L1: this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.CURRENT_IMPORT, OCPP16MeterValuePhase.L1),
          L2: this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.CURRENT_IMPORT, OCPP16MeterValuePhase.L2),
          L3: this.chargingStation.getSampledValueTemplate(connectorId, OCPP16MeterValueMeasurand.CURRENT_IMPORT, OCPP16MeterValuePhase.L3),
        };
      }
      if (currentSampledValueTemplate) {
        OCPP16ServiceUtils.checkMeasurandPowerDivider(this.chargingStation, currentSampledValueTemplate.measurand);
        const errMsg = `${this.chargingStation.logPrefix()} MeterValues measurand ${currentSampledValueTemplate.measurand ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: Unknown ${this.chargingStation.getCurrentOutType()} currentOutType in template file ${this.chargingStation.stationTemplateFile}, cannot calculate ${currentSampledValueTemplate.measurand ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER} measurand value`;
        const currentMeasurandValues: MeasurandValues = {} as MeasurandValues;
        let maxAmperage: number;
        switch (this.chargingStation.getCurrentOutType()) {
          case CurrentType.AC:
            maxAmperage = ACElectricUtils.amperagePerPhaseFromPower(this.chargingStation.getNumberOfPhases(), this.chargingStation.stationInfo.maxPower / this.chargingStation.stationInfo.powerDivider, this.chargingStation.getVoltageOut());
            if (this.chargingStation.getNumberOfPhases() === 3) {
              const defaultFluctuatedAmperagePerPhase = currentSampledValueTemplate.value
                && Utils.getRandomFloatFluctuatedRounded(parseInt(currentSampledValueTemplate.value), currentSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT);
              const phase1FluctuatedValue = currentPerPhaseSampledValueTemplates?.L1?.value
                && Utils.getRandomFloatFluctuatedRounded(parseInt(currentPerPhaseSampledValueTemplates.L1.value), currentPerPhaseSampledValueTemplates.L1.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT);
              const phase2FluctuatedValue = currentPerPhaseSampledValueTemplates?.L2?.value
                && Utils.getRandomFloatFluctuatedRounded(parseInt(currentPerPhaseSampledValueTemplates.L2.value), currentPerPhaseSampledValueTemplates.L2.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT);
              const phase3FluctuatedValue = currentPerPhaseSampledValueTemplates?.L3?.value
                && Utils.getRandomFloatFluctuatedRounded(parseInt(currentPerPhaseSampledValueTemplates.L3.value), currentPerPhaseSampledValueTemplates.L3.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT);
              currentMeasurandValues.L1 = (phase1FluctuatedValue ?? defaultFluctuatedAmperagePerPhase) ?? Utils.getRandomFloatRounded(maxAmperage);
              currentMeasurandValues.L2 = (phase2FluctuatedValue ?? defaultFluctuatedAmperagePerPhase) ?? Utils.getRandomFloatRounded(maxAmperage);
              currentMeasurandValues.L3 = (phase3FluctuatedValue ?? defaultFluctuatedAmperagePerPhase) ?? Utils.getRandomFloatRounded(maxAmperage);
            } else {
              currentMeasurandValues.L1 = currentSampledValueTemplate.value
                ? Utils.getRandomFloatFluctuatedRounded(parseInt(currentSampledValueTemplate.value), currentSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT)
                : Utils.getRandomFloatRounded(maxAmperage);
              currentMeasurandValues.L2 = 0;
              currentMeasurandValues.L3 = 0;
            }
            currentMeasurandValues.allPhases = Utils.roundTo((currentMeasurandValues.L1 + currentMeasurandValues.L2 + currentMeasurandValues.L3) / this.chargingStation.getNumberOfPhases(), 2);
            break;
          case CurrentType.DC:
            maxAmperage = DCElectricUtils.amperage(this.chargingStation.stationInfo.maxPower / this.chargingStation.stationInfo.powerDivider, this.chargingStation.getVoltageOut());
            currentMeasurandValues.allPhases = currentSampledValueTemplate.value
              ? Utils.getRandomFloatFluctuatedRounded(parseInt(currentSampledValueTemplate.value), currentSampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT)
              : Utils.getRandomFloatRounded(maxAmperage);
            break;
          default:
            logger.error(errMsg);
            throw new OCPPError(ErrorType.INTERNAL_ERROR, errMsg, OCPP16RequestCommand.METER_VALUES);
        }
        meterValue.sampledValue.push(OCPP16ServiceUtils.buildSampledValue(currentSampledValueTemplate, currentMeasurandValues.allPhases));
        const sampledValuesIndex = meterValue.sampledValue.length - 1;
        if (Utils.convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) > maxAmperage || debug) {
          logger.error(`${this.chargingStation.logPrefix()} MeterValues measurand ${meterValue.sampledValue[sampledValuesIndex].measurand ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${meterValue.sampledValue[sampledValuesIndex].value}/${maxAmperage}`);
        }
        for (let phase = 1; this.chargingStation.getNumberOfPhases() === 3 && phase <= this.chargingStation.getNumberOfPhases(); phase++) {
          const phaseValue = `L${phase}`;
          meterValue.sampledValue.push(OCPP16ServiceUtils.buildSampledValue(currentPerPhaseSampledValueTemplates[phaseValue] ?? currentSampledValueTemplate,
            currentMeasurandValues[phaseValue], null, phaseValue as OCPP16MeterValuePhase));
          const sampledValuesPerPhaseIndex = meterValue.sampledValue.length - 1;
          if (Utils.convertToFloat(meterValue.sampledValue[sampledValuesPerPhaseIndex].value) > maxAmperage || debug) {
            logger.error(`${this.chargingStation.logPrefix()} MeterValues measurand ${meterValue.sampledValue[sampledValuesPerPhaseIndex].measurand ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: phase ${meterValue.sampledValue[sampledValuesPerPhaseIndex].phase}, connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${meterValue.sampledValue[sampledValuesPerPhaseIndex].value}/${maxAmperage}`);
          }
        }
      }
      // Energy.Active.Import.Register measurand (default)
      const energySampledValueTemplate = this.chargingStation.getSampledValueTemplate(connectorId);
      if (energySampledValueTemplate) {
        OCPP16ServiceUtils.checkMeasurandPowerDivider(this.chargingStation, energySampledValueTemplate.measurand);
        const unitDivider = energySampledValueTemplate?.unit === MeterValueUnit.KILO_WATT_HOUR ? 1000 : 1;
        const maxEnergyRounded = Utils.roundTo(((this.chargingStation.stationInfo.maxPower / this.chargingStation.stationInfo.powerDivider) * interval) / (3600 * 1000), 2);
        const energyValueRounded = energySampledValueTemplate.value
          // Cumulate the fluctuated value around the static one
          ? Utils.getRandomFloatFluctuatedRounded(parseInt(energySampledValueTemplate.value), energySampledValueTemplate.fluctuationPercent ?? Constants.DEFAULT_FLUCTUATION_PERCENT)
          : Utils.getRandomFloatRounded(maxEnergyRounded);
        // Persist previous value on connector
        if (connector && !Utils.isNullOrUndefined(connector.energyActiveImportRegisterValue) && connector.energyActiveImportRegisterValue >= 0 &&
          !Utils.isNullOrUndefined(connector.transactionEnergyActiveImportRegisterValue) && connector.transactionEnergyActiveImportRegisterValue >= 0) {
          connector.energyActiveImportRegisterValue += energyValueRounded;
          connector.transactionEnergyActiveImportRegisterValue += energyValueRounded;
        } else {
          connector.energyActiveImportRegisterValue = 0;
          connector.transactionEnergyActiveImportRegisterValue = 0;
        }
        meterValue.sampledValue.push(OCPP16ServiceUtils.buildSampledValue(energySampledValueTemplate,
          Utils.roundTo(this.chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId) / unitDivider, 2)));
        const sampledValuesIndex = meterValue.sampledValue.length - 1;
        if (energyValueRounded > maxEnergyRounded || debug) {
          logger.error(`${this.chargingStation.logPrefix()} MeterValues measurand ${meterValue.sampledValue[sampledValuesIndex].measurand ?? OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${energyValueRounded}/${maxEnergyRounded}, duration: ${Utils.roundTo(interval / (3600 * 1000), 4)}h`);
        }
      }
      const payload: MeterValuesRequest = {
        connectorId,
        transactionId,
        meterValue: [meterValue],
      };
      await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.METER_VALUES);
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.METER_VALUES, error as Error);
    }
  }

  public async sendTransactionBeginMeterValues(connectorId: number, transactionId: number, beginMeterValue: OCPP16MeterValue): Promise<void> {
    try {
      const payload: MeterValuesRequest = {
        connectorId,
        transactionId,
        meterValue: [beginMeterValue],
      };
      await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.METER_VALUES);
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.METER_VALUES, error as Error);
    }
  }

  public async sendTransactionEndMeterValues(connectorId: number, transactionId: number, endMeterValue: OCPP16MeterValue): Promise<void> {
    try {
      const payload: MeterValuesRequest = {
        connectorId,
        transactionId,
        meterValue: [endMeterValue],
      };
      await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.METER_VALUES);
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.METER_VALUES, error as Error);
    }
  }

  public async sendDiagnosticsStatusNotification(diagnosticsStatus: OCPP16DiagnosticsStatus): Promise<void> {
    try {
      const payload: DiagnosticsStatusNotificationRequest = {
        status: diagnosticsStatus
      };
      await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION);
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.METER_VALUES, error as Error);
    }
  }

  public async sendResult(messageId: string, resultMessageData: JsonType, commandName: OCPP16RequestCommand | OCPP16IncomingRequestCommand): Promise<JsonType> {
    try {
      // Send error
      return await this.sendMessage(messageId, resultMessageData, MessageType.CALL_RESULT_MESSAGE, commandName) as JsonType;
    } catch (error) {
      this.handleRequestError(commandName as OCPP16RequestCommand, error as Error);
    }
  }

  public async sendError(messageId: string, ocppError: OCPPError, commandName: OCPP16RequestCommand | OCPP16IncomingRequestCommand): Promise<JsonType> {
    try {
      // Send error
      return await this.sendMessage(messageId, ocppError, MessageType.CALL_ERROR_MESSAGE, commandName) as JsonType;
    } catch (error) {
      this.handleRequestError(commandName as OCPP16RequestCommand, error as Error);
    }
  }
}
