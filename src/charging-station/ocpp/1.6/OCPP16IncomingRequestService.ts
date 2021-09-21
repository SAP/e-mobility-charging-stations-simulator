// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { ChangeAvailabilityRequest, ChangeConfigurationRequest, ClearChargingProfileRequest, GetConfigurationRequest, GetDiagnosticsRequest, MessageTrigger, OCPP16AvailabilityType, OCPP16IncomingRequestCommand, OCPP16TriggerMessageRequest, RemoteStartTransactionRequest, RemoteStopTransactionRequest, ResetRequest, SetChargingProfileRequest, UnlockConnectorRequest } from '../../../types/ocpp/1.6/Requests';
import { ChangeAvailabilityResponse, ChangeConfigurationResponse, ClearChargingProfileResponse, GetConfigurationResponse, GetDiagnosticsResponse, OCPP16TriggerMessageResponse, SetChargingProfileResponse, UnlockConnectorResponse } from '../../../types/ocpp/1.6/Responses';
import { ChargingProfilePurposeType, OCPP16ChargingProfile } from '../../../types/ocpp/1.6/ChargingProfile';
import { Client, FTPResponse } from 'basic-ftp';
import { IncomingRequestCommand, RequestCommand } from '../../../types/ocpp/Requests';
import { OCPP16AuthorizationStatus, OCPP16StopTransactionReason } from '../../../types/ocpp/1.6/Transaction';

import Constants from '../../../utils/Constants';
import { DefaultResponse } from '../../../types/ocpp/Responses';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { MessageType } from '../../../types/ocpp/MessageType';
import { OCPP16ChargePointStatus } from '../../../types/ocpp/1.6/ChargePointStatus';
import { OCPP16DiagnosticsStatus } from '../../../types/ocpp/1.6/DiagnosticsStatus';
import { OCPP16StandardParametersKey } from '../../../types/ocpp/1.6/Configuration';
import { OCPPConfigurationKey } from '../../../types/ocpp/Configuration';
import OCPPError from '../OCPPError';
import OCPPIncomingRequestService from '../OCPPIncomingRequestService';
import { URL } from 'url';
import Utils from '../../../utils/Utils';
import fs from 'fs';
import logger from '../../../utils/Logger';
import path from 'path';
import tar from 'tar';

export default class OCPP16IncomingRequestService extends OCPPIncomingRequestService {
  public async handleRequest(messageId: string, commandName: OCPP16IncomingRequestCommand, commandPayload: Record<string, unknown>): Promise<void> {
    let response;
    const methodName = `handleRequest${commandName}`;
    // Call
    if (typeof this[methodName] === 'function') {
      try {
        // Call the method to build the response
        response = await this[methodName](commandPayload);
      } catch (error) {
        // Log
        logger.error(this.chargingStation.logPrefix() + ' Handle request error: %j', error);
        // Send back an error response to inform backend
        await this.chargingStation.ocppRequestService.sendError(messageId, error, commandName);
        throw error;
      }
    } else {
      // Throw exception
      const error = new OCPPError(ErrorType.NOT_IMPLEMENTED, `${commandName} is not implemented to handle payload ${JSON.stringify(commandPayload, null, 2)}`, commandName);
      await this.chargingStation.ocppRequestService.sendError(messageId, error, commandName);
      throw error;
    }
    // Send the built response
    await this.chargingStation.ocppRequestService.sendMessage(messageId, response, MessageType.CALL_RESULT_MESSAGE, commandName);
  }

  // Simulate charging station restart
  private handleRequestReset(commandPayload: ResetRequest): DefaultResponse {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setImmediate(async (): Promise<void> => {
      await this.chargingStation.stop(commandPayload.type + 'Reset' as OCPP16StopTransactionReason);
      await Utils.sleep(this.chargingStation.stationInfo.resetTime);
      this.chargingStation.start();
    });
    logger.info(`${this.chargingStation.logPrefix()} ${commandPayload.type} reset command received, simulating it. The station will be back online in ${Utils.formatDurationMilliSeconds(this.chargingStation.stationInfo.resetTime)}`);
    return Constants.OCPP_RESPONSE_ACCEPTED;
  }

  private handleRequestClearCache(): DefaultResponse {
    return Constants.OCPP_RESPONSE_ACCEPTED;
  }

