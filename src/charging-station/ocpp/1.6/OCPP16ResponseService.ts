// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { AuthorizeRequest, OCPP16AuthorizationStatus, OCPP16AuthorizeResponse, OCPP16StartTransactionResponse, OCPP16StopTransactionResponse, StartTransactionRequest, StopTransactionRequest } from '../../../types/ocpp/1.6/Transaction';
import { HeartbeatRequest, OCPP16RequestCommand, StatusNotificationRequest } from '../../../types/ocpp/1.6/Requests';
import { HeartbeatResponse, OCPP16BootNotificationResponse, OCPP16RegistrationStatus, StatusNotificationResponse } from '../../../types/ocpp/1.6/Responses';
import { MeterValuesRequest, MeterValuesResponse } from '../../../types/ocpp/1.6/MeterValues';

import ChargingStation from '../../ChargingStation';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { OCPP16ChargePointStatus } from '../../../types/ocpp/1.6/ChargePointStatus';
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';
import { OCPP16StandardParametersKey } from '../../../types/ocpp/1.6/Configuration';
import OCPPError from '../OCPPError';
import OCPPResponseService from '../OCPPResponseService';
import { ResponseHandler } from '../../../types/ocpp/Responses';
import Utils from '../../../utils/Utils';
import logger from '../../../utils/Logger';

export default class OCPP16ResponseService extends OCPPResponseService {
  private responseHandlers: Map<OCPP16RequestCommand, ResponseHandler>;

  constructor(chargingStation: ChargingStation) {
    super(chargingStation);
    this.responseHandlers = new Map<OCPP16RequestCommand, ResponseHandler>([
      [OCPP16RequestCommand.BOOT_NOTIFICATION, this.handleResponseBootNotification.bind(this)],
      [OCPP16RequestCommand.HEARTBEAT, this.handleResponseHeartbeat.bind(this)],
      [OCPP16RequestCommand.AUTHORIZE, this.handleResponseAuthorize.bind(this)],
      [OCPP16RequestCommand.START_TRANSACTION, this.handleResponseStartTransaction.bind(this)],
      [OCPP16RequestCommand.STOP_TRANSACTION, this.handleResponseStopTransaction.bind(this)],
      [OCPP16RequestCommand.STATUS_NOTIFICATION, this.handleResponseStatusNotification.bind(this)],
      [OCPP16RequestCommand.METER_VALUES, this.handleResponseMeterValues.bind(this)]
    ]);
  }

  public async handleResponse(commandName: OCPP16RequestCommand, payload: Record<string, unknown> | string, requestPayload: Record<string, unknown>): Promise<void> {
    if (this.chargingStation.isRegistered() || commandName === OCPP16RequestCommand.BOOT_NOTIFICATION) {
      if (this.responseHandlers.has(commandName)) {
        try {
          await this.responseHandlers.get(commandName)(payload, requestPayload);
        } catch (error) {
          logger.error(this.chargingStation.logPrefix() + ' Handle request response error: %j', error);
          throw error;
        }
      } else {
        // Throw exception
        throw new OCPPError(ErrorType.NOT_IMPLEMENTED, `${commandName} is not implemented to handle request response payload ${JSON.stringify(payload, null, 2)}`, commandName);
      }
    } else {
      throw new OCPPError(ErrorType.SECURITY_ERROR, `The charging station is not registered on the central server. ${commandName} cannot be not issued to handle request response payload ${JSON.stringify(payload, null, 2)}`, commandName);
    }
  }

