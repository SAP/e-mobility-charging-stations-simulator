// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import fs from 'node:fs';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import type { JSONSchemaType } from 'ajv';
import { Client, type FTPResponse } from 'basic-ftp';
import tar from 'tar';

import {
  type ChargingStation,
  ChargingStationConfigurationUtils,
  ChargingStationUtils,
} from '../../../charging-station';
import { OCPPError } from '../../../exception';
import {
  type ChangeAvailabilityRequest,
  type ChangeAvailabilityResponse,
  type ChangeConfigurationRequest,
  type ChangeConfigurationResponse,
  type ClearChargingProfileRequest,
  type ClearChargingProfileResponse,
  ErrorType,
  type GenericResponse,
  type GetConfigurationRequest,
  type GetConfigurationResponse,
  type GetDiagnosticsRequest,
  type GetDiagnosticsResponse,
  type IncomingRequestHandler,
  type JsonObject,
  type JsonType,
  OCPP16AuthorizationStatus,
  type OCPP16AuthorizeRequest,
  type OCPP16AuthorizeResponse,
  OCPP16AvailabilityType,
  type OCPP16BootNotificationRequest,
  type OCPP16BootNotificationResponse,
  OCPP16ChargePointErrorCode,
  OCPP16ChargePointStatus,
  type OCPP16ChargingProfile,
  OCPP16ChargingProfilePurposeType,
  type OCPP16ClearCacheRequest,
  type OCPP16DataTransferRequest,
  type OCPP16DataTransferResponse,
  OCPP16DataTransferStatus,
  OCPP16DataTransferVendorId,
  OCPP16DiagnosticsStatus,
  type OCPP16DiagnosticsStatusNotificationRequest,
  type OCPP16DiagnosticsStatusNotificationResponse,
  OCPP16FirmwareStatus,
  type OCPP16FirmwareStatusNotificationRequest,
  type OCPP16FirmwareStatusNotificationResponse,
  type OCPP16HeartbeatRequest,
  type OCPP16HeartbeatResponse,
  OCPP16IncomingRequestCommand,
  OCPP16MessageTrigger,
  OCPP16RequestCommand,
  OCPP16StandardParametersKey,
  type OCPP16StartTransactionRequest,
  type OCPP16StartTransactionResponse,
  type OCPP16StatusNotificationRequest,
  type OCPP16StatusNotificationResponse,
  OCPP16StopTransactionReason,
  OCPP16SupportedFeatureProfiles,
  type OCPP16TriggerMessageRequest,
  type OCPP16TriggerMessageResponse,
  type OCPP16UpdateFirmwareRequest,
  type OCPP16UpdateFirmwareResponse,
  type OCPPConfigurationKey,
  OCPPVersion,
  type RemoteStartTransactionRequest,
  type RemoteStopTransactionRequest,
  type ResetRequest,
  type SetChargingProfileRequest,
  type SetChargingProfileResponse,
  type UnlockConnectorRequest,
  type UnlockConnectorResponse,
} from '../../../types';
import { Constants, Utils, logger } from '../../../utils';
import { OCPP16ServiceUtils, OCPPConstants, OCPPIncomingRequestService } from '../internal';

const moduleName = 'OCPP16IncomingRequestService';

export class OCPP16IncomingRequestService extends OCPPIncomingRequestService {
  protected jsonSchemas: Map<OCPP16IncomingRequestCommand, JSONSchemaType<JsonObject>>;
  private incomingRequestHandlers: Map<OCPP16IncomingRequestCommand, IncomingRequestHandler>;

