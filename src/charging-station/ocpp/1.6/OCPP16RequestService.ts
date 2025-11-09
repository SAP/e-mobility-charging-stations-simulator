// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import type { ChargingStation } from '../../../charging-station/index.js'
import type { OCPPResponseService } from '../OCPPResponseService.js'

import { OCPPError } from '../../../exception/index.js'
import {
  ErrorType,
  type JsonObject,
  type JsonType,
  type OCPP16AuthorizeRequest,
  type OCPP16BootNotificationRequest,
  OCPP16ChargePointStatus,
  type OCPP16DataTransferRequest,
  type OCPP16DiagnosticsStatusNotificationRequest,
  type OCPP16FirmwareStatusNotificationRequest,
  type OCPP16HeartbeatRequest,
  type OCPP16MeterValue,
  type OCPP16MeterValuesRequest,
  OCPP16RequestCommand,
  type OCPP16StartTransactionRequest,
  type OCPP16StatusNotificationRequest,
  type OCPP16StopTransactionRequest,
  OCPPVersion,
  type RequestParams,
} from '../../../types/index.js'
import { Constants, generateUUID, logger } from '../../../utils/index.js'
import { OCPPRequestService } from '../OCPPRequestService.js'
import { OCPP16Constants } from './OCPP16Constants.js'
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils.js'

const moduleName = 'OCPP16RequestService'

export class OCPP16RequestService extends OCPPRequestService {
  protected payloadValidateFunctions: Map<OCPP16RequestCommand, ValidateFunction<JsonType>>