  private async handleRequestUnlockConnector(commandPayload: UnlockConnectorRequest): Promise<UnlockConnectorResponse> {
    const connectorId = commandPayload.connectorId;
    if (connectorId === 0) {
      logger.error(this.chargingStation.logPrefix() + ' Trying to unlock connector ' + connectorId.toString());
      return Constants.OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED;
    }
    if (this.chargingStation.getConnector(connectorId)?.transactionStarted) {
      const transactionId = this.chargingStation.getConnector(connectorId).transactionId;
      const stopResponse = await this.chargingStation.ocppRequestService.sendStopTransaction(transactionId,
        this.chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId),
        this.chargingStation.getTransactionIdTag(transactionId),
        OCPP16StopTransactionReason.UNLOCK_COMMAND);
      if (stopResponse.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
        return Constants.OCPP_RESPONSE_UNLOCKED;
      }
      return Constants.OCPP_RESPONSE_UNLOCK_FAILED;
    }
    await this.chargingStation.ocppRequestService.sendStatusNotification(connectorId, OCPP16ChargePointStatus.AVAILABLE);
    this.chargingStation.getConnector(connectorId).status = OCPP16ChargePointStatus.AVAILABLE;
    return Constants.OCPP_RESPONSE_UNLOCKED;
  }

  private handleRequestGetConfiguration(commandPayload: GetConfigurationRequest): GetConfigurationResponse {
    const configurationKey: OCPPConfigurationKey[] = [];
    const unknownKey: string[] = [];
    if (Utils.isEmptyArray(commandPayload.key)) {
      for (const configuration of this.chargingStation.configuration.configurationKey) {
        if (Utils.isUndefined(configuration.visible)) {
          configuration.visible = true;
        }
        if (!configuration.visible) {
          continue;
        }
        configurationKey.push({
          key: configuration.key,
          readonly: configuration.readonly,
          value: configuration.value,
        });
      }
    } else {
      for (const key of commandPayload.key) {
        const keyFound = this.chargingStation.getConfigurationKey(key);
        if (keyFound) {
          if (Utils.isUndefined(keyFound.visible)) {
            keyFound.visible = true;
          }
          if (!keyFound.visible) {
            continue;
          }
          configurationKey.push({
            key: keyFound.key,
            readonly: keyFound.readonly,
            value: keyFound.value,
          });
        } else {
          unknownKey.push(key);
        }
      }
    }
    return {
      configurationKey,
      unknownKey,
    };
  }

  private handleRequestChangeConfiguration(commandPayload: ChangeConfigurationRequest): ChangeConfigurationResponse {
    // JSON request fields type sanity check
    if (!Utils.isString(commandPayload.key)) {
      logger.error(`${this.chargingStation.logPrefix()} ${RequestCommand.CHANGE_CONFIGURATION} request key field is not a string:`, commandPayload);
    }
    if (!Utils.isString(commandPayload.value)) {
      logger.error(`${this.chargingStation.logPrefix()} ${RequestCommand.CHANGE_CONFIGURATION} request value field is not a string:`, commandPayload);
    }
    const keyToChange = this.chargingStation.getConfigurationKey(commandPayload.key, true);
    if (!keyToChange) {
      return Constants.OCPP_CONFIGURATION_RESPONSE_NOT_SUPPORTED;
    } else if (keyToChange && keyToChange.readonly) {
      return Constants.OCPP_CONFIGURATION_RESPONSE_REJECTED;
    } else if (keyToChange && !keyToChange.readonly) {
      const keyIndex = this.chargingStation.configuration.configurationKey.indexOf(keyToChange);
      let valueChanged = false;
      if (this.chargingStation.configuration.configurationKey[keyIndex].value !== commandPayload.value) {
        this.chargingStation.configuration.configurationKey[keyIndex].value = commandPayload.value;
        valueChanged = true;
      }
      let triggerHeartbeatRestart = false;
      if (keyToChange.key === OCPP16StandardParametersKey.HeartBeatInterval && valueChanged) {
        this.chargingStation.setConfigurationKeyValue(OCPP16StandardParametersKey.HeartbeatInterval, commandPayload.value);
        triggerHeartbeatRestart = true;
      }
      if (keyToChange.key === OCPP16StandardParametersKey.HeartbeatInterval && valueChanged) {
        this.chargingStation.setConfigurationKeyValue(OCPP16StandardParametersKey.HeartBeatInterval, commandPayload.value);
        triggerHeartbeatRestart = true;
      }
      if (triggerHeartbeatRestart) {
        this.chargingStation.restartHeartbeat();
      }
      if (keyToChange.key === OCPP16StandardParametersKey.WebSocketPingInterval && valueChanged) {
        this.chargingStation.restartWebSocketPing();
      }
      if (keyToChange.reboot) {
        return Constants.OCPP_CONFIGURATION_RESPONSE_REBOOT_REQUIRED;
      }
      return Constants.OCPP_CONFIGURATION_RESPONSE_ACCEPTED;
    }
  }

  private handleRequestSetChargingProfile(commandPayload: SetChargingProfileRequest): SetChargingProfileResponse {
    if (!this.chargingStation.getConnector(commandPayload.connectorId)) {
      logger.error(`${this.chargingStation.logPrefix()} Trying to set charging profile(s) to a non existing connector Id ${commandPayload.connectorId}`);
      return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    if (commandPayload.csChargingProfiles.chargingProfilePurpose === ChargingProfilePurposeType.CHARGE_POINT_MAX_PROFILE && commandPayload.connectorId !== 0) {
      return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    if (commandPayload.csChargingProfiles.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE && (commandPayload.connectorId === 0 || !this.chargingStation.getConnector(commandPayload.connectorId)?.transactionStarted)) {
      return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    this.chargingStation.setChargingProfile(commandPayload.connectorId, commandPayload.csChargingProfiles);
    logger.debug(`${this.chargingStation.logPrefix()} Charging profile(s) set, dump their stack: %j`, this.chargingStation.getConnector(commandPayload.connectorId).chargingProfiles);
    return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_ACCEPTED;
  }

  private handleRequestClearChargingProfile(commandPayload: ClearChargingProfileRequest): ClearChargingProfileResponse {
    if (!this.chargingStation.getConnector(commandPayload.connectorId)) {
      logger.error(`${this.chargingStation.logPrefix()} Trying to clear a charging profile(s) to a non existing connector Id ${commandPayload.connectorId}`);
      return Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN;
    }
    if (commandPayload.connectorId && !Utils.isEmptyArray(this.chargingStation.getConnector(commandPayload.connectorId).chargingProfiles)) {
      this.chargingStation.getConnector(commandPayload.connectorId).chargingProfiles = [];
      logger.debug(`${this.chargingStation.logPrefix()} Charging profile(s) cleared, dump their stack: %j`, this.chargingStation.getConnector(commandPayload.connectorId).chargingProfiles);
      return Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED;
    }
    if (!commandPayload.connectorId) {
      let clearedCP = false;
      for (const connector in this.chargingStation.connectors) {
        if (!Utils.isEmptyArray(this.chargingStation.getConnector(Utils.convertToInt(connector)).chargingProfiles)) {
          this.chargingStation.getConnector(Utils.convertToInt(connector)).chargingProfiles?.forEach((chargingProfile: OCPP16ChargingProfile, index: number) => {
            let clearCurrentCP = false;
            if (chargingProfile.chargingProfileId === commandPayload.id) {
              clearCurrentCP = true;
            }
            if (!commandPayload.chargingProfilePurpose && chargingProfile.stackLevel === commandPayload.stackLevel) {
              clearCurrentCP = true;
            }
            if (!chargingProfile.stackLevel && chargingProfile.chargingProfilePurpose === commandPayload.chargingProfilePurpose) {
              clearCurrentCP = true;
            }
            if (chargingProfile.stackLevel === commandPayload.stackLevel && chargingProfile.chargingProfilePurpose === commandPayload.chargingProfilePurpose) {
              clearCurrentCP = true;
            }
            if (clearCurrentCP) {
              this.chargingStation.getConnector(commandPayload.connectorId).chargingProfiles[index] = {} as OCPP16ChargingProfile;
              logger.debug(`${this.chargingStation.logPrefix()} Charging profile(s) cleared, dump their stack: %j`, this.chargingStation.getConnector(commandPayload.connectorId).chargingProfiles);
              clearedCP = true;
            }
          });
        }
      }
      if (clearedCP) {
        return Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED;
      }
    }
    return Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN;
  }

  private async handleRequestChangeAvailability(commandPayload: ChangeAvailabilityRequest): Promise<ChangeAvailabilityResponse> {
    const connectorId: number = commandPayload.connectorId;
    if (!this.chargingStation.getConnector(connectorId)) {
      logger.error(`${this.chargingStation.logPrefix()} Trying to change the availability of a non existing connector Id ${connectorId.toString()}`);
      return Constants.OCPP_AVAILABILITY_RESPONSE_REJECTED;
    }
    const chargePointStatus: OCPP16ChargePointStatus = commandPayload.type === OCPP16AvailabilityType.OPERATIVE ? OCPP16ChargePointStatus.AVAILABLE : OCPP16ChargePointStatus.UNAVAILABLE;
    if (connectorId === 0) {
      let response: ChangeAvailabilityResponse = Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED;
      for (const connector in this.chargingStation.connectors) {
        if (this.chargingStation.getConnector(Utils.convertToInt(connector))?.transactionStarted) {
          response = Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED;
        }
        this.chargingStation.getConnector(Utils.convertToInt(connector)).availability = commandPayload.type;
        if (response === Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED) {
          await this.chargingStation.ocppRequestService.sendStatusNotification(Utils.convertToInt(connector), chargePointStatus);
          this.chargingStation.getConnector(Utils.convertToInt(connector)).status = chargePointStatus;
        }
      }
      return response;
    } else if (connectorId > 0 && (this.chargingStation.getConnector(0).availability === OCPP16AvailabilityType.OPERATIVE || (this.chargingStation.getConnector(0).availability === OCPP16AvailabilityType.INOPERATIVE && commandPayload.type === OCPP16AvailabilityType.INOPERATIVE))) {
      if (this.chargingStation.getConnector(connectorId)?.transactionStarted) {
        this.chargingStation.getConnector(connectorId).availability = commandPayload.type;
        return Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED;
      }
      this.chargingStation.getConnector(connectorId).availability = commandPayload.type;
      await this.chargingStation.ocppRequestService.sendStatusNotification(connectorId, chargePointStatus);
      this.chargingStation.getConnector(connectorId).status = chargePointStatus;
      return Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED;
    }
    return Constants.OCPP_AVAILABILITY_RESPONSE_REJECTED;
  }

  private async handleRequestRemoteStartTransaction(commandPayload: RemoteStartTransactionRequest): Promise<DefaultResponse> {
    const transactionConnectorId: number = commandPayload.connectorId;
    if (transactionConnectorId) {
      await this.chargingStation.ocppRequestService.sendStatusNotification(transactionConnectorId, OCPP16ChargePointStatus.PREPARING);
      this.chargingStation.getConnector(transactionConnectorId).status = OCPP16ChargePointStatus.PREPARING;
      if (this.chargingStation.isChargingStationAvailable() && this.chargingStation.isConnectorAvailable(transactionConnectorId)) {
        // Check if authorized
        if (this.chargingStation.getAuthorizeRemoteTxRequests()) {
          let authorized = false;
          if (this.chargingStation.getLocalAuthListEnabled() && this.chargingStation.hasAuthorizedTags()
              && this.chargingStation.authorizedTags.find((value) => value === commandPayload.idTag)) {
            authorized = true;
          }
          if (!authorized || (authorized && this.chargingStation.getMayAuthorizeAtRemoteStart())) {
            const authorizeResponse = await this.chargingStation.ocppRequestService.sendAuthorize(transactionConnectorId, commandPayload.idTag);
            if (authorizeResponse?.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
              authorized = true;
            } else {
              authorized = false;
            }
          }
          if (authorized) {
            // Authorization successful, start transaction
            if (this.setRemoteStartTransactionChargingProfile(transactionConnectorId, commandPayload.chargingProfile)) {
              if ((await this.chargingStation.ocppRequestService.sendStartTransaction(transactionConnectorId, commandPayload.idTag)).idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
                logger.debug(this.chargingStation.logPrefix() + ' Transaction remotely STARTED on ' + this.chargingStation.stationInfo.chargingStationId + '#' + transactionConnectorId.toString() + ' for idTag ' + commandPayload.idTag);
                return Constants.OCPP_RESPONSE_ACCEPTED;
              }
              return this.notifyRemoteStartTransactionRejected(transactionConnectorId, commandPayload.idTag);
            }
            return this.notifyRemoteStartTransactionRejected(transactionConnectorId, commandPayload.idTag);
          }
          return this.notifyRemoteStartTransactionRejected(transactionConnectorId, commandPayload.idTag);
        }
        // No authorization check required, start transaction
        if (this.setRemoteStartTransactionChargingProfile(transactionConnectorId, commandPayload.chargingProfile)) {
          if ((await this.chargingStation.ocppRequestService.sendStartTransaction(transactionConnectorId, commandPayload.idTag)).idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
            logger.debug(this.chargingStation.logPrefix() + ' Transaction remotely STARTED on ' + this.chargingStation.stationInfo.chargingStationId + '#' + transactionConnectorId.toString() + ' for idTag ' + commandPayload.idTag);
            return Constants.OCPP_RESPONSE_ACCEPTED;
          }
          return this.notifyRemoteStartTransactionRejected(transactionConnectorId, commandPayload.idTag);
        }
        return this.notifyRemoteStartTransactionRejected(transactionConnectorId, commandPayload.idTag);
      }
      return this.notifyRemoteStartTransactionRejected(transactionConnectorId, commandPayload.idTag);
    }
    return this.notifyRemoteStartTransactionRejected(transactionConnectorId, commandPayload.idTag);
  }

  private async notifyRemoteStartTransactionRejected(connectorId: number, idTag: string): Promise<DefaultResponse> {
    if (this.chargingStation.getConnector(connectorId).status !== OCPP16ChargePointStatus.AVAILABLE) {
      await this.chargingStation.ocppRequestService.sendStatusNotification(connectorId, OCPP16ChargePointStatus.AVAILABLE);
      this.chargingStation.getConnector(connectorId).status = OCPP16ChargePointStatus.AVAILABLE;
    }
    logger.warn(this.chargingStation.logPrefix() + ' Remote starting transaction REJECTED on connector Id ' + connectorId.toString() + ', idTag ' + idTag + ', availability ' + this.chargingStation.getConnector(connectorId).availability + ', status ' + this.chargingStation.getConnector(connectorId).status);
    return Constants.OCPP_RESPONSE_REJECTED;
  }

  private setRemoteStartTransactionChargingProfile(connectorId: number, cp: OCPP16ChargingProfile): boolean {
    if (cp && cp.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE) {
      this.chargingStation.setChargingProfile(connectorId, cp);
      logger.debug(`${this.chargingStation.logPrefix()} Charging profile(s) set at remote start transaction, dump their stack: %j`, this.chargingStation.getConnector(connectorId).chargingProfiles);
      return true;
    } else if (cp && cp.chargingProfilePurpose !== ChargingProfilePurposeType.TX_PROFILE) {
      logger.warn(`${this.chargingStation.logPrefix()} Not allowed to set ${cp.chargingProfilePurpose} charging profile(s) at remote start transaction`);
      return false;
    } else if (!cp) {
      return true;
    }
  }

  private async handleRequestRemoteStopTransaction(commandPayload: RemoteStopTransactionRequest): Promise<DefaultResponse> {
    const transactionId = commandPayload.transactionId;
    for (const connector in this.chargingStation.connectors) {
      if (Utils.convertToInt(connector) > 0 && this.chargingStation.getConnector(Utils.convertToInt(connector))?.transactionId === transactionId) {
        await this.chargingStation.ocppRequestService.sendStatusNotification(Utils.convertToInt(connector), OCPP16ChargePointStatus.FINISHING);
        this.chargingStation.getConnector(Utils.convertToInt(connector)).status = OCPP16ChargePointStatus.FINISHING;
        await this.chargingStation.ocppRequestService.sendStopTransaction(transactionId, this.chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId),
          this.chargingStation.getTransactionIdTag(transactionId));
        return Constants.OCPP_RESPONSE_ACCEPTED;
      }
    }
    logger.info(this.chargingStation.logPrefix() + ' Trying to remote stop a non existing transaction ' + transactionId.toString());
    return Constants.OCPP_RESPONSE_REJECTED;
  }

  private async handleRequestGetDiagnostics(commandPayload: GetDiagnosticsRequest): Promise<GetDiagnosticsResponse> {
    logger.debug(this.chargingStation.logPrefix() + ' ' + IncomingRequestCommand.GET_DIAGNOSTICS + ' request received: %j', commandPayload);
    const uri = new URL(commandPayload.location);
    if (uri.protocol.startsWith('ftp:')) {
      let ftpClient: Client;
      try {
        const logFiles = fs.readdirSync(path.resolve(__dirname, '../../../../')).filter((file) => file.endsWith('.log')).map((file) => path.join('./', file));
        const diagnosticsArchive = this.chargingStation.stationInfo.chargingStationId + '_logs.tar.gz';
        tar.create({ gzip: true }, logFiles).pipe(fs.createWriteStream(diagnosticsArchive));
        ftpClient = new Client();
        const accessResponse = await ftpClient.access({
          host: uri.host,
          ...(uri.port !== '') && { port: Utils.convertToInt(uri.port) },
          ...(uri.username !== '') && { user: uri.username },
          ...(uri.password !== '') && { password: uri.password },
        });
        let uploadResponse: FTPResponse;
        if (accessResponse.code === 220) {
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          ftpClient.trackProgress(async (info) => {
            logger.info(`${this.chargingStation.logPrefix()} ${info.bytes / 1024} bytes transferred from diagnostics archive ${info.name}`);
            await this.chargingStation.ocppRequestService.sendDiagnosticsStatusNotification(OCPP16DiagnosticsStatus.Uploading);
          });
          uploadResponse = await ftpClient.uploadFrom(path.join(path.resolve(__dirname, '../../../../'), diagnosticsArchive), uri.pathname + diagnosticsArchive);
          if (uploadResponse.code === 226) {
            await this.chargingStation.ocppRequestService.sendDiagnosticsStatusNotification(OCPP16DiagnosticsStatus.Uploaded);
            if (ftpClient) {
              ftpClient.close();
            }
            return { fileName: diagnosticsArchive };
          }
          throw new OCPPError(ErrorType.GENERIC_ERROR, `Diagnostics transfer failed with error code ${accessResponse.code.toString()}${uploadResponse?.code && '|' + uploadResponse?.code.toString()}`, IncomingRequestCommand.GET_DIAGNOSTICS);
        }
        throw new OCPPError(ErrorType.GENERIC_ERROR, `Diagnostics transfer failed with error code ${accessResponse.code.toString()}${uploadResponse?.code && '|' + uploadResponse?.code.toString()}`, IncomingRequestCommand.GET_DIAGNOSTICS);
      } catch (error) {
        await this.chargingStation.ocppRequestService.sendDiagnosticsStatusNotification(OCPP16DiagnosticsStatus.UploadFailed);
        if (ftpClient) {
          ftpClient.close();
        }
        return this.handleIncomingRequestError(IncomingRequestCommand.GET_DIAGNOSTICS, error, Constants.OCPP_RESPONSE_EMPTY);
      }
    } else {
      logger.error(`${this.chargingStation.logPrefix()} Unsupported protocol ${uri.protocol} to transfer the diagnostic logs archive`);
      await this.chargingStation.ocppRequestService.sendDiagnosticsStatusNotification(OCPP16DiagnosticsStatus.UploadFailed);
      return Constants.OCPP_RESPONSE_EMPTY;
    }
  }

  private handleRequestTriggerMessage(commandPayload: OCPP16TriggerMessageRequest): OCPP16TriggerMessageResponse {
    try {
      switch (commandPayload.requestedMessage) {
        case MessageTrigger.BootNotification:
          setTimeout(() => {
            this.chargingStation.ocppRequestService.sendBootNotification(this.chargingStation.getBootNotificationRequest().chargePointModel,
              this.chargingStation.getBootNotificationRequest().chargePointVendor, this.chargingStation.getBootNotificationRequest().chargeBoxSerialNumber,
              this.chargingStation.getBootNotificationRequest().firmwareVersion).catch(() => { /* This is intentional */ });
          }, Constants.OCPP_TRIGGER_MESSAGE_DELAY);
          return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED;
        case MessageTrigger.Heartbeat:
          setTimeout(() => {
            this.chargingStation.ocppRequestService.sendHeartbeat().catch(() => { /* This is intentional */ });
          }, Constants.OCPP_TRIGGER_MESSAGE_DELAY);
          return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED;
        default:
          return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED;
      }
    } catch (error) {
      return this.handleIncomingRequestError(IncomingRequestCommand.TRIGGER_MESSAGE, error, Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_REJECTED);
    }
  }
}