  public constructor() {
    // if (new.target?.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    // }
    super(OCPPVersion.VERSION_16);
    this.incomingRequestHandlers = new Map<OCPP16IncomingRequestCommand, IncomingRequestHandler>([
      [OCPP16IncomingRequestCommand.RESET, this.handleRequestReset.bind(this)],
      [OCPP16IncomingRequestCommand.CLEAR_CACHE, this.handleRequestClearCache.bind(this)],
      [OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR, this.handleRequestUnlockConnector.bind(this)],
      [
        OCPP16IncomingRequestCommand.GET_CONFIGURATION,
        this.handleRequestGetConfiguration.bind(this),
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION,
        this.handleRequestChangeConfiguration.bind(this),
      ],
      [
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE,
        this.handleRequestSetChargingProfile.bind(this),
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE,
        this.handleRequestClearChargingProfile.bind(this),
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY,
        this.handleRequestChangeAvailability.bind(this),
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        this.handleRequestRemoteStartTransaction.bind(this),
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
        this.handleRequestRemoteStopTransaction.bind(this),
      ],
      [OCPP16IncomingRequestCommand.GET_DIAGNOSTICS, this.handleRequestGetDiagnostics.bind(this)],
      [OCPP16IncomingRequestCommand.TRIGGER_MESSAGE, this.handleRequestTriggerMessage.bind(this)],
      [OCPP16IncomingRequestCommand.DATA_TRANSFER, this.handleRequestDataTransfer.bind(this)],
      [OCPP16IncomingRequestCommand.UPDATE_FIRMWARE, this.handleRequestUpdateFirmware.bind(this)],
    ]);
    this.jsonSchemas = new Map<OCPP16IncomingRequestCommand, JSONSchemaType<JsonObject>>([
      [
        OCPP16IncomingRequestCommand.RESET,
        OCPP16ServiceUtils.parseJsonSchemaFile<ResetRequest>(
          '../../../assets/json-schemas/ocpp/1.6/Reset.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CACHE,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16ClearCacheRequest>(
          '../../../assets/json-schemas/ocpp/1.6/ClearCache.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR,
        OCPP16ServiceUtils.parseJsonSchemaFile<UnlockConnectorRequest>(
          '../../../assets/json-schemas/ocpp/1.6/UnlockConnector.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.GET_CONFIGURATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<GetConfigurationRequest>(
          '../../../assets/json-schemas/ocpp/1.6/GetConfiguration.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<ChangeConfigurationRequest>(
          '../../../assets/json-schemas/ocpp/1.6/ChangeConfiguration.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
        OCPP16ServiceUtils.parseJsonSchemaFile<GetDiagnosticsRequest>(
          '../../../assets/json-schemas/ocpp/1.6/GetDiagnostics.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE,
        OCPP16ServiceUtils.parseJsonSchemaFile<SetChargingProfileRequest>(
          '../../../assets/json-schemas/ocpp/1.6/SetChargingProfile.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE,
        OCPP16ServiceUtils.parseJsonSchemaFile<ClearChargingProfileRequest>(
          '../../../assets/json-schemas/ocpp/1.6/ClearChargingProfile.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY,
        OCPP16ServiceUtils.parseJsonSchemaFile<ChangeAvailabilityRequest>(
          '../../../assets/json-schemas/ocpp/1.6/ChangeAvailability.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        OCPP16ServiceUtils.parseJsonSchemaFile<RemoteStartTransactionRequest>(
          '../../../assets/json-schemas/ocpp/1.6/RemoteStartTransaction.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
        OCPP16ServiceUtils.parseJsonSchemaFile<RemoteStopTransactionRequest>(
          '../../../assets/json-schemas/ocpp/1.6/RemoteStopTransaction.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16TriggerMessageRequest>(
          '../../../assets/json-schemas/ocpp/1.6/TriggerMessage.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.DATA_TRANSFER,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DataTransferRequest>(
          '../../../assets/json-schemas/ocpp/1.6/DataTransfer.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16UpdateFirmwareRequest>(
          '../../../assets/json-schemas/ocpp/1.6/UpdateFirmware.json',
          moduleName,
          'constructor'
        ),
      ],
    ]);
    this.validatePayload.bind(this);
  }

  public async incomingRequestHandler(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: OCPP16IncomingRequestCommand,
    commandPayload: JsonType
  ): Promise<void> {
    let response: JsonType;
    if (
      chargingStation.getOcppStrictCompliance() === true &&
      chargingStation.isInPendingState() === true &&
      (commandName === OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION ||
        commandName === OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION)
    ) {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          null,
          2
        )} while the charging station is in pending state on the central server`,
        commandName,
        commandPayload
      );
    }
    if (
      chargingStation.isRegistered() === true ||
      (chargingStation.getOcppStrictCompliance() === false &&
        chargingStation.isInUnknownState() === true)
    ) {
      if (
        this.incomingRequestHandlers.has(commandName) === true &&
        OCPP16ServiceUtils.isIncomingRequestCommandSupported(chargingStation, commandName) === true
      ) {
        try {
          this.validatePayload(chargingStation, commandName, commandPayload);
          // Call the method to build the response
          response = await this.incomingRequestHandlers.get(commandName)(
            chargingStation,
            commandPayload
          );
        } catch (error) {
          // Log
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.incomingRequestHandler: Handle incoming request error:`,
            error
          );
          throw error;
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle request PDU ${JSON.stringify(
            commandPayload,
            null,
            2
          )}`,
          commandName,
          commandPayload
        );
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          null,
          2
        )} while the charging station is not registered on the central server.`,
        commandName,
        commandPayload
      );
    }
    // Send the built response
    await chargingStation.ocppRequestService.sendResponse(
      chargingStation,
      messageId,
      response,
      commandName
    );
  }

  private validatePayload(
    chargingStation: ChargingStation,
    commandName: OCPP16IncomingRequestCommand,
    commandPayload: JsonType
  ): boolean {
    if (this.jsonSchemas.has(commandName) === true) {
      return this.validateIncomingRequestPayload(
        chargingStation,
        commandName,
        this.jsonSchemas.get(commandName),
        commandPayload
      );
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema found for command '${commandName}' PDU validation`
    );
    return false;
  }

  // Simulate charging station restart
  private handleRequestReset(
    chargingStation: ChargingStation,
    commandPayload: ResetRequest
  ): GenericResponse {
    this.runInAsyncScope(
      chargingStation.reset.bind(chargingStation) as (
        this: ChargingStation,
        ...args: any[]
      ) => Promise<void>,
      chargingStation,
      `${commandPayload.type}Reset` as OCPP16StopTransactionReason
    ).catch(Constants.EMPTY_FUNCTION);
    logger.info(
      `${chargingStation.logPrefix()} ${
        commandPayload.type
      } reset command received, simulating it. The station will be back online in ${Utils.formatDurationMilliSeconds(
        chargingStation.stationInfo.resetTime
      )}`
    );
    return OCPPConstants.OCPP_RESPONSE_ACCEPTED;
  }

  private async handleRequestUnlockConnector(
    chargingStation: ChargingStation,
    commandPayload: UnlockConnectorRequest
  ): Promise<UnlockConnectorResponse> {
    const connectorId = commandPayload.connectorId;
    if (chargingStation.connectors.has(connectorId) === false) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to unlock a non existing connector Id ${connectorId.toString()}`
      );
      return OCPPConstants.OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED;
    }
    if (connectorId === 0) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to unlock connector Id ${connectorId.toString()}`
      );
      return OCPPConstants.OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED;
    }
    if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true) {
      const stopResponse = await chargingStation.stopTransactionOnConnector(
        connectorId,
        OCPP16StopTransactionReason.UNLOCK_COMMAND
      );
      if (stopResponse.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
        return OCPPConstants.OCPP_RESPONSE_UNLOCKED;
      }
      return OCPPConstants.OCPP_RESPONSE_UNLOCK_FAILED;
    }
    await chargingStation.ocppRequestService.requestHandler<
      OCPP16StatusNotificationRequest,
      OCPP16StatusNotificationResponse
    >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
      connectorId,
      status: OCPP16ChargePointStatus.Available,
      errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
    });
    chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.Available;
    return OCPPConstants.OCPP_RESPONSE_UNLOCKED;
  }

  private handleRequestGetConfiguration(
    chargingStation: ChargingStation,
    commandPayload: GetConfigurationRequest
  ): GetConfigurationResponse {
    const configurationKey: OCPPConfigurationKey[] = [];
    const unknownKey: string[] = [];
    if (Utils.isUndefined(commandPayload.key) === true) {
      for (const configuration of chargingStation.ocppConfiguration.configurationKey) {
        if (Utils.isUndefined(configuration.visible) === true) {
          configuration.visible = true;
        }
        if (configuration.visible === false) {
          continue;
        }
        configurationKey.push({
          key: configuration.key,
          readonly: configuration.readonly,
          value: configuration.value,
        });
      }
    } else if (Utils.isNotEmptyArray(commandPayload.key) === true) {
      for (const key of commandPayload.key) {
        const keyFound = ChargingStationConfigurationUtils.getConfigurationKey(
          chargingStation,
          key,
          true
        );
        if (keyFound) {
          if (Utils.isUndefined(keyFound.visible) === true) {
            keyFound.visible = true;
          }
          if (keyFound.visible === false) {
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

  private handleRequestChangeConfiguration(
    chargingStation: ChargingStation,
    commandPayload: ChangeConfigurationRequest
  ): ChangeConfigurationResponse {
    const keyToChange = ChargingStationConfigurationUtils.getConfigurationKey(
      chargingStation,
      commandPayload.key,
      true
    );
    if (!keyToChange) {
      return OCPPConstants.OCPP_CONFIGURATION_RESPONSE_NOT_SUPPORTED;
    } else if (keyToChange && keyToChange.readonly) {
      return OCPPConstants.OCPP_CONFIGURATION_RESPONSE_REJECTED;
    } else if (keyToChange && !keyToChange.readonly) {
      let valueChanged = false;
      if (keyToChange.value !== commandPayload.value) {
        ChargingStationConfigurationUtils.setConfigurationKeyValue(
          chargingStation,
          commandPayload.key,
          commandPayload.value,
          true
        );
        valueChanged = true;
      }
      let triggerHeartbeatRestart = false;
      if (keyToChange.key === OCPP16StandardParametersKey.HeartBeatInterval && valueChanged) {
        ChargingStationConfigurationUtils.setConfigurationKeyValue(
          chargingStation,
          OCPP16StandardParametersKey.HeartbeatInterval,
          commandPayload.value
        );
        triggerHeartbeatRestart = true;
      }
      if (keyToChange.key === OCPP16StandardParametersKey.HeartbeatInterval && valueChanged) {
        ChargingStationConfigurationUtils.setConfigurationKeyValue(
          chargingStation,
          OCPP16StandardParametersKey.HeartBeatInterval,
          commandPayload.value
        );
        triggerHeartbeatRestart = true;
      }
      if (triggerHeartbeatRestart) {
        chargingStation.restartHeartbeat();
      }
      if (keyToChange.key === OCPP16StandardParametersKey.WebSocketPingInterval && valueChanged) {
        chargingStation.restartWebSocketPing();
      }
      if (keyToChange.reboot) {
        return OCPPConstants.OCPP_CONFIGURATION_RESPONSE_REBOOT_REQUIRED;
      }
      return OCPPConstants.OCPP_CONFIGURATION_RESPONSE_ACCEPTED;
    }
  }

  private handleRequestSetChargingProfile(
    chargingStation: ChargingStation,
    commandPayload: SetChargingProfileRequest
  ): SetChargingProfileResponse {
    if (
      OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE
      ) === false
    ) {
      return OCPPConstants.OCPP_SET_CHARGING_PROFILE_RESPONSE_NOT_SUPPORTED;
    }
    if (chargingStation.connectors.has(commandPayload.connectorId) === false) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set charging profile(s) to a non existing connector Id ${
          commandPayload.connectorId
        }`
      );
      return OCPPConstants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    if (
      commandPayload.csChargingProfiles.chargingProfilePurpose ===
        OCPP16ChargingProfilePurposeType.CHARGE_POINT_MAX_PROFILE &&
      commandPayload.connectorId !== 0
    ) {
      return OCPPConstants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    if (
      commandPayload.csChargingProfiles.chargingProfilePurpose ===
        OCPP16ChargingProfilePurposeType.TX_PROFILE &&
      (commandPayload.connectorId === 0 ||
        chargingStation.getConnectorStatus(commandPayload.connectorId)?.transactionStarted ===
          false)
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set transaction charging profile(s) on connector ${
          commandPayload.connectorId
        } without a started transaction`
      );
      return OCPPConstants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    OCPP16ServiceUtils.setChargingProfile(
      chargingStation,
      commandPayload.connectorId,
      commandPayload.csChargingProfiles
    );
    logger.debug(
      `${chargingStation.logPrefix()} Charging profile(s) set on connector id ${
        commandPayload.connectorId
      }: %j`,
      commandPayload.csChargingProfiles
    );
    return OCPPConstants.OCPP_SET_CHARGING_PROFILE_RESPONSE_ACCEPTED;
  }

  private handleRequestClearChargingProfile(
    chargingStation: ChargingStation,
    commandPayload: ClearChargingProfileRequest
  ): ClearChargingProfileResponse {
    if (
      OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE
      ) === false
    ) {
      return OCPPConstants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN;
    }
    if (chargingStation.connectors.has(commandPayload.connectorId) === false) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to clear a charging profile(s) to a non existing connector Id ${
          commandPayload.connectorId
        }`
      );
      return OCPPConstants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN;
    }
    const connectorStatus = chargingStation.getConnectorStatus(commandPayload.connectorId);
    if (
      !Utils.isNullOrUndefined(commandPayload.connectorId) &&
      Utils.isNotEmptyArray(connectorStatus?.chargingProfiles)
    ) {
      connectorStatus.chargingProfiles = [];
      logger.debug(
        `${chargingStation.logPrefix()} Charging profile(s) cleared on connector id ${
          commandPayload.connectorId
        }`
      );
      return OCPPConstants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED;
    }
    if (Utils.isNullOrUndefined(commandPayload.connectorId)) {
      let clearedCP = false;
      for (const connectorId of chargingStation.connectors.keys()) {
        if (
          Utils.isNotEmptyArray(chargingStation.getConnectorStatus(connectorId)?.chargingProfiles)
        ) {
          chargingStation
            .getConnectorStatus(connectorId)
            ?.chargingProfiles?.forEach((chargingProfile: OCPP16ChargingProfile, index: number) => {
              let clearCurrentCP = false;
              if (chargingProfile.chargingProfileId === commandPayload.id) {
                clearCurrentCP = true;
              }
              if (
                !commandPayload.chargingProfilePurpose &&
                chargingProfile.stackLevel === commandPayload.stackLevel
              ) {
                clearCurrentCP = true;
              }
              if (
                !chargingProfile.stackLevel &&
                chargingProfile.chargingProfilePurpose === commandPayload.chargingProfilePurpose
              ) {
                clearCurrentCP = true;
              }
              if (
                chargingProfile.stackLevel === commandPayload.stackLevel &&
                chargingProfile.chargingProfilePurpose === commandPayload.chargingProfilePurpose
              ) {
                clearCurrentCP = true;
              }
              if (clearCurrentCP) {
                connectorStatus?.chargingProfiles?.splice(index, 1);
                logger.debug(
                  `${chargingStation.logPrefix()} Matching charging profile(s) cleared: %j`,
                  chargingProfile
                );
                clearedCP = true;
              }
            });
        }
      }
      if (clearedCP) {
        return OCPPConstants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED;
      }
    }
    return OCPPConstants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN;
  }

