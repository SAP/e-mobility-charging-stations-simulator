import { secondsToMilliseconds } from 'date-fns'

import type { ChargingStation } from '../ChargingStation.js'

import { BaseError, type OCPPError } from '../../exception/index.js'
import {
  AuthorizationStatus,
  type AuthorizeRequest,
  type AuthorizeResponse,
  type BootNotificationRequest,
  type BootNotificationResponse,
  BroadcastChannelProcedureName,
  type BroadcastChannelRequest,
  type BroadcastChannelRequestPayload,
  type BroadcastChannelResponsePayload,
  type DataTransferRequest,
  type DataTransferResponse,
  DataTransferStatus,
  type DiagnosticsStatusNotificationRequest,
  type DiagnosticsStatusNotificationResponse,
  type EmptyObject,
  type FirmwareStatusNotificationRequest,
  type FirmwareStatusNotificationResponse,
  GenericStatus,
  GetCertificateStatusEnumType,
  type HeartbeatRequest,
  type HeartbeatResponse,
  Iso15118EVCertificateStatusEnumType,
  type MessageEvent,
  type MeterValuesRequest,
  type MeterValuesResponse,
  type OCPP20Get15118EVCertificateRequest,
  type OCPP20Get15118EVCertificateResponse,
  type OCPP20GetCertificateStatusRequest,
  type OCPP20GetCertificateStatusResponse,
  type OCPP20LogStatusNotificationRequest,
  type OCPP20LogStatusNotificationResponse,
  type OCPP20MeterValuesRequest,
  type OCPP20MeterValuesResponse,
  type OCPP20NotifyCustomerInformationRequest,
  type OCPP20NotifyCustomerInformationResponse,
  type OCPP20NotifyReportRequest,
  type OCPP20NotifyReportResponse,
  type OCPP20SecurityEventNotificationRequest,
  type OCPP20SecurityEventNotificationResponse,
  type OCPP20SignCertificateRequest,
  type OCPP20SignCertificateResponse,
  type OCPP20TransactionEventRequest,
  type OCPP20TransactionEventResponse,
  OCPPVersion,
  RegistrationStatusEnumType,
  RequestCommand,
  type RequestParams,
  ResponseStatus,
  StandardParametersKey,
  type StartTransactionRequest,
  type StartTransactionResponse,
  type StatusNotificationRequest,
  type StatusNotificationResponse,
  type StopTransactionRequest,
  type StopTransactionResponse,
} from '../../types/index.js'
import { OCPP20AuthorizationStatusEnumType } from '../../types/ocpp/2.0/Transaction.js'
import { Constants, convertToInt, isAsyncFunction, isEmpty, logger } from '../../utils/index.js'
import { getConfigurationKey } from '../ConfigurationKeyUtils.js'
import { buildMeterValue } from '../ocpp/index.js'
import { WorkerBroadcastChannel } from './WorkerBroadcastChannel.js'

const moduleName = 'ChargingStationWorkerBroadcastChannel'

