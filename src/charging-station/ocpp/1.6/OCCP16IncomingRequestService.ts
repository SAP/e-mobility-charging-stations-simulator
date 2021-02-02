import { ChangeAvailabilityRequest, ChangeConfigurationRequest, ClearChargingProfileRequest, GetConfigurationRequest, OCPP16AvailabilityType, OCPP16IncomingRequestCommand, RemoteStartTransactionRequest, RemoteStopTransactionRequest, ResetRequest, SetChargingProfileRequest, UnlockConnectorRequest } from '../../../types/ocpp/1.6/Requests';
import { ChangeAvailabilityResponse, ChangeConfigurationResponse, ClearChargingProfileResponse, DefaultResponse, GetConfigurationResponse, SetChargingProfileResponse, UnlockConnectorResponse } from '../../../types/ocpp/1.6/Responses';
import { ChargingProfilePurposeType, OCPP16ChargingProfile } from '../../../types/ocpp/1.6/ChargingProfile';
import { OCPP16AuthorizationStatus, OCPP16StopTransactionReason } from '../../../types/ocpp/1.6/Transaction';

import Constants from '../../../utils/Constants';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { MessageType } from '../../../types/ocpp/MessageType';
import { OCPP16ChargePointStatus } from '../../../types/ocpp/1.6/ChargePointStatus';
import { OCPP16StandardParametersKey } from '../../../types/ocpp/1.6/Configuration';
import { OCPPConfigurationKey } from '../../../types/ocpp/Configuration';
import OCPPError from '../../OcppError';
import OCPPIncomingRequestService from '../OCPPIncomingRequestService';
import Utils from '../../../utils/Utils';
import logger from '../../../utils/Logger';

