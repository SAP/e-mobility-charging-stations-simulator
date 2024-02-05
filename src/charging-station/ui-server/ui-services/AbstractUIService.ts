import { BaseError, type OCPPError } from '../../../exception/index.js'
import {
  BroadcastChannelProcedureName,
  type BroadcastChannelRequestPayload,
  ConfigurationSection,
  type JsonType,
  ProcedureName,
  type ProtocolRequest,
  type ProtocolRequestHandler,
  type ProtocolResponse,
  type ProtocolVersion,
  type RequestPayload,
  type ResponsePayload,
  ResponseStatus,
  type StorageConfiguration
} from '../../../types/index.js'
import { Configuration, isAsyncFunction, isNotEmptyArray, logger } from '../../../utils/index.js'
import { Bootstrap } from '../../Bootstrap.js'
import { UIServiceWorkerBroadcastChannel } from '../../broadcast-channel/UIServiceWorkerBroadcastChannel.js'
import type { AbstractUIServer } from '../AbstractUIServer.js'

const moduleName = 'AbstractUIService'

export abstract class AbstractUIService {
  protected static readonly ProcedureNameToBroadCastChannelProcedureNameMapping = new Map<
  ProcedureName,
  BroadcastChannelProcedureName
  >([
    [ProcedureName.START_CHARGING_STATION, BroadcastChannelProcedureName.START_CHARGING_STATION],
    [ProcedureName.STOP_CHARGING_STATION, BroadcastChannelProcedureName.STOP_CHARGING_STATION],
    [ProcedureName.CLOSE_CONNECTION, BroadcastChannelProcedureName.CLOSE_CONNECTION],
    [ProcedureName.OPEN_CONNECTION, BroadcastChannelProcedureName.OPEN_CONNECTION],
    [
      ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
      BroadcastChannelProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR
    ],
    [
      ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
      BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR
    ],
    [ProcedureName.SET_SUPERVISION_URL, BroadcastChannelProcedureName.SET_SUPERVISION_URL],
    [ProcedureName.START_TRANSACTION, BroadcastChannelProcedureName.START_TRANSACTION],
    [ProcedureName.STOP_TRANSACTION, BroadcastChannelProcedureName.STOP_TRANSACTION],
    [ProcedureName.AUTHORIZE, BroadcastChannelProcedureName.AUTHORIZE],
    [ProcedureName.BOOT_NOTIFICATION, BroadcastChannelProcedureName.BOOT_NOTIFICATION],
    [ProcedureName.STATUS_NOTIFICATION, BroadcastChannelProcedureName.STATUS_NOTIFICATION],
    [ProcedureName.HEARTBEAT, BroadcastChannelProcedureName.HEARTBEAT],
    [ProcedureName.METER_VALUES, BroadcastChannelProcedureName.METER_VALUES],
    [ProcedureName.DATA_TRANSFER, BroadcastChannelProcedureName.DATA_TRANSFER],
    [
      ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION,
      BroadcastChannelProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION
    ],
    [
      ProcedureName.FIRMWARE_STATUS_NOTIFICATION,
      BroadcastChannelProcedureName.FIRMWARE_STATUS_NOTIFICATION
    ]
  ])

  protected readonly requestHandlers: Map<ProcedureName, ProtocolRequestHandler>
  private readonly version: ProtocolVersion
  private readonly uiServer: AbstractUIServer
  private readonly uiServiceWorkerBroadcastChannel: UIServiceWorkerBroadcastChannel
  private readonly broadcastChannelRequests: Map<string, number>

  constructor (uiServer: AbstractUIServer, version: ProtocolVersion) {
    this.uiServer = uiServer
    this.version = version
    this.requestHandlers = new Map<ProcedureName, ProtocolRequestHandler>([
      [ProcedureName.LIST_TEMPLATES, this.handleListTemplates.bind(this)],
      [ProcedureName.LIST_CHARGING_STATIONS, this.handleListChargingStations.bind(this)],
      [ProcedureName.ADD_CHARGING_STATIONS, this.handleAddChargingStations.bind(this)],
      [ProcedureName.PERFORMANCE_STATISTICS, this.handlePerformanceStatistics.bind(this)],
      [ProcedureName.START_SIMULATOR, this.handleStartSimulator.bind(this)],
      [ProcedureName.STOP_SIMULATOR, this.handleStopSimulator.bind(this)]
    ])
    this.uiServiceWorkerBroadcastChannel = new UIServiceWorkerBroadcastChannel(this)
    this.broadcastChannelRequests = new Map<string, number>()
  }

