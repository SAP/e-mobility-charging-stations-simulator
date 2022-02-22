// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { ChangeAvailabilityRequest, ChangeConfigurationRequest, ClearChargingProfileRequest, GetConfigurationRequest, GetDiagnosticsRequest, MessageTrigger, OCPP16AvailabilityType, OCPP16IncomingRequestCommand, OCPP16RequestCommand, OCPP16TriggerMessageRequest, RemoteStartTransactionRequest, RemoteStopTransactionRequest, ResetRequest, SetChargingProfileRequest, UnlockConnectorRequest } from '../../../types/ocpp/1.6/Requests';
import { ChangeAvailabilityResponse, ChangeConfigurationResponse, ClearChargingProfileResponse, GetConfigurationResponse, GetDiagnosticsResponse, OCPP16TriggerMessageResponse, SetChargingProfileResponse, UnlockConnectorResponse } from '../../../types/ocpp/1.6/Responses';
import { ChargingProfilePurposeType, OCPP16ChargingProfile } from '../../../types/ocpp/1.6/ChargingProfile';
import { Client, FTPResponse } from 'basic-ftp';
import { OCPP16AuthorizationStatus, OCPP16StopTransactionReason } from '../../../types/ocpp/1.6/Transaction';

import type ChargingStation from '../../ChargingStation';
import Constants from '../../../utils/Constants';
import { DefaultResponse } from '../../../types/ocpp/Responses';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { IncomingRequestHandler } from '../../../types/ocpp/Requests';
import { JsonType } from '../../../types/JsonType';
import { OCPP16ChargePointStatus } from '../../../types/ocpp/1.6/ChargePointStatus';
import { OCPP16DiagnosticsStatus } from '../../../types/ocpp/1.6/DiagnosticsStatus';
import { OCPP16StandardParametersKey } from '../../../types/ocpp/1.6/Configuration';
import { OCPPConfigurationKey } from '../../../types/ocpp/Configuration';
import OCPPError from '../../../exception/OCPPError';
import OCPPIncomingRequestService from '../OCPPIncomingRequestService';
import { URL } from 'url';
import Utils from '../../../utils/Utils';
import fs from 'fs';
import logger from '../../../utils/Logger';
import path from 'path';
import tar from 'tar';

const moduleName = 'OCPP16IncomingRequestService';

export default class OCPP16IncomingRequestService extends OCPPIncomingRequestService {
  private incomingRequestHandlers: Map<OCPP16IncomingRequestCommand, IncomingRequestHandler>;

  public constructor(chargingStation: ChargingStation) {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super(chargingStation);
    this.incomingRequestHandlers = new Map<OCPP16IncomingRequestCommand, IncomingRequestHandler>([
      [OCPP16IncomingRequestCommand.RESET, this.handleRequestReset.bind(this)],
      [OCPP16IncomingRequestCommand.CLEAR_CACHE, this.handleRequestClearCache.bind(this)],
      [OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR, this.handleRequestUnlockConnector.bind(this)],
      [OCPP16IncomingRequestCommand.GET_CONFIGURATION, this.handleRequestGetConfiguration.bind(this)],
      [OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION, this.handleRequestChangeConfiguration.bind(this)],
      [OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE, this.handleRequestSetChargingProfile.bind(this)],
      [OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE, this.handleRequestClearChargingProfile.bind(this)],
      [OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY, this.handleRequestChangeAvailability.bind(this)],
      [OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION, this.handleRequestRemoteStartTransaction.bind(this)],
      [OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION, this.handleRequestRemoteStopTransaction.bind(this)],
      [OCPP16IncomingRequestCommand.GET_DIAGNOSTICS, this.handleRequestGetDiagnostics.bind(this)],
      [OCPP16IncomingRequestCommand.TRIGGER_MESSAGE, this.handleRequestTriggerMessage.bind(this)]
    ]);
  }

