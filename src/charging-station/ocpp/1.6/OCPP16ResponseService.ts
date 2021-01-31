import { AuthorizeRequest, OCPP16AuthorizationStatus, OCPP16AuthorizeResponse, OCPP16StartTransactionResponse, OCPP16StopTransactionResponse, StartTransactionRequest, StopTransactionRequest } from '../../../types/ocpp/1.6/Transaction';
import { HeartbeatRequest, OCPP16BootNotificationRequest, OCPP16RequestCommand, StatusNotificationRequest } from '../../../types/ocpp/1.6/Requests';
import { HeartbeatResponse, OCPP16BootNotificationResponse, OCPP16RegistrationStatus, StatusNotificationResponse } from '../../../types/ocpp/1.6/RequestResponses';
import { MeterValuesRequest, MeterValuesResponse } from '../../../types/ocpp/1.6/MeterValues';

import { OCPP16ChargePointStatus } from '../../../types/ocpp/1.6/ChargePointStatus';
import { OCPP16StandardParametersKey } from '../../../types/ocpp/1.6/Configuration';
import OCPPResponseService from '../OCPPResponseService';
import Utils from '../../../utils/Utils';
import logger from '../../../utils/Logger';

export default class OCPP16ResponseService extends OCPPResponseService {
  public async handleResponse(commandName: OCPP16RequestCommand, payload: Record<string, unknown> | string, requestPayload: Record<string, unknown>): Promise<void> {
    const responseCallbackFn = 'handleResponse' + commandName;
    if (typeof this[responseCallbackFn] === 'function') {
      await this[responseCallbackFn](payload, requestPayload);
    } else {
      logger.error(this.chargingStation.logPrefix() + ' Trying to call an undefined response callback function: ' + responseCallbackFn);
    }
  }

  private handleResponseBootNotification(payload: OCPP16BootNotificationResponse, requestPayload: OCPP16BootNotificationRequest): void {
    if (payload.status === OCPP16RegistrationStatus.ACCEPTED) {
      this.chargingStation.heartbeatSetInterval ? this.chargingStation.restartHeartbeat() : this.chargingStation.startHeartbeat();
      this.chargingStation.addConfigurationKey(OCPP16StandardParametersKey.HeartBeatInterval, payload.interval.toString());
      this.chargingStation.addConfigurationKey(OCPP16StandardParametersKey.HeartbeatInterval, payload.interval.toString(), false, false);
      this.chargingStation.hasStopped && (this.chargingStation.hasStopped = false);
    } else if (payload.status === OCPP16RegistrationStatus.PENDING) {
      logger.info(this.chargingStation.logPrefix() + ' Charging station in pending state on the central server');
    } else {
      logger.info(this.chargingStation.logPrefix() + ' Charging station rejected by the central server');
    }
  }

  private async handleResponseStartTransaction(payload: OCPP16StartTransactionResponse, requestPayload: StartTransactionRequest): Promise<void> {
    const connectorId = requestPayload.connectorId;

    let transactionConnectorId: number;
    for (const connector in this.chargingStation.connectors) {
      if (Utils.convertToInt(connector) > 0 && Utils.convertToInt(connector) === connectorId) {
        transactionConnectorId = Utils.convertToInt(connector);
        break;
      }
    }
    if (!transactionConnectorId) {
      logger.error(this.chargingStation.logPrefix() + ' Trying to start a transaction on a non existing connector Id ' + connectorId.toString());
      return;
    }
    if (this.chargingStation.getConnector(connectorId)?.transactionStarted) {
      logger.debug(this.chargingStation.logPrefix() + ' Trying to start a transaction on an already used connector ' + connectorId.toString() + ': %j', this.chargingStation.getConnector(connectorId));
      return;
    }

    if (payload?.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
      this.chargingStation.getConnector(connectorId).transactionStarted = true;
      this.chargingStation.getConnector(connectorId).transactionId = payload.transactionId;
      this.chargingStation.getConnector(connectorId).idTag = requestPayload.idTag;
      this.chargingStation.getConnector(connectorId).lastEnergyActiveImportRegisterValue = 0;
      await this.chargingStation.ocppRequestService.sendStatusNotification(connectorId, OCPP16ChargePointStatus.CHARGING);
      this.chargingStation.getConnector(connectorId).status = OCPP16ChargePointStatus.CHARGING;
      logger.info(this.chargingStation.logPrefix() + ' Transaction ' + payload.transactionId.toString() + ' STARTED on ' + this.chargingStation.stationInfo.chargingStationId + '#' + connectorId.toString() + ' for idTag ' + requestPayload.idTag);
      if (this.chargingStation.stationInfo.powerSharedByConnectors) {
        this.chargingStation.stationInfo.powerDivider++;
      }
      const configuredMeterValueSampleInterval = this.chargingStation.getConfigurationKey(OCPP16StandardParametersKey.MeterValueSampleInterval);
      this.chargingStation.startMeterValues(connectorId, configuredMeterValueSampleInterval ? Utils.convertToInt(configuredMeterValueSampleInterval.value) * 1000 : 60000);
    } else {
      logger.error(this.chargingStation.logPrefix() + ' Starting transaction id ' + payload.transactionId.toString() + ' REJECTED with status ' + payload?.idTagInfo?.status + ', idTag ' + requestPayload.idTag);
      this.chargingStation.resetTransactionOnConnector(connectorId);
      await this.chargingStation.ocppRequestService.sendStatusNotification(connectorId, OCPP16ChargePointStatus.AVAILABLE);
      this.chargingStation.getConnector(connectorId).status = OCPP16ChargePointStatus.AVAILABLE;
    }
  }

