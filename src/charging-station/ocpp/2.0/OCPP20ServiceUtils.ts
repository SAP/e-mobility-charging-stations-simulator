import { secondsToMilliseconds } from 'date-fns'

import { type ChargingStation, resetConnectorStatus } from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  type ConnectorStatus,
  ConnectorStatusEnum,
  ErrorType,
  OCPP20ChargingStateEnumType,
  OCPP20ComponentName,
  type OCPP20EVSEType,
  OCPP20IncomingRequestCommand,
  OCPP20MeasurandEnumType,
  type OCPP20MeterValue,
  OCPP20OptionalVariableName,
  OCPP20ReadingContextEnumType,
  OCPP20ReasonEnumType,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  type OCPP20StatusNotificationRequest,
  OCPP20TransactionEventEnumType,
  type OCPP20TransactionEventOptions,
  type OCPP20TransactionEventRequest,
  type OCPP20TransactionEventResponse,
  type OCPP20TransactionType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
  ReasonCodeEnumType,
  type UUIDv4,
} from '../../../types/index.js'
import {
  clampToSafeTimerValue,
  Constants,
  convertToBoolean,
  convertToInt,
  convertToIntOrNaN,
  formatDurationMilliSeconds,
  generateUUID,
  logger,
  validateIdentifierString,
} from '../../../utils/index.js'
import { buildConfigKey, getConfigurationKey } from '../../ConfigurationKeyUtils.js'
import {
  buildMeterValue,
  OCPPServiceUtils,
  sendAndSetConnectorStatus,
} from '../OCPPServiceUtils.js'
import { OCPP20VariableManager } from './OCPP20VariableManager.js'

const moduleName = 'OCPP20ServiceUtils'

export interface RejectionReason {
  additionalInfo: string
  reasonCode: ReasonCodeEnumType
}

export class OCPP20ServiceUtils extends OCPPServiceUtils {
  private static readonly incomingRequestSchemaNames: readonly [
    OCPP20IncomingRequestCommand,
    string
  ][] = [
      [OCPP20IncomingRequestCommand.CERTIFICATE_SIGNED, 'CertificateSigned'],
      [OCPP20IncomingRequestCommand.CHANGE_AVAILABILITY, 'ChangeAvailability'],
      [OCPP20IncomingRequestCommand.CLEAR_CACHE, 'ClearCache'],
      [OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION, 'CustomerInformation'],
      [OCPP20IncomingRequestCommand.DATA_TRANSFER, 'DataTransfer'],
      [OCPP20IncomingRequestCommand.DELETE_CERTIFICATE, 'DeleteCertificate'],
      [OCPP20IncomingRequestCommand.GET_BASE_REPORT, 'GetBaseReport'],
      [OCPP20IncomingRequestCommand.GET_INSTALLED_CERTIFICATE_IDS, 'GetInstalledCertificateIds'],
      [OCPP20IncomingRequestCommand.GET_LOG, 'GetLog'],
      [OCPP20IncomingRequestCommand.GET_TRANSACTION_STATUS, 'GetTransactionStatus'],
      [OCPP20IncomingRequestCommand.GET_VARIABLES, 'GetVariables'],
      [OCPP20IncomingRequestCommand.INSTALL_CERTIFICATE, 'InstallCertificate'],
      [OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION, 'RequestStartTransaction'],
      [OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION, 'RequestStopTransaction'],
      [OCPP20IncomingRequestCommand.RESET, 'Reset'],
      [OCPP20IncomingRequestCommand.SET_NETWORK_PROFILE, 'SetNetworkProfile'],
      [OCPP20IncomingRequestCommand.SET_VARIABLES, 'SetVariables'],
      [OCPP20IncomingRequestCommand.TRIGGER_MESSAGE, 'TriggerMessage'],
      [OCPP20IncomingRequestCommand.UNLOCK_CONNECTOR, 'UnlockConnector'],
      [OCPP20IncomingRequestCommand.UPDATE_FIRMWARE, 'UpdateFirmware'],
    ]

