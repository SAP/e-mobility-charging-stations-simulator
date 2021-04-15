import { AuthorizeRequest, OCPP16AuthorizeResponse, OCPP16StartTransactionResponse, OCPP16StopTransactionReason, OCPP16StopTransactionResponse, StartTransactionRequest, StopTransactionRequest } from '../../../types/ocpp/1.6/Transaction';
import { HeartbeatRequest, OCPP16BootNotificationRequest, OCPP16IncomingRequestCommand, OCPP16RequestCommand, StatusNotificationRequest } from '../../../types/ocpp/1.6/Requests';
import { MeterValue, MeterValueLocation, MeterValuePhase, MeterValueUnit, MeterValuesRequest, OCPP16MeterValueMeasurand, OCPP16SampledValue } from '../../../types/ocpp/1.6/MeterValues';

import { ACElectricUtils } from '../../../utils/ElectricUtils';
import Constants from '../../../utils/Constants';
import MeasurandValues from '../../../types/MeasurandValues';
import { MessageType } from '../../../types/ocpp/MessageType';
import { OCPP16BootNotificationResponse } from '../../../types/ocpp/1.6/Responses';
import { OCPP16ChargePointErrorCode } from '../../../types/ocpp/1.6/ChargePointErrorCode';
import { OCPP16ChargePointStatus } from '../../../types/ocpp/1.6/ChargePointStatus';
import { OCPP16StandardParametersKey } from '../../../types/ocpp/1.6/Configuration';
import OCPPError from '../../OcppError';
import OCPPRequestService from '../OCPPRequestService';
import { PowerOutType } from '../../../types/ChargingStationTemplate';
import Utils from '../../../utils/Utils';
import logger from '../../../utils/Logger';

