import type { AbstractUIServer } from '../AbstractUIServer.js'

import { BaseError, type OCPPError } from '../../../exception/index.js'
import {
  BroadcastChannelProcedureName,
  type BroadcastChannelRequestPayload,
  type ChargingStationInfo,
  type ChargingStationOptions,
  ConfigurationSection,
  type JsonObject,
  type JsonType,
  ProcedureName,
  type ProtocolRequest,
  type ProtocolRequestHandler,
  type ProtocolResponse,
  type ProtocolVersion,
  type RequestPayload,
  type ResponsePayload,
  ResponseStatus,
  type StorageConfiguration,
} from '../../../types/index.js'
import { Configuration, isAsyncFunction, isNotEmptyArray, logger } from '../../../utils/index.js'
import { Bootstrap } from '../../Bootstrap.js'
import { UIServiceWorkerBroadcastChannel } from '../../broadcast-channel/UIServiceWorkerBroadcastChannel.js'

const moduleName = 'AbstractUIService'

interface AddChargingStationsRequestPayload extends RequestPayload {
  numberOfStations: number
  options?: ChargingStationOptions
  template: string
}

export abstract class AbstractUIService {
  protected static readonly ProcedureNameToBroadCastChannelProcedureNameMapping = new Map<
    ProcedureName,
    BroadcastChannelProcedureName
  >([
    [ProcedureName.AUTHORIZE, BroadcastChannelProcedureName.AUTHORIZE],
    [ProcedureName.BOOT_NOTIFICATION, BroadcastChannelProcedureName.BOOT_NOTIFICATION],
    [ProcedureName.CLOSE_CONNECTION, BroadcastChannelProcedureName.CLOSE_CONNECTION],
    [ProcedureName.DATA_TRANSFER, BroadcastChannelProcedureName.DATA_TRANSFER],
    [
      ProcedureName.DELETE_CHARGING_STATIONS,
      BroadcastChannelProcedureName.DELETE_CHARGING_STATIONS,
    ],
    [
      ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION,
      BroadcastChannelProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION,
    ],
    [
      ProcedureName.FIRMWARE_STATUS_NOTIFICATION,
      BroadcastChannelProcedureName.FIRMWARE_STATUS_NOTIFICATION,
    ],
    [ProcedureName.HEARTBEAT, BroadcastChannelProcedureName.HEARTBEAT],
    [ProcedureName.METER_VALUES, BroadcastChannelProcedureName.METER_VALUES],
    [ProcedureName.OPEN_CONNECTION, BroadcastChannelProcedureName.OPEN_CONNECTION],
    [ProcedureName.SET_SUPERVISION_URL, BroadcastChannelProcedureName.SET_SUPERVISION_URL],
    [
      ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
      BroadcastChannelProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
    ],
    [ProcedureName.START_CHARGING_STATION, BroadcastChannelProcedureName.START_CHARGING_STATION],
    [ProcedureName.START_TRANSACTION, BroadcastChannelProcedureName.START_TRANSACTION],
    [ProcedureName.STATUS_NOTIFICATION, BroadcastChannelProcedureName.STATUS_NOTIFICATION],
    [
      ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
      BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
    ],
    [ProcedureName.STOP_CHARGING_STATION, BroadcastChannelProcedureName.STOP_CHARGING_STATION],
    [ProcedureName.STOP_TRANSACTION, BroadcastChannelProcedureName.STOP_TRANSACTION],
  ])

  protected readonly requestHandlers: Map<ProcedureName, ProtocolRequestHandler>
  private readonly broadcastChannelRequests: Map<
    `${string}-${string}-${string}-${string}-${string}`,
    number
  >

  private readonly uiServer: AbstractUIServer
  private readonly uiServiceWorkerBroadcastChannel: UIServiceWorkerBroadcastChannel
  private readonly version: ProtocolVersion

  constructor (uiServer: AbstractUIServer, version: ProtocolVersion) {
    this.uiServer = uiServer
    this.version = version
    this.requestHandlers = new Map<ProcedureName, ProtocolRequestHandler>([
      [ProcedureName.ADD_CHARGING_STATIONS, this.handleAddChargingStations.bind(this)],
      [ProcedureName.LIST_CHARGING_STATIONS, this.handleListChargingStations.bind(this)],
      [ProcedureName.LIST_TEMPLATES, this.handleListTemplates.bind(this)],
      [ProcedureName.PERFORMANCE_STATISTICS, this.handlePerformanceStatistics.bind(this)],
      [ProcedureName.SIMULATOR_STATE, this.handleSimulatorState.bind(this)],
      [ProcedureName.START_SIMULATOR, this.handleStartSimulator.bind(this)],
      [ProcedureName.STOP_SIMULATOR, this.handleStopSimulator.bind(this)],
    ])
    this.uiServiceWorkerBroadcastChannel = new UIServiceWorkerBroadcastChannel(this)
    this.broadcastChannelRequests = new Map<
      `${string}-${string}-${string}-${string}-${string}`,
      number
    >()
  }