  private handleResponseBootNotification(payload: OCPP16BootNotificationResponse): void {
    if (payload.status === OCPP16RegistrationStatus.ACCEPTED) {
      this.chargingStation.addConfigurationKey(OCPP16StandardParametersKey.HeartBeatInterval, payload.interval.toString());
      this.chargingStation.addConfigurationKey(OCPP16StandardParametersKey.HeartbeatInterval, payload.interval.toString(), { visible: false });
      this.chargingStation.heartbeatSetInterval ? this.chargingStation.restartHeartbeat() : this.chargingStation.startHeartbeat();
    } else if (payload.status === OCPP16RegistrationStatus.PENDING) {
      logger.info(this.chargingStation.logPrefix() + ' Charging station in pending state on the central server');
    } else {
      logger.warn(this.chargingStation.logPrefix() + ' Charging station rejected by the central server');
    }
  }

  private handleResponseHeartbeat(payload: HeartbeatResponse, requestPayload: HeartbeatRequest): void {
    logger.debug(this.chargingStation.logPrefix() + ' Heartbeat response received: %j to Heartbeat request: %j', payload, requestPayload);
  }

  private handleResponseAuthorize(payload: OCPP16AuthorizeResponse, requestPayload: AuthorizeRequest): void {
    let authorizeConnectorId: number;
    for (const connectorId of this.chargingStation.connectors.keys()) {
      if (connectorId > 0 && this.chargingStation.getConnectorStatus(connectorId)?.authorizeIdTag === requestPayload.idTag) {
        authorizeConnectorId = connectorId;
        break;
      }
    }
    if (payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
      this.chargingStation.getConnectorStatus(authorizeConnectorId).idTagAuthorized = true;
      logger.debug(`${this.chargingStation.logPrefix()} IdTag ${requestPayload.idTag} authorized on connector ${authorizeConnectorId}`);
    } else {
      this.chargingStation.getConnectorStatus(authorizeConnectorId).idTagAuthorized = false;
      delete this.chargingStation.getConnectorStatus(authorizeConnectorId).authorizeIdTag;
      logger.debug(`${this.chargingStation.logPrefix()} IdTag ${requestPayload.idTag} refused with status ${payload.idTagInfo.status} on connector ${authorizeConnectorId}`);
    }
  }

