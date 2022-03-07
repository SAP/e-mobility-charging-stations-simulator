// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import {
  AuthorizeRequest,
  OCPP16AuthorizeResponse,
  OCPP16StartTransactionResponse,
  OCPP16StopTransactionReason,
  OCPP16StopTransactionResponse,
  StartTransactionRequest,
  StopTransactionRequest,
} from '../../../types/ocpp/1.6/Transaction';
import {
  DiagnosticsStatusNotificationRequest,
  HeartbeatRequest,
  OCPP16BootNotificationRequest,
  OCPP16RequestCommand,
  StatusNotificationRequest,
} from '../../../types/ocpp/1.6/Requests';
import { MeterValuesRequest, OCPP16MeterValue } from '../../../types/ocpp/1.6/MeterValues';
import { ResponseType, SendParams } from '../../../types/ocpp/Requests';

import type ChargingStation from '../../ChargingStation';
import Constants from '../../../utils/Constants';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { JsonType } from '../../../types/JsonType';
import { OCPP16ChargePointErrorCode } from '../../../types/ocpp/1.6/ChargePointErrorCode';
import { OCPP16ChargePointStatus } from '../../../types/ocpp/1.6/ChargePointStatus';
import { OCPP16DiagnosticsStatus } from '../../../types/ocpp/1.6/DiagnosticsStatus';
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';
import OCPPError from '../../../exception/OCPPError';
import OCPPRequestService from '../OCPPRequestService';
import type OCPPResponseService from '../OCPPResponseService';
import Utils from '../../../utils/Utils';

const moduleName = 'OCPP16RequestService';

export default class OCPP16RequestService extends OCPPRequestService {
  public constructor(chargingStation: ChargingStation, ocppResponseService: OCPPResponseService) {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super(chargingStation, ocppResponseService);
  }

  public async sendMessageHandler(
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType,
    params?: SendParams
  ): Promise<ResponseType> {
    if (Object.values(OCPP16RequestCommand).includes(commandName)) {
      return this.sendMessage(
        Utils.generateUUID(),
        this.buildCommandPayload(commandName, commandParams),
        commandName,
        params
      );
    }
    throw new OCPPError(
      ErrorType.NOT_SUPPORTED,
      `${moduleName}.sendMessageHandler: Unsupported OCPP command ${commandName}`,
      commandName,
      { commandName }
    );
  }

  public async sendStatusNotification(
    connectorId: number,
    status: OCPP16ChargePointStatus,
    errorCode: OCPP16ChargePointErrorCode = OCPP16ChargePointErrorCode.NO_ERROR
  ): Promise<void> {
    const payload: StatusNotificationRequest = {
      connectorId,
      errorCode,
      status,
    };
    await this.sendMessage(Utils.generateUUID(), payload, OCPP16RequestCommand.STATUS_NOTIFICATION);
  }

  public async sendAuthorize(
    connectorId: number,
    idTag?: string
  ): Promise<OCPP16AuthorizeResponse> {
    const payload: AuthorizeRequest = {
      ...(!Utils.isUndefined(idTag) ? { idTag } : { idTag: Constants.DEFAULT_IDTAG }),
    };
    this.chargingStation.getConnectorStatus(connectorId).authorizeIdTag = idTag;
    return (await this.sendMessage(
      Utils.generateUUID(),
      payload,
      OCPP16RequestCommand.AUTHORIZE
    )) as OCPP16AuthorizeResponse;
  }

  public async sendStartTransaction(
    connectorId: number,
    idTag?: string
  ): Promise<OCPP16StartTransactionResponse> {
    const payload: StartTransactionRequest = {
      connectorId,
      ...(!Utils.isUndefined(idTag) ? { idTag } : { idTag: Constants.DEFAULT_IDTAG }),
      meterStart: this.chargingStation.getEnergyActiveImportRegisterByConnectorId(connectorId),
      timestamp: new Date().toISOString(),
    };
    return (await this.sendMessage(
      Utils.generateUUID(),
      payload,
      OCPP16RequestCommand.START_TRANSACTION
    )) as OCPP16StartTransactionResponse;
  }

