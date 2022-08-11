// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

import { Client, FTPResponse } from 'basic-ftp';
import tar from 'tar';

import OCPPError from '../../../exception/OCPPError';
import { JsonType } from '../../../types/JsonType';
import { OCPP16ChargePointErrorCode } from '../../../types/ocpp/1.6/ChargePointErrorCode';
import { OCPP16ChargePointStatus } from '../../../types/ocpp/1.6/ChargePointStatus';
import {
  ChargingProfilePurposeType,
  OCPP16ChargingProfile,
} from '../../../types/ocpp/1.6/ChargingProfile';
import {
  OCPP16StandardParametersKey,
  OCPP16SupportedFeatureProfiles,
} from '../../../types/ocpp/1.6/Configuration';
import { OCPP16DiagnosticsStatus } from '../../../types/ocpp/1.6/DiagnosticsStatus';
import {
  OCPP16MeterValuesRequest,
  OCPP16MeterValuesResponse,
} from '../../../types/ocpp/1.6/MeterValues';
import {
  ChangeAvailabilityRequest,
  ChangeConfigurationRequest,
  ClearChargingProfileRequest,
  DiagnosticsStatusNotificationRequest,
  GetConfigurationRequest,
  GetDiagnosticsRequest,
  MessageTrigger,
  OCPP16AvailabilityType,
  OCPP16BootNotificationRequest,
  OCPP16HeartbeatRequest,
  OCPP16IncomingRequestCommand,
  OCPP16RequestCommand,
  OCPP16StatusNotificationRequest,
  OCPP16TriggerMessageRequest,
  RemoteStartTransactionRequest,
  RemoteStopTransactionRequest,
  ResetRequest,
  SetChargingProfileRequest,
  UnlockConnectorRequest,
} from '../../../types/ocpp/1.6/Requests';
import {
  ChangeAvailabilityResponse,
  ChangeConfigurationResponse,
  ClearChargingProfileResponse,
  DiagnosticsStatusNotificationResponse,
  GetConfigurationResponse,
  GetDiagnosticsResponse,
  OCPP16BootNotificationResponse,
  OCPP16HeartbeatResponse,
  OCPP16StatusNotificationResponse,
  OCPP16TriggerMessageResponse,
  SetChargingProfileResponse,
  UnlockConnectorResponse,
} from '../../../types/ocpp/1.6/Responses';
import {
  OCPP16AuthorizationStatus,
  OCPP16AuthorizeRequest,
  OCPP16AuthorizeResponse,
  OCPP16StartTransactionRequest,
  OCPP16StartTransactionResponse,
  OCPP16StopTransactionReason,
  OCPP16StopTransactionRequest,
  OCPP16StopTransactionResponse,
} from '../../../types/ocpp/1.6/Transaction';
import { OCPPConfigurationKey } from '../../../types/ocpp/Configuration';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { IncomingRequestHandler } from '../../../types/ocpp/Requests';
import { DefaultResponse } from '../../../types/ocpp/Responses';
import Constants from '../../../utils/Constants';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';
import type ChargingStation from '../../ChargingStation';
import { ChargingStationConfigurationUtils } from '../../ChargingStationConfigurationUtils';
import { ChargingStationUtils } from '../../ChargingStationUtils';
import OCPPIncomingRequestService from '../OCPPIncomingRequestService';
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';

const moduleName = 'OCPP16IncomingRequestService';

export default class OCPP16IncomingRequestService extends OCPPIncomingRequestService {
  private incomingRequestHandlers: Map<OCPP16IncomingRequestCommand, IncomingRequestHandler>;

