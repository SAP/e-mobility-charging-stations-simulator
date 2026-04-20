import { secondsToMilliseconds } from 'date-fns'

import type { ChargingStation } from '../ChargingStation.js'

import { BaseError, OCPPError } from '../../exception/index.js'
import {
  AuthorizationStatus,
  type AuthorizeResponse,
  type BootNotificationRequest,
  type BootNotificationResponse,
  BroadcastChannelProcedureName,
  type BroadcastChannelRequest,
  type BroadcastChannelRequestPayload,
  type BroadcastChannelResponsePayload,
  type DataTransferResponse,
  DataTransferStatus,
  GenericStatus,
  GetCertificateStatusEnumType,
  type HeartbeatResponse,
  Iso15118EVCertificateStatusEnumType,
  type MessageEvent,
  type MeterValuesRequest,
  type MeterValuesResponse,
  type OCPP16AuthorizeResponse,
  OCPP20AuthorizationStatusEnumType,
  type OCPP20AuthorizeResponse,
  type OCPP20Get15118EVCertificateResponse,
  type OCPP20GetCertificateStatusResponse,
  type OCPP20SignCertificateResponse,
  type OCPP20TransactionEventResponse,
  OCPPVersion,
  RegistrationStatusEnumType,
  RequestCommand,
  type RequestParams,
  ResponseStatus,
  StandardParametersKey,
  type StartTransactionRequest,
  type StartTransactionResponse,
  type StopTransactionRequest,
  type StopTransactionResponse,
} from '../../types/index.js'
import {
  Constants,
  convertToInt,
  getErrorMessage,
  isAsyncFunction,
  isEmpty,
  logger,
} from '../../utils/index.js'
import { getConfigurationKey } from '../ConfigurationKeyUtils.js'
import {
  buildMeterValue,
  OCPP20ServiceUtils,
  startTransactionOnConnector,
  stopTransactionOnConnector,
} from '../ocpp/index.js'
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
  | HeartbeatResponse
  | OCPP20Get15118EVCertificateResponse
  | OCPP20GetCertificateStatusResponse
  | OCPP20SignCertificateResponse
  | OCPP20TransactionEventResponse
  | StartTransactionResponse
  | StopTransactionResponse

export class ChargingStationWorkerBroadcastChannel extends WorkerBroadcastChannel {
  private static readonly acceptedStatusCommands = new Map<
    BroadcastChannelProcedureName,
    (response: CommandResponse) => boolean
      >([
        [
          BroadcastChannelProcedureName.BOOT_NOTIFICATION,
          r => r.status === RegistrationStatusEnumType.ACCEPTED,
        ],
        [BroadcastChannelProcedureName.DATA_TRANSFER, r => r.status === DataTransferStatus.ACCEPTED],
        [
          BroadcastChannelProcedureName.GET_15118_EV_CERTIFICATE,
          r =>
            (r as OCPP20Get15118EVCertificateResponse).status ===
        Iso15118EVCertificateStatusEnumType.Accepted,
        ],
        [
          BroadcastChannelProcedureName.GET_CERTIFICATE_STATUS,
          r =>
            (r as OCPP20GetCertificateStatusResponse).status === GetCertificateStatusEnumType.Accepted,
        ],
        [
          BroadcastChannelProcedureName.SIGN_CERTIFICATE,
          r => (r as OCPP20SignCertificateResponse).status === GenericStatus.Accepted,
        ],
      ])

  private static readonly emptyResponseCommands = new Set<BroadcastChannelProcedureName>([
    BroadcastChannelProcedureName.LOG_STATUS_NOTIFICATION,
    BroadcastChannelProcedureName.METER_VALUES,
    BroadcastChannelProcedureName.NOTIFY_CUSTOMER_INFORMATION,
    BroadcastChannelProcedureName.NOTIFY_REPORT,
    BroadcastChannelProcedureName.SECURITY_EVENT_NOTIFICATION,
    BroadcastChannelProcedureName.STATUS_NOTIFICATION,
  ])

  private readonly chargingStation: ChargingStation

  private readonly commandHandlers: Map<BroadcastChannelProcedureName, CommandHandler>

  private readonly requestParams: RequestParams = {
    throwError: true,
  }

