// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { JSONSchemaType } from 'ajv';

import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';
import OCPPError from '../../../exception/OCPPError';
import type { JsonObject, JsonType } from '../../../types/JsonType';
import { OCPP16ChargePointErrorCode } from '../../../types/ocpp/1.6/ChargePointErrorCode';
import { OCPP16ChargePointStatus } from '../../../types/ocpp/1.6/ChargePointStatus';
import { OCPP16StandardParametersKey } from '../../../types/ocpp/1.6/Configuration';
import type {
  OCPP16MeterValuesRequest,
  OCPP16MeterValuesResponse,
} from '../../../types/ocpp/1.6/MeterValues';
import {
  type OCPP16BootNotificationRequest,
  OCPP16IncomingRequestCommand,
  OCPP16RequestCommand,
  type OCPP16StatusNotificationRequest,
} from '../../../types/ocpp/1.6/Requests';
import type {
  ChangeAvailabilityResponse,
  ChangeConfigurationResponse,
  ClearChargingProfileResponse,
  GetConfigurationResponse,
  GetDiagnosticsResponse,
  OCPP16BootNotificationResponse,
  OCPP16DataTransferResponse,
  OCPP16DiagnosticsStatusNotificationResponse,
  OCPP16FirmwareStatusNotificationResponse,
  OCPP16HeartbeatResponse,
  OCPP16StatusNotificationResponse,
  OCPP16TriggerMessageResponse,
  OCPP16UpdateFirmwareResponse,
  SetChargingProfileResponse,
  UnlockConnectorResponse,
} from '../../../types/ocpp/1.6/Responses';
import {
  OCPP16AuthorizationStatus,
  type OCPP16AuthorizeRequest,
  type OCPP16AuthorizeResponse,
  type OCPP16StartTransactionRequest,
  type OCPP16StartTransactionResponse,
  type OCPP16StopTransactionRequest,
  type OCPP16StopTransactionResponse,
} from '../../../types/ocpp/1.6/Transaction';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { OCPPVersion } from '../../../types/ocpp/OCPPVersion';
import {
  type GenericResponse,
  RegistrationStatusEnumType,
  type ResponseHandler,
} from '../../../types/ocpp/Responses';
import Constants from '../../../utils/Constants';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';
import type ChargingStation from '../../ChargingStation';
import { ChargingStationConfigurationUtils } from '../../ChargingStationConfigurationUtils';
import OCPPResponseService from '../OCPPResponseService';

const moduleName = 'OCPP16ResponseService';

export default class OCPP16ResponseService extends OCPPResponseService {
  public jsonIncomingRequestResponseSchemas: Map<
    OCPP16IncomingRequestCommand,
    JSONSchemaType<JsonObject>
  >;

  private responseHandlers: Map<OCPP16RequestCommand, ResponseHandler>;
  private jsonSchemas: Map<OCPP16RequestCommand, JSONSchemaType<JsonObject>>;