  public constructor() {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super();
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
    ]);
  }

  public async incomingRequestHandler(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: OCPP16IncomingRequestCommand,
    commandPayload: JsonType
  ): Promise<void> {
    let response: JsonType;
    if (
      chargingStation.getOcppStrictCompliance() &&
      chargingStation.isInPendingState() &&
      (commandName === OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION ||
        commandName === OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION)
    ) {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request payload ${JSON.stringify(
          commandPayload,
          null,
          2
        )} while the charging station is in pending state on the central server`,
        commandName,
        commandPayload
      );
    }
    if (
      chargingStation.isRegistered() ||
      (!chargingStation.getOcppStrictCompliance() && chargingStation.isInUnknownState())
    ) {
      if (
        this.incomingRequestHandlers.has(commandName) &&
        ChargingStationUtils.isCommandSupported(commandName, chargingStation)
      ) {
        try {
          // Call the method to build the response
          response = await this.incomingRequestHandlers.get(commandName)(
            chargingStation,
            commandPayload
          );
        } catch (error) {
          // Log
          logger.error(chargingStation.logPrefix() + ' Handle request error: %j', error);
          throw error;
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle request payload ${JSON.stringify(
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
        `${commandName} cannot be issued to handle request payload ${JSON.stringify(
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

  // Simulate charging station restart
  private handleRequestReset(
    chargingStation: ChargingStation,
    commandPayload: ResetRequest
  ): DefaultResponse {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setImmediate(async (): Promise<void> => {
      await chargingStation.reset((commandPayload.type + 'Reset') as OCPP16StopTransactionReason);
    });
    logger.info(
      `${chargingStation.logPrefix()} ${
        commandPayload.type
      } reset command received, simulating it. The station will be back online in ${Utils.formatDurationMilliSeconds(
        chargingStation.stationInfo.resetTime
      )}`
    );
    return Constants.OCPP_RESPONSE_ACCEPTED;
  }

  private handleRequestClearCache(): DefaultResponse {
    return Constants.OCPP_RESPONSE_ACCEPTED;
  }

  private async handleRequestUnlockConnector(
    chargingStation: ChargingStation,
    commandPayload: UnlockConnectorRequest
  ): Promise<UnlockConnectorResponse> {
    const connectorId = commandPayload.connectorId;
    if (connectorId === 0) {
      logger.error(
        chargingStation.logPrefix() + ' Trying to unlock connector ' + connectorId.toString()
      );
      return Constants.OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED;
    }
    if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted) {
      const transactionId = chargingStation.getConnectorStatus(connectorId).transactionId;
      if (
        chargingStation.getBeginEndMeterValues() &&
        chargingStation.getOcppStrictCompliance() &&
        !chargingStation.getOutOfOrderEndMeterValues()
      ) {
        // FIXME: Implement OCPP version agnostic helpers
        const transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(
          chargingStation,
          connectorId,
          chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId)
        );
        await chargingStation.ocppRequestService.requestHandler<
          OCPP16MeterValuesRequest,
          OCPP16MeterValuesResponse
        >(chargingStation, OCPP16RequestCommand.METER_VALUES, {
          connectorId,
          transactionId,
          meterValue: [transactionEndMeterValue],
        });
      }
      const stopResponse = await chargingStation.ocppRequestService.requestHandler<
        OCPP16StopTransactionRequest,
        OCPP16StopTransactionResponse
      >(chargingStation, OCPP16RequestCommand.STOP_TRANSACTION, {
        transactionId,
        meterStop: chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId),
        idTag: chargingStation.getTransactionIdTag(transactionId),
        reason: OCPP16StopTransactionReason.UNLOCK_COMMAND,
      });
      if (stopResponse.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
        return Constants.OCPP_RESPONSE_UNLOCKED;
      }
      return Constants.OCPP_RESPONSE_UNLOCK_FAILED;
    }
    await chargingStation.ocppRequestService.requestHandler<
      OCPP16StatusNotificationRequest,
      OCPP16StatusNotificationResponse
    >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
      connectorId,
      status: OCPP16ChargePointStatus.AVAILABLE,
      errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
    });
    chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.AVAILABLE;
    return Constants.OCPP_RESPONSE_UNLOCKED;
  }

  private handleRequestGetConfiguration(
    chargingStation: ChargingStation,
    commandPayload: GetConfigurationRequest
  ): GetConfigurationResponse {
    const configurationKey: OCPPConfigurationKey[] = [];
    const unknownKey: string[] = [];
    if (Utils.isEmptyArray(commandPayload.key)) {
      for (const configuration of chargingStation.ocppConfiguration.configurationKey) {
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
        const keyFound = ChargingStationConfigurationUtils.getConfigurationKey(
          chargingStation,
          key
        );
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

  private handleRequestChangeConfiguration(
    chargingStation: ChargingStation,
    commandPayload: ChangeConfigurationRequest
  ): ChangeConfigurationResponse {
    // JSON request fields type sanity check
    if (!Utils.isString(commandPayload.key)) {
      logger.error(
        `${chargingStation.logPrefix()} ${
          OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION
        } request key field is not a string:`,
        commandPayload
      );
    }
    if (!Utils.isString(commandPayload.value)) {
      logger.error(
        `${chargingStation.logPrefix()} ${
          OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION
        } request value field is not a string:`,
        commandPayload
      );
    }
    const keyToChange = ChargingStationConfigurationUtils.getConfigurationKey(
      chargingStation,
      commandPayload.key,
      true
    );
    if (!keyToChange) {
      return Constants.OCPP_CONFIGURATION_RESPONSE_NOT_SUPPORTED;
    } else if (keyToChange && keyToChange.readonly) {
      return Constants.OCPP_CONFIGURATION_RESPONSE_REJECTED;
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
        return Constants.OCPP_CONFIGURATION_RESPONSE_REBOOT_REQUIRED;
      }
      return Constants.OCPP_CONFIGURATION_RESPONSE_ACCEPTED;
    }
  }

  private handleRequestSetChargingProfile(
    chargingStation: ChargingStation,
    commandPayload: SetChargingProfileRequest
  ): SetChargingProfileResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE
      )
    ) {
      return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_NOT_SUPPORTED;
    }
    if (!chargingStation.getConnectorStatus(commandPayload.connectorId)) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set charging profile(s) to a non existing connector Id ${
          commandPayload.connectorId
        }`
      );
      return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    if (
      commandPayload.csChargingProfiles.chargingProfilePurpose ===
        ChargingProfilePurposeType.CHARGE_POINT_MAX_PROFILE &&
      commandPayload.connectorId !== 0
    ) {
      return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    if (
      commandPayload.csChargingProfiles.chargingProfilePurpose ===
        ChargingProfilePurposeType.TX_PROFILE &&
      (commandPayload.connectorId === 0 ||
        !chargingStation.getConnectorStatus(commandPayload.connectorId)?.transactionStarted)
    ) {
      return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED;
    }
    chargingStation.setChargingProfile(
      commandPayload.connectorId,
      commandPayload.csChargingProfiles
    );
    logger.debug(
      `${chargingStation.logPrefix()} Charging profile(s) set on connector id ${
        commandPayload.connectorId
      }, dump their stack: %j`,
      chargingStation.getConnectorStatus(commandPayload.connectorId).chargingProfiles
    );
    return Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_ACCEPTED;
  }

  private handleRequestClearChargingProfile(
    chargingStation: ChargingStation,
    commandPayload: ClearChargingProfileRequest
  ): ClearChargingProfileResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE
      )
    ) {
      return Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN;
    }
    const connectorStatus = chargingStation.getConnectorStatus(commandPayload.connectorId);
    if (!connectorStatus) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to clear a charging profile(s) to a non existing connector Id ${
          commandPayload.connectorId
        }`
      );
      return Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN;
    }
    if (commandPayload.connectorId && !Utils.isEmptyArray(connectorStatus.chargingProfiles)) {
      connectorStatus.chargingProfiles = [];
      logger.debug(
        `${chargingStation.logPrefix()} Charging profile(s) cleared on connector id ${
          commandPayload.connectorId
        }, dump their stack: %j`,
        connectorStatus.chargingProfiles
      );
      return Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED;
    }
    if (!commandPayload.connectorId) {
      let clearedCP = false;
      for (const connectorId of chargingStation.connectors.keys()) {
        if (!Utils.isEmptyArray(chargingStation.getConnectorStatus(connectorId).chargingProfiles)) {
          chargingStation
            .getConnectorStatus(connectorId)
            .chargingProfiles?.forEach((chargingProfile: OCPP16ChargingProfile, index: number) => {
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
                connectorStatus.chargingProfiles.splice(index, 1);
                logger.debug(
                  `${chargingStation.logPrefix()} Matching charging profile(s) cleared on connector id ${
                    commandPayload.connectorId
                  }, dump their stack: %j`,
                  connectorStatus.chargingProfiles
                );
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

  private async handleRequestChangeAvailability(
    chargingStation: ChargingStation,
    commandPayload: ChangeAvailabilityRequest
  ): Promise<ChangeAvailabilityResponse> {
    const connectorId: number = commandPayload.connectorId;
    if (!chargingStation.getConnectorStatus(connectorId)) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to change the availability of a non existing connector Id ${connectorId.toString()}`
      );
      return Constants.OCPP_AVAILABILITY_RESPONSE_REJECTED;
    }
    const chargePointStatus: OCPP16ChargePointStatus =
      commandPayload.type === OCPP16AvailabilityType.OPERATIVE
        ? OCPP16ChargePointStatus.AVAILABLE
        : OCPP16ChargePointStatus.UNAVAILABLE;
    if (connectorId === 0) {
      let response: ChangeAvailabilityResponse = Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED;
      for (const id of chargingStation.connectors.keys()) {
        if (chargingStation.getConnectorStatus(id)?.transactionStarted) {
          response = Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED;
        }
        chargingStation.getConnectorStatus(id).availability = commandPayload.type;
        if (response === Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED) {
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
      (chargingStation.getConnectorStatus(0).availability === OCPP16AvailabilityType.OPERATIVE ||
        (chargingStation.getConnectorStatus(0).availability ===
          OCPP16AvailabilityType.INOPERATIVE &&
          commandPayload.type === OCPP16AvailabilityType.INOPERATIVE))
    ) {
      if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted) {
        chargingStation.getConnectorStatus(connectorId).availability = commandPayload.type;
        return Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED;
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
      return Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED;
    }
    return Constants.OCPP_AVAILABILITY_RESPONSE_REJECTED;
  }

  private async handleRequestRemoteStartTransaction(
    chargingStation: ChargingStation,
    commandPayload: RemoteStartTransactionRequest
  ): Promise<DefaultResponse> {
    const transactionConnectorId = commandPayload.connectorId;
    const connectorStatus = chargingStation.getConnectorStatus(transactionConnectorId);
    if (transactionConnectorId) {
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16StatusNotificationRequest,
        OCPP16StatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
        connectorId: transactionConnectorId,
        status: OCPP16ChargePointStatus.PREPARING,
        errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
      });
      connectorStatus.status = OCPP16ChargePointStatus.PREPARING;
      if (chargingStation.isChargingStationAvailable() && connectorStatus) {
        // Check if authorized
        if (chargingStation.getAuthorizeRemoteTxRequests()) {
          let authorized = false;
          if (
            chargingStation.getLocalAuthListEnabled() &&
            chargingStation.hasAuthorizedTags() &&
            chargingStation.authorizedTagsCache
              .getAuthorizedTags(
                ChargingStationUtils.getAuthorizationFile(chargingStation.stationInfo)
              )
              .find((value) => value === commandPayload.idTag)
          ) {
            connectorStatus.localAuthorizeIdTag = commandPayload.idTag;
            connectorStatus.idTagLocalAuthorized = true;
            authorized = true;
          } else if (chargingStation.getMayAuthorizeAtRemoteStart()) {
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
          if (authorized) {
            // Authorization successful, start transaction
            if (
              this.setRemoteStartTransactionChargingProfile(
                chargingStation,
                transactionConnectorId,
                commandPayload.chargingProfile
              )
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
                logger.debug(
                  chargingStation.logPrefix() +
                    ' Transaction remotely STARTED on ' +
                    chargingStation.stationInfo.chargingStationId +
                    '#' +
                    transactionConnectorId.toString() +
                    ' for idTag ' +
                    commandPayload.idTag
                );
                return Constants.OCPP_RESPONSE_ACCEPTED;
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
          )
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
            logger.debug(
              chargingStation.logPrefix() +
                ' Transaction remotely STARTED on ' +
                chargingStation.stationInfo.chargingStationId +
                '#' +
                transactionConnectorId.toString() +
                ' for idTag ' +
                commandPayload.idTag
            );
            return Constants.OCPP_RESPONSE_ACCEPTED;
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
  ): Promise<DefaultResponse> {
    if (
      chargingStation.getConnectorStatus(connectorId).status !== OCPP16ChargePointStatus.AVAILABLE
    ) {
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16StatusNotificationRequest,
        OCPP16StatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
        connectorId,
        status: OCPP16ChargePointStatus.AVAILABLE,
        errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
      });
      chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.AVAILABLE;
    }
    logger.warn(
      chargingStation.logPrefix() +
        ' Remote starting transaction REJECTED on connector Id ' +
        connectorId.toString() +
        ', idTag ' +
        idTag +
        ', availability ' +
        chargingStation.getConnectorStatus(connectorId).availability +
        ', status ' +
        chargingStation.getConnectorStatus(connectorId).status
    );
    return Constants.OCPP_RESPONSE_REJECTED;
  }

  private setRemoteStartTransactionChargingProfile(
    chargingStation: ChargingStation,
    connectorId: number,
    cp: OCPP16ChargingProfile
  ): boolean {
    if (cp && cp.chargingProfilePurpose === ChargingProfilePurposeType.TX_PROFILE) {
      chargingStation.setChargingProfile(connectorId, cp);
      logger.debug(
        `${chargingStation.logPrefix()} Charging profile(s) set at remote start transaction on connector id ${connectorId}, dump their stack: %j`,
        chargingStation.getConnectorStatus(connectorId).chargingProfiles
      );
      return true;
    } else if (cp && cp.chargingProfilePurpose !== ChargingProfilePurposeType.TX_PROFILE) {
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
  ): Promise<DefaultResponse> {
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
          status: OCPP16ChargePointStatus.FINISHING,
          errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
        });
        chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.FINISHING;
        if (
          chargingStation.getBeginEndMeterValues() &&
          chargingStation.getOcppStrictCompliance() &&
          !chargingStation.getOutOfOrderEndMeterValues()
        ) {
          // FIXME: Implement OCPP version agnostic helpers
          const transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(
            chargingStation,
            connectorId,
            chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId)
          );
          await chargingStation.ocppRequestService.requestHandler<
            OCPP16MeterValuesRequest,
            OCPP16MeterValuesResponse
          >(chargingStation, OCPP16RequestCommand.METER_VALUES, {
            connectorId,
            transactionId,
            meterValue: [transactionEndMeterValue],
          });
        }
        await chargingStation.ocppRequestService.requestHandler<
          OCPP16StopTransactionRequest,
          OCPP16StopTransactionResponse
        >(chargingStation, OCPP16RequestCommand.STOP_TRANSACTION, {
          transactionId,
          meterStop: chargingStation.getEnergyActiveImportRegisterByTransactionId(transactionId),
          idTag: chargingStation.getTransactionIdTag(transactionId),
        });
        return Constants.OCPP_RESPONSE_ACCEPTED;
      }
    }
    logger.warn(
      chargingStation.logPrefix() +
        ' Trying to remote stop a non existing transaction ' +
        transactionId.toString()
    );
    return Constants.OCPP_RESPONSE_REJECTED;
  }

  private async handleRequestGetDiagnostics(
    chargingStation: ChargingStation,
    commandPayload: GetDiagnosticsRequest
  ): Promise<GetDiagnosticsResponse> {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.FirmwareManagement,
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
      )
    ) {
      return Constants.OCPP_RESPONSE_EMPTY;
    }
    logger.debug(
      chargingStation.logPrefix() +
        ' ' +
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS +
        ' request received: %j',
      commandPayload
    );
    const uri = new URL(commandPayload.location);
    if (uri.protocol.startsWith('ftp:')) {
      let ftpClient: Client;
      try {
        const logFiles = fs
          .readdirSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../'))
          .filter((file) => file.endsWith('.log'))
          .map((file) => path.join('./', file));
        const diagnosticsArchive = chargingStation.stationInfo.chargingStationId + '_logs.tar.gz';
        tar.create({ gzip: true }, logFiles).pipe(fs.createWriteStream(diagnosticsArchive));
        ftpClient = new Client();
        const accessResponse = await ftpClient.access({
          host: uri.host,
          ...(!Utils.isEmptyString(uri.port) && { port: Utils.convertToInt(uri.port) }),
          ...(!Utils.isEmptyString(uri.username) && { user: uri.username }),
          ...(!Utils.isEmptyString(uri.password) && { password: uri.password }),
        });
        let uploadResponse: FTPResponse;
        if (accessResponse.code === 220) {
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          ftpClient.trackProgress(async (info) => {
            logger.info(
              `${chargingStation.logPrefix()} ${
                info.bytes / 1024
              } bytes transferred from diagnostics archive ${info.name}`
            );
            await chargingStation.ocppRequestService.requestHandler<
              DiagnosticsStatusNotificationRequest,
              DiagnosticsStatusNotificationResponse
            >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
              status: OCPP16DiagnosticsStatus.Uploading,
            });
          });
          uploadResponse = await ftpClient.uploadFrom(
            path.join(
              path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../'),
              diagnosticsArchive
            ),
            uri.pathname + diagnosticsArchive
          );
          if (uploadResponse.code === 226) {
            await chargingStation.ocppRequestService.requestHandler<
              DiagnosticsStatusNotificationRequest,
              DiagnosticsStatusNotificationResponse
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
              uploadResponse?.code && '|' + uploadResponse?.code.toString()
            }`,
            OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
          );
        }
        throw new OCPPError(
          ErrorType.GENERIC_ERROR,
          `Diagnostics transfer failed with error code ${accessResponse.code.toString()}${
            uploadResponse?.code && '|' + uploadResponse?.code.toString()
          }`,
          OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
        );
      } catch (error) {
        await chargingStation.ocppRequestService.requestHandler<
          DiagnosticsStatusNotificationRequest,
          DiagnosticsStatusNotificationResponse
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
          { errorResponse: Constants.OCPP_RESPONSE_EMPTY }
        );
      }
    } else {
      logger.error(
        `${chargingStation.logPrefix()} Unsupported protocol ${
          uri.protocol
        } to transfer the diagnostic logs archive`
      );
      await chargingStation.ocppRequestService.requestHandler<
        DiagnosticsStatusNotificationRequest,
        DiagnosticsStatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
        status: OCPP16DiagnosticsStatus.UploadFailed,
      });
      return Constants.OCPP_RESPONSE_EMPTY;
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
      )
    ) {
      return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED;
    }
    // TODO: factor out the check on connector id
    if (commandPayload?.connectorId < 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${
          OCPP16IncomingRequestCommand.TRIGGER_MESSAGE
        } incoming request received with invalid connectorId ${commandPayload.connectorId}`
      );
      return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_REJECTED;
    }
    try {
      switch (commandPayload.requestedMessage) {
        case MessageTrigger.BootNotification:
          setTimeout(() => {
            chargingStation.ocppRequestService
              .requestHandler<OCPP16BootNotificationRequest, OCPP16BootNotificationResponse>(
                chargingStation,
                OCPP16RequestCommand.BOOT_NOTIFICATION,
                {
                  chargePointModel: chargingStation.getBootNotificationRequest().chargePointModel,
                  chargePointVendor: chargingStation.getBootNotificationRequest().chargePointVendor,
                  chargeBoxSerialNumber:
                    chargingStation.getBootNotificationRequest().chargeBoxSerialNumber,
                  firmwareVersion: chargingStation.getBootNotificationRequest().firmwareVersion,
                  chargePointSerialNumber:
                    chargingStation.getBootNotificationRequest().chargePointSerialNumber,
                  iccid: chargingStation.getBootNotificationRequest().iccid,
                  imsi: chargingStation.getBootNotificationRequest().imsi,
                  meterSerialNumber: chargingStation.getBootNotificationRequest().meterSerialNumber,
                  meterType: chargingStation.getBootNotificationRequest().meterType,
                },
                { skipBufferingOnError: true, triggerMessage: true }
              )
              .then((value) => {
                chargingStation.bootNotificationResponse = value;
              })
              .catch(() => {
                /* This is intentional */
              });
          }, Constants.OCPP_TRIGGER_MESSAGE_DELAY);
          return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED;
        case MessageTrigger.Heartbeat:
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
              .catch(() => {
                /* This is intentional */
              });
          }, Constants.OCPP_TRIGGER_MESSAGE_DELAY);
          return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED;
        case MessageTrigger.StatusNotification:
          setTimeout(() => {
            if (commandPayload?.connectorId) {
              chargingStation.ocppRequestService
                .requestHandler<OCPP16StatusNotificationRequest, OCPP16StatusNotificationResponse>(
                  chargingStation,
                  OCPP16RequestCommand.STATUS_NOTIFICATION,
                  {
                    connectorId: commandPayload.connectorId,
                    errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
                    status: chargingStation.getConnectorStatus(commandPayload.connectorId).status,
                  },
                  {
                    triggerMessage: true,
                  }
                )
                .catch(() => {
                  /* This is intentional */
                });
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
                      status: chargingStation.getConnectorStatus(connectorId).status,
                    },
                    {
                      triggerMessage: true,
                    }
                  )
                  .catch(() => {
                    /* This is intentional */
                  });
              }
            }
          }, Constants.OCPP_TRIGGER_MESSAGE_DELAY);
          return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED;
        default:
          return Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED;
      }
    } catch (error) {
      return this.handleIncomingRequestError(
        chargingStation,
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        error as Error,
        { errorResponse: Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_REJECTED }
      );
    }
  }
}
