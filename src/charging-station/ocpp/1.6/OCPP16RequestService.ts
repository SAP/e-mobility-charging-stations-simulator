// Partial Copyright Jerome Benoit. 2021-2023. All Rights Reserved.

import type { JSONSchemaType } from 'ajv';

import type { ChargingStation } from '../../../charging-station';
import { OCPPError } from '../../../exception';
import {
  ErrorType,
  type JsonObject,
  type JsonType,
  type OCPP16AuthorizeRequest,
  type OCPP16BootNotificationRequest,
  type OCPP16DataTransferRequest,
  type OCPP16DiagnosticsStatusNotificationRequest,
  type OCPP16FirmwareStatusNotificationRequest,
  type OCPP16HeartbeatRequest,
  type OCPP16MeterValuesRequest,
  OCPP16RequestCommand,
  type OCPP16StartTransactionRequest,
  type OCPP16StatusNotificationRequest,
  type OCPP16StopTransactionRequest,
  OCPPVersion,
  type RequestParams,
} from '../../../types';
import { Constants, Utils } from '../../../utils';
import {
  OCPP16ServiceUtils,
  OCPPConstants,
  OCPPRequestService,
  type OCPPResponseService,
} from '../internal';

const moduleName = 'OCPP16RequestService';

export class OCPP16RequestService extends OCPPRequestService {
  protected jsonSchemas: Map<OCPP16RequestCommand, JSONSchemaType<JsonObject>>;

  public constructor(ocppResponseService: OCPPResponseService) {
    // if (new.target?.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target?.name} instances directly`);
    // }
    super(OCPPVersion.VERSION_16, ocppResponseService);
    this.jsonSchemas = new Map<OCPP16RequestCommand, JSONSchemaType<JsonObject>>([
      [
        OCPP16RequestCommand.AUTHORIZE,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16AuthorizeRequest>(
          '../../../assets/json-schemas/ocpp/1.6/Authorize.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16RequestCommand.BOOT_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16BootNotificationRequest>(
          '../../../assets/json-schemas/ocpp/1.6/BootNotification.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DiagnosticsStatusNotificationRequest>(
          '../../../assets/json-schemas/ocpp/1.6/DiagnosticsStatusNotification.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16RequestCommand.HEARTBEAT,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16HeartbeatRequest>(
          '../../../assets/json-schemas/ocpp/1.6/Heartbeat.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16RequestCommand.METER_VALUES,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16MeterValuesRequest>(
          '../../../assets/json-schemas/ocpp/1.6/MeterValues.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16RequestCommand.STATUS_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StatusNotificationRequest>(
          '../../../assets/json-schemas/ocpp/1.6/StatusNotification.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16RequestCommand.START_TRANSACTION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StartTransactionRequest>(
          '../../../assets/json-schemas/ocpp/1.6/StartTransaction.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16RequestCommand.STOP_TRANSACTION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StopTransactionRequest>(
          '../../../assets/json-schemas/ocpp/1.6/StopTransaction.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16RequestCommand.DATA_TRANSFER,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DataTransferRequest>(
          '../../../assets/json-schemas/ocpp/1.6/DataTransfer.json',
          moduleName,
          'constructor'
        ),
      ],
      [
        OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
        OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16FirmwareStatusNotificationRequest>(
          '../../../assets/json-schemas/ocpp/1.6/FirmwareStatusNotification.json',
          moduleName,
          'constructor'
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
      )) as ResponseType;
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
