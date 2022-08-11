// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import OCPPError from '../../../exception/OCPPError';
import { JsonObject, JsonType } from '../../../types/JsonType';
import { OCPP16RequestCommand } from '../../../types/ocpp/1.6/Requests';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { RequestParams } from '../../../types/ocpp/Requests';
import Constants from '../../../utils/Constants';
import Utils from '../../../utils/Utils';
import type ChargingStation from '../../ChargingStation';
import { ChargingStationUtils } from '../../ChargingStationUtils';
import OCPPRequestService from '../OCPPRequestService';
import type OCPPResponseService from '../OCPPResponseService';
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';

const moduleName = 'OCPP16RequestService';

export default class OCPP16RequestService extends OCPPRequestService {
  public constructor(ocppResponseService: OCPPResponseService) {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super(ocppResponseService);
  }

  public async requestHandler<Request extends JsonType, Response extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType,
    params?: RequestParams
  ): Promise<Response> {
    if (
      Object.values(OCPP16RequestCommand).includes(commandName) &&
      ChargingStationUtils.isCommandSupported(commandName, chargingStation)
    ) {
      return (await this.sendMessage(
        chargingStation,
        Utils.generateUUID(),
        this.buildRequestPayload<Request>(chargingStation, commandName, commandParams),
        commandName,
        params
      )) as unknown as Response;
    }
    throw new OCPPError(
      ErrorType.NOT_SUPPORTED,
      `${moduleName}.requestHandler: Unsupported OCPP command ${commandName}`,
      commandName,
      commandParams
    );
  }

  private buildRequestPayload<Request extends JsonType>(
    chargingStation: ChargingStation,
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
        // Sanity check
        if (!Array.isArray(commandParams?.meterValue)) {
          throw new OCPPError(
            ErrorType.TYPERAINT_VIOLATION,
            `${moduleName}.buildRequestPayload ${commandName}: Invalid array type for meterValue payload field`,
            commandName,
            commandParams
          );
        }
        return {
          connectorId: commandParams?.connectorId,
          transactionId: commandParams?.transactionId,
          meterValue: commandParams?.meterValue,
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
          meterStart: chargingStation.getEnergyActiveImportRegisterByConnectorId(
            commandParams?.connectorId as number
          ),
          timestamp: new Date().toISOString(),
        } as unknown as Request;
      case OCPP16RequestCommand.STOP_TRANSACTION:
        connectorId = chargingStation.getConnectorIdByTransactionId(
          commandParams?.transactionId as number
        );
        return {
          transactionId: commandParams?.transactionId,
          ...(!Utils.isUndefined(commandParams?.idTag) && { idTag: commandParams.idTag }),
          meterStop: commandParams?.meterStop,
          timestamp: new Date().toISOString(),
          ...(commandParams?.reason && { reason: commandParams.reason }),
          ...(chargingStation.getTransactionDataMeterValues() && {
            transactionData: OCPP16ServiceUtils.buildTransactionDataMeterValues(
              chargingStation.getConnectorStatus(connectorId).transactionBeginMeterValue,
              OCPP16ServiceUtils.buildTransactionEndMeterValue(
                chargingStation,
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
          commandParams
        );
    }
  }
}