  public deleteBroadcastChannelRequest (
    uuid: `${string}-${string}-${string}-${string}-${string}`
  ): void {
    this.broadcastChannelRequests.delete(uuid)
  }

  public getBroadcastChannelExpectedResponses (
    uuid: `${string}-${string}-${string}-${string}-${string}`
  ): number {
    return this.broadcastChannelRequests.get(uuid) ?? 0
  }

  public logPrefix = (modName: string, methodName: string): string => {
    return this.uiServer.logPrefix(modName, methodName, this.version)
  }

  public async requestHandler (request: ProtocolRequest): Promise<ProtocolResponse | undefined> {
    let uuid: `${string}-${string}-${string}-${string}-${string}` | undefined
    let command: ProcedureName | undefined
    let requestPayload: RequestPayload | undefined
    let responsePayload: ResponsePayload | undefined
    try {
      ;[uuid, command, requestPayload] = request

      if (!this.requestHandlers.has(command)) {
        throw new BaseError(
          `'${command}' is not implemented to handle message payload ${JSON.stringify(
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
        responsePayload = await requestHandler(uuid, command, requestPayload)
      } else {
        responsePayload = (
          requestHandler as (
            uuid?: string,
            procedureName?: ProcedureName,
            payload?: RequestPayload
          ) => ResponsePayload | undefined
        )(uuid, command, requestPayload)
      }
    } catch (error) {
      // Log
      logger.error(`${this.logPrefix(moduleName, 'requestHandler')} Handle request error:`, error)
      responsePayload = {
        command,
        errorDetails: (error as OCPPError).details,
        errorMessage: (error as OCPPError).message,
        errorStack: (error as OCPPError).stack,
        hashIds: requestPayload?.hashIds,
        requestPayload,
        responsePayload,
        status: ResponseStatus.FAILURE,
      } satisfies ResponsePayload
    }
    if (responsePayload != null) {
      if (uuid != null) {
        return this.uiServer.buildProtocolResponse(uuid, responsePayload)
      }
      logger.warn(
        `${this.logPrefix(moduleName, 'requestHandler')} UUID is not defined in the request:`,
        request
      )
      return undefined
    }
  }

  // public sendRequest (
  //   uuid: `${string}-${string}-${string}-${string}-${string}`,
  //   procedureName: ProcedureName,
  //   requestPayload: RequestPayload
  // ): void {
  //   this.uiServer.sendRequest(
  //     this.uiServer.buildProtocolRequest(uuid, procedureName, requestPayload)
  //   )
  // }

  public sendResponse (
    uuid: `${string}-${string}-${string}-${string}-${string}`,
    responsePayload: ResponsePayload
  ): void {
    if (this.uiServer.hasResponseHandler(uuid)) {
      this.uiServer.sendResponse(this.uiServer.buildProtocolResponse(uuid, responsePayload))
    } else {
      logger.warn(`${this.logPrefix(moduleName, 'sendResponse')} Response handler not found:`, {
        responsePayload,
        uuid,
      })
    }
  }

  public stop (): void {
    this.broadcastChannelRequests.clear()
    this.uiServiceWorkerBroadcastChannel.close()
  }

  protected handleProtocolRequest (
    uuid: `${string}-${string}-${string}-${string}-${string}`,
    procedureName: ProcedureName,
    payload: RequestPayload
  ): void {
    const broadCastChannelProcedureName =
      AbstractUIService.ProcedureNameToBroadCastChannelProcedureNameMapping.get(procedureName)
    if (broadCastChannelProcedureName == null) {
      throw new BaseError(`No broadcast channel mapping for procedure '${procedureName}'`)
    }
    this.sendBroadcastChannelRequest(uuid, broadCastChannelProcedureName, payload)
  }

  private async handleAddChargingStations (
    _uuid?: `${string}-${string}-${string}-${string}-${string}`,
    _procedureName?: ProcedureName,
    requestPayload?: RequestPayload
  ): Promise<ResponsePayload> {
    const { numberOfStations, options, template } =
      requestPayload as AddChargingStationsRequestPayload
    if (!Bootstrap.getInstance().getState().started) {
      return {
        errorMessage:
          'Cannot add charging station(s) while the charging stations simulator is not started',
        status: ResponseStatus.FAILURE,
      } satisfies ResponsePayload
    }
    if (
      typeof template !== 'string' ||
      typeof numberOfStations !== 'number' ||
      !Number.isInteger(numberOfStations) ||
      numberOfStations <= 0
    ) {
      return {
        errorMessage: 'Invalid request payload',
        status: ResponseStatus.FAILURE,
      } satisfies ResponsePayload
    }
    if (!this.uiServer.chargingStationTemplates.has(template)) {
      return {
        errorMessage: `Template '${template}' not found`,
        status: ResponseStatus.FAILURE,
      } satisfies ResponsePayload
    }
    const succeededStationInfos: ChargingStationInfo[] = []
    const failedStationInfos: ChargingStationInfo[] = []
    let err: Error | undefined
    for (let i = 0; i < numberOfStations; i++) {
      let stationInfo: ChargingStationInfo | undefined
      try {
        stationInfo = await Bootstrap.getInstance().addChargingStation(
          Bootstrap.getInstance().getLastContiguousIndex(template) + 1,
          `${template}.json`,
          options
        )
        if (stationInfo != null) {
          succeededStationInfos.push(stationInfo)
        }
      } catch (error) {
        err = error as Error
        if (stationInfo != null) {
          failedStationInfos.push(stationInfo)
        }
      }
    }
    return {
      status: err != null ? ResponseStatus.FAILURE : ResponseStatus.SUCCESS,
      ...(succeededStationInfos.length > 0 && {
        hashIdsSucceeded: succeededStationInfos.map(stationInfo => stationInfo.hashId),
      }),
      ...(failedStationInfos.length > 0 && {
        hashIdsFailed: failedStationInfos.map(stationInfo => stationInfo.hashId),
      }),
      ...(err != null && { errorMessage: err.message, errorStack: err.stack }),
    } satisfies ResponsePayload
  }

  private handleListChargingStations (): ResponsePayload {
    return {
      chargingStations: this.uiServer.listChargingStationData() as JsonType[],
      status: ResponseStatus.SUCCESS,
    } satisfies ResponsePayload
  }

  private handleListTemplates (): ResponsePayload {
    return {
      status: ResponseStatus.SUCCESS,
      templates: [...this.uiServer.chargingStationTemplates.values()],
    } satisfies ResponsePayload
  }

  private handlePerformanceStatistics (): ResponsePayload {
    if (
      Configuration.getConfigurationSection<StorageConfiguration>(
        ConfigurationSection.performanceStorage
      ).enabled !== true
    ) {
      return {
        errorMessage: 'Performance statistics storage is not enabled',
        status: ResponseStatus.FAILURE,
      } satisfies ResponsePayload
    }
    try {
      return {
        performanceStatistics: [
          ...(Bootstrap.getInstance().getPerformanceStatistics() ?? []),
        ] as JsonType[],
        status: ResponseStatus.SUCCESS,
      } satisfies ResponsePayload
    } catch (error) {
      return {
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack,
        status: ResponseStatus.FAILURE,
      } satisfies ResponsePayload
    }
  }

  private handleSimulatorState (): ResponsePayload {
    try {
      return {
        state: Bootstrap.getInstance().getState() as unknown as JsonObject,
        status: ResponseStatus.SUCCESS,
      } satisfies ResponsePayload
    } catch (error) {
      return {
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack,
        status: ResponseStatus.FAILURE,
      } satisfies ResponsePayload
    }
  }

  private async handleStartSimulator (): Promise<ResponsePayload> {
    try {
      await Bootstrap.getInstance().start()
      return { status: ResponseStatus.SUCCESS }
    } catch (error) {
      return {
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack,
        status: ResponseStatus.FAILURE,
      } satisfies ResponsePayload
    }
  }

  private async handleStopSimulator (): Promise<ResponsePayload> {
    try {
      await Bootstrap.getInstance().stop()
      return { status: ResponseStatus.SUCCESS }
    } catch (error) {
      return {
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack,
        status: ResponseStatus.FAILURE,
      } satisfies ResponsePayload
    }
  }

  private sendBroadcastChannelRequest (
    uuid: `${string}-${string}-${string}-${string}-${string}`,
    procedureName: BroadcastChannelProcedureName,
    payload: BroadcastChannelRequestPayload
  ): void {
    if (isNotEmptyArray(payload.hashIds)) {
      payload.hashIds = payload.hashIds
        .map(hashId => {
          if (this.uiServer.hasChargingStationData(hashId)) {
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
        .filter((hashId): hashId is string => hashId != null)
    } else {
      delete payload.hashIds
    }
    const expectedNumberOfResponses = Array.isArray(payload.hashIds)
      ? payload.hashIds.length
      : this.uiServer.getChargingStationsCount()
    if (expectedNumberOfResponses === 0) {
      throw new BaseError(
        'hashIds array in the request payload does not contain any valid charging station hashId'
      )
    }
    this.uiServiceWorkerBroadcastChannel.sendRequest([uuid, procedureName, payload])
    this.broadcastChannelRequests.set(uuid, expectedNumberOfResponses)
  }
}