  public async sendStopTransaction(
    transactionId: number,
    meterStop: number,
    idTag?: string,
    reason: OCPP16StopTransactionReason = OCPP16StopTransactionReason.NONE
  ): Promise<OCPP16StopTransactionResponse> {
    let connectorId: number;
    for (const id of this.chargingStation.connectors.keys()) {
      if (id > 0 && this.chargingStation.getConnectorStatus(id)?.transactionId === transactionId) {
        connectorId = id;
        break;
      }
    }
    const transactionEndMeterValue = OCPP16ServiceUtils.buildTransactionEndMeterValue(
      this.chargingStation,
      connectorId,
      meterStop
    );
    // FIXME: should be a callback, each OCPP commands implementation must do only one job
    this.chargingStation.getBeginEndMeterValues() &&
      this.chargingStation.getOcppStrictCompliance() &&
      !this.chargingStation.getOutOfOrderEndMeterValues() &&
      (await this.sendTransactionEndMeterValues(
        connectorId,
        transactionId,
        transactionEndMeterValue
      ));
    const payload: StopTransactionRequest = {
      transactionId,
      ...(!Utils.isUndefined(idTag) && { idTag }),
      meterStop,
      timestamp: new Date().toISOString(),
      ...(reason && { reason }),
      ...(this.chargingStation.getTransactionDataMeterValues() && {
        transactionData: OCPP16ServiceUtils.buildTransactionDataMeterValues(
          this.chargingStation.getConnectorStatus(connectorId).transactionBeginMeterValue,
          transactionEndMeterValue
        ),
      }),
    };
    return (await this.sendMessage(
      Utils.generateUUID(),
      payload,
      OCPP16RequestCommand.STOP_TRANSACTION
    )) as OCPP16StartTransactionResponse;
  }

  public async sendMeterValues(
    connectorId: number,
    transactionId: number,
    interval: number
  ): Promise<void> {
    const meterValue: OCPP16MeterValue = OCPP16ServiceUtils.buildMeterValue(
      this.chargingStation,
      connectorId,
      transactionId,
      interval
    );
    const payload: MeterValuesRequest = {
      connectorId,
      transactionId,
      meterValue: [meterValue],
    };
    await this.sendMessage(Utils.generateUUID(), payload, OCPP16RequestCommand.METER_VALUES);
  }

  public async sendTransactionBeginMeterValues(
    connectorId: number,
    transactionId: number,
    beginMeterValue: OCPP16MeterValue
  ): Promise<void> {
    const payload: MeterValuesRequest = {
      connectorId,
      transactionId,
      meterValue: [beginMeterValue],
    };
    await this.sendMessage(Utils.generateUUID(), payload, OCPP16RequestCommand.METER_VALUES);
  }

  public async sendTransactionEndMeterValues(
    connectorId: number,
    transactionId: number,
    endMeterValue: OCPP16MeterValue
  ): Promise<void> {
    const payload: MeterValuesRequest = {
      connectorId,
      transactionId,
      meterValue: [endMeterValue],
    };
    await this.sendMessage(Utils.generateUUID(), payload, OCPP16RequestCommand.METER_VALUES);
  }

  public async sendDiagnosticsStatusNotification(
    diagnosticsStatus: OCPP16DiagnosticsStatus
  ): Promise<void> {
    const payload: DiagnosticsStatusNotificationRequest = {
      status: diagnosticsStatus,
    };
    await this.sendMessage(
      Utils.generateUUID(),
      payload,
      OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION
    );
  }

