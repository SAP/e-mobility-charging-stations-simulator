// Partial Copyright Jerome Benoit. 2021. All Rights Reserved.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { JSONSchemaType } from 'ajv';

import OCPPError from '../../../exception/OCPPError';
import { JsonObject, JsonType } from '../../../types/JsonType';
import { OCPP16MeterValuesRequest } from '../../../types/ocpp/1.6/MeterValues';
import {
  DiagnosticsStatusNotificationRequest,
  OCPP16BootNotificationRequest,
  OCPP16HeartbeatRequest,
  OCPP16RequestCommand,
  OCPP16StatusNotificationRequest,
} from '../../../types/ocpp/1.6/Requests';
import {
  OCPP16AuthorizeRequest,
  OCPP16StartTransactionRequest,
  OCPP16StopTransactionRequest,
} from '../../../types/ocpp/1.6/Transaction';
import { ErrorType } from '../../../types/ocpp/ErrorType';
import { RequestParams } from '../../../types/ocpp/Requests';
import Constants from '../../../utils/Constants';
import logger from '../../../utils/Logger';
import Utils from '../../../utils/Utils';
import type ChargingStation from '../../ChargingStation';
import { ChargingStationUtils } from '../../ChargingStationUtils';
import OCPPRequestService from '../OCPPRequestService';
import type OCPPResponseService from '../OCPPResponseService';
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';

const moduleName = 'OCPP16RequestService';

export default class OCPP16RequestService extends OCPPRequestService {
  private jsonSchemas: Map<OCPP16RequestCommand, JSONSchemaType<JsonObject>>;

  public constructor(ocppResponseService: OCPPResponseService) {
    if (new.target?.name === moduleName) {
      throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    }
    super(ocppResponseService);
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
        ) as JSONSchemaType<DiagnosticsStatusNotificationRequest>,
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
    ]);
    this.buildRequestPayload.bind(this);
    this.validatePayload.bind(this);
  }

  public async requestHandler<Request extends JsonType, Response extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType,
    params?: RequestParams
  ): Promise<Response> {
    if (ChargingStationUtils.isRequestCommandSupported(commandName, chargingStation)) {
      const requestPayload = this.buildRequestPayload<Request>(
        chargingStation,
        commandName,
        commandParams
      );
      this.validatePayload(chargingStation, commandName, requestPayload);
      return (await this.sendMessage(
        chargingStation,
        Utils.generateUUID(),
        requestPayload,
        commandName,
        params
      )) as unknown as Response;
    }
    throw new OCPPError(
      ErrorType.NOT_SUPPORTED,
      `${moduleName}.requestHandler: Unsupported OCPP command '${commandName}'`,
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
          `${moduleName}.buildRequestPayload: Unsupported OCPP command '${commandName}'`,
          commandName,
          commandParams
        );
    }
  }

  private validatePayload<Request extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    requestPayload: Request
  ): boolean {
    if (this.jsonSchemas.has(commandName)) {
      return this.validateRequestPayload(
        chargingStation,
        commandName,
        this.jsonSchemas.get(commandName),
        requestPayload
      );
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema found for command ${commandName} PDU validation`
    );
    return false;
  }
}