  private static readonly outgoingRequestSchemaNames: readonly [OCPP20RequestCommand, string][] = [
    [OCPP20RequestCommand.AUTHORIZE, 'Authorize'],
    [OCPP20RequestCommand.BOOT_NOTIFICATION, 'BootNotification'],
    [OCPP20RequestCommand.DATA_TRANSFER, 'DataTransfer'],
    [OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION, 'FirmwareStatusNotification'],
    [OCPP20RequestCommand.GET_15118_EV_CERTIFICATE, 'Get15118EVCertificate'],
    [OCPP20RequestCommand.GET_CERTIFICATE_STATUS, 'GetCertificateStatus'],
    [OCPP20RequestCommand.HEARTBEAT, 'Heartbeat'],
    [OCPP20RequestCommand.LOG_STATUS_NOTIFICATION, 'LogStatusNotification'],
    [OCPP20RequestCommand.METER_VALUES, 'MeterValues'],
    [OCPP20RequestCommand.NOTIFY_CUSTOMER_INFORMATION, 'NotifyCustomerInformation'],
    [OCPP20RequestCommand.NOTIFY_REPORT, 'NotifyReport'],
    [OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION, 'SecurityEventNotification'],
    [OCPP20RequestCommand.SIGN_CERTIFICATE, 'SignCertificate'],
    [OCPP20RequestCommand.STATUS_NOTIFICATION, 'StatusNotification'],
    [OCPP20RequestCommand.TRANSACTION_EVENT, 'TransactionEvent'],
  ]

  static buildTransactionStartedMeterValues (connectorStatus: ConnectorStatus): OCPP20MeterValue[] {
    return OCPP20ServiceUtils.buildEnergyMeterValues(
      connectorStatus,
      OCPP20ReadingContextEnumType.TRANSACTION_BEGIN
    )
  }