  public constructor (ocppResponseService: OCPPResponseService) {
    // if (new.target.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target.name} instances directly`)
    // }
    super(OCPPVersion.VERSION_16, ocppResponseService)
    this.payloadValidateFunctions = new Map<OCPP16RequestCommand, ValidateFunction<JsonType>>([
      [
        OCPP16RequestCommand.AUTHORIZE,
        this.ajv.compile(
          OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16AuthorizeRequest>(
            'assets/json-schemas/ocpp/1.6/Authorize.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP16RequestCommand.BOOT_NOTIFICATION,
        this.ajv.compile(
          OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16BootNotificationRequest>(
            'assets/json-schemas/ocpp/1.6/BootNotification.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP16RequestCommand.DATA_TRANSFER,
        this.ajv.compile(
          OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DataTransferRequest>(
            'assets/json-schemas/ocpp/1.6/DataTransfer.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        this.ajv.compile(
          OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16DiagnosticsStatusNotificationRequest>(
            'assets/json-schemas/ocpp/1.6/DiagnosticsStatusNotification.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
        this.ajv.compile(
          OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16FirmwareStatusNotificationRequest>(
            'assets/json-schemas/ocpp/1.6/FirmwareStatusNotification.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP16RequestCommand.HEARTBEAT,
        this.ajv.compile(
          OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16HeartbeatRequest>(
            'assets/json-schemas/ocpp/1.6/Heartbeat.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP16RequestCommand.METER_VALUES,
        this.ajv.compile(
          OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16MeterValuesRequest>(
            'assets/json-schemas/ocpp/1.6/MeterValues.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP16RequestCommand.START_TRANSACTION,
        this.ajv.compile(
          OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StartTransactionRequest>(
            'assets/json-schemas/ocpp/1.6/StartTransaction.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP16RequestCommand.STATUS_NOTIFICATION,
        this.ajv.compile(
          OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StatusNotificationRequest>(
            'assets/json-schemas/ocpp/1.6/StatusNotification.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP16RequestCommand.STOP_TRANSACTION,
        this.ajv.compile(
          OCPP16ServiceUtils.parseJsonSchemaFile<OCPP16StopTransactionRequest>(
            'assets/json-schemas/ocpp/1.6/StopTransaction.json',
            moduleName,
            'constructor'
          )
        ),
      ],
    ])
    this.buildRequestPayload = this.buildRequestPayload.bind(this)
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async requestHandler<RequestType extends JsonType, ResponseType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    commandParams?: RequestType,
    params?: RequestParams
  ): Promise<ResponseType> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Processing '${commandName}' request`
    )
    // FIXME?: add sanity checks on charging station availability, connector availability, connector status, etc.
    if (OCPP16ServiceUtils.isRequestCommandSupported(chargingStation, commandName)) {
      try {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Building request payload for '${commandName}'`
        )
        const requestPayload = this.buildRequestPayload<RequestType>(
          chargingStation,
          commandName,
          commandParams
        )
        const messageId = generateUUID()
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Sending '${commandName}' request with message ID '${messageId}'`
        )
        // Pre request actions hook
        switch (commandName) {
          case OCPP16RequestCommand.START_TRANSACTION:
            await OCPP16ServiceUtils.sendAndSetConnectorStatus(
              chargingStation,
              (commandParams as OCPP16StartTransactionRequest).connectorId,
              OCPP16ChargePointStatus.Preparing
            )
            break
        }
        const response = (await this.sendMessage(
          chargingStation,
          messageId,
          requestPayload,
          commandName,
          params
        )) as ResponseType
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: '${commandName}' request completed successfully`
        )
        return response
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Error processing '${commandName}' request:`,
          error
        )
        throw error
      }
    }
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    const errorMsg = `Unsupported OCPP command ${commandName}`
    logger.error(`${chargingStation.logPrefix()} ${moduleName}.requestHandler: ${errorMsg}`)
    throw new OCPPError(ErrorType.NOT_SUPPORTED, errorMsg, commandName, commandParams)
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  private buildRequestPayload<Request extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType
  ): Request {
    let connectorId: number | undefined
    let energyActiveImportRegister: number
    commandParams = commandParams as JsonObject
    switch (commandName) {
      case OCPP16RequestCommand.AUTHORIZE:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP16RequestCommand.AUTHORIZE} payload with default idTag`
        )
        return {
          idTag: Constants.DEFAULT_IDTAG,
          ...commandParams,
        } as unknown as Request
      case OCPP16RequestCommand.BOOT_NOTIFICATION:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP16RequestCommand.BOOT_NOTIFICATION} payload`
        )
        return commandParams as unknown as Request
      case OCPP16RequestCommand.DATA_TRANSFER:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP16RequestCommand.DATA_TRANSFER} payload`
        )
        return commandParams as unknown as Request
      case OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION} payload`
        )
        return commandParams as unknown as Request
      case OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION} payload`
        )
        return commandParams as unknown as Request
      case OCPP16RequestCommand.HEARTBEAT:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP16RequestCommand.HEARTBEAT} payload (empty)`
        )
        return OCPP16Constants.OCPP_REQUEST_EMPTY as unknown as Request
      case OCPP16RequestCommand.METER_VALUES:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP16RequestCommand.METER_VALUES} payload`
        )
        return commandParams as unknown as Request
      case OCPP16RequestCommand.START_TRANSACTION:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP16RequestCommand.START_TRANSACTION} payload with meter start and timestamp`
        )
        return {
          idTag: Constants.DEFAULT_IDTAG,
          meterStart: chargingStation.getEnergyActiveImportRegisterByConnectorId(
            commandParams.connectorId as number,
            true
          ),
          timestamp: new Date(),
          ...(OCPP16ServiceUtils.hasReservation(
            chargingStation,
            commandParams.connectorId as number,
            commandParams.idTag as string
          ) && {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            reservationId: chargingStation.getReservationBy(
              'connectorId',
              chargingStation.getConnectorStatus(0)?.status === OCPP16ChargePointStatus.Reserved
                ? 0
                : (commandParams.connectorId as number)
            )!.reservationId,
          }),
          ...commandParams,
        } as unknown as Request
      case OCPP16RequestCommand.STATUS_NOTIFICATION:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP16RequestCommand.STATUS_NOTIFICATION} payload`
        )
        return commandParams as unknown as Request
      case OCPP16RequestCommand.STOP_TRANSACTION:
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${OCPP16RequestCommand.STOP_TRANSACTION} payload with meter stop and timestamp`
        )
        chargingStation.stationInfo?.transactionDataMeterValues === true &&
          (connectorId = chargingStation.getConnectorIdByTransactionId(
            commandParams.transactionId as number
          ))
        energyActiveImportRegister = chargingStation.getEnergyActiveImportRegisterByTransactionId(
          commandParams.transactionId as number,
          true
        )
        return {
          idTag: chargingStation.getTransactionIdTag(commandParams.transactionId as number),
          meterStop: energyActiveImportRegister,
          timestamp: new Date(),
          ...(chargingStation.stationInfo?.transactionDataMeterValues === true && {
            transactionData: OCPP16ServiceUtils.buildTransactionDataMeterValues(
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              chargingStation.getConnectorStatus(connectorId!)!
                .transactionBeginMeterValue! as OCPP16MeterValue,
              OCPP16ServiceUtils.buildTransactionEndMeterValue(
                chargingStation,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                connectorId!,
                energyActiveImportRegister
              ) as OCPP16MeterValue
            ),
          }),
          ...commandParams,
        } as unknown as Request
      default: {
        // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
        const errorMsg = `Unsupported OCPP command ${commandName as string} for payload building`
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: ${errorMsg}`
        )
        throw new OCPPError(ErrorType.NOT_SUPPORTED, errorMsg, commandName, commandParams)
      }
    }
  }
}
