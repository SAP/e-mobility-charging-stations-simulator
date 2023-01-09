// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { JSONSchemaType } from 'ajv';

import OCPPError from '../../../exception/OCPPError';
import type { JsonObject, JsonType } from '../../../types/JsonType';
import type { OCPP16MeterValuesRequest } from '../../../types/ocpp/1.6/MeterValues';
import {
  type OCPP16BootNotificationRequest,
  type OCPP16DataTransferRequest,
  type OCPP16DiagnosticsStatusNotificationRequest,
  type OCPP16HeartbeatRequest,
  OCPP16RequestCommand,
  type OCPP16StatusNotificationRequest,
  type OCPP16UpdateFirmwareRequest,
} from '../../../types/ocpp/1.6/Requests';
import type {
  OCPP16AuthorizeRequest,
  OCPP16StartTransactionRequest,
  OCPP16StopTransactionRequest,
} from '../../../types/ocpp/1.6/Transaction';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { OCPPVersion } from '../../../types/ocpp/OCPPVersion';
import type { RequestParams } from '../../../types/ocpp/Requests';
import Constants from '../../../utils/Constants';
import Utils from '../../../utils/Utils';
import type ChargingStation from '../../ChargingStation';
import OCPPRequestService from '../OCPPRequestService';
import type OCPPResponseService from '../OCPPResponseService';
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';

const moduleName = 'OCPP16RequestService';

export default class OCPP16RequestService extends OCPPRequestService {
  protected jsonSchemas: Map<OCPP16RequestCommand, JSONSchemaType<JsonObject>>;

  public constructor(ocppResponseService: OCPPResponseService) {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super(OCPPVersion.VERSION_16, ocppResponseService);
    this.jsonSchemas = new Map<OCPP16RequestCommand, JSONSchemaType<JsonObject>>([
      [
        OCPP16RequestCommand.AUTHORIZE,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/1.6/Authorize.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP16AuthorizeRequest>,
      ],
      [
        OCPP16RequestCommand.BOOT_NOTIFICATION,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/1.6/BootNotification.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP16BootNotificationRequest>,
      ],
      [
        OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/1.6/DiagnosticsStatusNotification.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP16DiagnosticsStatusNotificationRequest>,
      ],
      [
        OCPP16RequestCommand.HEARTBEAT,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/1.6/Heartbeat.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP16HeartbeatRequest>,
      ],
      [
        OCPP16RequestCommand.METER_VALUES,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/1.6/MeterValues.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP16MeterValuesRequest>,
      ],
      [
        OCPP16RequestCommand.STATUS_NOTIFICATION,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/1.6/StatusNotification.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP16StatusNotificationRequest>,
      ],
      [
        OCPP16RequestCommand.START_TRANSACTION,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/1.6/StartTransaction.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP16StartTransactionRequest>,
      ],
      [
        OCPP16RequestCommand.STOP_TRANSACTION,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/1.6/StopTransaction.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP16StopTransactionRequest>,
      ],
      [
        OCPP16RequestCommand.DATA_TRANSFER,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/1.6/DataTransfer.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP16DataTransferRequest>,
      ],
      [
        OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
        JSON.parse(
          fs.readFileSync(
            path.resolve(
              path.dirname(fileURLToPath(import.meta.url)),
              '../../../assets/json-schemas/ocpp/1.6/FirmwareStatusNotification.json'
            ),
            'utf8'
          )
        ) as JSONSchemaType<OCPP16UpdateFirmwareRequest>,
      ],
    ]);
    this.buildRequestPayload.bind(this);
  }

  public async requestHandler<RequestType extends JsonType, ResponseType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType,
    params?: RequestParams
  ): Promise<ResponseType> {
    if (OCPP16ServiceUtils.isRequestCommandSupported(chargingStation, commandName) === true) {
      const requestPayload = this.buildRequestPayload<RequestType>(
        chargingStation,
        commandName,
        commandParams
      );
      return (await this.sendMessage(
        chargingStation,
        Utils.generateUUID(),
        requestPayload,
        commandName,
        params
      )) as unknown as ResponseType;
    }
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    throw new OCPPError(
      ErrorType.NOT_SUPPORTED,
      `Unsupported OCPP command '${commandName}'`,
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
    let energyActiveImportRegister: number;
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
      case OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION:
        return {
          status: commandParams?.status,
        } as unknown as Request;
      case OCPP16RequestCommand.HEARTBEAT:
        return {} as unknown as Request;
      case OCPP16RequestCommand.METER_VALUES:
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
          timestamp: new Date(),
        } as unknown as Request;
      case OCPP16RequestCommand.STOP_TRANSACTION:
        connectorId = chargingStation.getConnectorIdByTransactionId(
          commandParams?.transactionId as number
        );
        commandParams?.meterStop &&
          (energyActiveImportRegister =
            chargingStation.getEnergyActiveImportRegisterByTransactionId(
              commandParams?.transactionId as number,
              true
            ));
        return {
          transactionId: commandParams?.transactionId,
          idTag:
            commandParams?.idTag ??
            chargingStation.getTransactionIdTag(commandParams?.transactionId as number),
          meterStop: commandParams?.meterStop ?? energyActiveImportRegister,
          timestamp: new Date(),
          reason: commandParams?.reason,
          ...(chargingStation.getTransactionDataMeterValues() && {
            transactionData: OCPP16ServiceUtils.buildTransactionDataMeterValues(
              chargingStation.getConnectorStatus(connectorId).transactionBeginMeterValue,
              OCPP16ServiceUtils.buildTransactionEndMeterValue(
                chargingStation,
                connectorId,
                (commandParams?.meterStop as number) ?? energyActiveImportRegister
              )
            ),
          }),
        } as unknown as Request;
      case OCPP16RequestCommand.DATA_TRANSFER:
        return commandParams as unknown as Request;
      default:
        // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
        throw new OCPPError(
          ErrorType.NOT_SUPPORTED,
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Unsupported OCPP command '${commandName}'`,
          commandName,
          commandParams
        );
    }
  }
}
