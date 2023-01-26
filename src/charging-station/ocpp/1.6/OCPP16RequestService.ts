// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import type { JSONSchemaType } from 'ajv';

import { OCPP16ServiceUtils } from './OCPP16ServiceUtils';
import OCPPError from '../../../exception/OCPPError';
import type { JsonObject, JsonType } from '../../../types/JsonType';
import type { OCPP16MeterValuesRequest } from '../../../types/ocpp/1.6/MeterValues';
import {
  type OCPP16BootNotificationRequest,
  type OCPP16DataTransferRequest,
  type OCPP16DiagnosticsStatusNotificationRequest,
  type OCPP16FirmwareStatusNotificationRequest,
  type OCPP16HeartbeatRequest,
  OCPP16RequestCommand,
  type OCPP16StatusNotificationRequest,
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
import OCPPConstants from '../OCPPConstants';
import OCPPRequestService from '../OCPPRequestService';
import type OCPPResponseService from '../OCPPResponseService';

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
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16AuthorizeRequest>(
          '../../../assets/json-schemas/ocpp/1.6/Authorize.json'
        ),
      ],
      [
        OCPP16RequestCommand.BOOT_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16BootNotificationRequest>(
          '../../../assets/json-schemas/ocpp/1.6/BootNotification.json'
        ),
      ],
      [
        OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DiagnosticsStatusNotificationRequest>(
          '../../../assets/json-schemas/ocpp/1.6/DiagnosticsStatusNotification.json'
        ),
      ],
      [
        OCPP16RequestCommand.HEARTBEAT,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16HeartbeatRequest>(
          '../../../assets/json-schemas/ocpp/1.6/Heartbeat.json'
        ),
      ],
      [
        OCPP16RequestCommand.METER_VALUES,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16MeterValuesRequest>(
          '../../../assets/json-schemas/ocpp/1.6/MeterValues.json'
        ),
      ],
      [
        OCPP16RequestCommand.STATUS_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StatusNotificationRequest>(
          '../../../assets/json-schemas/ocpp/1.6/StatusNotification.json'
        ),
      ],
      [
        OCPP16RequestCommand.START_TRANSACTION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StartTransactionRequest>(
          '../../../assets/json-schemas/ocpp/1.6/StartTransaction.json'
        ),
      ],
      [
        OCPP16RequestCommand.STOP_TRANSACTION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StopTransactionRequest>(
          '../../../assets/json-schemas/ocpp/1.6/StopTransaction.json'
        ),
      ],
      [
        OCPP16RequestCommand.DATA_TRANSFER,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DataTransferRequest>(
          '../../../assets/json-schemas/ocpp/1.6/DataTransfer.json'
        ),
      ],
      [
        OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16FirmwareStatusNotificationRequest>(
          '../../../assets/json-schemas/ocpp/1.6/FirmwareStatusNotification.json'
        ),
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
      return (await this.sendMessage(
        chargingStation,
        Utils.generateUUID(),
        this.buildRequestPayload<RequestType>(chargingStation, commandName, commandParams),
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
      case OCPP16RequestCommand.BOOT_NOTIFICATION:
      case OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION:
      case OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION:
      case OCPP16RequestCommand.METER_VALUES:
      case OCPP16RequestCommand.STATUS_NOTIFICATION:
      case OCPP16RequestCommand.DATA_TRANSFER:
        return commandParams as unknown as Request;
      case OCPP16RequestCommand.AUTHORIZE:
        return {
          idTag: Constants.DEFAULT_IDTAG,
          ...commandParams,
        } as unknown as Request;
      case OCPP16RequestCommand.HEARTBEAT:
        return OCPPConstants.OCPP_REQUEST_EMPTY as unknown as Request;
      case OCPP16RequestCommand.START_TRANSACTION:
        return {
          idTag: Constants.DEFAULT_IDTAG,
          meterStart: chargingStation.getEnergyActiveImportRegisterByConnectorId(
            commandParams?.connectorId as number,
            true
          ),
          timestamp: new Date(),
          ...commandParams,
        } as unknown as Request;
      case OCPP16RequestCommand.STOP_TRANSACTION:
        chargingStation.getTransactionDataMeterValues() &&
          (connectorId = chargingStation.getConnectorIdByTransactionId(
            commandParams?.transactionId as number
          ));
        energyActiveImportRegister = chargingStation.getEnergyActiveImportRegisterByTransactionId(
          commandParams?.transactionId as number,
          true
        );
        return {
          idTag: chargingStation.getTransactionIdTag(commandParams?.transactionId as number),
          meterStop: energyActiveImportRegister,
          timestamp: new Date(),
          ...(chargingStation.getTransactionDataMeterValues() && {
            transactionData: OCPP16ServiceUtils.buildTransactionDataMeterValues(
              chargingStation.getConnectorStatus(connectorId).transactionBeginMeterValue,
              OCPP16ServiceUtils.buildTransactionEndMeterValue(
                chargingStation,
                connectorId,
                energyActiveImportRegister
              )
            ),
          }),
          ...commandParams,
        } as unknown as Request;
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