  private buildCommandPayload(
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType
  ): JsonType {
    switch (commandName) {
      case OCPP16RequestCommand.AUTHORIZE:
        return {
          ...(!Utils.isUndefined(commandParams?.idTag)
            ? { idTag: commandParams.idTag }
            : { idTag: Constants.DEFAULT_IDTAG }),
        } as AuthorizeRequest;
      case OCPP16RequestCommand.BOOT_NOTIFICATION:
        return {
          chargePointModel: commandParams?.chargePointModel,
          chargePointVendor: commandParams?.chargePointVendor,
          ...(!Utils.isUndefined(commandParams?.chargeBoxSerialNumber) && {
            chargeBoxSerialNumber: commandParams.chargeBoxSerialNumber,
          }),
          ...(!Utils.isUndefined(commandParams?.chargePointSerialNumber) && {
            chargePointSerialNumber: commandParams.chargePointSerialNumber,
          }),
          ...(!Utils.isUndefined(commandParams?.firmwareVersion) && {
            firmwareVersion: commandParams.firmwareVersion,
          }),
          ...(!Utils.isUndefined(commandParams?.iccid) && { iccid: commandParams.iccid }),
          ...(!Utils.isUndefined(commandParams?.imsi) && { imsi: commandParams.imsi }),
          ...(!Utils.isUndefined(commandParams?.meterSerialNumber) && {
            meterSerialNumber: commandParams.meterSerialNumber,
          }),
          ...(!Utils.isUndefined(commandParams?.meterType) && {
            meterType: commandParams.meterType,
          }),
        } as OCPP16BootNotificationRequest;
      case OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION:
        return {
          status: commandParams?.diagnosticsStatus,
        } as DiagnosticsStatusNotificationRequest;
      case OCPP16RequestCommand.HEARTBEAT:
        return {} as HeartbeatRequest;
      case OCPP16RequestCommand.METER_VALUES:
        return {
          connectorId: commandParams?.connectorId,
          transactionId: commandParams?.transactionId,
          meterValue: Array.isArray(commandParams?.meterValues)
            ? commandParams?.meterValues
            : [commandParams?.meterValue],
        } as MeterValuesRequest;
      case OCPP16RequestCommand.STATUS_NOTIFICATION:
        return {
          connectorId: commandParams?.connectorId,
          errorCode: commandParams?.errorCode,
          status: commandParams?.status,
        } as StatusNotificationRequest;
      case OCPP16RequestCommand.START_TRANSACTION:
        return {
          connectorId: commandParams?.connectorId,
          ...(!Utils.isUndefined(commandParams?.idTag)
            ? { idTag: commandParams?.idTag }
            : { idTag: Constants.DEFAULT_IDTAG }),
          meterStart: this.chargingStation.getEnergyActiveImportRegisterByConnectorId(
            commandParams?.connectorId as number
          ),
          timestamp: new Date().toISOString(),
        } as StartTransactionRequest;
      case OCPP16RequestCommand.STOP_TRANSACTION:
        return {
          transactionId: commandParams?.transactionId,
          ...(!Utils.isUndefined(commandParams?.idTag) && { idTag: commandParams.idTag }),
          meterStop: commandParams?.meterStop,
          timestamp: new Date().toISOString(),
          ...(commandParams?.reason && { reason: commandParams.reason }),
          ...(this.chargingStation.getTransactionDataMeterValues() && {
            transactionData: OCPP16ServiceUtils.buildTransactionDataMeterValues(
              this.chargingStation.getConnectorStatus(commandParams?.connectorId as number)
                .transactionBeginMeterValue,
              OCPP16ServiceUtils.buildTransactionEndMeterValue(
                this.chargingStation,
                commandParams?.connectorId as number,
                commandParams?.meterStop as number
              )
            ),
          }),
        } as StopTransactionRequest;
      default:
        throw new OCPPError(
          ErrorType.NOT_SUPPORTED,
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `${moduleName}.buildCommandPayload: Unsupported OCPP command: ${commandName}`,
          commandName,
          { commandName }
        );
    }
  }
}