  public async requestHandler (request: ProtocolRequest): Promise<ProtocolResponse | undefined> {
    let messageId: string | undefined
    let command: ProcedureName | undefined
    let requestPayload: RequestPayload | undefined
    let responsePayload: ResponsePayload | undefined
    try {
      [messageId, command, requestPayload] = request

      if (!this.requestHandlers.has(command)) {
        throw new BaseError(
          `${command} is not implemented to handle message payload ${JSON.stringify(
            requestPayload,
            undefined,
            2
          )}`
        )
      }

      // Call the request handler to build the response payload
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const requestHandler = this.requestHandlers.get(command)!
      if (isAsyncFunction(requestHandler)) {
        responsePayload = await requestHandler(messageId, command, requestPayload)
      } else {
        responsePayload = (
          requestHandler as (
            uuid?: string,
            procedureName?: ProcedureName,
            payload?: RequestPayload
          ) => undefined | ResponsePayload
        )(messageId, command, requestPayload)
      }
    } catch (error) {
      // Log
      logger.error(`${this.logPrefix(moduleName, 'requestHandler')} Handle request error:`, error)
      responsePayload = {
        hashIds: requestPayload?.hashIds,
        status: ResponseStatus.FAILURE,
        command,
        requestPayload,
        responsePayload,
        errorMessage: (error as OCPPError).message,
        errorStack: (error as OCPPError).stack,
        errorDetails: (error as OCPPError).details
      } satisfies ResponsePayload
    }
    if (responsePayload != null) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.uiServer.buildProtocolResponse(messageId!, responsePayload)
    }
  }

  // public sendRequest (
  //   messageId: string,
  //   procedureName: ProcedureName,
  //   requestPayload: RequestPayload
  // ): void {
  //   this.uiServer.sendRequest(
  //     this.uiServer.buildProtocolRequest(messageId, procedureName, requestPayload)
  //   )
  // }

  public sendResponse (messageId: string, responsePayload: ResponsePayload): void {
    if (this.uiServer.hasResponseHandler(messageId)) {
      this.uiServer.sendResponse(this.uiServer.buildProtocolResponse(messageId, responsePayload))
    }
  }

  public logPrefix = (modName: string, methodName: string): string => {
    return this.uiServer.logPrefix(modName, methodName, this.version)
  }

  public deleteBroadcastChannelRequest (uuid: string): void {
    this.broadcastChannelRequests.delete(uuid)
  }

  public getBroadcastChannelExpectedResponses (uuid: string): number {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.broadcastChannelRequests.get(uuid)!
  }

  protected handleProtocolRequest (
    uuid: string,
    procedureName: ProcedureName,
    payload: RequestPayload
  ): void {
    this.sendBroadcastChannelRequest(
      uuid,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      AbstractUIService.ProcedureNameToBroadCastChannelProcedureNameMapping.get(procedureName)!,
      payload
    )
  }

  private sendBroadcastChannelRequest (
    uuid: string,
    procedureName: BroadcastChannelProcedureName,
    payload: BroadcastChannelRequestPayload
  ): void {
    if (isNotEmptyArray(payload.hashIds)) {
      payload.hashIds = payload.hashIds
        .map(hashId => {
          if (this.uiServer.chargingStations.has(hashId)) {
            return hashId
          }
          logger.warn(
            `${this.logPrefix(
              moduleName,
              'sendBroadcastChannelRequest'
            )} Charging station with hashId '${hashId}' not found`
          )
          return undefined
        })
        .filter(hashId => hashId != null) as string[]
    } else {
      delete payload.hashIds
    }
    const expectedNumberOfResponses = Array.isArray(payload.hashIds)
      ? payload.hashIds.length
      : this.uiServer.chargingStations.size
    if (expectedNumberOfResponses === 0) {
      throw new BaseError(
        'hashIds array in the request payload does not contain any valid charging station hashId'
      )
    }
    this.uiServiceWorkerBroadcastChannel.sendRequest([uuid, procedureName, payload])
    this.broadcastChannelRequests.set(uuid, expectedNumberOfResponses)
  }

  private handleListTemplates (): ResponsePayload {
    return {
      status: ResponseStatus.SUCCESS,
      templates: [...this.uiServer.chargingStationTemplates.values()] as JsonType[]
    } satisfies ResponsePayload
  }

  private handleListChargingStations (): ResponsePayload {
    return {
      status: ResponseStatus.SUCCESS,
      chargingStations: [...this.uiServer.chargingStations.values()] as JsonType[]
    } satisfies ResponsePayload
  }

  private async handleAddChargingStations (
    messageId?: string,
    procedureName?: ProcedureName,
    requestPayload?: RequestPayload
  ): Promise<ResponsePayload> {
    const { template, numberOfStations } = requestPayload as {
      template: string
      numberOfStations: number
    }
    if (!this.uiServer.chargingStationTemplates.has(template)) {
      return {
        status: ResponseStatus.FAILURE,
        errorMessage: `Template '${template}' not found`
      } satisfies ResponsePayload
    }
    for (let i = 0; i < numberOfStations; i++) {
      try {
        await Bootstrap.getInstance().addChargingStation(
          Bootstrap.getInstance().getLastIndex(template) + 1,
          `${template}.json`
        )
      } catch (error) {
        return {
          status: ResponseStatus.FAILURE,
          errorMessage: (error as Error).message,
          errorStack: (error as Error).stack
        } satisfies ResponsePayload
      }
    }
    return {
      status: ResponseStatus.SUCCESS
    }
  }

  private handlePerformanceStatistics (): ResponsePayload {
    if (
      Configuration.getConfigurationSection<StorageConfiguration>(
        ConfigurationSection.performanceStorage
      ).enabled !== true
    ) {
      return {
        status: ResponseStatus.FAILURE,
        errorMessage: 'Performance statistics storage is not enabled'
      } satisfies ResponsePayload
    }
    try {
      return {
        status: ResponseStatus.SUCCESS,
        performanceStatistics: [
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...Bootstrap.getInstance().getPerformanceStatistics()!
        ] as JsonType[]
      }
    } catch (error) {
      return {
        status: ResponseStatus.FAILURE,
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack
      } satisfies ResponsePayload
    }
  }

  private async handleStartSimulator (): Promise<ResponsePayload> {
    try {
      await Bootstrap.getInstance().start()
      return { status: ResponseStatus.SUCCESS }
    } catch (error) {
      return {
        status: ResponseStatus.FAILURE,
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack
      } satisfies ResponsePayload
    }
  }

  private async handleStopSimulator (): Promise<ResponsePayload> {
    try {
      await Bootstrap.getInstance().stop()
      return { status: ResponseStatus.SUCCESS }
    } catch (error) {
      return {
        status: ResponseStatus.FAILURE,
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack
      } satisfies ResponsePayload
    }
  }
}