type CommandHandler = (
  requestPayload?: BroadcastChannelRequestPayload
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => CommandResponse | Promise<CommandResponse | void> | void

type CommandResponse =
  | AuthorizeResponse
  | BootNotificationResponse
  | DataTransferResponse
  | EmptyObject
  | HeartbeatResponse
  | OCPP20Get15118EVCertificateResponse
  | OCPP20GetCertificateStatusResponse
  | OCPP20SignCertificateResponse
  | OCPP20TransactionEventResponse
  | StartTransactionResponse
  | StopTransactionResponse

export class ChargingStationWorkerBroadcastChannel extends WorkerBroadcastChannel {
  private readonly chargingStation: ChargingStation
  private readonly commandHandlers: Map<BroadcastChannelProcedureName, CommandHandler>

  constructor (chargingStation: ChargingStation) {
    super()
    const requestParams: RequestParams = {
      throwError: true,
    }
    this.commandHandlers = new Map<BroadcastChannelProcedureName, CommandHandler>([
      [
        BroadcastChannelProcedureName.AUTHORIZE,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            AuthorizeRequest,
            AuthorizeResponse
          >(
            this.chargingStation,
            RequestCommand.AUTHORIZE,
            requestPayload as AuthorizeRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.BOOT_NOTIFICATION,
        async (requestPayload?: BroadcastChannelRequestPayload) => {
          return await this.chargingStation.ocppRequestService.requestHandler<
            BootNotificationRequest,
            BootNotificationResponse
          >(
            this.chargingStation,
            RequestCommand.BOOT_NOTIFICATION,
            {
              ...this.chargingStation.bootNotificationRequest,
              ...requestPayload,
            } as BootNotificationRequest,
            {
              skipBufferingOnError: true,
              throwError: true,
            }
          )
        },
      ],
      [
        BroadcastChannelProcedureName.CLOSE_CONNECTION,
        () => {
          this.chargingStation.closeWSConnection()
        },
      ],
      [
        BroadcastChannelProcedureName.DATA_TRANSFER,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            DataTransferRequest,
            DataTransferResponse
          >(
            this.chargingStation,
            RequestCommand.DATA_TRANSFER,
            requestPayload as DataTransferRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.DELETE_CHARGING_STATIONS,
        async (requestPayload?: BroadcastChannelRequestPayload) => {
          await this.chargingStation.delete(requestPayload?.deleteConfiguration as boolean)
        },
      ],
      [
        BroadcastChannelProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            DiagnosticsStatusNotificationRequest,
            DiagnosticsStatusNotificationResponse
          >(
            this.chargingStation,
            RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
            requestPayload as DiagnosticsStatusNotificationRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.FIRMWARE_STATUS_NOTIFICATION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            FirmwareStatusNotificationRequest,
            FirmwareStatusNotificationResponse
          >(
            this.chargingStation,
            RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
            requestPayload as FirmwareStatusNotificationRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.HEARTBEAT,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            HeartbeatRequest,
            HeartbeatResponse
          >(
            this.chargingStation,
            RequestCommand.HEARTBEAT,
            requestPayload as HeartbeatRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.METER_VALUES,
        async (requestPayload?: BroadcastChannelRequestPayload) => {
          if (this.chargingStation.stationInfo?.ocppVersion === OCPPVersion.VERSION_201) {
            return await this.chargingStation.ocppRequestService.requestHandler<
              OCPP20MeterValuesRequest,
              OCPP20MeterValuesResponse
            >(
              this.chargingStation,
              RequestCommand.METER_VALUES,
              requestPayload as OCPP20MeterValuesRequest,
              requestParams
            )
          }
          const configuredMeterValueSampleInterval = getConfigurationKey(
            chargingStation,
            StandardParametersKey.MeterValueSampleInterval
          )
          const connectorId = requestPayload?.connectorId
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const transactionId = this.chargingStation.getConnectorStatus(connectorId!)?.transactionId
          return await this.chargingStation.ocppRequestService.requestHandler<
            MeterValuesRequest,
            MeterValuesResponse
          >(
            this.chargingStation,
            RequestCommand.METER_VALUES,
            {
              meterValue: [
                buildMeterValue(
                  this.chargingStation,
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  connectorId!,
                  convertToInt(transactionId),
                  configuredMeterValueSampleInterval != null
                    ? secondsToMilliseconds(convertToInt(configuredMeterValueSampleInterval.value))
                    : Constants.DEFAULT_METER_VALUES_INTERVAL
                ),
              ],
              ...requestPayload,
            } as MeterValuesRequest,
            requestParams
          )
        },
      ],
      [
        BroadcastChannelProcedureName.OPEN_CONNECTION,
        () => {
          this.chargingStation.openWSConnection()
        },
      ],
      [
        BroadcastChannelProcedureName.SET_SUPERVISION_URL,
        (requestPayload?: BroadcastChannelRequestPayload) => {
          const url = requestPayload?.url
          if (typeof url !== 'string' || isEmpty(url)) {
            throw new BaseError(
              `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: 'url' field is required`
            )
          }
          this.chargingStation.setSupervisionUrl(url)
        },
      ],
      [
        BroadcastChannelProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
        (requestPayload?: BroadcastChannelRequestPayload) => {
          this.chargingStation.startAutomaticTransactionGenerator(requestPayload?.connectorIds)
        },
      ],
      [
        BroadcastChannelProcedureName.START_CHARGING_STATION,
        () => {
          this.chargingStation.start()
        },
      ],
      [
        BroadcastChannelProcedureName.START_TRANSACTION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            StartTransactionRequest,
            StartTransactionResponse
          >(
            this.chargingStation,
            RequestCommand.START_TRANSACTION,
            requestPayload as StartTransactionRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.STATUS_NOTIFICATION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            StatusNotificationRequest,
            StatusNotificationResponse
          >(
            this.chargingStation,
            RequestCommand.STATUS_NOTIFICATION,
            requestPayload as StatusNotificationRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
        (requestPayload?: BroadcastChannelRequestPayload) => {
          this.chargingStation.stopAutomaticTransactionGenerator(requestPayload?.connectorIds)
        },
      ],
      [
        BroadcastChannelProcedureName.STOP_CHARGING_STATION,
        async () => {
          await this.chargingStation.stop()
        },
      ],
      [
        BroadcastChannelProcedureName.STOP_TRANSACTION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            StopTransactionRequest,
            StopTransactionResponse
          >(
            this.chargingStation,
            RequestCommand.STOP_TRANSACTION,
            {
              meterStop: this.chargingStation.getEnergyActiveImportRegisterByTransactionId(
                requestPayload?.transactionId,
                true
              ),
              ...requestPayload,
            } as StopTransactionRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.GET_15118_EV_CERTIFICATE,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            OCPP20Get15118EVCertificateRequest,
            OCPP20Get15118EVCertificateResponse
          >(
            this.chargingStation,
            RequestCommand.GET_15118_EV_CERTIFICATE,
            requestPayload as OCPP20Get15118EVCertificateRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.GET_CERTIFICATE_STATUS,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            OCPP20GetCertificateStatusRequest,
            OCPP20GetCertificateStatusResponse
          >(
            this.chargingStation,
            RequestCommand.GET_CERTIFICATE_STATUS,
            requestPayload as OCPP20GetCertificateStatusRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.LOG_STATUS_NOTIFICATION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            OCPP20LogStatusNotificationRequest,
            OCPP20LogStatusNotificationResponse
          >(
            this.chargingStation,
            RequestCommand.LOG_STATUS_NOTIFICATION,
            requestPayload as OCPP20LogStatusNotificationRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.NOTIFY_CUSTOMER_INFORMATION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            OCPP20NotifyCustomerInformationRequest,
            OCPP20NotifyCustomerInformationResponse
          >(
            this.chargingStation,
            RequestCommand.NOTIFY_CUSTOMER_INFORMATION,
            requestPayload as OCPP20NotifyCustomerInformationRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.NOTIFY_REPORT,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            OCPP20NotifyReportRequest,
            OCPP20NotifyReportResponse
          >(
            this.chargingStation,
            RequestCommand.NOTIFY_REPORT,
            requestPayload as OCPP20NotifyReportRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.SECURITY_EVENT_NOTIFICATION,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            OCPP20SecurityEventNotificationRequest,
            OCPP20SecurityEventNotificationResponse
          >(
            this.chargingStation,
            RequestCommand.SECURITY_EVENT_NOTIFICATION,
            requestPayload as OCPP20SecurityEventNotificationRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.SIGN_CERTIFICATE,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            OCPP20SignCertificateRequest,
            OCPP20SignCertificateResponse
          >(
            this.chargingStation,
            RequestCommand.SIGN_CERTIFICATE,
            requestPayload as OCPP20SignCertificateRequest,
            requestParams
          ),
      ],
      [
        BroadcastChannelProcedureName.TRANSACTION_EVENT,
        async (requestPayload?: BroadcastChannelRequestPayload) =>
          await this.chargingStation.ocppRequestService.requestHandler<
            OCPP20TransactionEventRequest,
            OCPP20TransactionEventResponse
          >(
            this.chargingStation,
            RequestCommand.TRANSACTION_EVENT,
            requestPayload as OCPP20TransactionEventRequest,
            requestParams
          ),
      ],
    ])
    this.chargingStation = chargingStation
    this.onmessage = this.requestHandler.bind(this) as (message: unknown) => void
    this.onmessageerror = this.messageErrorHandler.bind(this) as (message: unknown) => void
  }

  private cleanRequestPayload (
    command: BroadcastChannelProcedureName,
    requestPayload: BroadcastChannelRequestPayload
  ): void {
    delete requestPayload.hashId
    delete requestPayload.hashIds
    ![
      BroadcastChannelProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
      BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
    ].includes(command) && delete requestPayload.connectorIds
  }

  private async commandHandler (
    command: BroadcastChannelProcedureName,
    requestPayload: BroadcastChannelRequestPayload
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  ): Promise<CommandResponse | void> {
    if (this.commandHandlers.has(command)) {
      this.cleanRequestPayload(command, requestPayload)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const commandHandler = this.commandHandlers.get(command)!
      if (isAsyncFunction(commandHandler)) {
        return await commandHandler(requestPayload)
      }
      return (
        commandHandler as (
          requestPayload?: BroadcastChannelRequestPayload
          // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
        ) => CommandResponse | void
      )(requestPayload)
    }
    throw new BaseError(`Unknown worker broadcast channel command: '${command}'`)
  }

  private commandResponseToResponsePayload (
    command: BroadcastChannelProcedureName,
    requestPayload: BroadcastChannelRequestPayload,
    commandResponse: CommandResponse
  ): BroadcastChannelResponsePayload {
    const responseStatus = this.commandResponseToResponseStatus(command, commandResponse)
    if (responseStatus === ResponseStatus.SUCCESS) {
      return {
        hashId: this.chargingStation.stationInfo?.hashId,
        status: responseStatus,
      }
    }
    return {
      command,
      commandResponse,
      hashId: this.chargingStation.stationInfo?.hashId,
      requestPayload,
      status: responseStatus,
    }
  }

  private commandResponseToResponseStatus (
    command: BroadcastChannelProcedureName,
    commandResponse: CommandResponse
  ): ResponseStatus {
    switch (command) {
      case BroadcastChannelProcedureName.AUTHORIZE:
      case BroadcastChannelProcedureName.START_TRANSACTION:
      case BroadcastChannelProcedureName.STOP_TRANSACTION:
        if (
          (
            commandResponse as
              | AuthorizeResponse
              | StartTransactionResponse
              | StopTransactionResponse
          ).idTagInfo?.status === AuthorizationStatus.ACCEPTED
        ) {
          return ResponseStatus.SUCCESS
        }
        return ResponseStatus.FAILURE
      case BroadcastChannelProcedureName.BOOT_NOTIFICATION:
        if (commandResponse.status === RegistrationStatusEnumType.ACCEPTED) {
          return ResponseStatus.SUCCESS
        }
        return ResponseStatus.FAILURE
      case BroadcastChannelProcedureName.DATA_TRANSFER:
        if (commandResponse.status === DataTransferStatus.ACCEPTED) {
          return ResponseStatus.SUCCESS
        }
        return ResponseStatus.FAILURE
      case BroadcastChannelProcedureName.HEARTBEAT:
        if ('currentTime' in commandResponse) {
          return ResponseStatus.SUCCESS
        }
        return ResponseStatus.FAILURE
      case BroadcastChannelProcedureName.METER_VALUES:
      case BroadcastChannelProcedureName.STATUS_NOTIFICATION:
        if (isEmpty(commandResponse)) {
          return ResponseStatus.SUCCESS
        }
        return ResponseStatus.FAILURE
      case BroadcastChannelProcedureName.GET_15118_EV_CERTIFICATE:
        if (
          (commandResponse as OCPP20Get15118EVCertificateResponse).status ===
          Iso15118EVCertificateStatusEnumType.Accepted
        ) {
          return ResponseStatus.SUCCESS
        }
        return ResponseStatus.FAILURE
      case BroadcastChannelProcedureName.GET_CERTIFICATE_STATUS:
        if (
          (commandResponse as OCPP20GetCertificateStatusResponse).status ===
          GetCertificateStatusEnumType.Accepted
        ) {
          return ResponseStatus.SUCCESS
        }
        return ResponseStatus.FAILURE
      case BroadcastChannelProcedureName.SIGN_CERTIFICATE:
        if (
          (commandResponse as OCPP20SignCertificateResponse).status === GenericStatus.Accepted
        ) {
          return ResponseStatus.SUCCESS
        }
        return ResponseStatus.FAILURE
      case BroadcastChannelProcedureName.TRANSACTION_EVENT:
        if (
          isEmpty(commandResponse) ||
          (commandResponse as OCPP20TransactionEventResponse).idTokenInfo == null ||
          (commandResponse as OCPP20TransactionEventResponse).idTokenInfo?.status ===
            OCPP20AuthorizationStatusEnumType.Accepted
        ) {
          return ResponseStatus.SUCCESS
        }
        return ResponseStatus.FAILURE
      default:
        return ResponseStatus.FAILURE
    }
  }

  private messageErrorHandler (messageEvent: MessageEvent): void {
    logger.error(
      `${this.chargingStation.logPrefix()} ${moduleName}.messageErrorHandler: Error at handling message:`,
      messageEvent
    )
  }

  private requestHandler (messageEvent: MessageEvent): void {
    const validatedMessageEvent = this.validateMessageEvent(messageEvent)
    if (validatedMessageEvent === false) {
      return
    }
    if (this.isResponse(validatedMessageEvent.data)) {
      return
    }
    const [uuid, command, requestPayload] = validatedMessageEvent.data as BroadcastChannelRequest
    if (
      requestPayload.hashIds != null &&
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      !requestPayload.hashIds.includes(this.chargingStation.stationInfo!.hashId)
    ) {
      return
    }
    if (requestPayload.hashId != null) {
      logger.error(
        `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: 'hashId' field usage in PDU is deprecated, use 'hashIds' array instead`
      )
      return
    }
    let responsePayload: BroadcastChannelResponsePayload | undefined
    // eslint-disable-next-line promise/catch-or-return
    this.commandHandler(command, requestPayload)
      .then(commandResponse => {
        if (commandResponse == null || isEmpty(commandResponse)) {
          responsePayload = {
            hashId: this.chargingStation.stationInfo?.hashId,
            status: ResponseStatus.SUCCESS,
          }
        } else {
          responsePayload = this.commandResponseToResponsePayload(
            command,
            requestPayload,
            commandResponse
          )
        }
        return undefined
      })
      .catch((error: unknown) => {
        logger.error(
          `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: Handle request error:`,
          error
        )
        responsePayload = {
          command,
          errorDetails: (error as OCPPError).details,
          errorMessage: (error as OCPPError).message,
          errorStack: (error as OCPPError).stack,
          hashId: this.chargingStation.stationInfo?.hashId,
          requestPayload,
          status: ResponseStatus.FAILURE,
        } satisfies BroadcastChannelResponsePayload
        return undefined
      })
      .finally(() => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.sendResponse([uuid, responsePayload!])
      })
  }
}