  public static async cleanupEndedTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus
  ): Promise<void> {
    OCPP20ServiceUtils.stopPeriodicMeterValues(chargingStation, connectorId)
    resetConnectorStatus(connectorStatus)
    connectorStatus.locked = false
    await sendAndSetConnectorStatus(chargingStation, {
      connectorId,
      connectorStatus: ConnectorStatusEnum.Available,
    } as unknown as OCPP20StatusNotificationRequest)
  }

  /**
   * OCPP 2.0 Incoming Request Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestPayloadConfigs = (): [
    OCPP20IncomingRequestCommand,
    { schemaPath: string }
  ][] =>
    OCPP20ServiceUtils.incomingRequestSchemaNames.map(([command, schemaBase]) => [
      command,
      OCPP20ServiceUtils.PayloadValidatorConfig(`${schemaBase}Request.json`),
    ])

  /**
   * Configuration for OCPP 2.0 Incoming Request Response validators
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestResponsePayloadConfigs = (): [
    OCPP20IncomingRequestCommand,
    { schemaPath: string }
  ][] =>
    OCPP20ServiceUtils.incomingRequestSchemaNames.map(([command, schemaBase]) => [
      command,
      OCPP20ServiceUtils.PayloadValidatorConfig(`${schemaBase}Response.json`),
    ])

  /**
   * Factory options for OCPP 2.0 payload validators
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0 validators
   */
  public static createPayloadOptions = (moduleName: string, methodName: string) =>
    OCPP20ServiceUtils.PayloadValidatorOptions(
      OCPPVersion.VERSION_201,
      'assets/json-schemas/ocpp/2.0',
      moduleName,
      methodName
    )

  /**
   * OCPP 2.0 Request Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createRequestPayloadConfigs = (): [
    OCPP20RequestCommand,
    { schemaPath: string }
  ][] =>
    OCPP20ServiceUtils.outgoingRequestSchemaNames.map(([command, schemaBase]) => [
      command,
      OCPP20ServiceUtils.PayloadValidatorConfig(`${schemaBase}Request.json`),
    ])

  /**
   * OCPP 2.0 Response Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createResponsePayloadConfigs = (): [
    OCPP20RequestCommand,
    { schemaPath: string }
  ][] =>
    OCPP20ServiceUtils.outgoingRequestSchemaNames.map(([command, schemaBase]) => [
      command,
      OCPP20ServiceUtils.PayloadValidatorConfig(`${schemaBase}Response.json`),
    ])

  public static enforceMessageLimits<
    T extends { attributeType?: unknown; component: unknown; variable: unknown },
    R
  >(
    chargingStation: { logPrefix: () => string },
    moduleName: string,
    context: string,
    data: T[],
    itemsLimit: number,
    bytesLimit: number,
    buildRejected: (item: T, reason: RejectionReason) => R,
    logger: { debug: (...args: unknown[]) => void }
  ): { rejected: boolean; results: R[] } {
    if (itemsLimit > 0 && data.length > itemsLimit) {
      const results = data.map(d =>
        buildRejected(d, {
          additionalInfo: `ItemsPerMessage limit ${itemsLimit.toString()} exceeded (${data.length.toString()} requested)`,
          reasonCode: ReasonCodeEnumType.TooManyElements,
        })
      )
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.${context}: Rejected all variables due to ItemsPerMessage limit (${itemsLimit.toString()})`
      )
      return { rejected: true, results }
    }
    if (bytesLimit > 0) {
      const estimatedSize = Buffer.byteLength(JSON.stringify(data), 'utf8')
      if (estimatedSize > bytesLimit) {
        const results = data.map(d =>
          buildRejected(d, {
            additionalInfo: `BytesPerMessage limit ${bytesLimit.toString()} exceeded (estimated ${estimatedSize.toString()} bytes)`,
            reasonCode: ReasonCodeEnumType.TooLargeElement,
          })
        )
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.${context}: Rejected all variables due to BytesPerMessage limit (${bytesLimit.toString()})`
        )
        return { rejected: true, results }
      }
    }
    return { rejected: false, results: [] }
  }

  public static enforcePostCalculationBytesLimit<
    T extends { attributeType?: unknown; component: unknown; variable: unknown },
    R
  >(
    chargingStation: { logPrefix: () => string },
    moduleName: string,
    context: string,
    originalData: T[],
    currentResults: R[],
    bytesLimit: number,
    buildRejected: (item: T, reason: RejectionReason) => R,
    logger: { debug: (...args: unknown[]) => void }
  ): R[] {
    if (bytesLimit > 0) {
      try {
        const actualSize = Buffer.byteLength(JSON.stringify(currentResults), 'utf8')
        if (actualSize > bytesLimit) {
          const results = originalData.map(d =>
            buildRejected(d, {
              additionalInfo: `BytesPerMessage limit ${bytesLimit.toString()} exceeded (actual ${actualSize.toString()} bytes)`,
              reasonCode: ReasonCodeEnumType.TooLargeElement,
            })
          )
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.${context}: Rejected all variables due to BytesPerMessage limit post calculation (${bytesLimit.toString()})`
          )
          return results
        }
      } catch (error) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.${context}: BytesPerMessage limit calculation failed`,
          error
        )
      }
    }
    return currentResults
  }

  public static getAlignedDataInterval (chargingStation: ChargingStation): number {
    return OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20RequiredVariableName.AlignedDataInterval,
      900
    )
  }

  public static getTxUpdatedInterval (chargingStation: ChargingStation): number {
    return OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.SampledDataCtrlr,
      OCPP20RequiredVariableName.TxUpdatedInterval,
      Constants.DEFAULT_TX_UPDATED_INTERVAL
    )
  }

  /**
   * Read ItemsPerMessage and BytesPerMessage configuration limits
   * Extracts configuration-reading logic shared between handleRequestGetVariables
   * and handleRequestSetVariables to eliminate DRY violations.
   * @param chargingStation - The charging station instance
   * @returns Object with itemsLimit and bytesLimit (both fallback to 0 if not configured or invalid)
   */
  public static readMessageLimits (chargingStation: ChargingStation): {
    bytesLimit: number
    itemsLimit: number
  } {
    let itemsLimit = 0
    let bytesLimit = 0
    try {
      const itemsCfg = getConfigurationKey(
        chargingStation,
        buildConfigKey(
          OCPP20ComponentName.DeviceDataCtrlr,
          OCPP20RequiredVariableName.ItemsPerMessage
        )
      )?.value
      const bytesCfg = getConfigurationKey(
        chargingStation,
        buildConfigKey(
          OCPP20ComponentName.DeviceDataCtrlr,
          OCPP20RequiredVariableName.BytesPerMessage
        )
      )?.value
      if (itemsCfg && /^\d+$/.test(itemsCfg)) {
        itemsLimit = convertToIntOrNaN(itemsCfg)
      }
      if (bytesCfg && /^\d+$/.test(bytesCfg)) {
        bytesLimit = convertToIntOrNaN(bytesCfg)
      }
    } catch (error) {
      logger.debug(
        `${chargingStation.logPrefix()} readMessageLimits: error reading message limits:`,
        error
      )
    }
    return { bytesLimit, itemsLimit }
  }

  public static async requestDeauthorizeTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): Promise<OCPP20TransactionEventResponse> {
    const { connectorStatus, transactionId } = OCPP20ServiceUtils.resolveActiveTransaction(
      chargingStation,
      connectorId
    )

    const stopTxOnInvalidId = OCPP20ServiceUtils.readVariableAsBoolean(
      chargingStation,
      OCPP20ComponentName.TxCtrlr,
      OCPP20RequiredVariableName.StopTxOnInvalidId,
      true
    )

    if (!stopTxOnInvalidId) {
      await this.sendTransactionEvent(
        chargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.Deauthorized,
        connectorId,
        transactionId,
        { evseId }
      )
      return { idTokenInfo: undefined }
    }

    const maxEnergyOnInvalidId = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.TxCtrlr,
      OCPP20OptionalVariableName.MaxEnergyOnInvalidId,
      0
    )

    if (maxEnergyOnInvalidId > 0) {
      // E05.FR.03: continue charging up to MaxEnergyOnInvalidId Wh before terminating
      connectorStatus.transactionDeauthorized = true
      connectorStatus.transactionDeauthorizedEnergyWh =
        connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0

      await this.sendTransactionEvent(
        chargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.Deauthorized,
        connectorId,
        transactionId,
        { evseId }
      )

      return { idTokenInfo: undefined }
    }

    await this.sendTransactionEvent(
      chargingStation,
      OCPP20TransactionEventEnumType.Updated,
      OCPP20TriggerReasonEnumType.Deauthorized,
      connectorId,
      transactionId,
      {
        chargingState: OCPP20ChargingStateEnumType.SuspendedEVSE,
        evseId,
      }
    )

    return this.terminateTransaction(
      chargingStation,
      connectorId,
      connectorStatus,
      transactionId,
      OCPP20TriggerReasonEnumType.Deauthorized,
      OCPP20ReasonEnumType.DeAuthorized,
      evseId
    )
  }

  public static async requestStopTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number,
    triggerReason: OCPP20TriggerReasonEnumType = OCPP20TriggerReasonEnumType.RemoteStop,
    stoppedReason: OCPP20ReasonEnumType = OCPP20ReasonEnumType.Remote
  ): Promise<OCPP20TransactionEventResponse> {
    const { connectorStatus, transactionId } = OCPP20ServiceUtils.resolveActiveTransaction(
      chargingStation,
      connectorId
    )

    return this.terminateTransaction(
      chargingStation,
      connectorId,
      connectorStatus,
      transactionId,
      triggerReason,
      stoppedReason,
      evseId
    )
  }

  /**
   * Resets all TransactionEvent-related state for a connector when starting a new transaction.
   * According to OCPP 2.0.1 Section 1.3.2.1, sequence numbers should start at 0 for new transactions.
   * This also resets the EVSE and IdToken sent flags per E01.FR.16 and E03.FR.01.
   * @param chargingStation - The charging station instance
   * @param connectorId - The connector ID for which to reset the transaction state
   */
  public static resetTransactionSequenceNumber (
    chargingStation: ChargingStation,
    connectorId: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus != null) {
      connectorStatus.transactionSeqNo = undefined // Reset to undefined, will be set to 0 on first use
      connectorStatus.transactionEvseSent = undefined // E01.FR.16: EVSE must be sent in first event of new transaction
      connectorStatus.transactionIdTokenSent = undefined // E03.FR.01: IdToken must be sent in first event after authorization
      logger.debug(
        `${chargingStation.logPrefix()} OCPP20ServiceUtils.resetTransactionSequenceNumber: Reset transaction state for connector ${connectorId.toString()}`
      )
    }
  }

  public static async sendQueuedTransactionEvents (
    chargingStation: ChargingStation,
    connectorId: number
  ): Promise<void> {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (
      connectorStatus?.transactionEventQueue == null ||
      connectorStatus.transactionEventQueue.length === 0
    ) {
      return
    }

    const queueLength = connectorStatus.transactionEventQueue.length
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Sending ${queueLength.toString()} queued TransactionEvents for connector ${connectorId.toString()}`
    )

    const queue = [...connectorStatus.transactionEventQueue]
    connectorStatus.transactionEventQueue = []

    for (const queuedEvent of queue) {
      try {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Sending queued event with seqNo=${queuedEvent.seqNo.toString()}`
        )
        await chargingStation.ocppRequestService.requestHandler<
          OCPP20TransactionEventRequest,
          OCPP20TransactionEventResponse
        >(chargingStation, OCPP20RequestCommand.TRANSACTION_EVENT, queuedEvent.request, {
          rawPayload: true,
        })
        if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended) {
          await OCPP20ServiceUtils.cleanupEndedTransaction(
            chargingStation,
            connectorId,
            connectorStatus
          )
        }
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Failed to send queued TransactionEvent with seqNo=${queuedEvent.seqNo.toString()}:`,
          error
        )
      }
    }
  }

  public static async sendTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    triggerReason: OCPP20TriggerReasonEnumType,
    connectorId: number,
    transactionId: string,
    options: OCPP20TransactionEventOptions = {}
  ): Promise<OCPP20TransactionEventResponse> {
    try {
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      if (connectorStatus == null) {
        const errorMsg = `Cannot find connector status for connector ${connectorId.toString()}`
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: ${errorMsg}`
        )
        throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
      }

      // Offline: build and queue pre-built payload (sent as-is via rawPayload on reconnect)
      if (!chargingStation.isWebSocketConnectionOpened()) {
        // E04.FR.03: offline flag SHALL be TRUE for any TransactionEventRequest that occurred while offline
        const transactionEventRequest = buildTransactionEvent(chargingStation, {
          connectorId,
          eventType,
          transactionId,
          triggerReason,
          ...options,
          offline: true,
        } as unknown as OCPP20TransactionEventRequest)
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Station offline, queueing TransactionEvent with seqNo=${transactionEventRequest.seqNo.toString()}`
        )
        connectorStatus.transactionEventQueue ??= []
        connectorStatus.transactionEventQueue.push({
          request: transactionEventRequest,
          seqNo: transactionEventRequest.seqNo,
          timestamp: new Date(),
        })
        return { idTokenInfo: undefined }
      }

      // Online: minimal params → requestHandler → buildRequestPayload
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Sending TransactionEvent for trigger ${triggerReason}`
      )

      const response = await chargingStation.ocppRequestService.requestHandler<
        OCPP20TransactionEventRequest,
        OCPP20TransactionEventResponse
      >(chargingStation, OCPP20RequestCommand.TRANSACTION_EVENT, {
        connectorId,
        eventType,
        transactionId,
        triggerReason,
        ...options,
      } as unknown as OCPP20TransactionEventRequest)

      return response
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Failed to send TransactionEvent:`,
        error
      )
      throw error
    }
  }

  public static startPeriodicMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    interval: number
  ): void {
    const connector = chargingStation.getConnectorStatus(connectorId)
    if (connector == null) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.startPeriodicMeterValues: Connector ${connectorId.toString()} not found`
      )
      return
    }
    if (interval <= 0) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.startPeriodicMeterValues: TxUpdatedInterval is ${interval.toString()}, not starting periodic TransactionEvent`
      )
      return
    }
    if (connector.transactionMeterValuesSetInterval != null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.startPeriodicMeterValues: TxUpdatedInterval already started, stopping first`
      )
      OCPP20ServiceUtils.stopPeriodicMeterValues(chargingStation, connectorId)
    }
    connector.transactionMeterValuesSetInterval = setInterval(() => {
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      if (connectorStatus?.transactionStarted === true && connectorStatus.transactionId != null) {
        if (
          connectorStatus.transactionDeauthorized === true &&
          connectorStatus.transactionDeauthorizedEnergyWh != null
        ) {
          const maxEnergy = OCPP20ServiceUtils.readVariableAsInteger(
            chargingStation,
            OCPP20ComponentName.TxCtrlr,
            OCPP20OptionalVariableName.MaxEnergyOnInvalidId,
            0
          )
          const currentEnergy = connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
          const energySinceDeauth = currentEnergy - connectorStatus.transactionDeauthorizedEnergyWh
          if (maxEnergy > 0 && energySinceDeauth >= maxEnergy) {
            const evseId = chargingStation.getEvseIdByConnectorId(connectorId)
            OCPP20ServiceUtils.terminateTransaction(
              chargingStation,
              connectorId,
              connectorStatus,
              connectorStatus.transactionId.toString(),
              OCPP20TriggerReasonEnumType.Deauthorized,
              OCPP20ReasonEnumType.DeAuthorized,
              evseId
            ).catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.startPeriodicMeterValues: Error terminating deauthorized transaction:`,
                error
              )
            })
            return
          }
        }
        const meterValue = buildMeterValue(
          chargingStation,
          connectorStatus.transactionId,
          interval
        ) as OCPP20MeterValue
        OCPP20ServiceUtils.sendTransactionEvent(
          chargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          connectorStatus.transactionId as string,
          { meterValue: [meterValue] }
        ).catch((error: unknown) => {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.startPeriodicMeterValues: Error sending periodic TransactionEvent:`,
            error
          )
        })
      }
    }, clampToSafeTimerValue(interval))
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.startPeriodicMeterValues: TxUpdatedInterval started every ${formatDurationMilliSeconds(interval)}`
    )
  }

  public static async stopAllTransactions (
    chargingStation: ChargingStation,
    triggerReason: OCPP20TriggerReasonEnumType = OCPP20TriggerReasonEnumType.RemoteStop,
    stoppedReason: OCPP20ReasonEnumType = OCPP20ReasonEnumType.Remote,
    evseId?: number
  ): Promise<void> {
    const terminationPromises: Promise<unknown>[] = []
    if (evseId != null) {
      const evseStatus = chargingStation.getEvseStatus(evseId)
      if (evseStatus != null) {
        for (const [connectorId, connectorStatus] of evseStatus.connectors) {
          if (connectorStatus.transactionId != null) {
            terminationPromises.push(
              OCPP20ServiceUtils.requestStopTransaction(
                chargingStation,
                connectorId,
                evseId,
                triggerReason,
                stoppedReason
              ).catch((error: unknown) => {
                logger.error(
                  `${chargingStation.logPrefix()} ${moduleName}.stopAllTransactions: Error stopping transaction on connector ${connectorId.toString()}:`,
                  error
                )
              })
            )
          }
        }
      }
    } else {
      for (const [iteratedEvseId, evseStatus] of chargingStation.evses) {
        if (iteratedEvseId === 0) {
          continue
        }
        for (const [connectorId, connectorStatus] of evseStatus.connectors) {
          if (connectorStatus.transactionId != null) {
            terminationPromises.push(
              OCPP20ServiceUtils.requestStopTransaction(
                chargingStation,
                connectorId,
                iteratedEvseId,
                triggerReason,
                stoppedReason
              ).catch((error: unknown) => {
                logger.error(
                  `${chargingStation.logPrefix()} ${moduleName}.stopAllTransactions: Error stopping transaction on connector ${connectorId.toString()}:`,
                  error
                )
              })
            )
          }
        }
      }
    }
    if (terminationPromises.length > 0) {
      await Promise.all(terminationPromises)
    }
  }

  public static stopPeriodicMeterValues (
    chargingStation: ChargingStation,
    connectorId: number
  ): void {
    const connector = chargingStation.getConnectorStatus(connectorId)
    if (connector?.transactionMeterValuesSetInterval != null) {
      clearInterval(connector.transactionMeterValuesSetInterval)
      delete connector.transactionMeterValuesSetInterval
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.stopPeriodicMeterValues: TxUpdatedInterval stopped`
      )
    }
  }

  private static buildEnergyMeterValues (
    connectorStatus: ConnectorStatus,
    context: OCPP20ReadingContextEnumType
  ): OCPP20MeterValue[] {
    const meterValues: OCPP20MeterValue[] = []
    const energyValue = connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
    if (energyValue >= 0) {
      meterValues.push({
        sampledValue: [
          {
            context,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            value: energyValue,
          },
        ],
        timestamp: new Date(),
      })
    }
    return meterValues
  }

  private static buildTransactionEndedMeterValues (
    connectorStatus: ConnectorStatus
  ): OCPP20MeterValue[] {
    return OCPP20ServiceUtils.buildEnergyMeterValues(
      connectorStatus,
      OCPP20ReadingContextEnumType.TRANSACTION_END
    )
  }

  private static readVariableAsBoolean (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultValue: boolean
  ): boolean {
    const value = OCPP20ServiceUtils.readVariableValue(chargingStation, componentName, variableName)
    return value != null ? convertToBoolean(value) : defaultValue
  }

  private static readVariableAsInteger (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultValue: number
  ): number {
    const value = OCPP20ServiceUtils.readVariableValue(chargingStation, componentName, variableName)
    if (value != null) {
      try {
        return convertToInt(value)
      } catch {
        logger.warn(
          `${moduleName}.readVariableAsInteger: Cannot convert '${value}' to integer for ${componentName}.${variableName}, using default ${defaultValue.toString()}`
        )
        return defaultValue
      }
    }
    return defaultValue
  }

  private static readVariableAsIntervalMs (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultSeconds: number
  ): number {
    const intervalSeconds = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      componentName,
      variableName,
      defaultSeconds
    )
    return intervalSeconds > 0
      ? secondsToMilliseconds(intervalSeconds)
      : secondsToMilliseconds(defaultSeconds)
  }

  private static readVariableValue (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string
  ): string | undefined {
    const variableManager = OCPP20VariableManager.getInstance()
    const results = variableManager.getVariables(chargingStation, [
      {
        component: { name: componentName },
        variable: { name: variableName },
      },
    ])
    if (results.length > 0 && results[0].attributeValue != null) {
      return results[0].attributeValue
    }
    return undefined
  }

  private static resolveActiveTransaction (
    chargingStation: ChargingStation,
    connectorId: number
  ): { connectorStatus: ConnectorStatus; transactionId: string } {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (
      (connectorStatus?.transactionStarted === true ||
        connectorStatus?.transactionPending === true) &&
      connectorStatus.transactionId != null
    ) {
      let transactionId: string
      if (typeof connectorStatus.transactionId === 'string') {
        transactionId = connectorStatus.transactionId
      } else {
        transactionId = connectorStatus.transactionId.toString()
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.resolveActiveTransaction: Non-string transaction ID ${transactionId} converted to string for OCPP 2.0`
        )
      }
      return { connectorStatus, transactionId }
    }
    throw new OCPPError(
      ErrorType.PROPERTY_CONSTRAINT_VIOLATION,
      `No active transaction on connector ${connectorId.toString()}`
    )
  }

  private static async terminateTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus,
    transactionId: string,
    triggerReason: OCPP20TriggerReasonEnumType,
    stoppedReason: OCPP20ReasonEnumType,
    evseId?: number
  ): Promise<OCPP20TransactionEventResponse> {
    const endedMeterValues = this.buildTransactionEndedMeterValues(connectorStatus)

    const response = await this.sendTransactionEvent(
      chargingStation,
      OCPP20TransactionEventEnumType.Ended,
      triggerReason,
      connectorId,
      transactionId,
      {
        evseId,
        meterValue: endedMeterValues.length > 0 ? endedMeterValues : undefined,
        stoppedReason,
      }
    )

    await OCPP20ServiceUtils.cleanupEndedTransaction(chargingStation, connectorId, connectorStatus)

    return response
  }
}

/**
 * @param chargingStation - Charging station instance
 * @param commandParams - Transaction event request parameters
 * @returns Built TransactionEventRequest
 */
export function buildTransactionEvent (
  chargingStation: ChargingStation,
  commandParams: OCPP20TransactionEventRequest
): OCPP20TransactionEventRequest {
  const params = commandParams as Record<string, unknown>
  const eventType = params.eventType as OCPP20TransactionEventEnumType
  const triggerReason =
    params.triggerReason != null
      ? (params.triggerReason as OCPP20TriggerReasonEnumType)
      : eventType === OCPP20TransactionEventEnumType.Ended
        ? OCPP20TriggerReasonEnumType.RemoteStop
        : OCPP20TriggerReasonEnumType.Authorized
  const inputEvse = params.evse as undefined | { connectorId?: number; id?: number }
  const connectorId =
    params.connectorId != null
      ? (params.connectorId as number)
      : (inputEvse?.connectorId ?? inputEvse?.id ?? 1)
  const transactionId =
    params.transactionId != null
      ? (params.transactionId as string)
      : eventType === OCPP20TransactionEventEnumType.Ended
        ? (chargingStation.getConnectorStatus(connectorId)?.transactionId?.toString() ??
          generateUUID())
        : generateUUID()
  const options = params as unknown as OCPP20TransactionEventOptions

  if (!validateIdentifierString(transactionId, 36)) {
    const errorMsg = `Invalid transaction ID format (must be non-empty string ≤36 characters): ${transactionId}`
    logger.error(`${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: ${errorMsg}`)
    throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
  }

  const evseId = options.evseId ?? chargingStation.getEvseIdByConnectorId(connectorId)
  if (evseId == null) {
    const errorMsg = `Cannot find EVSE ID for connector ${connectorId.toString()}`
    logger.error(`${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: ${errorMsg}`)
    throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
  }

  const connectorStatus = chargingStation.getConnectorStatus(connectorId)
  if (connectorStatus == null) {
    const errorMsg = `Cannot find connector status for connector ${connectorId.toString()}`
    logger.error(`${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: ${errorMsg}`)
    throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
  }

  if (connectorStatus.transactionSeqNo == null) {
    connectorStatus.transactionSeqNo = 0
  } else {
    connectorStatus.transactionSeqNo = connectorStatus.transactionSeqNo + 1
  }

  // E01.FR.16: only include EVSE in first TransactionEvent
  let evse: OCPP20EVSEType | undefined
  if (connectorStatus.transactionEvseSent !== true) {
    evse = { id: evseId }
    if (connectorId !== evseId) {
      evse.connectorId = connectorId
    }
    connectorStatus.transactionEvseSent = true
  }

  const transactionInfo: OCPP20TransactionType = {
    transactionId: transactionId as UUIDv4,
  }

  if (options.chargingState !== undefined) {
    transactionInfo.chargingState = options.chargingState
  }
  if (options.stoppedReason !== undefined) {
    transactionInfo.stoppedReason = options.stoppedReason
  }
  if (options.remoteStartId !== undefined) {
    transactionInfo.remoteStartId = options.remoteStartId
  }

  const transactionEventRequest: OCPP20TransactionEventRequest = {
    eventType,
    seqNo: connectorStatus.transactionSeqNo,
    timestamp: new Date(),
    transactionInfo,
    triggerReason,
  }

  if (evse !== undefined) {
    transactionEventRequest.evse = evse
  }

  // E03.FR.01: Include idToken only once per transaction
  if (options.idToken !== undefined && connectorStatus.transactionIdTokenSent !== true) {
    transactionEventRequest.idToken = options.idToken
    connectorStatus.transactionIdTokenSent = true
  }
  if (options.meterValue !== undefined && options.meterValue.length > 0) {
    transactionEventRequest.meterValue = options.meterValue
  }
  if (options.cableMaxCurrent !== undefined) {
    transactionEventRequest.cableMaxCurrent = options.cableMaxCurrent
  }
  if (options.numberOfPhasesUsed !== undefined) {
    transactionEventRequest.numberOfPhasesUsed = options.numberOfPhasesUsed
  }
  if (options.offline !== undefined) {
    transactionEventRequest.offline = options.offline
  }
  if (options.reservationId !== undefined) {
    transactionEventRequest.reservationId = options.reservationId
  }
  if (options.customData !== undefined) {
    transactionEventRequest.customData = options.customData
  }

  logger.debug(
    `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: Building TransactionEvent for trigger ${triggerReason}`
  )

  return transactionEventRequest
}