export default class OCPP16IncomingRequestService extends OCPPIncomingRequestService {
  public async handleRequest(messageId: string, commandName: OCPP16IncomingRequestCommand, commandPayload: Record<string, unknown>): Promise<void> {
    let response;
    // Call
    if (typeof this['handleRequest' + commandName] === 'function') {
      try {
        // Call the method to build the response
        response = await this['handleRequest' + commandName](commandPayload);
      } catch (error) {
        // Log
        logger.error(this.chargingStation.logPrefix() + ' Handle request error: %j', error);
        // Send back an error response to inform backend
        await this.chargingStation.ocppRequestService.sendError(messageId, error, commandName);
        throw error;
      }
    } else {
      // Throw exception
      await this.chargingStation.ocppRequestService.sendError(messageId, new OCPPError(ErrorType.NOT_IMPLEMENTED, `${commandName} is not implemented`, {}), commandName);
      throw new Error(`${commandName} is not implemented to handle payload ${JSON.stringify(commandPayload)}`);
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
    logger.info(`${this.chargingStation.logPrefix()} ${commandPayload.type} reset command received, simulating it. The station will be back online in ${Utils.milliSecondsToHHMMSS(this.chargingStation.stationInfo.resetTime)}`);
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
      const stopResponse = await this.chargingStation.ocppRequestService.sendStopTransaction(transactionId, this.chargingStation.getTransactionMeterStop(transactionId), this.chargingStation.getTransactionIdTag(transactionId), OCPP16StopTransactionReason.UNLOCK_COMMAND);
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
      logger.error(`${this.chargingStation.logPrefix()} ChangeConfiguration request key field is not a string:`, commandPayload);
    }
    if (!Utils.isString(commandPayload.value)) {
      logger.error(`${this.chargingStation.logPrefix()} ChangeConfiguration request value field is not a string:`, commandPayload);
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
          this.chargingStation.getConnector(Utils.convertToInt(connector)).chargingProfiles.forEach((chargingProfile: OCPP16ChargingProfile, index: number) => {
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
        if (this.chargingStation.getConnector(Utils.convertToInt(connector)).transactionStarted) {
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
    const transactionConnectorID: number = commandPayload.connectorId ? commandPayload.connectorId : 1;
    if (this.chargingStation.isChargingStationAvailable() && this.chargingStation.isConnectorAvailable(transactionConnectorID)) {
      if (this.chargingStation.getAuthorizeRemoteTxRequests() && this.chargingStation.getLocalAuthListEnabled() && this.chargingStation.hasAuthorizedTags()) {
        // Check if authorized
        if (this.chargingStation.authorizedTags.find((value) => value === commandPayload.idTag)) {
          await this.chargingStation.ocppRequestService.sendStatusNotification(transactionConnectorID, OCPP16ChargePointStatus.PREPARING);
          this.chargingStation.getConnector(transactionConnectorID).status = OCPP16ChargePointStatus.PREPARING;
          if (commandPayload.chargingProfile && commandPayload.chargingProfile.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE) {
            this.chargingStation.setChargingProfile(transactionConnectorID, commandPayload.chargingProfile);
            logger.debug(`${this.chargingStation.logPrefix()} Charging profile(s) set at start transaction, dump their stack: %j`, this.chargingStation.getConnector(transactionConnectorID).chargingProfiles);
          } else if (commandPayload.chargingProfile && commandPayload.chargingProfile.chargingProfilePurpose !== ChargingProfilePurposeType.TX_PROFILE) {
            return Constants.OCPP_RESPONSE_REJECTED;
          }
          // Authorization successful start transaction
          await this.chargingStation.ocppRequestService.sendStartTransaction(transactionConnectorID, commandPayload.idTag);
          logger.debug(this.chargingStation.logPrefix() + ' Transaction remotely STARTED on ' + this.chargingStation.stationInfo.chargingStationId + '#' + transactionConnectorID.toString() + ' for idTag ' + commandPayload.idTag);
          return Constants.OCPP_RESPONSE_ACCEPTED;
        }
        logger.error(this.chargingStation.logPrefix() + ' Remote starting transaction REJECTED on connector Id ' + transactionConnectorID.toString() + ', idTag ' + commandPayload.idTag);
        return Constants.OCPP_RESPONSE_REJECTED;
      }
      await this.chargingStation.ocppRequestService.sendStatusNotification(transactionConnectorID, OCPP16ChargePointStatus.PREPARING);
      this.chargingStation.getConnector(transactionConnectorID).status = OCPP16ChargePointStatus.PREPARING;
      if (commandPayload.chargingProfile && commandPayload.chargingProfile.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE) {
        this.chargingStation.setChargingProfile(transactionConnectorID, commandPayload.chargingProfile);
        logger.debug(`${this.chargingStation.logPrefix()} Charging profile(s) set at start transaction, dump their stack: %j`, this.chargingStation.getConnector(commandPayload.connectorId).chargingProfiles);
      } else if (commandPayload.chargingProfile && commandPayload.chargingProfile.chargingProfilePurpose !== ChargingProfilePurposeType.TX_PROFILE) {
        return Constants.OCPP_RESPONSE_REJECTED;
      }
      // No local authorization check required => start transaction
      await this.chargingStation.ocppRequestService.sendStartTransaction(transactionConnectorID, commandPayload.idTag);
      logger.debug(this.chargingStation.logPrefix() + ' Transaction remotely STARTED on ' + this.chargingStation.stationInfo.chargingStationId + '#' + transactionConnectorID.toString() + ' for idTag ' + commandPayload.idTag);
      return Constants.OCPP_RESPONSE_ACCEPTED;
    }
    logger.error(this.chargingStation.logPrefix() + ' Remote starting transaction REJECTED on unavailable connector Id ' + transactionConnectorID.toString() + ', idTag ' + commandPayload.idTag);
    return Constants.OCPP_RESPONSE_REJECTED;
  }

  private async handleRequestRemoteStopTransaction(commandPayload: RemoteStopTransactionRequest): Promise<DefaultResponse> {
    const transactionId = commandPayload.transactionId;
    for (const connector in this.chargingStation.connectors) {
      if (Utils.convertToInt(connector) > 0 && this.chargingStation.getConnector(Utils.convertToInt(connector))?.transactionId === transactionId) {
        await this.chargingStation.ocppRequestService.sendStatusNotification(Utils.convertToInt(connector), OCPP16ChargePointStatus.FINISHING);
        this.chargingStation.getConnector(Utils.convertToInt(connector)).status = OCPP16ChargePointStatus.FINISHING;
        await this.chargingStation.ocppRequestService.sendStopTransaction(transactionId, this.chargingStation.getTransactionMeterStop(transactionId), this.chargingStation.getTransactionIdTag(transactionId));
        return Constants.OCPP_RESPONSE_ACCEPTED;
      }
    }
    logger.info(this.chargingStation.logPrefix() + ' Trying to remote stop a non existing transaction ' + transactionId.toString());
    return Constants.OCPP_RESPONSE_REJECTED;
  }
}