  private async handleRequestChangeAvailability(
    chargingStation: ChargingStation,
    commandPayload: ChangeAvailabilityRequest
  ): Promise<ChangeAvailabilityResponse> {
    const connectorId: number = commandPayload.connectorId;
    if (chargingStation.connectors.has(connectorId) === false) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to change the availability of a non existing connector Id ${connectorId.toString()}`
      );
      return OCPPConstants.OCPP_AVAILABILITY_RESPONSE_REJECTED;
    }
    const chargePointStatus: OCPP16ChargePointStatus =
      commandPayload.type === OCPP16AvailabilityType.OPERATIVE
        ? OCPP16ChargePointStatus.Available
        : OCPP16ChargePointStatus.Unavailable;
    if (connectorId === 0) {
      let response: ChangeAvailabilityResponse = OCPPConstants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED;
      for (const id of chargingStation.connectors.keys()) {
        if (chargingStation.getConnectorStatus(id)?.transactionStarted === true) {
          response = OCPPConstants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED;
        }
        chargingStation.getConnectorStatus(id).availability = commandPayload.type;
        if (response === OCPPConstants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED) {
          await chargingStation.ocppRequestService.requestHandler<
            OCPP16StatusNotificationRequest,
            OCPP16StatusNotificationResponse
          >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
            connectorId: id,
            status: chargePointStatus,
            errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
          });
          chargingStation.getConnectorStatus(id).status = chargePointStatus;
        }
      }
      return response;
    } else if (
      connectorId > 0 &&
      (chargingStation.isChargingStationAvailable() === true ||
        (chargingStation.isChargingStationAvailable() === false &&
          commandPayload.type === OCPP16AvailabilityType.INOPERATIVE))
    ) {
      if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true) {
        chargingStation.getConnectorStatus(connectorId).availability = commandPayload.type;
        return OCPPConstants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED;
      }
      chargingStation.getConnectorStatus(connectorId).availability = commandPayload.type;
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16StatusNotificationRequest,
        OCPP16StatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
        connectorId,
        status: chargePointStatus,
        errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
      });
      chargingStation.getConnectorStatus(connectorId).status = chargePointStatus;
      return OCPPConstants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED;
    }
    return OCPPConstants.OCPP_AVAILABILITY_RESPONSE_REJECTED;
  }

  private async handleRequestRemoteStartTransaction(
    chargingStation: ChargingStation,
    commandPayload: RemoteStartTransactionRequest
  ): Promise<GenericResponse> {
    const transactionConnectorId = commandPayload.connectorId;
    if (chargingStation.connectors.has(transactionConnectorId) === true) {
      const remoteStartTransactionLogMsg = `${chargingStation.logPrefix()} Transaction remotely STARTED on ${
        chargingStation.stationInfo.chargingStationId
      }#${transactionConnectorId.toString()} for idTag '${commandPayload.idTag}'`;
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16StatusNotificationRequest,
        OCPP16StatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
        connectorId: transactionConnectorId,
        status: OCPP16ChargePointStatus.Preparing,
        errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
      });
      const connectorStatus = chargingStation.getConnectorStatus(transactionConnectorId);
      connectorStatus.status = OCPP16ChargePointStatus.Preparing;
      if (
        chargingStation.isChargingStationAvailable() === true &&
        chargingStation.isConnectorAvailable(transactionConnectorId) === true
      ) {
        // Check if authorized
        if (chargingStation.getAuthorizeRemoteTxRequests() === true) {
          let authorized = false;
          if (
            chargingStation.getLocalAuthListEnabled() === true &&
            chargingStation.hasAuthorizedTags() === true &&
            Utils.isNotEmptyString(
              chargingStation.authorizedTagsCache
                .getAuthorizedTags(
                  ChargingStationUtils.getAuthorizationFile(chargingStation.stationInfo)
                )
                ?.find((idTag) => idTag === commandPayload.idTag)
            )
          ) {
            connectorStatus.localAuthorizeIdTag = commandPayload.idTag;
            connectorStatus.idTagLocalAuthorized = true;
            authorized = true;
          } else if (chargingStation.getMustAuthorizeAtRemoteStart() === true) {
            connectorStatus.authorizeIdTag = commandPayload.idTag;
            const authorizeResponse: OCPP16AuthorizeResponse =
              await chargingStation.ocppRequestService.requestHandler<
                OCPP16AuthorizeRequest,
                OCPP16AuthorizeResponse
              >(chargingStation, OCPP16RequestCommand.AUTHORIZE, {
                idTag: commandPayload.idTag,
              });
            if (authorizeResponse?.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
              authorized = true;
            }
          } else {
            logger.warn(
              `${chargingStation.logPrefix()} The charging station configuration expects authorize at remote start transaction but local authorization or authorize isn't enabled`
            );
          }
          if (authorized === true) {
            // Authorization successful, start transaction
            if (
              this.setRemoteStartTransactionChargingProfile(
                chargingStation,
                transactionConnectorId,
                commandPayload.chargingProfile
              ) === true
            ) {
              connectorStatus.transactionRemoteStarted = true;
              if (
                (
                  await chargingStation.ocppRequestService.requestHandler<
                    OCPP16StartTransactionRequest,
                    OCPP16StartTransactionResponse
                  >(chargingStation, OCPP16RequestCommand.START_TRANSACTION, {
                    connectorId: transactionConnectorId,
                    idTag: commandPayload.idTag,
                  })
                ).idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED
              ) {
                logger.debug(remoteStartTransactionLogMsg);
                return OCPPConstants.OCPP_RESPONSE_ACCEPTED;
              }
              return this.notifyRemoteStartTransactionRejected(
                chargingStation,
                transactionConnectorId,
                commandPayload.idTag
              );
            }
            return this.notifyRemoteStartTransactionRejected(
              chargingStation,
              transactionConnectorId,
              commandPayload.idTag
            );
          }
          return this.notifyRemoteStartTransactionRejected(
            chargingStation,
            transactionConnectorId,
            commandPayload.idTag
          );
        }
        // No authorization check required, start transaction
        if (
          this.setRemoteStartTransactionChargingProfile(
            chargingStation,
            transactionConnectorId,
            commandPayload.chargingProfile
          ) === true
        ) {
          connectorStatus.transactionRemoteStarted = true;
          if (
            (
              await chargingStation.ocppRequestService.requestHandler<
                OCPP16StartTransactionRequest,
                OCPP16StartTransactionResponse
              >(chargingStation, OCPP16RequestCommand.START_TRANSACTION, {
                connectorId: transactionConnectorId,
                idTag: commandPayload.idTag,
              })
            ).idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED
          ) {
            logger.debug(remoteStartTransactionLogMsg);
            return OCPPConstants.OCPP_RESPONSE_ACCEPTED;
          }
          return this.notifyRemoteStartTransactionRejected(
            chargingStation,
            transactionConnectorId,
            commandPayload.idTag
          );
        }
        return this.notifyRemoteStartTransactionRejected(
          chargingStation,
          transactionConnectorId,
          commandPayload.idTag
        );
      }
      return this.notifyRemoteStartTransactionRejected(
        chargingStation,
        transactionConnectorId,
        commandPayload.idTag
      );
    }
    return this.notifyRemoteStartTransactionRejected(
      chargingStation,
      transactionConnectorId,
      commandPayload.idTag
    );
  }

  private async notifyRemoteStartTransactionRejected(
    chargingStation: ChargingStation,
    connectorId: number,
    idTag: string
  ): Promise<GenericResponse> {
    if (
      chargingStation.getConnectorStatus(connectorId)?.status !== OCPP16ChargePointStatus.Available
    ) {
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16StatusNotificationRequest,
        OCPP16StatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
        connectorId,
        status: OCPP16ChargePointStatus.Available,
        errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
      });
      chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.Available;
    }
    logger.warn(
      `${chargingStation.logPrefix()} Remote starting transaction REJECTED on connector Id ${connectorId.toString()}, idTag '${idTag}', availability '${
        chargingStation.getConnectorStatus(connectorId)?.availability
      }', status '${chargingStation.getConnectorStatus(connectorId)?.status}'`
    );
    return OCPPConstants.OCPP_RESPONSE_REJECTED;
  }

  private setRemoteStartTransactionChargingProfile(
    chargingStation: ChargingStation,
    connectorId: number,
    cp: OCPP16ChargingProfile
  ): boolean {
    if (cp && cp.chargingProfilePurpose === OCPP16ChargingProfilePurposeType.TX_PROFILE) {
      OCPP16ServiceUtils.setChargingProfile(chargingStation, connectorId, cp);
      logger.debug(
        `${chargingStation.logPrefix()} Charging profile(s) set at remote start transaction on connector id ${connectorId}: %j`,
        cp
      );
      return true;
    } else if (cp && cp.chargingProfilePurpose !== OCPP16ChargingProfilePurposeType.TX_PROFILE) {
      logger.warn(
        `${chargingStation.logPrefix()} Not allowed to set ${
          cp.chargingProfilePurpose
        } charging profile(s) at remote start transaction`
      );
      return false;
    } else if (!cp) {
      return true;
    }
  }

  private async handleRequestRemoteStopTransaction(
    chargingStation: ChargingStation,
    commandPayload: RemoteStopTransactionRequest
  ): Promise<GenericResponse> {
    const transactionId = commandPayload.transactionId;
    for (const connectorId of chargingStation.connectors.keys()) {
      if (
        connectorId > 0 &&
        chargingStation.getConnectorStatus(connectorId)?.transactionId === transactionId
      ) {
        await chargingStation.ocppRequestService.requestHandler<
          OCPP16StatusNotificationRequest,
          OCPP16StatusNotificationResponse
        >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
          connectorId,
          status: OCPP16ChargePointStatus.Finishing,
          errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
        });
        chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.Finishing;
        const stopResponse = await chargingStation.stopTransactionOnConnector(
          connectorId,
          OCPP16StopTransactionReason.REMOTE
        );
        if (stopResponse.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
          return OCPPConstants.OCPP_RESPONSE_ACCEPTED;
        }
        return OCPPConstants.OCPP_RESPONSE_REJECTED;
      }
    }
    logger.warn(
      `${chargingStation.logPrefix()} Trying to remote stop a non existing transaction ${transactionId.toString()}`
    );
    return OCPPConstants.OCPP_RESPONSE_REJECTED;
  }

  private handleRequestUpdateFirmware(
    chargingStation: ChargingStation,
    commandPayload: OCPP16UpdateFirmwareRequest
  ): OCPP16UpdateFirmwareResponse {
    if (
      OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.FirmwareManagement,
        OCPP16IncomingRequestCommand.UPDATE_FIRMWARE
      ) === false
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUpdateFirmware: Cannot simulate firmware update: feature profile not supported`
      );
      return OCPPConstants.OCPP_RESPONSE_EMPTY;
    }
    if (
      !Utils.isNullOrUndefined(chargingStation.stationInfo.firmwareStatus) &&
      chargingStation.stationInfo.firmwareStatus !== OCPP16FirmwareStatus.Installed
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUpdateFirmware: Cannot simulate firmware update: firmware update is already in progress`
      );
      return OCPPConstants.OCPP_RESPONSE_EMPTY;
    }
    const retrieveDate = Utils.convertToDate(commandPayload.retrieveDate);
    const now = Date.now();
    if (retrieveDate?.getTime() <= now) {
      this.runInAsyncScope(
        this.updateFirmwareSimulation.bind(this) as (
          this: OCPP16IncomingRequestService,
          ...args: any[]
        ) => Promise<void>,
        this,
        chargingStation
      ).catch(Constants.EMPTY_FUNCTION);
    } else {
      setTimeout(() => {
        this.updateFirmwareSimulation(chargingStation).catch(Constants.EMPTY_FUNCTION);
      }, retrieveDate?.getTime() - now);
    }
    return OCPPConstants.OCPP_RESPONSE_EMPTY;
  }

  private async updateFirmwareSimulation(
    chargingStation: ChargingStation,
    maxDelay = 30,
    minDelay = 15
  ): Promise<void> {
    if (
      ChargingStationUtils.checkChargingStation(chargingStation, chargingStation.logPrefix()) ===
      false
    ) {
      return;
    }
    for (const connectorId of chargingStation.connectors.keys()) {
      if (
        connectorId > 0 &&
        chargingStation.getConnectorStatus(connectorId)?.transactionStarted === false
      ) {
        await chargingStation.ocppRequestService.requestHandler<
          OCPP16StatusNotificationRequest,
          OCPP16StatusNotificationResponse
        >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
          connectorId,
          status: OCPP16ChargePointStatus.Unavailable,
          errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
        });
        chargingStation.getConnectorStatus(connectorId).status =
          OCPP16ChargePointStatus.Unavailable;
      }
    }
    await chargingStation.ocppRequestService.requestHandler<
      OCPP16FirmwareStatusNotificationRequest,
      OCPP16FirmwareStatusNotificationResponse
    >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      status: OCPP16FirmwareStatus.Downloading,
    });
    chargingStation.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Downloading;
    if (
      chargingStation.stationInfo?.firmwareUpgrade?.failureStatus ===
      OCPP16FirmwareStatus.DownloadFailed
    ) {
      await Utils.sleep(Utils.getRandomInteger(maxDelay, minDelay) * 1000);
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16FirmwareStatusNotificationRequest,
        OCPP16FirmwareStatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
        status: chargingStation.stationInfo?.firmwareUpgrade?.failureStatus,
      });
      chargingStation.stationInfo.firmwareStatus =
        chargingStation.stationInfo?.firmwareUpgrade?.failureStatus;
      return;
    }
    await Utils.sleep(Utils.getRandomInteger(maxDelay, minDelay) * 1000);
    await chargingStation.ocppRequestService.requestHandler<
      OCPP16FirmwareStatusNotificationRequest,
      OCPP16FirmwareStatusNotificationResponse
    >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      status: OCPP16FirmwareStatus.Downloaded,
    });
    chargingStation.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Downloaded;
    let wasTransactionsStarted = false;
    let transactionsStarted: boolean;
    do {
      let trxCount = 0;
      for (const connectorId of chargingStation.connectors.keys()) {
        if (
          connectorId > 0 &&
          chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true
        ) {
          trxCount++;
        }
      }
      if (trxCount > 0) {
        const waitTime = 15 * 1000;
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.updateFirmwareSimulation: ${trxCount} transaction(s) in progress, waiting ${
            waitTime / 1000
          } seconds before continuing firmware update simulation`
        );
        await Utils.sleep(waitTime);
        transactionsStarted = true;
        wasTransactionsStarted = true;
      } else {
        for (const connectorId of chargingStation.connectors.keys()) {
          if (
            connectorId > 0 &&
            chargingStation.getConnectorStatus(connectorId)?.status !==
              OCPP16ChargePointStatus.Unavailable
          ) {
            await chargingStation.ocppRequestService.requestHandler<
              OCPP16StatusNotificationRequest,
              OCPP16StatusNotificationResponse
            >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
              connectorId,
              status: OCPP16ChargePointStatus.Unavailable,
              errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
            });
            chargingStation.getConnectorStatus(connectorId).status =
              OCPP16ChargePointStatus.Unavailable;
          }
        }
        transactionsStarted = false;
      }
    } while (transactionsStarted);
    !wasTransactionsStarted &&
      (await Utils.sleep(Utils.getRandomInteger(maxDelay, minDelay) * 1000));
    if (
      ChargingStationUtils.checkChargingStation(chargingStation, chargingStation.logPrefix()) ===
      false
    ) {
      return;
    }
    await chargingStation.ocppRequestService.requestHandler<
      OCPP16FirmwareStatusNotificationRequest,
      OCPP16FirmwareStatusNotificationResponse
    >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      status: OCPP16FirmwareStatus.Installing,
    });
    chargingStation.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Installing;
    if (
      chargingStation.stationInfo?.firmwareUpgrade?.failureStatus ===
      OCPP16FirmwareStatus.InstallationFailed
    ) {
      await Utils.sleep(Utils.getRandomInteger(maxDelay, minDelay) * 1000);
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16FirmwareStatusNotificationRequest,
        OCPP16FirmwareStatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
        status: chargingStation.stationInfo?.firmwareUpgrade?.failureStatus,
      });
      chargingStation.stationInfo.firmwareStatus =
        chargingStation.stationInfo?.firmwareUpgrade?.failureStatus;
      return;
    }
    if (chargingStation.stationInfo?.firmwareUpgrade?.reset === true) {
      await Utils.sleep(Utils.getRandomInteger(maxDelay, minDelay) * 1000);
      await chargingStation.reset(OCPP16StopTransactionReason.REBOOT);
    }
  }

  private async handleRequestGetDiagnostics(
    chargingStation: ChargingStation,
    commandPayload: GetDiagnosticsRequest
  ): Promise<GetDiagnosticsResponse> {
    if (
      OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.FirmwareManagement,
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
      ) === false
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetDiagnostics: Cannot get diagnostics: feature profile not supported`
      );
      return OCPPConstants.OCPP_RESPONSE_EMPTY;
    }
    const uri = new URL(commandPayload.location);
    if (uri.protocol.startsWith('ftp:')) {
      let ftpClient: Client;
      try {
        const logFiles = fs
          .readdirSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../'))
          .filter((file) => file.endsWith('.log'))
          .map((file) => path.join('./', file));
        const diagnosticsArchive = `${chargingStation.stationInfo.chargingStationId}_logs.tar.gz`;
        tar.create({ gzip: true }, logFiles).pipe(fs.createWriteStream(diagnosticsArchive));
        ftpClient = new Client();
        const accessResponse = await ftpClient.access({
          host: uri.host,
          ...(Utils.isNotEmptyString(uri.port) && { port: Utils.convertToInt(uri.port) }),
          ...(Utils.isNotEmptyString(uri.username) && { user: uri.username }),
          ...(Utils.isNotEmptyString(uri.password) && { password: uri.password }),
        });
        let uploadResponse: FTPResponse;
        if (accessResponse.code === 220) {
          ftpClient.trackProgress((info) => {
            logger.info(
              `${chargingStation.logPrefix()} ${
                info.bytes / 1024
              } bytes transferred from diagnostics archive ${info.name}`
            );
            chargingStation.ocppRequestService
              .requestHandler<
                OCPP16DiagnosticsStatusNotificationRequest,
                OCPP16DiagnosticsStatusNotificationResponse
              >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
                status: OCPP16DiagnosticsStatus.Uploading,
              })
              .catch((error) => {
                logger.error(
                  `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetDiagnostics: Error while sending '${
                    OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION
                  }'`,
                  error
                );
              });
          });
          uploadResponse = await ftpClient.uploadFrom(
            path.join(
              path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../'),
              diagnosticsArchive
            ),
            `${uri.pathname}${diagnosticsArchive}`
          );
          if (uploadResponse.code === 226) {
            await chargingStation.ocppRequestService.requestHandler<
              OCPP16DiagnosticsStatusNotificationRequest,
              OCPP16DiagnosticsStatusNotificationResponse
            >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
              status: OCPP16DiagnosticsStatus.Uploaded,
            });
            if (ftpClient) {
              ftpClient.close();
            }
            return { fileName: diagnosticsArchive };
          }
          throw new OCPPError(
            ErrorType.GENERIC_ERROR,
            `Diagnostics transfer failed with error code ${accessResponse.code.toString()}${
              uploadResponse?.code && `|${uploadResponse?.code.toString()}`
            }`,
            OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
          );
        }
        throw new OCPPError(
          ErrorType.GENERIC_ERROR,
          `Diagnostics transfer failed with error code ${accessResponse.code.toString()}${
            uploadResponse?.code && `|${uploadResponse?.code.toString()}`
          }`,
          OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
        );
      } catch (error) {
        await chargingStation.ocppRequestService.requestHandler<
          OCPP16DiagnosticsStatusNotificationRequest,
          OCPP16DiagnosticsStatusNotificationResponse
        >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
          status: OCPP16DiagnosticsStatus.UploadFailed,
        });
        if (ftpClient) {
          ftpClient.close();
        }
        return this.handleIncomingRequestError(
          chargingStation,
          OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
          error as Error,
          { errorResponse: OCPPConstants.OCPP_RESPONSE_EMPTY }
        );
      }
    } else {
      logger.error(
        `${chargingStation.logPrefix()} Unsupported protocol ${
          uri.protocol
        } to transfer the diagnostic logs archive`
      );
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16DiagnosticsStatusNotificationRequest,
        OCPP16DiagnosticsStatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
        status: OCPP16DiagnosticsStatus.UploadFailed,
      });
      return OCPPConstants.OCPP_RESPONSE_EMPTY;
    }
  }

  private handleRequestTriggerMessage(
    chargingStation: ChargingStation,
    commandPayload: OCPP16TriggerMessageRequest
  ): OCPP16TriggerMessageResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.RemoteTrigger,
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE
      ) ||
      !OCPP16ServiceUtils.isMessageTriggerSupported(
        chargingStation,
        commandPayload.requestedMessage
      )
    ) {
      return OCPPConstants.OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED;
    }
    if (
      !OCPP16ServiceUtils.isConnectorIdValid(
        chargingStation,
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        commandPayload.connectorId
      )
    ) {
      return OCPPConstants.OCPP_TRIGGER_MESSAGE_RESPONSE_REJECTED;
    }
    try {
      switch (commandPayload.requestedMessage) {
        case OCPP16MessageTrigger.BootNotification:
          setTimeout(() => {
            chargingStation.ocppRequestService
              .requestHandler<OCPP16BootNotificationRequest, OCPP16BootNotificationResponse>(
                chargingStation,
                OCPP16RequestCommand.BOOT_NOTIFICATION,
                chargingStation.bootNotificationRequest,
                { skipBufferingOnError: true, triggerMessage: true }
              )
              .then((response) => {
                chargingStation.bootNotificationResponse = response;
              })
              .catch(Constants.EMPTY_FUNCTION);
          }, Constants.OCPP_TRIGGER_MESSAGE_DELAY);
          return OCPPConstants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED;
        case OCPP16MessageTrigger.Heartbeat:
          setTimeout(() => {
            chargingStation.ocppRequestService
              .requestHandler<OCPP16HeartbeatRequest, OCPP16HeartbeatResponse>(
                chargingStation,
                OCPP16RequestCommand.HEARTBEAT,
                null,
                {
                  triggerMessage: true,
                }
              )
              .catch(Constants.EMPTY_FUNCTION);
          }, Constants.OCPP_TRIGGER_MESSAGE_DELAY);
          return OCPPConstants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED;
        case OCPP16MessageTrigger.StatusNotification:
          setTimeout(() => {
            if (!Utils.isNullOrUndefined(commandPayload?.connectorId)) {
              chargingStation.ocppRequestService
                .requestHandler<OCPP16StatusNotificationRequest, OCPP16StatusNotificationResponse>(
                  chargingStation,
                  OCPP16RequestCommand.STATUS_NOTIFICATION,
                  {
                    connectorId: commandPayload.connectorId,
                    errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
                    status: chargingStation.getConnectorStatus(commandPayload.connectorId)?.status,
                  },
                  {
                    triggerMessage: true,
                  }
                )
                .catch(Constants.EMPTY_FUNCTION);
            } else {
              for (const connectorId of chargingStation.connectors.keys()) {
                chargingStation.ocppRequestService
                  .requestHandler<
                    OCPP16StatusNotificationRequest,
                    OCPP16StatusNotificationResponse
                  >(
                    chargingStation,
                    OCPP16RequestCommand.STATUS_NOTIFICATION,
                    {
                      connectorId,
                      errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
                      status: chargingStation.getConnectorStatus(connectorId)?.status,
                    },
                    {
                      triggerMessage: true,
                    }
                  )
                  .catch(Constants.EMPTY_FUNCTION);
              }
            }
          }, Constants.OCPP_TRIGGER_MESSAGE_DELAY);
          return OCPPConstants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED;
        default:
          return OCPPConstants.OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED;
      }
    } catch (error) {
      return this.handleIncomingRequestError(
        chargingStation,
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        error as Error,
        { errorResponse: OCPPConstants.OCPP_TRIGGER_MESSAGE_RESPONSE_REJECTED }
      );
    }
  }

  private handleRequestDataTransfer(
    chargingStation: ChargingStation,
    commandPayload: OCPP16DataTransferRequest
  ): OCPP16DataTransferResponse {
    try {
      if (Object.values(OCPP16DataTransferVendorId).includes(commandPayload.vendorId)) {
        return {
          status: OCPP16DataTransferStatus.ACCEPTED,
        };
      }
      return {
        status: OCPP16DataTransferStatus.UNKNOWN_VENDOR_ID,
      };
    } catch (error) {
      return this.handleIncomingRequestError(
        chargingStation,
        OCPP16IncomingRequestCommand.DATA_TRANSFER,
        error as Error,
        { errorResponse: OCPPConstants.OCPP_DATA_TRANSFER_RESPONSE_REJECTED }
      );
    }
  }
}