  private async handleResponseStopTransaction(payload: OCPP16StopTransactionResponse, requestPayload: StopTransactionRequest): Promise<void> {
    let transactionConnectorId: number;
    for (const connector in this.chargingStation.connectors) {
      if (Utils.convertToInt(connector) > 0 && this.chargingStation.getConnector(Utils.convertToInt(connector))?.transactionId === requestPayload.transactionId) {
        transactionConnectorId = Utils.convertToInt(connector);
        break;
      }
    }
    if (!transactionConnectorId) {
      logger.error(this.chargingStation.logPrefix() + ' Trying to stop a non existing transaction ' + requestPayload.transactionId.toString());
      return;
    }
    if (payload.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
      if (!this.chargingStation.isChargingStationAvailable() || !this.chargingStation.isConnectorAvailable(transactionConnectorId)) {
        await this.chargingStation.ocppRequestService.sendStatusNotification(transactionConnectorId, OCPP16ChargePointStatus.UNAVAILABLE);
        this.chargingStation.getConnector(transactionConnectorId).status = OCPP16ChargePointStatus.UNAVAILABLE;
      } else {
        await this.chargingStation.ocppRequestService.sendStatusNotification(transactionConnectorId, OCPP16ChargePointStatus.AVAILABLE);
        this.chargingStation.getConnector(transactionConnectorId).status = OCPP16ChargePointStatus.AVAILABLE;
      }
      if (this.chargingStation.stationInfo.powerSharedByConnectors) {
        this.chargingStation.stationInfo.powerDivider--;
      }
      logger.info(this.chargingStation.logPrefix() + ' Transaction ' + requestPayload.transactionId.toString() + ' STOPPED on ' + this.chargingStation.stationInfo.chargingStationId + '#' + transactionConnectorId.toString());
      this.chargingStation.resetTransactionOnConnector(transactionConnectorId);
    } else {
      logger.error(this.chargingStation.logPrefix() + ' Stopping transaction id ' + requestPayload.transactionId.toString() + ' REJECTED with status ' + payload.idTagInfo?.status);
    }
  }

  private handleResponseStatusNotification(payload: StatusNotificationRequest, requestPayload: StatusNotificationResponse): void {
    logger.debug(this.chargingStation.logPrefix() + ' Status notification response received: %j to StatusNotification request: %j', payload, requestPayload);
  }

  private handleResponseMeterValues(payload: MeterValuesRequest, requestPayload: MeterValuesResponse): void {
    logger.debug(this.chargingStation.logPrefix() + ' MeterValues response received: %j to MeterValues request: %j', payload, requestPayload);
  }

  private handleResponseHeartbeat(payload: HeartbeatResponse, requestPayload: HeartbeatRequest): void {
    logger.debug(this.chargingStation.logPrefix() + ' Heartbeat response received: %j to Heartbeat request: %j', payload, requestPayload);
  }

  private handleResponseAuthorize(payload: OCPP16AuthorizeResponse, requestPayload: AuthorizeRequest): void {
    logger.debug(this.chargingStation.logPrefix() + ' Authorize response received: %j to Authorize request: %j', payload, requestPayload);
  }
}
