// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import { JsonObject, JsonType } from '../../../types/JsonType';

import type ChargingStation from '../../ChargingStation';
import Constants from '../../../utils/Constants';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { OCPP16RequestCommand } from '../../../types/ocpp/1.6/Requests';
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';
import OCPPError from '../../../exception/OCPPError';
import OCPPRequestService from '../OCPPRequestService';
import type OCPPResponseService from '../OCPPResponseService';
import { RequestParams } from '../../../types/ocpp/Requests';
import Utils from '../../../utils/Utils';

const moduleName = 'OCPP16RequestService';

export default class OCPP16RequestService extends OCPPRequestService {
  public constructor(chargingStation: ChargingStation, ocppResponseService: OCPPResponseService) {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super(chargingStation, ocppResponseService);
  }

  public async requestHandler<Request extends JsonType, Response extends JsonType>(
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType,
    params?: RequestParams
  ): Promise<Response> {
    if (Object.values(OCPP16RequestCommand).includes(commandName)) {
      return (await this.sendMessage(
        Utils.generateUUID(),
        this.buildRequestPayload<Request>(commandName, commandParams),
        commandName,
        params
      )) as unknown as Response;
    }
    throw new OCPPError(
      ErrorType.NOT_SUPPORTED,
      `${moduleName}.requestHandler: Unsupported OCPP command ${commandName}`,
      commandName,
      { commandName }
    );
  }

  private buildRequestPayload<Request extends JsonType>(
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType
  ): Request {
    let connectorId: number;
    commandParams = commandParams as JsonObject;
    switch (commandName) {
      case OCPP16RequestCommand.AUTHORIZE:
        return {
          ...(!Utils.isUndefined(commandParams?.idTag)
            ? { idTag: commandParams.idTag }
            : { idTag: Constants.DEFAULT_IDTAG }),
        } as unknown as Request;
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
        } as unknown as Request;
      case OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION:
        return {
          status: commandParams?.diagnosticsStatus,
        } as unknown as Request;
      case OCPP16RequestCommand.HEARTBEAT:
        return {} as unknown as Request;
      case OCPP16RequestCommand.METER_VALUES:
        return {
          connectorId: commandParams?.connectorId,
          transactionId: commandParams?.transactionId,
          meterValue: Array.isArray(commandParams?.meterValue)
            ? commandParams?.meterValue
            : [commandParams?.meterValue],
        } as unknown as Request;
      case OCPP16RequestCommand.STATUS_NOTIFICATION:
        return {
          connectorId: commandParams?.connectorId,
          status: commandParams?.status,
          errorCode: commandParams?.errorCode,
        } as unknown as Request;
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
        } as unknown as Request;
      case OCPP16RequestCommand.STOP_TRANSACTION:
        connectorId = this.chargingStation.getConnectorIdByTransactionId(
          commandParams?.transactionId as number
        );
        return {
          transactionId: commandParams?.transactionId,
          ...(!Utils.isUndefined(commandParams?.idTag) && { idTag: commandParams.idTag }),
          meterStop: commandParams?.meterStop,
          timestamp: new Date().toISOString(),
          ...(commandParams?.reason && { reason: commandParams.reason }),
          ...(this.chargingStation.getTransactionDataMeterValues() && {
            transactionData: OCPP16ServiceUtils.buildTransactionDataMeterValues(
              this.chargingStation.getConnectorStatus(connectorId).transactionBeginMeterValue,
              OCPP16ServiceUtils.buildTransactionEndMeterValue(
                this.chargingStation,
                connectorId,
                commandParams?.meterStop as number
              )
            ),
          }),
        } as unknown as Request;
      default:
        throw new OCPPError(
          ErrorType.NOT_SUPPORTED,
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `${moduleName}.buildRequestPayload: Unsupported OCPP command: ${commandName}`,
          commandName,
          { commandName }
        );
    }
  }
}