  constructor (chargingStation: ChargingStation) {
    super()
    this.chargingStation = chargingStation
    this.commandHandlers = new Map<BroadcastChannelProcedureName, CommandHandler>([
      [BroadcastChannelProcedureName.AUTHORIZE, this.passthrough(RequestCommand.AUTHORIZE)],
      [BroadcastChannelProcedureName.BOOT_NOTIFICATION, this.handleBootNotification.bind(this)],
      [
        BroadcastChannelProcedureName.CLOSE_CONNECTION,
        () => {
          this.chargingStation.closeWSConnection()
        },
      ],
      [BroadcastChannelProcedureName.DATA_TRANSFER, this.passthrough(RequestCommand.DATA_TRANSFER)],
      [
        BroadcastChannelProcedureName.DELETE_CHARGING_STATIONS,
        async (requestPayload?: BroadcastChannelRequestPayload) => {
          await this.chargingStation.delete(requestPayload?.deleteConfiguration as boolean)
        },
      ],
      [
        BroadcastChannelProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION,
        this.passthrough(RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION),
      ],
      [
        BroadcastChannelProcedureName.FIRMWARE_STATUS_NOTIFICATION,
        this.passthrough(RequestCommand.FIRMWARE_STATUS_NOTIFICATION),
      ],
      [
        BroadcastChannelProcedureName.GET_15118_EV_CERTIFICATE,
        this.passthrough(RequestCommand.GET_15118_EV_CERTIFICATE),
      ],
      [
        BroadcastChannelProcedureName.GET_CERTIFICATE_STATUS,
        this.passthrough(RequestCommand.GET_CERTIFICATE_STATUS),
      ],
      [BroadcastChannelProcedureName.HEARTBEAT, this.passthrough(RequestCommand.HEARTBEAT)],
      [
        BroadcastChannelProcedureName.LOCK_CONNECTOR,
        (requestPayload?: BroadcastChannelRequestPayload) => {
          if (requestPayload?.connectorId == null) {
            throw new BaseError(
              `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: 'connectorId' field is required`
            )
          }
          this.chargingStation.lockConnector(requestPayload.connectorId)
        },
      ],
      [
        BroadcastChannelProcedureName.LOG_STATUS_NOTIFICATION,
        this.passthrough(RequestCommand.LOG_STATUS_NOTIFICATION),
      ],
      [BroadcastChannelProcedureName.METER_VALUES, this.handleMeterValues.bind(this)],
      [
        BroadcastChannelProcedureName.NOTIFY_CUSTOMER_INFORMATION,
        this.passthrough(RequestCommand.NOTIFY_CUSTOMER_INFORMATION),
      ],
      [BroadcastChannelProcedureName.NOTIFY_REPORT, this.passthrough(RequestCommand.NOTIFY_REPORT)],
      [
        BroadcastChannelProcedureName.OPEN_CONNECTION,
        () => {
          this.chargingStation.openWSConnection()
        },
      ],
      [
        BroadcastChannelProcedureName.SECURITY_EVENT_NOTIFICATION,
        this.passthrough(RequestCommand.SECURITY_EVENT_NOTIFICATION),
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
        BroadcastChannelProcedureName.SIGN_CERTIFICATE,
        this.passthrough(RequestCommand.SIGN_CERTIFICATE),
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
      [BroadcastChannelProcedureName.START_TRANSACTION, this.handleStartTransaction.bind(this)],
      [
        BroadcastChannelProcedureName.STATUS_NOTIFICATION,
        this.passthrough(RequestCommand.STATUS_NOTIFICATION),
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
      [BroadcastChannelProcedureName.STOP_TRANSACTION, this.handleStopTransaction.bind(this)],
      [
        BroadcastChannelProcedureName.TRANSACTION_EVENT,
        this.passthrough(RequestCommand.TRANSACTION_EVENT),
      ],
      [
        BroadcastChannelProcedureName.UNLOCK_CONNECTOR,
        (requestPayload?: BroadcastChannelRequestPayload) => {
          if (requestPayload?.connectorId == null) {
            throw new BaseError(
              `${this.chargingStation.logPrefix()} ${moduleName}.requestHandler: 'connectorId' field is required`
            )
          }
          this.chargingStation.unlockConnector(requestPayload.connectorId)
        },
      ],
    ])
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
      const commandHandler = this.commandHandlers.get(command)
      if (commandHandler == null) {
        throw new BaseError(`Unknown worker broadcast channel command: '${command}'`)
      }
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
    if (ChargingStationWorkerBroadcastChannel.emptyResponseCommands.has(command)) {
      return isEmpty(commandResponse) ? ResponseStatus.SUCCESS : ResponseStatus.FAILURE
    }
    const statusCheck = ChargingStationWorkerBroadcastChannel.acceptedStatusCommands.get(command)
    if (statusCheck != null) {
      return statusCheck(commandResponse) ? ResponseStatus.SUCCESS : ResponseStatus.FAILURE
    }
    switch (command) {
      case BroadcastChannelProcedureName.AUTHORIZE:
        switch (this.chargingStation.stationInfo?.ocppVersion) {
          case OCPPVersion.VERSION_16:
            if (
              (commandResponse as OCPP16AuthorizeResponse).idTagInfo.status ===
              AuthorizationStatus.ACCEPTED
            ) {
              return ResponseStatus.SUCCESS
            }
            return ResponseStatus.FAILURE
          case OCPPVersion.VERSION_20:
          case OCPPVersion.VERSION_201:
            if (
              (commandResponse as OCPP20AuthorizeResponse).idTokenInfo.status ===
              AuthorizationStatus.Accepted
            ) {
              return ResponseStatus.SUCCESS
            }
            return ResponseStatus.FAILURE
          default:
            return ResponseStatus.FAILURE
        }
      case BroadcastChannelProcedureName.START_TRANSACTION:
      case BroadcastChannelProcedureName.STOP_TRANSACTION:
        // OCPP 2.0.1 path returns a result with accepted boolean field
        if ('accepted' in commandResponse) {
          return (commandResponse as { accepted: boolean }).accepted
            ? ResponseStatus.SUCCESS
            : ResponseStatus.FAILURE
        }
        // OCPP 1.6 path returns StartTransactionResponse/StopTransactionResponse with idTagInfo
        if (
          (
            commandResponse as
              | OCPP16AuthorizeResponse
              | StartTransactionResponse
              | StopTransactionResponse
          ).idTagInfo?.status === AuthorizationStatus.ACCEPTED
        ) {
          return ResponseStatus.SUCCESS
        }
        return ResponseStatus.FAILURE
      case BroadcastChannelProcedureName.HEARTBEAT:
        return 'currentTime' in commandResponse ? ResponseStatus.SUCCESS : ResponseStatus.FAILURE
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

  private async handleBootNotification (
    requestPayload?: BroadcastChannelRequestPayload
  ): Promise<BootNotificationResponse> {
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
  }

  private async handleMeterValues (
    requestPayload?: BroadcastChannelRequestPayload
  ): Promise<MeterValuesResponse> {
    const payloadEvseId = (requestPayload as undefined | { evseId?: number })?.evseId
    const connectorId =
      requestPayload?.connectorId ??
      (payloadEvseId != null
        ? this.chargingStation.getConnectorIdByEvseId(payloadEvseId)
        : undefined)
    if (connectorId == null) {
      throw new BaseError(
        `${this.chargingStation.logPrefix()} ${moduleName}.handleMeterValues: Missing connectorId or evseId in request payload`
      )
    }
    const transactionId = this.chargingStation.getConnectorStatus(connectorId)?.transactionId
    const isOcpp2 =
      this.chargingStation.stationInfo?.ocppVersion === OCPPVersion.VERSION_20 ||
      this.chargingStation.stationInfo?.ocppVersion === OCPPVersion.VERSION_201
    const interval = isOcpp2
      ? OCPP20ServiceUtils.getAlignedDataInterval(this.chargingStation)
      : (() => {
          const key = getConfigurationKey(
            this.chargingStation,
            StandardParametersKey.MeterValueSampleInterval
          )
          return key != null
            ? secondsToMilliseconds(convertToInt(key.value))
            : Constants.DEFAULT_METER_VALUES_INTERVAL_MS
        })()
    return await this.chargingStation.ocppRequestService.requestHandler<
      MeterValuesRequest,
      MeterValuesResponse
    >(
      this.chargingStation,
      RequestCommand.METER_VALUES,
      {
        ...(isOcpp2
          ? {
              evseId: payloadEvseId ?? this.chargingStation.getEvseIdByConnectorId(connectorId),
            }
          : { connectorId }),
        meterValue: [buildMeterValue(this.chargingStation, transactionId, interval)],
        ...requestPayload,
      } as MeterValuesRequest,
      this.requestParams
    )
  }

  private async handleStartTransaction (
    requestPayload?: BroadcastChannelRequestPayload
  ): Promise<CommandResponse> {
    const connectorId = requestPayload?.connectorId
    if (connectorId == null) {
      throw new BaseError(
        `${this.chargingStation.logPrefix()} ${moduleName}.handleStartTransaction: 'connectorId' field is required`
      )
    }
    const idTag = (requestPayload as undefined | { idTag?: string })?.idTag
    switch (this.chargingStation.stationInfo?.ocppVersion) {
      case OCPPVersion.VERSION_16:
        return await this.chargingStation.ocppRequestService.requestHandler<
          Partial<StartTransactionRequest>,
          StartTransactionResponse
        >(
          this.chargingStation,
          RequestCommand.START_TRANSACTION,
          {
            connectorId,
            ...(idTag != null && { idTag }),
          },
          this.requestParams
        )
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201:
        return (await startTransactionOnConnector(
          this.chargingStation,
          connectorId,
          idTag
        )) as unknown as CommandResponse
      default:
        throw new BaseError(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `${this.chargingStation.logPrefix()} ${moduleName}.handleStartTransaction: unsupported OCPP version ${this.chargingStation.stationInfo?.ocppVersion}`
        )
    }
  }

  private async handleStopTransaction (
    requestPayload?: BroadcastChannelRequestPayload
  ): Promise<CommandResponse> {
    switch (this.chargingStation.stationInfo?.ocppVersion) {
      case OCPPVersion.VERSION_16:
        return await this.chargingStation.ocppRequestService.requestHandler<
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
          this.requestParams
        )
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201: {
        const connectorId = this.chargingStation.getConnectorIdByTransactionId(
          requestPayload?.transactionId
        )
        if (connectorId == null) {
          throw new BaseError(
            `${this.chargingStation.logPrefix()} ${moduleName}.handleStopTransaction: cannot resolve connector ID for transaction ${String(requestPayload?.transactionId)}`
          )
        }
        return (await stopTransactionOnConnector(
          this.chargingStation,
          connectorId
        )) as unknown as CommandResponse
      }
      default:
        throw new BaseError(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `${this.chargingStation.logPrefix()} ${moduleName}.handleStopTransaction: unsupported OCPP version ${this.chargingStation.stationInfo?.ocppVersion}`
        )
    }
  }

  private messageErrorHandler (messageEvent: MessageEvent): void {
    logger.error(
      `${this.chargingStation.logPrefix()} ${moduleName}.messageErrorHandler: Error at handling message:`,
      messageEvent
    )
  }

  private passthrough (command: RequestCommand): CommandHandler {
    return async (requestPayload?: BroadcastChannelRequestPayload): Promise<CommandResponse> => {
      const result = await this.chargingStation.ocppRequestService.requestHandler(
        this.chargingStation,
        command,
        requestPayload,
        this.requestParams
      )
      return result as CommandResponse
    }
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
      !requestPayload.hashIds.includes(this.chargingStation.stationInfo?.hashId ?? '')
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
          errorDetails: error instanceof OCPPError ? error.details : undefined,
          errorMessage: getErrorMessage(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          hashId: this.chargingStation.stationInfo?.hashId,
          requestPayload,
          status: ResponseStatus.FAILURE,
        } satisfies BroadcastChannelResponsePayload
        return undefined
      })
      .finally(() => {
        this.sendResponse([
          uuid,
          responsePayload ?? {
            command,
            hashId: this.chargingStation.stationInfo?.hashId,
            status: ResponseStatus.FAILURE,
          },
        ])
      })
  }
}