  public constructor() {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super(OCPPVersion.VERSION_16);
    this.responseHandlers = new Map<OCPP16RequestCommand, ResponseHandler>([
      [OCPP16RequestCommand.BOOT_NOTIFICATION, this.handleResponseBootNotification.bind(this)],
      [OCPP16RequestCommand.HEARTBEAT, this.emptyResponseHandler.bind(this)],
      [OCPP16RequestCommand.AUTHORIZE, this.handleResponseAuthorize.bind(this)],
      [OCPP16RequestCommand.START_TRANSACTION, this.handleResponseStartTransaction.bind(this)],
      [OCPP16RequestCommand.STOP_TRANSACTION, this.handleResponseStopTransaction.bind(this)],
      [OCPP16RequestCommand.STATUS_NOTIFICATION, this.emptyResponseHandler.bind(this)],
      [OCPP16RequestCommand.METER_VALUES, this.emptyResponseHandler.bind(this)],
      [OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, this.emptyResponseHandler.bind(this)],
      [OCPP16RequestCommand.DATA_TRANSFER, this.emptyResponseHandler.bind(this)],
      [OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, this.emptyResponseHandler.bind(this)],
    ]);
    this.jsonSchemas = new Map<OCPP16RequestCommand, JSONSchemaType<JsonObject>>([
      [
        OCPP16RequestCommand.BOOT_NOTIFICATION,
        this.parseJsonSchemaFile<OCPP16BootNotificationResponse>(
          '../../../assets/json-schemas/ocpp/1.6/BootNotificationResponse.json'
        ),
      ],
      [
        OCPP16RequestCommand.HEARTBEAT,
        this.parseJsonSchemaFile<OCPP16HeartbeatResponse>(
          '../../../assets/json-schemas/ocpp/1.6/HeartbeatResponse.json'
        ),
      ],
      [
        OCPP16RequestCommand.AUTHORIZE,
        this.parseJsonSchemaFile<OCPP16AuthorizeResponse>(
          '../../../assets/json-schemas/ocpp/1.6/AuthorizeResponse.json'
        ),
      ],
      [
        OCPP16RequestCommand.START_TRANSACTION,
        this.parseJsonSchemaFile<OCPP16StartTransactionResponse>(
          '../../../assets/json-schemas/ocpp/1.6/StartTransactionResponse.json'
        ),
      ],
      [
        OCPP16RequestCommand.STOP_TRANSACTION,
        this.parseJsonSchemaFile<OCPP16StopTransactionResponse>(
          '../../../assets/json-schemas/ocpp/1.6/StopTransactionResponse.json'
        ),
      ],
      [
        OCPP16RequestCommand.STATUS_NOTIFICATION,
        this.parseJsonSchemaFile<OCPP16StatusNotificationResponse>(
          '../../../assets/json-schemas/ocpp/1.6/StatusNotificationResponse.json'
        ),
      ],
      [
        OCPP16RequestCommand.METER_VALUES,
        this.parseJsonSchemaFile<OCPP16MeterValuesResponse>(
          '../../../assets/json-schemas/ocpp/1.6/MeterValuesResponse.json'
        ),
      ],
      [
        OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        this.parseJsonSchemaFile<OCPP16DiagnosticsStatusNotificationResponse>(
          '../../../assets/json-schemas/ocpp/1.6/DiagnosticsStatusNotificationResponse.json'
        ),
      ],
      [
        OCPP16RequestCommand.DATA_TRANSFER,
        this.parseJsonSchemaFile<OCPP16DataTransferResponse>(
          '../../../assets/json-schemas/ocpp/1.6/DataTransferResponse.json'
        ),
      ],
      [
        OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
        this.parseJsonSchemaFile<OCPP16FirmwareStatusNotificationResponse>(
          '../../../assets/json-schemas/ocpp/1.6/FirmwareStatusNotificationResponse.json'
        ),
      ],
    ]);
    this.jsonIncomingRequestResponseSchemas = new Map([
      [
        OCPP16IncomingRequestCommand.RESET,
        this.parseJsonSchemaFile<GenericResponse>(
          '../../../assets/json-schemas/ocpp/1.6/ResetResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CACHE,
        this.parseJsonSchemaFile<GenericResponse>(
          '../../../assets/json-schemas/ocpp/1.6/ClearCacheResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY,
        this.parseJsonSchemaFile<ChangeAvailabilityResponse>(
          '../../../assets/json-schemas/ocpp/1.6/ChangeAvailabilityResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR,
        this.parseJsonSchemaFile<UnlockConnectorResponse>(
          '../../../assets/json-schemas/ocpp/1.6/UnlockConnectorResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.GET_CONFIGURATION,
        this.parseJsonSchemaFile<GetConfigurationResponse>(
          '../../../assets/json-schemas/ocpp/1.6/GetConfigurationResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION,
        this.parseJsonSchemaFile<ChangeConfigurationResponse>(
          '../../../assets/json-schemas/ocpp/1.6/ChangeConfigurationResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE,
        this.parseJsonSchemaFile<SetChargingProfileResponse>(
          '../../../assets/json-schemas/ocpp/1.6/SetChargingProfileResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE,
        this.parseJsonSchemaFile<ClearChargingProfileResponse>(
          '../../../assets/json-schemas/ocpp/1.6/ClearChargingProfileResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        this.parseJsonSchemaFile<GenericResponse>(
          '../../../assets/json-schemas/ocpp/1.6/RemoteStartTransactionResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
        this.parseJsonSchemaFile<GenericResponse>(
          '../../../assets/json-schemas/ocpp/1.6/RemoteStopTransactionResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
        this.parseJsonSchemaFile<GetDiagnosticsResponse>(
          '../../../assets/json-schemas/ocpp/1.6/GetDiagnosticsResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        this.parseJsonSchemaFile<OCPP16TriggerMessageResponse>(
          '../../../assets/json-schemas/ocpp/1.6/TriggerMessageResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.DATA_TRANSFER,
        this.parseJsonSchemaFile<OCPP16DataTransferResponse>(
          '../../../assets/json-schemas/ocpp/1.6/DataTransferResponse.json'
        ),
      ],
      [
        OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
        this.parseJsonSchemaFile<OCPP16UpdateFirmwareResponse>(
          '../../../assets/json-schemas/ocpp/1.6/UpdateFirmwareResponse.json'
        ),
      ],
    ]);
    this.validatePayload.bind(this);
  }

  public async responseHandler(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    payload: JsonType,
    requestPayload: JsonType
  ): Promise<void> {
    if (
      chargingStation.isRegistered() === true ||
      commandName === OCPP16RequestCommand.BOOT_NOTIFICATION
    ) {
      if (
        this.responseHandlers.has(commandName) === true &&
        OCPP16ServiceUtils.isRequestCommandSupported(chargingStation, commandName) === true
      ) {
        try {
          this.validatePayload(chargingStation, commandName, payload);
          await this.responseHandlers.get(commandName)(chargingStation, payload, requestPayload);
        } catch (error) {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.responseHandler: Handle response error:`,
            error
          );
          throw error;
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle response PDU ${JSON.stringify(
            payload,
            null,
            2
          )}`,
          commandName,
          payload
        );
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle response PDU ${JSON.stringify(
          payload,
          null,
          2
        )} while the charging station is not registered on the central server.`,
        commandName,
        payload
      );
    }
  }

  private validatePayload(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    payload: JsonType
  ): boolean {
    if (this.jsonSchemas.has(commandName) === true) {
      return this.validateResponsePayload(
        chargingStation,
        commandName,
        this.jsonSchemas.get(commandName),
        payload
      );
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema found for command '${commandName}' PDU validation`
    );
    return false;
  }

  private handleResponseBootNotification(
    chargingStation: ChargingStation,
    payload: OCPP16BootNotificationResponse
  ): void {
    if (payload.status === RegistrationStatusEnumType.ACCEPTED) {
      ChargingStationConfigurationUtils.addConfigurationKey(
        chargingStation,
        OCPP16StandardParametersKey.HeartbeatInterval,
        payload.interval.toString(),
        {},
        { overwrite: true, save: true }
      );
      ChargingStationConfigurationUtils.addConfigurationKey(
        chargingStation,
        OCPP16StandardParametersKey.HeartBeatInterval,
        payload.interval.toString(),
        { visible: false },
        { overwrite: true, save: true }
      );
      chargingStation.heartbeatSetInterval
        ? chargingStation.restartHeartbeat()
        : chargingStation.startHeartbeat();
    }
    if (Object.values(RegistrationStatusEnumType).includes(payload.status)) {
      const logMsg = `${chargingStation.logPrefix()} Charging station in '${
        payload.status
      }' state on the central server`;
      payload.status === RegistrationStatusEnumType.REJECTED
        ? logger.warn(logMsg)
        : logger.info(logMsg);
    } else {
      logger.error(
        chargingStation.logPrefix() +
          ' Charging station boot notification response received: %j with undefined registration status',
        payload
      );
    }
  }

  private handleResponseAuthorize(
    chargingStation: ChargingStation,
    payload: OCPP16AuthorizeResponse,
    requestPayload: OCPP16AuthorizeRequest
  ): void {
    let authorizeConnectorId: number;
    for (const connectorId of chargingStation.connectors.keys()) {
      if (
        connectorId > 0 &&
        chargingStation.getConnectorStatus(connectorId)?.authorizeIdTag === requestPayload.idTag
      ) {
        authorizeConnectorId = connectorId;
        break;
      }
    }
    const isAuthorizeConnectorIdDefined = authorizeConnectorId !== undefined;
    if (payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
      isAuthorizeConnectorIdDefined &&
        (chargingStation.getConnectorStatus(authorizeConnectorId).idTagAuthorized = true);
      logger.debug(
        `${chargingStation.logPrefix()} IdTag '${requestPayload.idTag}' accepted${
          isAuthorizeConnectorIdDefined ? ` on connector ${authorizeConnectorId}` : ''
        }`
      );
    } else {
      if (isAuthorizeConnectorIdDefined) {
        chargingStation.getConnectorStatus(authorizeConnectorId).idTagAuthorized = false;
        delete chargingStation.getConnectorStatus(authorizeConnectorId).authorizeIdTag;
      }
      logger.debug(
        `${chargingStation.logPrefix()} IdTag '${requestPayload.idTag}' rejected with status '${
          payload.idTagInfo.status
        }'${isAuthorizeConnectorIdDefined ? ` on connector ${authorizeConnectorId}` : ''}`
      );
    }
  }

  private async handleResponseStartTransaction(
    chargingStation: ChargingStation,
    payload: OCPP16StartTransactionResponse,
    requestPayload: OCPP16StartTransactionRequest
  ): Promise<void> {
    const connectorId = requestPayload.connectorId;

    let transactionConnectorId: number;
    for (const id of chargingStation.connectors.keys()) {
      if (id > 0 && id === connectorId) {
        transactionConnectorId = id;
        break;
      }
    }
    if (!transactionConnectorId) {
      logger.error(
        chargingStation.logPrefix() +
          ' Trying to start a transaction on a non existing connector Id ' +
          connectorId.toString()
      );
      return;
    }
    if (
      chargingStation.getConnectorStatus(connectorId).transactionRemoteStarted === true &&
      chargingStation.getAuthorizeRemoteTxRequests() === true &&
      chargingStation.getLocalAuthListEnabled() === true &&
      chargingStation.hasAuthorizedTags() &&
      chargingStation.getConnectorStatus(connectorId).idTagLocalAuthorized === false
    ) {
      logger.error(
        chargingStation.logPrefix() +
          ' Trying to start a transaction with a not local authorized idTag ' +
          chargingStation.getConnectorStatus(connectorId).localAuthorizeIdTag +
          ' on connector Id ' +
          connectorId.toString()
      );
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId);
      return;
    }
    if (
      chargingStation.getConnectorStatus(connectorId).transactionRemoteStarted === true &&
      chargingStation.getAuthorizeRemoteTxRequests() === true &&
      chargingStation.getMustAuthorizeAtRemoteStart() === true &&
      chargingStation.getConnectorStatus(connectorId).idTagLocalAuthorized === false &&
      chargingStation.getConnectorStatus(connectorId).idTagAuthorized === false
    ) {
      logger.error(
        chargingStation.logPrefix() +
          ' Trying to start a transaction with a not authorized idTag ' +
          chargingStation.getConnectorStatus(connectorId).authorizeIdTag +
          ' on connector Id ' +
          connectorId.toString()
      );
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId);
      return;
    }
    if (
      chargingStation.getConnectorStatus(connectorId).idTagAuthorized &&
      chargingStation.getConnectorStatus(connectorId).authorizeIdTag !== requestPayload.idTag
    ) {
      logger.error(
        chargingStation.logPrefix() +
          ' Trying to start a transaction with an idTag ' +
          requestPayload.idTag +
          ' different from the authorize request one ' +
          chargingStation.getConnectorStatus(connectorId).authorizeIdTag +
          ' on connector Id ' +
          connectorId.toString()
      );
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId);
      return;
    }
    if (
      chargingStation.getConnectorStatus(connectorId).idTagLocalAuthorized &&
      chargingStation.getConnectorStatus(connectorId).localAuthorizeIdTag !== requestPayload.idTag
    ) {
      logger.error(
        chargingStation.logPrefix() +
          ' Trying to start a transaction with an idTag ' +
          requestPayload.idTag +
          ' different from the local authorized one ' +
          chargingStation.getConnectorStatus(connectorId).localAuthorizeIdTag +
          ' on connector Id ' +
          connectorId.toString()
      );
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId);
      return;
    }
    if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true) {
      logger.debug(
        chargingStation.logPrefix() +
          ' Trying to start a transaction on an already used connector ' +
          connectorId.toString() +
          ': %j',
        chargingStation.getConnectorStatus(connectorId)
      );
      return;
    }
    if (
      chargingStation.getConnectorStatus(connectorId)?.status !==
        OCPP16ChargePointStatus.AVAILABLE &&
      chargingStation.getConnectorStatus(connectorId)?.status !== OCPP16ChargePointStatus.PREPARING
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction on connector ${connectorId.toString()} with status ${
          chargingStation.getConnectorStatus(connectorId)?.status
        }`
      );
      return;
    }
    // if (!Number.isInteger(payload.transactionId)) {
    //   logger.warn(
    //     `${chargingStation.logPrefix()} Trying to start a transaction on connector ${connectorId.toString()} with a non integer transaction Id ${
    //       payload.transactionId
    //     }, converting to integer`
    //   );
    //   payload.transactionId = Utils.convertToInt(payload.transactionId);
    // }

    if (payload.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
      chargingStation.getConnectorStatus(connectorId).transactionStarted = true;
      chargingStation.getConnectorStatus(connectorId).transactionId = payload.transactionId;
      chargingStation.getConnectorStatus(connectorId).transactionIdTag = requestPayload.idTag;
      chargingStation.getConnectorStatus(
        connectorId
      ).transactionEnergyActiveImportRegisterValue = 0;
      chargingStation.getConnectorStatus(connectorId).transactionBeginMeterValue =
        OCPP16ServiceUtils.buildTransactionBeginMeterValue(
          chargingStation,
          connectorId,
          requestPayload.meterStart
        );
      chargingStation.getBeginEndMeterValues() &&
        (await chargingStation.ocppRequestService.requestHandler<
          OCPP16MeterValuesRequest,
          OCPP16MeterValuesResponse
        >(chargingStation, OCPP16RequestCommand.METER_VALUES, {
          connectorId,
          transactionId: payload.transactionId,
          meterValue: [chargingStation.getConnectorStatus(connectorId).transactionBeginMeterValue],
        }));
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16StatusNotificationRequest,
        OCPP16StatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
        connectorId,
        status: OCPP16ChargePointStatus.CHARGING,
        errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
      });
      chargingStation.getConnectorStatus(connectorId).status = OCPP16ChargePointStatus.CHARGING;
      logger.info(
        chargingStation.logPrefix() +
          ' Transaction ' +
          payload.transactionId.toString() +
          ' STARTED on ' +
          chargingStation.stationInfo.chargingStationId +
          '#' +
          connectorId.toString() +
          " for idTag '" +
          requestPayload.idTag +
          "'"
      );
      if (chargingStation.stationInfo.powerSharedByConnectors) {
        chargingStation.powerDivider++;
      }
      const configuredMeterValueSampleInterval =
        ChargingStationConfigurationUtils.getConfigurationKey(
          chargingStation,
          OCPP16StandardParametersKey.MeterValueSampleInterval
        );
      chargingStation.startMeterValues(
        connectorId,
        configuredMeterValueSampleInterval
          ? Utils.convertToInt(configuredMeterValueSampleInterval.value) * 1000
          : Constants.DEFAULT_METER_VALUES_INTERVAL
      );
    } else {
      logger.warn(
        chargingStation.logPrefix() +
          ' Starting transaction id ' +
          payload.transactionId.toString() +
          " REJECTED with status '" +
          payload?.idTagInfo?.status +
          "', idTag '" +
          requestPayload.idTag +
          "'"
      );
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId);
    }
  }

  private async resetConnectorOnStartTransactionError(
    chargingStation: ChargingStation,
    connectorId: number
  ): Promise<void> {
    chargingStation.resetConnectorStatus(connectorId);
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
  }

  private async handleResponseStopTransaction(
    chargingStation: ChargingStation,
    payload: OCPP16StopTransactionResponse,
    requestPayload: OCPP16StopTransactionRequest
  ): Promise<void> {
    const transactionConnectorId = chargingStation.getConnectorIdByTransactionId(
      requestPayload.transactionId
    );
    if (!transactionConnectorId) {
      logger.error(
        chargingStation.logPrefix() +
          ' Trying to stop a non existing transaction ' +
          requestPayload.transactionId.toString()
      );
      return;
    }
    if (payload.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
      chargingStation.getBeginEndMeterValues() === true &&
        chargingStation.getOcppStrictCompliance() === false &&
        chargingStation.getOutOfOrderEndMeterValues() === true &&
        (await chargingStation.ocppRequestService.requestHandler<
          OCPP16MeterValuesRequest,
          OCPP16MeterValuesResponse
        >(chargingStation, OCPP16RequestCommand.METER_VALUES, {
          connectorId: transactionConnectorId,
          transactionId: requestPayload.transactionId,
          meterValue: [
            OCPP16ServiceUtils.buildTransactionEndMeterValue(
              chargingStation,
              transactionConnectorId,
              requestPayload.meterStop
            ),
          ],
        }));
      if (
        chargingStation.isChargingStationAvailable() === false ||
        chargingStation.isConnectorAvailable(transactionConnectorId) === false
      ) {
        await chargingStation.ocppRequestService.requestHandler<
          OCPP16StatusNotificationRequest,
          OCPP16StatusNotificationResponse
        >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
          connectorId: transactionConnectorId,
          status: OCPP16ChargePointStatus.UNAVAILABLE,
          errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
        });
        chargingStation.getConnectorStatus(transactionConnectorId).status =
          OCPP16ChargePointStatus.UNAVAILABLE;
      } else {
        await chargingStation.ocppRequestService.requestHandler<
          OCPP16BootNotificationRequest,
          OCPP16BootNotificationResponse
        >(chargingStation, OCPP16RequestCommand.STATUS_NOTIFICATION, {
          connectorId: transactionConnectorId,
          status: OCPP16ChargePointStatus.AVAILABLE,
          errorCode: OCPP16ChargePointErrorCode.NO_ERROR,
        });
        chargingStation.getConnectorStatus(transactionConnectorId).status =
          OCPP16ChargePointStatus.AVAILABLE;
      }
      if (chargingStation.stationInfo.powerSharedByConnectors) {
        chargingStation.powerDivider--;
      }
      chargingStation.resetConnectorStatus(transactionConnectorId);
      logger.info(
        chargingStation.logPrefix() +
          ' Transaction ' +
          requestPayload.transactionId.toString() +
          ' STOPPED on ' +
          chargingStation.stationInfo.chargingStationId +
          '#' +
          transactionConnectorId.toString()
      );
    } else {
      logger.warn(
        chargingStation.logPrefix() +
          ' Stopping transaction id ' +
          requestPayload.transactionId.toString() +
          " REJECTED with status '" +
          payload.idTagInfo?.status +
          "'"
      );
    }
  }

  private parseJsonSchemaFile<T extends JsonType>(relativePath: string): JSONSchemaType<T> {
    return JSON.parse(
      fs.readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), relativePath),
        'utf8'
      )
    ) as JSONSchemaType<T>;
  }
}