  public async handleRequest(messageId: string, commandName: OCPP16IncomingRequestCommand, commandPayload: JsonType): Promise<void> {
    let result: JsonType;
    if (this.chargingStation.getOcppStrictCompliance() && (this.chargingStation.isInPendingState()
      && (commandName === OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION || commandName === OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION))) {
      throw new OCPPError(ErrorType.SECURITY_ERROR, `${commandName} cannot be issued to handle request payload ${JSON.stringify(commandPayload, null, 2)} while the charging station is in pending state on the central server`, commandName);
    }
    if (this.chargingStation.isRegistered() || (!this.chargingStation.getOcppStrictCompliance() && this.chargingStation.isInUnknownState())) {
      if (this.incomingRequestHandlers.has(commandName)) {
        try {
          // Call the method to build the result
          result = await this.incomingRequestHandlers.get(commandName)(commandPayload);
        } catch (error) {
          // Log
          logger.error(this.chargingStation.logPrefix() + ' Handle request error: %j', error);
          throw error;
        }
      } else {
        // Throw exception
        throw new OCPPError(ErrorType.NOT_IMPLEMENTED, `${commandName} is not implemented to handle request payload ${JSON.stringify(commandPayload, null, 2)}`, commandName);
      }
    } else {
      throw new OCPPError(ErrorType.SECURITY_ERROR, `${commandName} cannot be issued to handle request payload ${JSON.stringify(commandPayload, null, 2)} while the charging station is not registered on the central server.`, commandName);
    }
    // Send the built result
    await this.chargingStation.ocppRequestService.sendResult(messageId, result, commandName);
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
    if (this.chargingStation.getConnectorStatus(connectorId)?.transactionStarted) {
      const transactionId = this.chargingStation.getConnectorStatus(connectorId).transactionId;
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
    this.chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.AVAILABLE;
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
      logger.error(`${this.chargingStation.logPrefix()} ${OCPP16RequestCommand.CHANGE_CONFIGURATION} request key field is not a string:`, commandPayload);
    }
    if (!Utils.isString(commandPayload.value)) {
      logger.error(`${this.chargingStation.logPrefix()} ${OCPP16RequestCommand.CHANGE_CONFIGURATION} request value field is not a string:`, commandPayload);
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
    if (!this.chargingStation.getConnectorStatus(commandPayload.connectorId)) {
      logger.error(`${this.chargingStation.logPrefix()} Trying to set charging profile(s) to a non existing connector Id ${commandPayload.connectorId}`);
      return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    if (commandPayload.csChargingProfiles.chargingProfilePurpose === ChargingProfilePurposeType.CHARGE_POINT_MAX_PROFILE && commandPayload.connectorId !== 0) {
      return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    if (commandPayload.csChargingProfiles.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE && (commandPayload.connectorId === 0 || !this.chargingStation.getConnectorStatus(commandPayload.connectorId)?.transactionStarted)) {
      return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    this.chargingStation.setChargingProfile(commandPayload.connectorId, commandPayload.csChargingProfiles);
    logger.debug(`${this.chargingStation.logPrefix()} Charging profile(s) set, dump their stack: %j`, this.chargingStation.getConnectorStatus(commandPayload.connectorId).chargingProfiles);
    return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_ACCEPTED;
  }

  private handleRequestClearChargingProfile(commandPayload: ClearChargingProfileRequest): ClearChargingProfileResponse {
    if (!this.chargingStation.getConnectorStatus(commandPayload.connectorId)) {
      logger.error(`${this.chargingStation.logPrefix()} Trying to clear a charging profile(s) to a non existing connector Id ${commandPayload.connectorId}`);
      return Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN;
    }
    if (commandPayload.connectorId && !Utils.isEmptyArray(this.chargingStation.getConnectorStatus(commandPayload.connectorId).chargingProfiles)) {
      this.chargingStation.getConnectorStatus(commandPayload.connectorId).chargingProfiles = [];
      logger.debug(`${this.chargingStation.logPrefix()} Charging profile(s) cleared, dump their stack: %j`, this.chargingStation.getConnectorStatus(commandPayload.connectorId).chargingProfiles);
      return Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED;
    }
    if (!commandPayload.connectorId) {
      let clearedCP = false;
      for (const connectorId of this.chargingStation.connectors.keys()) {
        if (!Utils.isEmptyArray(this.chargingStation.getConnectorStatus(connectorId).chargingProfiles)) {
          this.chargingStation.getConnectorStatus(connectorId).chargingProfiles?.forEach((chargingProfile: OCPP16ChargingProfile, index: number) => {
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
              this.chargingStation.getConnectorStatus(commandPayload.connectorId).chargingProfiles[index] = {} as OCPP16ChargingProfile;
              logger.debug(`${this.chargingStation.logPrefix()} Charging profile(s) cleared, dump their stack: %j`, this.chargingStation.getConnectorStatus(commandPayload.connectorId).chargingProfiles);
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
    if (!this.chargingStation.getConnectorStatus(connectorId)) {
      logger.error(`${this.chargingStation.logPrefix()} Trying to change the availability of a non existing connector Id ${connectorId.toString()}`);
      return Constants.OCPP_AVAILABILITY_RESPONSE_REJECTED;
    }
    const chargePointStatus: OCPP16ChargePointStatus = commandPayload.type === OCPP16AvailabilityType.OPERATIVE
      ? OCPP16ChargePointStatus.AVAILABLE
      : OCPP16ChargePointStatus.UNAVAILABLE;
    if (connectorId === 0) {
      let response: ChangeAvailabilityResponse = Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED;
      for (const id of this.chargingStation.connectors.keys()) {
        if (this.chargingStation.getConnectorStatus(id)?.transactionStarted) {
          response = Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED;
        }
        this.chargingStation.getConnectorStatus(id).availability = commandPayload.type;
        if (response === Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED) {
          await this.chargingStation.ocppRequestService.sendStatusNotification(id, chargePointStatus);
          this.chargingStation.getConnectorStatus(id).status = chargePointStatus;
        }
      }
      return response;
    } else if (connectorId > 0 && (this.chargingStation.getConnectorStatus(0).availability === OCPP16AvailabilityType.OPERATIVE || (this.chargingStation.getConnectorStatus(0).availability === OCPP16AvailabilityType.INOPERATIVE && commandPayload.type === OCPP16AvailabilityType.INOPERATIVE))) {
      if (this.chargingStation.getConnectorStatus(connectorId)?.transactionStarted) {
        this.chargingStation.getConnectorStatus(connectorId).availability = commandPayload.type;
        return Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED;
      }
      this.chargingStation.getConnectorStatus(connectorId).availability = commandPayload.type;
      await this.chargingStation.ocppRequestService.sendStatusNotification(connectorId, chargePointStatus);
      this.chargingStation.getConnectorStatus(connectorId).status = chargePointStatus;
      return Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED;
    }
    return Constants.OCPP_AVAILABILITY_RESPONSE_REJECTED;
  }

  private async handleRequestRemoteStartTransaction(commandPayload: RemoteStartTransactionRequest): Promise<DefaultResponse> {
    const transactionConnectorId: number = commandPayload.connectorId;
    if (transactionConnectorId) {
      await this.chargingStation.ocppRequestService.sendStatusNotification(transactionConnectorId, OCPP16ChargePointStatus.PREPARING);
      this.chargingStation.getConnectorStatus(transactionConnectorId).status = OCPP16ChargePointStatus.PREPARING;
      if (this.chargingStation.isChargingStationAvailable() && this.chargingStation.isConnectorAvailable(transactionConnectorId)) {
        // Check if authorized
        if (this.chargingStation.getAuthorizeRemoteTxRequests()) {
          let authorized = false;
          if (this.chargingStation.getLocalAuthListEnabled() && this.chargingStation.hasAuthorizedTags()
            && this.chargingStation.authorizedTags.find((value) => value === commandPayload.idTag)) {
            this.chargingStation.getConnectorStatus(transactionConnectorId).localAuthorizeIdTag = commandPayload.idTag;
            this.chargingStation.getConnectorStatus(transactionConnectorId).idTagLocalAuthorized = true;
            authorized = true;
          } else if (this.chargingStation.getMayAuthorizeAtRemoteStart()) {
            const authorizeResponse = await this.chargingStation.ocppRequestService.sendAuthorize(transactionConnectorId, commandPayload.idTag);
            if (authorizeResponse?.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
              authorized = true;
            }
          } else {
            logger.warn(`${this.chargingStation.logPrefix()} The charging station configuration expects authorize at remote start transaction but local authorization or authorize isn't enabled`);
          }
          if (authorized) {
            // Authorization successful, start transaction
            if (this.setRemoteStartTransactionChargingProfile(transactionConnectorId, commandPayload.chargingProfile)) {
              this.chargingStation.getConnectorStatus(transactionConnectorId).transactionRemoteStarted = true;
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
          this.chargingStation.getConnectorStatus(transactionConnectorId).transactionRemoteStarted = true;
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
    if (this.chargingStation.getConnectorStatus(connectorId).status !== OCPP16ChargePointStatus.AVAILABLE) {
      await this.chargingStation.ocppRequestService.sendStatusNotification(connectorId, OCPP16ChargePointStatus.AVAILABLE);
      this.chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.AVAILABLE;
    }
    logger.warn(this.chargingStation.logPrefix() + ' Remote starting transaction REJECTED on connector Id ' + connectorId.toString() + ', idTag ' + idTag + ', availability ' + this.chargingStation.getConnectorStatus(connectorId).availability + ', status ' + this.chargingStation.getConnectorStatus(connectorId).status);
    return Constants.OCPP_RESPONSE_REJECTED;
  }

  private setRemoteStartTransactionChargingProfile(connectorId: number, cp: OCPP16ChargingProfile): boolean {
    if (cp && cp.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE) {
      this.chargingStation.setChargingProfile(connectorId, cp);
      logger.debug(`${this.chargingStation.logPrefix()} Charging profile(s) set at remote start transaction, dump their stack: %j`, this.chargingStation.getConnectorStatus(connectorId).chargingProfiles);
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
    for (const connectorId of this.chargingStation.connectors.keys()) {
      if (connectorId > 0 && this.chargingStation.getConnectorStatus(connectorId)?.transactionId === transactionId) {
        await this.chargingStation.ocppRequestService.sendStatusNotification(connectorId, OCPP16ChargePointStatus.FINISHING);
        this.chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.FINISHING;
        await this.chargingStation.ocppRequestService.sendStopTransaction(transactionId, this.chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId),
          this.chargingStation.getTransactionIdTag(transactionId));
        return Constants.OCPP_RESPONSE_ACCEPTED;
      }
    }
    logger.info(this.chargingStation.logPrefix() + ' Trying to remote stop a non existing transaction ' + transactionId.toString());
    return Constants.OCPP_RESPONSE_REJECTED;
  }

  private async handleRequestGetDiagnostics(commandPayload: GetDiagnosticsRequest): Promise<GetDiagnosticsResponse> {
    logger.debug(this.chargingStation.logPrefix() + ' ' + OCPP16IncomingRequestCommand.GET_DIAGNOSTICS + ' request received: %j', commandPayload);
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
          throw new OCPPError(ErrorType.GENERIC_ERROR, `Diagnostics transfer failed with error code ${accessResponse.code.toString()}${uploadResponse?.code && '|' + uploadResponse?.code.toString()}`, OCPP16IncomingRequestCommand.GET_DIAGNOSTICS);
        }
        throw new OCPPError(ErrorType.GENERIC_ERROR, `Diagnostics transfer failed with error code ${accessResponse.code.toString()}${uploadResponse?.code && '|' + uploadResponse?.code.toString()}`, OCPP16IncomingRequestCommand.GET_DIAGNOSTICS);
      } catch (error) {
        await this.chargingStation.ocppRequestService.sendDiagnosticsStatusNotification(OCPP16DiagnosticsStatus.UploadFailed);
        if (ftpClient) {
          ftpClient.close();
        }
        return this.handleIncomingRequestError(OCPP16IncomingRequestCommand.GET_DIAGNOSTICS, error as Error, Constants.OCPP_RESPONSE_EMPTY);
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
              this.chargingStation.getBootNotificationRequest().firmwareVersion, this.chargingStation.getBootNotificationRequest().chargePointSerialNumber,
              this.chargingStation.getBootNotificationRequest().iccid, this.chargingStation.getBootNotificationRequest().imsi,
              this.chargingStation.getBootNotificationRequest().meterSerialNumber, this.chargingStation.getBootNotificationRequest().meterType,
              { triggerMessage: true }).catch(() => { /* This is intentional */ });
          }, Constants.OCPP_TRIGGER_MESSAGE_DELAY);
          return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED;
        case MessageTrigger.Heartbeat:
          setTimeout(() => {
            this.chargingStation.ocppRequestService.sendHeartbeat({ triggerMessage: true }).catch(() => { /* This is intentional */ });
          }, Constants.OCPP_TRIGGER_MESSAGE_DELAY);
          return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED;
        default:
          return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED;
      }
    } catch (error) {
      return this.handleIncomingRequestError(OCPP16IncomingRequestCommand.TRIGGER_MESSAGE, error as Error, Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_REJECTED);
    }
  }
}
