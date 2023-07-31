// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import { parentPort } from 'node:worker_threads';

import type { JSONSchemaType } from 'ajv';
import { secondsToMilliseconds } from 'date-fns';

import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';
import {
  type ChargingStation,
  addConfigurationKey,
  getConfigurationKey,
  resetConnectorStatus,
} from '../../../charging-station';
import { OCPPError } from '../../../exception';
import {
  type ChangeAvailabilityResponse,
  type ChangeConfigurationResponse,
  type ClearChargingProfileResponse,
  ErrorType,
  type GenericResponse,
  type GetConfigurationResponse,
  type GetDiagnosticsResponse,
  type JsonObject,
  type JsonType,
  OCPP16AuthorizationStatus,
  type OCPP16AuthorizeRequest,
  type OCPP16AuthorizeResponse,
  type OCPP16BootNotificationResponse,
  OCPP16ChargePointStatus,
  type OCPP16DataTransferResponse,
  type OCPP16DiagnosticsStatusNotificationResponse,
  type OCPP16FirmwareStatusNotificationResponse,
  type OCPP16GetCompositeScheduleResponse,
  type OCPP16HeartbeatResponse,
  OCPP16IncomingRequestCommand,
  type OCPP16MeterValuesRequest,
  type OCPP16MeterValuesResponse,
  OCPP16RequestCommand,
  type OCPP16ReserveNowResponse,
  OCPP16StandardParametersKey,
  type OCPP16StartTransactionRequest,
  type OCPP16StartTransactionResponse,
  type OCPP16StatusNotificationResponse,
  type OCPP16StopTransactionRequest,
  type OCPP16StopTransactionResponse,
  type OCPP16TriggerMessageResponse,
  type OCPP16UpdateFirmwareResponse,
  OCPPVersion,
  RegistrationStatusEnumType,
  ReservationTerminationReason,
  type ResponseHandler,
  type SetChargingProfileResponse,
  type UnlockConnectorResponse,
} from '../../../types';
import {
  Constants,
  buildUpdatedMessage,
  convertToInt,
  isNullOrUndefined,
  logger,
} from '../../../utils';
import { OCPPResponseService } from '../OCPPResponseService';

const moduleName = 'OCPP16ResponseService';

export class OCPP16ResponseService extends OCPPResponseService {
  public jsonIncomingRequestResponseSchemas: Map<
    OCPP16IncomingRequestCommand,
    JSONSchemaType<JsonObject>
  >;

  private responseHandlers: Map<OCPP16RequestCommand, ResponseHandler>;
  private jsonSchemas: Map<OCPP16RequestCommand, JSONSchemaType<JsonObject>>;