  private async handleResponseStartTransaction(payload: OCPP16StartTransactionResponse, requestPayload: StartTransactionRequest): Promise<void> {
    const connectorId = requestPayload.connectorId;

    let transactionConnectorId: number;
    for (const id of this.chargingStation.connectors.keys()) {
      if (id > 0 && id === connectorId) {
        transactionConnectorId = id;
        break;
      }
    }
    if (!transactionConnectorId) {
      logger.error(this.chargingStation.logPrefix() + ' Trying to start a transaction on a non existing connector Id ' + connectorId.toString());
      return;
    }
    if (this.chargingStation.getConnectorStatus(connectorId).transactionRemoteStarted && this.chargingStation.getAuthorizeRemoteTxRequests()
      && this.chargingStation.getLocalAuthListEnabled() && this.chargingStation.hasAuthorizedTags() && !this.chargingStation.getConnectorStatus(connectorId).idTagLocalAuthorized) {
      logger.error(this.chargingStation.logPrefix() + ' Trying to start a transaction with a not local authorized idTag ' + this.chargingStation.getConnectorStatus(connectorId).localAuthorizeIdTag + ' on connector Id ' + connectorId.toString());
      await this.resetConnectorOnStartTransactionError(connectorId);
      return;
    }
    if (this.chargingStation.getConnectorStatus(connectorId).transactionRemoteStarted && this.chargingStation.getAuthorizeRemoteTxRequests()
      && this.chargingStation.getMayAuthorizeAtRemoteStart() && !this.chargingStation.getConnectorStatus(connectorId).idTagLocalAuthorized
      && !this.chargingStation.getConnectorStatus(connectorId).idTagAuthorized) {
      logger.error(this.chargingStation.logPrefix() + ' Trying to start a transaction with a not authorized idTag ' + this.chargingStation.getConnectorStatus(connectorId).authorizeIdTag + ' on connector Id ' + connectorId.toString());
      await this.resetConnectorOnStartTransactionError(connectorId);
      return;
    }
    if (this.chargingStation.getConnectorStatus(connectorId).idTagAuthorized && this.chargingStation.getConnectorStatus(connectorId).authorizeIdTag !== requestPayload.idTag) {
      logger.error(this.chargingStation.logPrefix() + ' Trying to start a transaction with an idTag ' + requestPayload.idTag + ' different from the authorize request one ' + this.chargingStation.getConnectorStatus(connectorId).authorizeIdTag + ' on connector Id ' + connectorId.toString());
      await this.resetConnectorOnStartTransactionError(connectorId);
      return;
    }
    if (this.chargingStation.getConnectorStatus(connectorId).idTagLocalAuthorized
      && this.chargingStation.getConnectorStatus(connectorId).localAuthorizeIdTag !== requestPayload.idTag) {
      logger.error(this.chargingStation.logPrefix() + ' Trying to start a transaction with an idTag ' + requestPayload.idTag + ' different from the local authorized one ' + this.chargingStation.getConnectorStatus(connectorId).localAuthorizeIdTag + ' on connector Id ' + connectorId.toString());
      await this.resetConnectorOnStartTransactionError(connectorId);
      return;
    }
    if (this.chargingStation.getConnectorStatus(connectorId)?.transactionStarted) {
      logger.debug(this.chargingStation.logPrefix() + ' Trying to start a transaction on an already used connector ' + connectorId.toString() + ': %j', this.chargingStation.getConnectorStatus(connectorId));
      return;
    }
    if (this.chargingStation.getConnectorStatus(connectorId)?.status !== OCPP16ChargePointStatus.AVAILABLE
      && this.chargingStation.getConnectorStatus(connectorId)?.status !== OCPP16ChargePointStatus.PREPARING) {
      logger.error(`${this.chargingStation.logPrefix()} Trying to start a transaction on connector ${connectorId.toString()} with status ${this.chargingStation.getConnectorStatus(connectorId)?.status}`);
      return;
    }
    if (!Number.isInteger(payload.transactionId)) {
      logger.warn(`${this.chargingStation.logPrefix()} Trying to start a transaction on connector ${connectorId.toString()} with a non integer transaction Id ${payload.transactionId}, converting to integer`);
      payload.transactionId = Utils.convertToInt(payload.transactionId);
    }

    if (payload.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
      this.chargingStation.getConnectorStatus(connectorId).transactionStarted = true;
      this.chargingStation.getConnectorStatus(connectorId).transactionId = payload.transactionId;
      this.chargingStation.getConnectorStatus(connectorId).transactionIdTag = requestPayload.idTag;
      this.chargingStation.getConnectorStatus(connectorId).transactionEnergyActiveImportRegisterValue = 0;
      this.chargingStation.getConnectorStatus(connectorId).transactionBeginMeterValue = OCPP16ServiceUtils.buildTransactionBeginMeterValue(this.chargingStation, connectorId,
        requestPayload.meterStart);
      this.chargingStation.getBeginEndMeterValues() && await this.chargingStation.ocppRequestService.sendTransactionBeginMeterValues(connectorId, payload.transactionId,
        this.chargingStation.getConnectorStatus(connectorId).transactionBeginMeterValue);
      await this.chargingStation.ocppRequestService.sendStatusNotification(connectorId, OCPP16ChargePointStatus.CHARGING);
      this.chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.CHARGING;
      logger.info(this.chargingStation.logPrefix() + ' Transaction ' + payload.transactionId.toString() + ' STARTED on ' + this.chargingStation.stationInfo.chargingStationId + '#' + connectorId.toString() + ' for idTag ' + requestPayload.idTag);
      if (this.chargingStation.stationInfo.powerSharedByConnectors) {
        this.chargingStation.stationInfo.powerDivider++;
      }
      const configuredMeterValueSampleInterval = this.chargingStation.getConfigurationKey(OCPP16StandardParametersKey.MeterValueSampleInterval);
      this.chargingStation.startMeterValues(connectorId, configuredMeterValueSampleInterval ? Utils.convertToInt(configuredMeterValueSampleInterval.value) * 1000 : 60000);
    } else {
      logger.warn(this.chargingStation.logPrefix() + ' Starting transaction id ' + payload.transactionId.toString() + ' REJECTED with status ' + payload?.idTagInfo?.status + ', idTag ' + requestPayload.idTag);
      await this.resetConnectorOnStartTransactionError(connectorId);
    }
  }

