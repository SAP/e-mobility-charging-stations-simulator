// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import OCPPError from '../../../exception/OCPPError';
import { JsonType } from '../../../types/JsonType';
import { OCPP16ChargePointErrorCode } from '../../../types/ocpp/1.6/ChargePointErrorCode';
import { OCPP16ChargePointStatus } from '../../../types/ocpp/1.6/ChargePointStatus';
import { OCPP16StandardParametersKey } from '../../../types/ocpp/1.6/Configuration';
import {
  OCPP16MeterValuesRequest,
  OCPP16MeterValuesResponse,
} from '../../../types/ocpp/1.6/MeterValues';
import {
  OCPP16BootNotificationRequest,
  OCPP16RequestCommand,
  OCPP16StatusNotificationRequest,
} from '../../../types/ocpp/1.6/Requests';
import {
  OCPP16BootNotificationResponse,
  OCPP16RegistrationStatus,
  OCPP16StatusNotificationResponse,
} from '../../../types/ocpp/1.6/Responses';
import {
  OCPP16AuthorizationStatus,
  OCPP16AuthorizeRequest,
  OCPP16AuthorizeResponse,
  OCPP16StartTransactionRequest,
  OCPP16StartTransactionResponse,
  OCPP16StopTransactionRequest,
  OCPP16StopTransactionResponse,
} from '../../../types/ocpp/1.6/Transaction';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { ResponseHandler } from '../../../types/ocpp/Responses';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';
import type ChargingStation from '../../ChargingStation';
import { ChargingStationConfigurationUtils } from '../../ChargingStationConfigurationUtils';
import { ChargingStationUtils } from '../../ChargingStationUtils';
import OCPPResponseService from '../OCPPResponseService';
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';

const moduleName = 'OCPP16ResponseService';

export default class OCPP16ResponseService extends OCPPResponseService {
  private responseHandlers: Map<OCPP16RequestCommand, ResponseHandler>;

  public constructor() {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super();
    this.responseHandlers = new Map<OCPP16RequestCommand, ResponseHandler>([
      [OCPP16RequestCommand.BOOT_NOTIFICATION, this.handleResponseBootNotification.bind(this)],
      [OCPP16RequestCommand.HEARTBEAT, this.handleResponseHeartbeat.bind(this)],
      [OCPP16RequestCommand.AUTHORIZE, this.handleResponseAuthorize.bind(this)],
      [OCPP16RequestCommand.START_TRANSACTION, this.handleResponseStartTransaction.bind(this)],
      [OCPP16RequestCommand.STOP_TRANSACTION, this.handleResponseStopTransaction.bind(this)],
      [OCPP16RequestCommand.STATUS_NOTIFICATION, this.handleResponseStatusNotification.bind(this)],
      [OCPP16RequestCommand.METER_VALUES, this.handleResponseMeterValues.bind(this)],
    ]);
  }

  public async responseHandler(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    payload: JsonType,
    requestPayload: JsonType
  ): Promise<void> {
    if (chargingStation.isRegistered() || commandName === OCPP16RequestCommand.BOOT_NOTIFICATION) {
      if (
        this.responseHandlers.has(commandName) &&
        ChargingStationUtils.isCommandSupported(commandName, chargingStation)
      ) {
        try {
          await this.responseHandlers.get(commandName)(chargingStation, payload, requestPayload);
        } catch (error) {
          logger.error(chargingStation.logPrefix() + ' Handle request response error: %j', error);
          throw error;
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle request response payload ${JSON.stringify(
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
        `${commandName} cannot be issued to handle request response payload ${JSON.stringify(
          payload,
          null,
          2
        )} while the charging station is not registered on the central server. `,
        commandName,
        payload
      );
    }
  }

  private handleResponseBootNotification(
    chargingStation: ChargingStation,
    payload: OCPP16BootNotificationResponse
  ): void {
    if (payload.status === OCPP16RegistrationStatus.ACCEPTED) {
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
    if (Object.values(OCPP16RegistrationStatus).includes(payload.status)) {
      const logMsg = `${chargingStation.logPrefix()} Charging station in '${
        payload.status
      }' state on the central server`;
      payload.status === OCPP16RegistrationStatus.REJECTED
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

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private handleResponseHeartbeat(): void {}

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
    if (payload.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
      chargingStation.getConnectorStatus(authorizeConnectorId).idTagAuthorized = true;
      logger.debug(
        `${chargingStation.logPrefix()} IdTag ${
          requestPayload.idTag
        } authorized on connector ${authorizeConnectorId}`
      );
    } else {
      chargingStation.getConnectorStatus(authorizeConnectorId).idTagAuthorized = false;
      delete chargingStation.getConnectorStatus(authorizeConnectorId).authorizeIdTag;
      logger.debug(
        `${chargingStation.logPrefix()} IdTag ${requestPayload.idTag} refused with status '${
          payload.idTagInfo.status
        }' on connector ${authorizeConnectorId}`
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
      chargingStation.getConnectorStatus(connectorId).transactionRemoteStarted &&
      chargingStation.getAuthorizeRemoteTxRequests() &&
      chargingStation.getLocalAuthListEnabled() &&
      chargingStation.hasAuthorizedTags() &&
      !chargingStation.getConnectorStatus(connectorId).idTagLocalAuthorized
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
      chargingStation.getConnectorStatus(connectorId).transactionRemoteStarted &&
      chargingStation.getAuthorizeRemoteTxRequests() &&
      chargingStation.getMayAuthorizeAtRemoteStart() &&
      !chargingStation.getConnectorStatus(connectorId).idTagLocalAuthorized &&
      !chargingStation.getConnectorStatus(connectorId).idTagAuthorized
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
    if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted) {
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
    if (!Number.isInteger(payload.transactionId)) {
      logger.warn(
        `${chargingStation.logPrefix()} Trying to start a transaction on connector ${connectorId.toString()} with a non integer transaction Id ${
          payload.transactionId
        }, converting to integer`
      );
      payload.transactionId = Utils.convertToInt(payload.transactionId);
    }

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
          ' for idTag ' +
          requestPayload.idTag
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
          : 60000
      );
    } else {
      logger.warn(
        chargingStation.logPrefix() +
          ' Starting transaction id ' +
          payload.transactionId.toString() +
          " REJECTED with status '" +
          payload?.idTagInfo?.status +
          "', idTag " +
          requestPayload.idTag
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
      chargingStation.getBeginEndMeterValues() &&
        !chargingStation.getOcppStrictCompliance() &&
        chargingStation.getOutOfOrderEndMeterValues() &&
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
        !chargingStation.isChargingStationAvailable() ||
        !chargingStation.isConnectorAvailable(transactionConnectorId)
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
      logger.info(
        chargingStation.logPrefix() +
          ' Transaction ' +
          requestPayload.transactionId.toString() +
          ' STOPPED on ' +
          chargingStation.stationInfo.chargingStationId +
          '#' +
          transactionConnectorId.toString()
      );
      chargingStation.resetConnectorStatus(transactionConnectorId);
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

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private handleResponseStatusNotification(): void {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private handleResponseMeterValues(): void {}
}