export default class OCPP16RequestService extends OCPPRequestService {
  public async sendHeartbeat(): Promise<void> {
    try {
      const payload: HeartbeatRequest = {};
      await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.HEARTBEAT);
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.HEARTBEAT, error);
    }
  }

  public async sendBootNotification(chargePointModel: string, chargePointVendor: string, chargeBoxSerialNumber?: string, firmwareVersion?: string, chargePointSerialNumber?: string, iccid?: string, imsi?: string, meterSerialNumber?: string, meterType?: string): Promise<OCPP16BootNotificationResponse> {
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
      return await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.BOOT_NOTIFICATION) as OCPP16BootNotificationResponse;
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.BOOT_NOTIFICATION, error);
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
      this.handleRequestError(OCPP16RequestCommand.STATUS_NOTIFICATION, error);
    }
  }

  public async sendAuthorize(idTag?: string): Promise<OCPP16AuthorizeResponse> {
    try {
      const payload: AuthorizeRequest = {
        ...!Utils.isUndefined(idTag) ? { idTag } : { idTag: Constants.TRANSACTION_DEFAULT_TAGID },
      };
      return await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.AUTHORIZE) as OCPP16AuthorizeResponse;
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.AUTHORIZE, error);
    }
  }

  public async sendStartTransaction(connectorId: number, idTag?: string): Promise<OCPP16StartTransactionResponse> {
    try {
      const payload: StartTransactionRequest = {
        connectorId,
        ...!Utils.isUndefined(idTag) ? { idTag } : { idTag: Constants.TRANSACTION_DEFAULT_TAGID },
        meterStart: 0,
        timestamp: new Date().toISOString(),
      };
      return await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.START_TRANSACTION) as OCPP16StartTransactionResponse;
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.START_TRANSACTION, error);
    }
  }

  public async sendStopTransaction(transactionId: number, meterStop: number, idTag?: string,
      reason: OCPP16StopTransactionReason = OCPP16StopTransactionReason.NONE): Promise<OCPP16StopTransactionResponse> {
    try {
      const payload: StopTransactionRequest = {
        transactionId,
        ...!Utils.isUndefined(idTag) && { idTag },
        meterStop: meterStop,
        timestamp: new Date().toISOString(),
        ...reason && { reason },
      };
      return await this.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.STOP_TRANSACTION) as OCPP16StartTransactionResponse;
    } catch (error) {
      this.handleRequestError(OCPP16RequestCommand.STOP_TRANSACTION, error);
    }
  }

  // eslint-disable-next-line consistent-this
  public async sendMeterValues(connectorId: number, transactionId: number, interval: number, self: OCPPRequestService, debug = false): Promise<void> {
    try {
      const meterValue: MeterValue = {
        timestamp: new Date().toISOString(),
        sampledValue: [],
      };
      const meterValuesTemplate: OCPP16SampledValue[] = self.chargingStation.getConnector(connectorId).MeterValues;
      for (let index = 0; index < meterValuesTemplate.length; index++) {
        const connector = self.chargingStation.getConnector(connectorId);
        // SoC measurand
        if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === OCPP16MeterValueMeasurand.STATE_OF_CHARGE && self.chargingStation.getConfigurationKey(OCPP16StandardParametersKey.MeterValuesSampledData).value.includes(OCPP16MeterValueMeasurand.STATE_OF_CHARGE)) {
          meterValue.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.PERCENT },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) ? { location: meterValuesTemplate[index].location } : { location: MeterValueLocation.EV },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: Utils.getRandomInt(100).toString() },
          });
          const sampledValuesIndex = meterValue.sampledValue.length - 1;
          if (Utils.convertToInt(meterValue.sampledValue[sampledValuesIndex].value) > 100 || debug) {
            logger.error(`${self.chargingStation.logPrefix()} MeterValues measurand ${meterValue.sampledValue[sampledValuesIndex].measurand ? meterValue.sampledValue[sampledValuesIndex].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${meterValue.sampledValue[sampledValuesIndex].value}/100`);
          }
        // Voltage measurand
        } else if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === OCPP16MeterValueMeasurand.VOLTAGE && self.chargingStation.getConfigurationKey(OCPP16StandardParametersKey.MeterValuesSampledData).value.includes(OCPP16MeterValueMeasurand.VOLTAGE)) {
          const voltageMeasurandValue = Utils.getRandomFloatRounded(self.chargingStation.getVoltageOut() + self.chargingStation.getVoltageOut() * 0.1, self.chargingStation.getVoltageOut() - self.chargingStation.getVoltageOut() * 0.1);
          meterValue.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.VOLT },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: voltageMeasurandValue.toString() },
          });
          for (let phase = 1; self.chargingStation.getNumberOfPhases() === 3 && phase <= self.chargingStation.getNumberOfPhases(); phase++) {
            let phaseValue: string;
            if (self.chargingStation.getVoltageOut() >= 0 && self.chargingStation.getVoltageOut() <= 250) {
              phaseValue = `L${phase}-N`;
            } else if (self.chargingStation.getVoltageOut() > 250) {
              phaseValue = `L${phase}-L${(phase + 1) % self.chargingStation.getNumberOfPhases() !== 0 ? (phase + 1) % self.chargingStation.getNumberOfPhases() : self.chargingStation.getNumberOfPhases()}`;
            }
            meterValue.sampledValue.push({
              ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.VOLT },
              ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
              measurand: meterValuesTemplate[index].measurand,
              ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
              ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: voltageMeasurandValue.toString() },
              phase: phaseValue as MeterValuePhase,
            });
          }
        // Power.Active.Import measurand
        } else if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT && self.chargingStation.getConfigurationKey(OCPP16StandardParametersKey.MeterValuesSampledData).value.includes(OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT)) {
          // FIXME: factor out powerDivider checks
          if (Utils.isUndefined(self.chargingStation.stationInfo.powerDivider)) {
            const errMsg = `${self.chargingStation.logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider is undefined`;
            logger.error(errMsg);
            throw Error(errMsg);
          } else if (self.chargingStation.stationInfo.powerDivider && self.chargingStation.stationInfo.powerDivider <= 0) {
            const errMsg = `${self.chargingStation.logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider have zero or below value ${self.chargingStation.stationInfo.powerDivider}`;
            logger.error(errMsg);
            throw Error(errMsg);
          }
          const errMsg = `${self.chargingStation.logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: Unknown ${self.chargingStation.getPowerOutType()} powerOutType in template file ${self.chargingStation.stationTemplateFile}, cannot calculate ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER} measurand value`;
          const powerMeasurandValues = {} as MeasurandValues;
          const maxPower = Math.round(self.chargingStation.stationInfo.maxPower / self.chargingStation.stationInfo.powerDivider);
          const maxPowerPerPhase = Math.round((self.chargingStation.stationInfo.maxPower / self.chargingStation.stationInfo.powerDivider) / self.chargingStation.getNumberOfPhases());
          switch (self.chargingStation.getPowerOutType()) {
            case PowerOutType.AC:
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                powerMeasurandValues.L1 = Utils.getRandomFloatRounded(maxPowerPerPhase);
                powerMeasurandValues.L2 = 0;
                powerMeasurandValues.L3 = 0;
                if (self.chargingStation.getNumberOfPhases() === 3) {
                  powerMeasurandValues.L2 = Utils.getRandomFloatRounded(maxPowerPerPhase);
                  powerMeasurandValues.L3 = Utils.getRandomFloatRounded(maxPowerPerPhase);
                }
                powerMeasurandValues.allPhases = Utils.roundTo(powerMeasurandValues.L1 + powerMeasurandValues.L2 + powerMeasurandValues.L3, 2);
              }
              break;
            case PowerOutType.DC:
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                powerMeasurandValues.allPhases = Utils.getRandomFloatRounded(maxPower);
              }
              break;
            default:
              logger.error(errMsg);
              throw Error(errMsg);
          }
          meterValue.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.WATT },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: powerMeasurandValues.allPhases.toString() },
          });
          const sampledValuesIndex = meterValue.sampledValue.length - 1;
          if (Utils.convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) > maxPower || debug) {
            logger.error(`${self.chargingStation.logPrefix()} MeterValues measurand ${meterValue.sampledValue[sampledValuesIndex].measurand ? meterValue.sampledValue[sampledValuesIndex].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${meterValue.sampledValue[sampledValuesIndex].value}/${maxPower}`);
          }
          for (let phase = 1; self.chargingStation.getNumberOfPhases() === 3 && phase <= self.chargingStation.getNumberOfPhases(); phase++) {
            const phaseValue = `L${phase}-N`;
            meterValue.sampledValue.push({
              ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.WATT },
              ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
              ...!Utils.isUndefined(meterValuesTemplate[index].measurand) && { measurand: meterValuesTemplate[index].measurand },
              ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
              ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: powerMeasurandValues[`L${phase}`] as string },
              phase: phaseValue as MeterValuePhase,
            });
          }
        // Current.Import measurand
        } else if (meterValuesTemplate[index].measurand && meterValuesTemplate[index].measurand === OCPP16MeterValueMeasurand.CURRENT_IMPORT && self.chargingStation.getConfigurationKey(OCPP16StandardParametersKey.MeterValuesSampledData).value.includes(OCPP16MeterValueMeasurand.CURRENT_IMPORT)) {
          // FIXME: factor out powerDivider checks
          if (Utils.isUndefined(self.chargingStation.stationInfo.powerDivider)) {
            const errMsg = `${self.chargingStation.logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider is undefined`;
            logger.error(errMsg);
            throw Error(errMsg);
          } else if (self.chargingStation.stationInfo.powerDivider && self.chargingStation.stationInfo.powerDivider <= 0) {
            const errMsg = `${self.chargingStation.logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider have zero or below value ${self.chargingStation.stationInfo.powerDivider}`;
            logger.error(errMsg);
            throw Error(errMsg);
          }
          const errMsg = `${self.chargingStation.logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: Unknown ${self.chargingStation.getPowerOutType()} powerOutType in template file ${self.chargingStation.stationTemplateFile}, cannot calculate ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER} measurand value`;
          const currentMeasurandValues: MeasurandValues = {} as MeasurandValues;
          let maxAmperage: number;
          switch (self.chargingStation.getPowerOutType()) {
            case PowerOutType.AC:
              maxAmperage = ACElectricUtils.amperagePerPhaseFromPower(self.chargingStation.getNumberOfPhases(), self.chargingStation.stationInfo.maxPower / self.chargingStation.stationInfo.powerDivider, self.chargingStation.getVoltageOut());
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                currentMeasurandValues.L1 = Utils.getRandomFloatRounded(maxAmperage);
                currentMeasurandValues.L2 = 0;
                currentMeasurandValues.L3 = 0;
                if (self.chargingStation.getNumberOfPhases() === 3) {
                  currentMeasurandValues.L2 = Utils.getRandomFloatRounded(maxAmperage);
                  currentMeasurandValues.L3 = Utils.getRandomFloatRounded(maxAmperage);
                }
                currentMeasurandValues.allPhases = Utils.roundTo((currentMeasurandValues.L1 + currentMeasurandValues.L2 + currentMeasurandValues.L3) / self.chargingStation.getNumberOfPhases(), 2);
              }
              break;
            case PowerOutType.DC:
              maxAmperage = ACElectricUtils.amperageTotalFromPower(self.chargingStation.stationInfo.maxPower / self.chargingStation.stationInfo.powerDivider, self.chargingStation.getVoltageOut());
              if (Utils.isUndefined(meterValuesTemplate[index].value)) {
                currentMeasurandValues.allPhases = Utils.getRandomFloatRounded(maxAmperage);
              }
              break;
            default:
              logger.error(errMsg);
              throw Error(errMsg);
          }
          meterValue.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.AMP },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            measurand: meterValuesTemplate[index].measurand,
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: currentMeasurandValues.allPhases.toString() },
          });
          const sampledValuesIndex = meterValue.sampledValue.length - 1;
          if (Utils.convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) > maxAmperage || debug) {
            logger.error(`${self.chargingStation.logPrefix()} MeterValues measurand ${meterValue.sampledValue[sampledValuesIndex].measurand ? meterValue.sampledValue[sampledValuesIndex].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${meterValue.sampledValue[sampledValuesIndex].value}/${maxAmperage}`);
          }
          for (let phase = 1; self.chargingStation.getNumberOfPhases() === 3 && phase <= self.chargingStation.getNumberOfPhases(); phase++) {
            const phaseValue = `L${phase}`;
            meterValue.sampledValue.push({
              ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.AMP },
              ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
              ...!Utils.isUndefined(meterValuesTemplate[index].measurand) && { measurand: meterValuesTemplate[index].measurand },
              ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
              ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } : { value: currentMeasurandValues[phaseValue] as string },
              phase: phaseValue as MeterValuePhase,
            });
          }
        // Energy.Active.Import.Register measurand (default)
        } else if (!meterValuesTemplate[index].measurand || meterValuesTemplate[index].measurand === OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER) {
          // FIXME: factor out powerDivider checks
          if (Utils.isUndefined(self.chargingStation.stationInfo.powerDivider)) {
            const errMsg = `${self.chargingStation.logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider is undefined`;
            logger.error(errMsg);
            throw Error(errMsg);
          } else if (self.chargingStation.stationInfo.powerDivider && self.chargingStation.stationInfo.powerDivider <= 0) {
            const errMsg = `${self.chargingStation.logPrefix()} MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: powerDivider have zero or below value ${self.chargingStation.stationInfo.powerDivider}`;
            logger.error(errMsg);
            throw Error(errMsg);
          }
          if (Utils.isUndefined(meterValuesTemplate[index].value)) {
            const measurandValue = Utils.getRandomInt(self.chargingStation.stationInfo.maxPower / (self.chargingStation.stationInfo.powerDivider * 3600000) * interval);
            // Persist previous value in connector
            if (connector && !Utils.isNullOrUndefined(connector.lastEnergyActiveImportRegisterValue) && connector.lastEnergyActiveImportRegisterValue >= 0) {
              connector.lastEnergyActiveImportRegisterValue += measurandValue;
            } else {
              connector.lastEnergyActiveImportRegisterValue = 0;
            }
          }
          meterValue.sampledValue.push({
            ...!Utils.isUndefined(meterValuesTemplate[index].unit) ? { unit: meterValuesTemplate[index].unit } : { unit: MeterValueUnit.WATT_HOUR },
            ...!Utils.isUndefined(meterValuesTemplate[index].context) && { context: meterValuesTemplate[index].context },
            ...!Utils.isUndefined(meterValuesTemplate[index].measurand) && { measurand: meterValuesTemplate[index].measurand },
            ...!Utils.isUndefined(meterValuesTemplate[index].location) && { location: meterValuesTemplate[index].location },
            ...!Utils.isUndefined(meterValuesTemplate[index].value) ? { value: meterValuesTemplate[index].value } :
              { value: connector.lastEnergyActiveImportRegisterValue.toString() },
          });
          const sampledValuesIndex = meterValue.sampledValue.length - 1;
          const maxConsumption = Math.round(self.chargingStation.stationInfo.maxPower * 3600 / (self.chargingStation.stationInfo.powerDivider * interval));
          if (Utils.convertToFloat(meterValue.sampledValue[sampledValuesIndex].value) > maxConsumption || debug) {
            logger.error(`${self.chargingStation.logPrefix()} MeterValues measurand ${meterValue.sampledValue[sampledValuesIndex].measurand ? meterValue.sampledValue[sampledValuesIndex].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER}: connectorId ${connectorId}, transaction ${connector.transactionId}, value: ${meterValue.sampledValue[sampledValuesIndex].value}/${maxConsumption}`);
          }
        // Unsupported measurand
        } else {
          logger.info(`${self.chargingStation.logPrefix()} Unsupported MeterValues measurand ${meterValuesTemplate[index].measurand ? meterValuesTemplate[index].measurand : OCPP16MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER} on connectorId ${connectorId}`);
        }
      }
      const payload: MeterValuesRequest = {
        connectorId,
        transactionId,
        meterValue,
      };
      await self.sendMessage(Utils.generateUUID(), payload, MessageType.CALL_MESSAGE, OCPP16RequestCommand.METERVALUES);
    } catch (error) {
      self.handleRequestError(OCPP16RequestCommand.METERVALUES, error);
    }
  }

  public async sendError(messageId: string, error: OCPPError, commandName: OCPP16RequestCommand | OCPP16IncomingRequestCommand): Promise<unknown> {
    // Send error
    return this.sendMessage(messageId, error, MessageType.CALL_ERROR_MESSAGE, commandName);
  }
}