  private async resetConnectorOnStartTransactionError(connectorId: number): Promise<void> {
    this.chargingStation.resetConnectorStatus(connectorId);
    if (this.chargingStation.getConnectorStatus(connectorId).status !== OCPP16ChargePointStatus.AVAILABLE) {
      await this.chargingStation.ocppRequestService.sendStatusNotification(connectorId, OCPP16ChargePointStatus.AVAILABLE);
      this.chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.AVAILABLE;
    }
  }

  private async handleResponseStopTransaction(payload: OCPP16StopTransactionResponse, requestPayload: StopTransactionRequest): Promise<void> {
    let transactionConnectorId: number;
    for (const connectorId of this.chargingStation.connectors.keys()) {
      if (connectorId > 0 && this.chargingStation.getConnectorStatus(connectorId)?.transactionId === requestPayload.transactionId) {
        transactionConnectorId = connectorId;
        break;
      }
    }
    if (!transactionConnectorId) {
      logger.error(this.chargingStation.logPrefix() + ' Trying to stop a non existing transaction ' + requestPayload.transactionId.toString());
      return;
    }
    if (payload.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
      (this.chargingStation.getBeginEndMeterValues() && this.chargingStation.getOutOfOrderEndMeterValues())
        && await this.chargingStation.ocppRequestService.sendTransactionEndMeterValues(transactionConnectorId, requestPayload.transactionId,
          OCPP16ServiceUtils.buildTransactionEndMeterValue(this.chargingStation, transactionConnectorId, requestPayload.meterStop));
      if (!this.chargingStation.isChargingStationAvailable() || !this.chargingStation.isConnectorAvailable(transactionConnectorId)) {
        await this.chargingStation.ocppRequestService.sendStatusNotification(transactionConnectorId, OCPP16ChargePointStatus.UNAVAILABLE);
        this.chargingStation.getConnectorStatus(transactionConnectorId).status = OCPP16ChargePointStatus.UNAVAILABLE;
      } else {
        await this.chargingStation.ocppRequestService.sendStatusNotification(transactionConnectorId, OCPP16ChargePointStatus.AVAILABLE);
        this.chargingStation.getConnectorStatus(transactionConnectorId).status = OCPP16ChargePointStatus.AVAILABLE;
      }
      if (this.chargingStation.stationInfo.powerSharedByConnectors) {
        this.chargingStation.stationInfo.powerDivider--;
      }
      logger.info(this.chargingStation.logPrefix() + ' Transaction ' + requestPayload.transactionId.toString() + ' STOPPED on ' + this.chargingStation.stationInfo.chargingStationId + '#' + transactionConnectorId.toString());
      this.chargingStation.resetConnectorStatus(transactionConnectorId);
    } else {
      logger.warn(this.chargingStation.logPrefix() + ' Stopping transaction id ' + requestPayload.transactionId.toString() + ' REJECTED with status ' + payload.idTagInfo?.status);
    }
  }

  private handleResponseStatusNotification(payload: StatusNotificationRequest, requestPayload: StatusNotificationResponse): void {
    logger.debug(this.chargingStation.logPrefix() + ' Status notification response received: %j to StatusNotification request: %j', payload, requestPayload);
  }

  private handleResponseMeterValues(payload: MeterValuesRequest, requestPayload: MeterValuesResponse): void {
    logger.debug(this.chargingStation.logPrefix() + ' MeterValues response received: %j to MeterValues request: %j', payload, requestPayload);
  }
}