  public constructor() {
    // if (new.target?.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    // }
    super(OCPPVersion.VERSION_16);
    this.responseHandlers = new Map<OCPP16RequestCommand, ResponseHandler>([
      [
        OCPP16RequestCommand.BOOT_NOTIFICATION,
        this.handleResponseBootNotification.bind(this) as ResponseHandler,
      ],
      [OCPP16RequestCommand.HEARTBEAT, this.emptyResponseHandler.bind(this) as ResponseHandler],
      [OCPP16RequestCommand.AUTHORIZE, this.handleResponseAuthorize.bind(this) as ResponseHandler],
      [
        OCPP16RequestCommand.START_TRANSACTION,
        this.handleResponseStartTransaction.bind(this) as ResponseHandler,
      ],
      [
        OCPP16RequestCommand.STOP_TRANSACTION,
        this.handleResponseStopTransaction.bind(this) as ResponseHandler,
      ],
      [
        OCPP16RequestCommand.STATUS_NOTIFICATION,
        this.emptyResponseHandler.bind(this) as ResponseHandler,
      ],
      [OCPP16RequestCommand.METER_VALUES, this.emptyResponseHandler.bind(this) as ResponseHandler],
      [
        OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        this.emptyResponseHandler.bind(this) as ResponseHandler,
      ],
      [OCPP16RequestCommand.DATA_TRANSFER, this.emptyResponseHandler.bind(this) as ResponseHandler],
      [
        OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
        this.emptyResponseHandler.bind(this) as ResponseHandler,
      ],
    ]);
    this.jsonSchemas = new Map<OCPP16RequestCommand, JSONSchemaType<JsonObject>>([
      [
        OCPP16RequestCommand.BOOT_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16BootNotificationResponse>(
          'assets/json-schemas/ocpp/1.6/BootNotificationResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16RequestCommand.HEARTBEAT,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16HeartbeatResponse>(
          'assets/json-schemas/ocpp/1.6/HeartbeatResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16RequestCommand.AUTHORIZE,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16AuthorizeResponse>(
          'assets/json-schemas/ocpp/1.6/AuthorizeResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16RequestCommand.START_TRANSACTION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StartTransactionResponse>(
          'assets/json-schemas/ocpp/1.6/StartTransactionResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16RequestCommand.STOP_TRANSACTION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StopTransactionResponse>(
          'assets/json-schemas/ocpp/1.6/StopTransactionResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16RequestCommand.STATUS_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StatusNotificationResponse>(
          'assets/json-schemas/ocpp/1.6/StatusNotificationResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16RequestCommand.METER_VALUES,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16MeterValuesResponse>(
          'assets/json-schemas/ocpp/1.6/MeterValuesResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DiagnosticsStatusNotificationResponse>(
          'assets/json-schemas/ocpp/1.6/DiagnosticsStatusNotificationResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16RequestCommand.DATA_TRANSFER,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DataTransferResponse>(
          'assets/json-schemas/ocpp/1.6/DataTransferResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16FirmwareStatusNotificationResponse>(
          'assets/json-schemas/ocpp/1.6/FirmwareStatusNotificationResponse.json',
          moduleName,
          'constructor',
        ),
      ],
    ]);
    this.jsonIncomingRequestResponseSchemas = new Map([
      [
        OCPP16IncomingRequestCommand.RESET,
        OCPP16ServiceUtils.parseJsonSchemaFile<GenericResponse>(
          'assets/json-schemas/ocpp/1.6/ResetResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CACHE,
        OCPP16ServiceUtils.parseJsonSchemaFile<GenericResponse>(
          'assets/json-schemas/ocpp/1.6/ClearCacheResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY,
        OCPP16ServiceUtils.parseJsonSchemaFile<ChangeAvailabilityResponse>(
          'assets/json-schemas/ocpp/1.6/ChangeAvailabilityResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR,
        OCPP16ServiceUtils.parseJsonSchemaFile<UnlockConnectorResponse>(
          'assets/json-schemas/ocpp/1.6/UnlockConnectorResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.GET_CONFIGURATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<GetConfigurationResponse>(
          'assets/json-schemas/ocpp/1.6/GetConfigurationResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<ChangeConfigurationResponse>(
          'assets/json-schemas/ocpp/1.6/ChangeConfigurationResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.GET_COMPOSITE_SCHEDULE,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16GetCompositeScheduleResponse>(
          'assets/json-schemas/ocpp/1.6/GetCompositeScheduleResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE,
        OCPP16ServiceUtils.parseJsonSchemaFile<SetChargingProfileResponse>(
          'assets/json-schemas/ocpp/1.6/SetChargingProfileResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE,
        OCPP16ServiceUtils.parseJsonSchemaFile<ClearChargingProfileResponse>(
          'assets/json-schemas/ocpp/1.6/ClearChargingProfileResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        OCPP16ServiceUtils.parseJsonSchemaFile<GenericResponse>(
          'assets/json-schemas/ocpp/1.6/RemoteStartTransactionResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
        OCPP16ServiceUtils.parseJsonSchemaFile<GenericResponse>(
          'assets/json-schemas/ocpp/1.6/RemoteStopTransactionResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
        OCPP16ServiceUtils.parseJsonSchemaFile<GetDiagnosticsResponse>(
          'assets/json-schemas/ocpp/1.6/GetDiagnosticsResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16TriggerMessageResponse>(
          'assets/json-schemas/ocpp/1.6/TriggerMessageResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.DATA_TRANSFER,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DataTransferResponse>(
          'assets/json-schemas/ocpp/1.6/DataTransferResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16UpdateFirmwareResponse>(
          'assets/json-schemas/ocpp/1.6/UpdateFirmwareResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.RESERVE_NOW,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16ReserveNowResponse>(
          'assets/json-schemas/ocpp/1.6/ReserveNowResponse.json',
          moduleName,
          'constructor',
        ),
      ],
      [
        OCPP16IncomingRequestCommand.CANCEL_RESERVATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<GenericResponse>(
          'assets/json-schemas/ocpp/1.6/CancelReservationResponse.json',
          moduleName,
          'constructor',
        ),
      ],
    ]);
    this.validatePayload = this.validatePayload.bind(this) as (
      chargingStation: ChargingStation,
      commandName: OCPP16RequestCommand,
      payload: JsonType,
    ) => boolean;
  }

  public async responseHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    payload: ResType,
    requestPayload: ReqType,
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
          await this.responseHandlers.get(commandName)!(chargingStation, payload, requestPayload);
        } catch (error) {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.responseHandler: Handle response error:`,
            error,
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
            2,
          )}`,
          commandName,
          payload,
        );
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle response PDU ${JSON.stringify(
          payload,
          null,
          2,
        )} while the charging station is not registered on the central server.`,
        commandName,
        payload,
      );
    }
  }

  private validatePayload(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    payload: JsonType,
  ): boolean {
    if (this.jsonSchemas.has(commandName) === true) {
      return this.validateResponsePayload(
        chargingStation,
        commandName,
        this.jsonSchemas.get(commandName)!,
        payload,
      );
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema found for command '${commandName}' PDU validation`,
    );
    return false;
  }

  private handleResponseBootNotification(
    chargingStation: ChargingStation,
    payload: OCPP16BootNotificationResponse,
  ): void {
    if (payload.status === RegistrationStatusEnumType.ACCEPTED) {
      addConfigurationKey(
        chargingStation,
        OCPP16StandardParametersKey.HeartbeatInterval,
        payload.interval.toString(),
        {},
        { overwrite: true, save: true },
      );
      addConfigurationKey(
        chargingStation,
        OCPP16StandardParametersKey.HeartBeatInterval,
        payload.interval.toString(),
        { visible: false },
        { overwrite: true, save: true },
      );
      OCPP16ServiceUtils.startHeartbeatInterval(chargingStation, payload.interval);
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
        `${chargingStation.logPrefix()} Charging station boot notification response received: %j with undefined registration status`,
        payload,
      );
    }
  }

  private handleResponseAuthorize(
    chargingStation: ChargingStation,
    payload: OCPP16AuthorizeResponse,
    requestPayload: OCPP16AuthorizeRequest,
  ): void {
    let authorizeConnectorId: number | undefined;
    if (chargingStation.hasEvses) {
      for (const [evseId, evseStatus] of chargingStation.evses) {
        if (evseId > 0) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            if (connectorStatus?.authorizeIdTag === requestPayload.idTag) {
              authorizeConnectorId = connectorId;
              break;
            }
          }
        }
      }
    } else {
      for (const connectorId of chargingStation.connectors.keys()) {
        if (
          connectorId > 0 &&
          chargingStation.getConnectorStatus(connectorId)?.authorizeIdTag === requestPayload.idTag
        ) {
          authorizeConnectorId = connectorId;
          break;
        }
      }
    }
    const authorizeConnectorIdDefined = !isNullOrUndefined(authorizeConnectorId);
    if (payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
      if (authorizeConnectorIdDefined) {
        // chargingStation.getConnectorStatus(authorizeConnectorId!)!.authorizeIdTag =
        //   requestPayload.idTag;
        chargingStation.getConnectorStatus(authorizeConnectorId!)!.idTagAuthorized = true;
      }
      logger.debug(
        `${chargingStation.logPrefix()} idTag '${requestPayload.idTag}' accepted${
          authorizeConnectorIdDefined ? ` on connector id ${authorizeConnectorId}` : ''
        }`,
      );
    } else {
      if (authorizeConnectorIdDefined) {
        chargingStation.getConnectorStatus(authorizeConnectorId!)!.idTagAuthorized = false;
        delete chargingStation.getConnectorStatus(authorizeConnectorId!)?.authorizeIdTag;
      }
      logger.debug(
        `${chargingStation.logPrefix()} idTag '${requestPayload.idTag}' rejected with status '${
          payload.idTagInfo.status
        }'${authorizeConnectorIdDefined ? ` on connector id ${authorizeConnectorId}` : ''}`,
      );
    }
  }

  private async handleResponseStartTransaction(
    chargingStation: ChargingStation,
    payload: OCPP16StartTransactionResponse,
    requestPayload: OCPP16StartTransactionRequest,
  ): Promise<void> {
    const transactionConnectorId = requestPayload.connectorId;
    if (
      transactionConnectorId === 0 ||
      chargingStation.hasConnector(transactionConnectorId) === false
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction on a non existing connector id ${transactionConnectorId.toString()}`,
      );
      return;
    }
    if (
      chargingStation.getConnectorStatus(transactionConnectorId)?.transactionRemoteStarted ===
        true &&
      chargingStation.getAuthorizeRemoteTxRequests() === true &&
      chargingStation.getLocalAuthListEnabled() === true &&
      chargingStation.hasIdTags() === true &&
      chargingStation.getConnectorStatus(transactionConnectorId)?.idTagLocalAuthorized === false
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction with a not local authorized idTag ${chargingStation.getConnectorStatus(
          transactionConnectorId,
        )?.localAuthorizeIdTag} on connector id ${transactionConnectorId.toString()}`,
      );
      await this.resetConnectorOnStartTransactionError(chargingStation, transactionConnectorId);
      return;
    }
    if (
      chargingStation.getConnectorStatus(transactionConnectorId)?.transactionRemoteStarted ===
        true &&
      chargingStation.getAuthorizeRemoteTxRequests() === true &&
      chargingStation.getRemoteAuthorization() === true &&
      chargingStation.getConnectorStatus(transactionConnectorId)?.idTagLocalAuthorized === false &&
      chargingStation.getConnectorStatus(transactionConnectorId)?.idTagAuthorized === false
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction with a not authorized idTag ${chargingStation.getConnectorStatus(
          transactionConnectorId,
        )?.authorizeIdTag} on connector id ${transactionConnectorId.toString()}`,
      );
      await this.resetConnectorOnStartTransactionError(chargingStation, transactionConnectorId);
      return;
    }
    if (
      chargingStation.getConnectorStatus(transactionConnectorId)?.idTagAuthorized &&
      chargingStation.getConnectorStatus(transactionConnectorId)?.authorizeIdTag !==
        requestPayload.idTag
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction with an idTag ${
          requestPayload.idTag
        } different from the authorize request one ${chargingStation.getConnectorStatus(
          transactionConnectorId,
        )?.authorizeIdTag} on connector id ${transactionConnectorId.toString()}`,
      );
      await this.resetConnectorOnStartTransactionError(chargingStation, transactionConnectorId);
      return;
    }
    if (
      chargingStation.getConnectorStatus(transactionConnectorId)?.idTagLocalAuthorized &&
      chargingStation.getConnectorStatus(transactionConnectorId)?.localAuthorizeIdTag !==
        requestPayload.idTag
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction with an idTag ${
          requestPayload.idTag
        } different from the local authorized one ${chargingStation.getConnectorStatus(
          transactionConnectorId,
        )?.localAuthorizeIdTag} on connector id ${transactionConnectorId.toString()}`,
      );
      await this.resetConnectorOnStartTransactionError(chargingStation, transactionConnectorId);
      return;
    }
    if (chargingStation.getConnectorStatus(transactionConnectorId)?.transactionStarted === true) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction on an already used connector id ${transactionConnectorId.toString()}:`,
        chargingStation.getConnectorStatus(transactionConnectorId),
      );
      return;
    }
    if (chargingStation.hasEvses) {
      for (const [evseId, evseStatus] of chargingStation.evses) {
        if (evseStatus.connectors.size > 1) {
          for (const [connectorId, connectorStatus] of evseStatus.connectors) {
            if (
              transactionConnectorId !== connectorId &&
              connectorStatus?.transactionStarted === true
            ) {
              logger.error(
                `${chargingStation.logPrefix()} Trying to start a transaction on an already used evse id ${evseId.toString()}:`,
                evseStatus,
              );
              await this.resetConnectorOnStartTransactionError(
                chargingStation,
                transactionConnectorId,
              );
              return;
            }
          }
        }
      }
    }
    if (
      chargingStation.getConnectorStatus(transactionConnectorId)?.status !==
        OCPP16ChargePointStatus.Available &&
      chargingStation.getConnectorStatus(transactionConnectorId)?.status !==
        OCPP16ChargePointStatus.Preparing
    ) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to start a transaction on connector id ${transactionConnectorId.toString()} with status ${chargingStation.getConnectorStatus(
          transactionConnectorId,
        )?.status}`,
      );
      return;
    }
    if (!Number.isSafeInteger(payload.transactionId)) {
      logger.warn(
        `${chargingStation.logPrefix()} Trying to start a transaction on connector id ${transactionConnectorId.toString()} with a non integer transaction id ${
          payload.transactionId
        }, converting to integer`,
      );
      payload.transactionId = convertToInt(payload.transactionId);
    }

    if (payload.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
      chargingStation.getConnectorStatus(transactionConnectorId)!.transactionStarted = true;
      chargingStation.getConnectorStatus(transactionConnectorId)!.transactionStart =
        requestPayload.timestamp;
      chargingStation.getConnectorStatus(transactionConnectorId)!.transactionId =
        payload.transactionId;
      chargingStation.getConnectorStatus(transactionConnectorId)!.transactionIdTag =
        requestPayload.idTag;
      chargingStation.getConnectorStatus(
        transactionConnectorId,
      )!.transactionEnergyActiveImportRegisterValue = 0;
      chargingStation.getConnectorStatus(transactionConnectorId)!.transactionBeginMeterValue =
        OCPP16ServiceUtils.buildTransactionBeginMeterValue(
          chargingStation,
          transactionConnectorId,
          requestPayload.meterStart,
        );
      const reservedOnConnectorZero =
        chargingStation.getConnectorStatus(0)?.status === OCPP16ChargePointStatus.Reserved;
      if (
        chargingStation.getConnectorStatus(transactionConnectorId)?.status ===
          OCPP16ChargePointStatus.Reserved ||
        reservedOnConnectorZero
      ) {
        await chargingStation.removeReservation(
          chargingStation.getReservationBy(
            'connectorId',
            reservedOnConnectorZero ? 0 : transactionConnectorId,
          )!,
          ReservationTerminationReason.TRANSACTION_STARTED,
        );
      }
      chargingStation.getBeginEndMeterValues() &&
        (await chargingStation.ocppRequestService.requestHandler<
          OCPP16MeterValuesRequest,
          OCPP16MeterValuesResponse
        >(chargingStation, OCPP16RequestCommand.METER_VALUES, {
          connectorId: transactionConnectorId,
          transactionId: payload.transactionId,
          meterValue: [
            chargingStation.getConnectorStatus(transactionConnectorId)!.transactionBeginMeterValue,
          ],
        } as OCPP16MeterValuesRequest));
      await OCPP16ServiceUtils.sendAndSetConnectorStatus(
        chargingStation,
        transactionConnectorId,
        OCPP16ChargePointStatus.Charging,
      );
      logger.info(
        `${chargingStation.logPrefix()} Transaction with id ${payload.transactionId.toString()} STARTED on ${
          chargingStation.stationInfo.chargingStationId
        }#${transactionConnectorId.toString()} for idTag '${requestPayload.idTag}'`,
      );
      if (chargingStation.stationInfo.powerSharedByConnectors) {
        ++chargingStation.powerDivider;
      }
      const configuredMeterValueSampleInterval = getConfigurationKey(
        chargingStation,
        OCPP16StandardParametersKey.MeterValueSampleInterval,
      );
      chargingStation.startMeterValues(
        transactionConnectorId,
        configuredMeterValueSampleInterval
          ? secondsToMilliseconds(convertToInt(configuredMeterValueSampleInterval.value))
          : Constants.DEFAULT_METER_VALUES_INTERVAL,
      );
    } else {
      logger.warn(
        `${chargingStation.logPrefix()} Starting transaction with id ${payload.transactionId.toString()} REJECTED with status '${payload
          .idTagInfo?.status}', idTag '${requestPayload.idTag}'`,
      );
      await this.resetConnectorOnStartTransactionError(chargingStation, transactionConnectorId);
    }
  }

  private async resetConnectorOnStartTransactionError(
    chargingStation: ChargingStation,
    connectorId: number,
  ): Promise<void> {
    resetConnectorStatus(chargingStation.getConnectorStatus(connectorId)!);
    chargingStation.stopMeterValues(connectorId);
    parentPort?.postMessage(buildUpdatedMessage(chargingStation));
    if (
      chargingStation.getConnectorStatus(connectorId)?.status !== OCPP16ChargePointStatus.Available
    ) {
      await OCPP16ServiceUtils.sendAndSetConnectorStatus(
        chargingStation,
        connectorId,
        OCPP16ChargePointStatus.Available,
      );
    }
  }

  private async handleResponseStopTransaction(
    chargingStation: ChargingStation,
    payload: OCPP16StopTransactionResponse,
    requestPayload: OCPP16StopTransactionRequest,
  ): Promise<void> {
    const transactionConnectorId = chargingStation.getConnectorIdByTransactionId(
      requestPayload.transactionId,
    );
    if (isNullOrUndefined(transactionConnectorId)) {
      logger.error(
        `${chargingStation.logPrefix()} Trying to stop a non existing transaction with id ${requestPayload.transactionId.toString()}`,
      );
      return;
    }
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
            transactionConnectorId!,
            requestPayload.meterStop,
          ),
        ],
      }));
    if (
      chargingStation.isChargingStationAvailable() === false ||
      chargingStation.isConnectorAvailable(transactionConnectorId!) === false
    ) {
      await OCPP16ServiceUtils.sendAndSetConnectorStatus(
        chargingStation,
        transactionConnectorId!,
        OCPP16ChargePointStatus.Unavailable,
      );
    } else {
      await OCPP16ServiceUtils.sendAndSetConnectorStatus(
        chargingStation,
        transactionConnectorId!,
        OCPP16ChargePointStatus.Available,
      );
    }
    if (chargingStation.stationInfo.powerSharedByConnectors) {
      chargingStation.powerDivider--;
    }
    resetConnectorStatus(chargingStation.getConnectorStatus(transactionConnectorId!)!);
    chargingStation.stopMeterValues(transactionConnectorId!);
    parentPort?.postMessage(buildUpdatedMessage(chargingStation));
    const logMsg = `${chargingStation.logPrefix()} Transaction with id ${requestPayload.transactionId.toString()} STOPPED on ${
      chargingStation.stationInfo.chargingStationId
    }#${transactionConnectorId?.toString()} with status '${
      payload.idTagInfo?.status ?? 'undefined'
    }'`;
    if (
      isNullOrUndefined(payload.idTagInfo) ||
      payload.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED
    ) {
      logger.info(logMsg);
    } else {
      logger.warn(logMsg);
    }
  }
}
