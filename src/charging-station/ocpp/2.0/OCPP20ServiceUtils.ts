import { secondsToMilliseconds } from 'date-fns'

import { type ChargingStation, resetConnectorStatus } from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  type ConnectorStatus,
  type ConnectorStatusEnum,
  ErrorType,
  type MeterValue,
  OCPP20AuthorizationStatusEnumType,
  OCPP20ChargingStateEnumType,
  OCPP20ComponentName,
  type OCPP20ConnectorStatusEnumType,
  type OCPP20EVSEType,
  type OCPP20GetVariableResultType,
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenInfoType,
  type OCPP20IdTokenType,
  OCPP20IncomingRequestCommand,
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
  RequestCommand,
  type StartTransactionResult,
  type StopTransactionReason,
  type StopTransactionResult,
  type UUIDv4,
} from '../../../types/index.js'
import {
  clampToSafeTimerValue,
  computeExponentialBackOffDelay,
  Constants,
  convertToBoolean,
  convertToInt,
  convertToIntOrNaN,
  formatDurationMilliSeconds,
  generateUUID,
  isNotEmptyArray,
  logger,
  sleep,
  validateIdentifierString,
} from '../../../utils/index.js'
import { buildConfigKey, getConfigurationKey } from '../../index.js'
import {
  mapOCPP20AuthorizationStatus,
  mapOCPP20TokenType,
  OCPPAuthServiceFactory,
} from '../auth/index.js'
import { sendPostTransactionStatus } from '../OCPPConnectorStatusOperations.js'
import {
  buildMeterValue,
  createPayloadConfigs,
  PayloadValidatorOptions,
} from '../OCPPServiceUtils.js'
import { mapStopReasonToOCPP20 } from './OCPP20RequestBuilders.js'
import { OCPP20VariableManager } from './OCPP20VariableManager.js'

const moduleName = 'OCPP20ServiceUtils'

export interface RejectionReason {
  additionalInfo: string
  reasonCode: ReasonCodeEnumType
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class OCPP20ServiceUtils {
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
      [OCPP20IncomingRequestCommand.GET_LOCAL_LIST_VERSION, 'GetLocalListVersion'],
      [OCPP20IncomingRequestCommand.GET_LOG, 'GetLog'],
      [OCPP20IncomingRequestCommand.GET_TRANSACTION_STATUS, 'GetTransactionStatus'],
      [OCPP20IncomingRequestCommand.GET_VARIABLES, 'GetVariables'],
      [OCPP20IncomingRequestCommand.INSTALL_CERTIFICATE, 'InstallCertificate'],
      [OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION, 'RequestStartTransaction'],
      [OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION, 'RequestStopTransaction'],
      [OCPP20IncomingRequestCommand.RESET, 'Reset'],
      [OCPP20IncomingRequestCommand.SEND_LOCAL_LIST, 'SendLocalList'],
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

  /**
   * @param chargingStation - Target charging station for EVSE resolution
   * @param commandParams - Status notification parameters
   * @returns Formatted OCPP 2.0 StatusNotification request payload
   */
  public static buildStatusNotificationRequest (
    chargingStation: ChargingStation,
    commandParams: OCPP20StatusNotificationRequest
  ): OCPP20StatusNotificationRequest {
    const params = commandParams as Record<string, unknown>
    const connectorId = params.connectorId as number
    const connectorStatus = (params.connectorStatus ?? params.status) as ConnectorStatusEnum
    const evseId = params.evseId as number | undefined
    const resolvedEvseId = evseId ?? chargingStation.getEvseIdByConnectorId(connectorId)
    if (resolvedEvseId === undefined) {
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Cannot build status notification payload: evseId is undefined for connector ${connectorId.toString()}`,
        RequestCommand.STATUS_NOTIFICATION
      )
    }
    return {
      connectorId,
      connectorStatus: connectorStatus as OCPP20ConnectorStatusEnumType,
      evseId: resolvedEvseId,
      timestamp: new Date(),
    } satisfies OCPP20StatusNotificationRequest
  }

  /**
   * Build meter values for the start of a transaction.
   * @param chargingStation - Target charging station
   * @param transactionId - Transaction identifier
   * @returns Array of OCPP 2.0 meter values at transaction begin
   */
  static buildTransactionStartedMeterValues (
    chargingStation: ChargingStation,
    transactionId: number | string
  ): OCPP20MeterValue[] {
    try {
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.SampledDataCtrlr,
        OCPP20RequiredVariableName.TxStartedMeasurands
      )
      const startedMeterValue = buildMeterValue(
        chargingStation,
        transactionId,
        0,
        measurandsKey,
        OCPP20ReadingContextEnumType.TRANSACTION_BEGIN
      ) as OCPP20MeterValue
      return isNotEmptyArray(startedMeterValue.sampledValue) ? [startedMeterValue] : []
    } catch (error) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.buildTransactionStartedMeterValues: ${(error as Error).message}`
      )
      return []
    }
  }

  /**
   * Clean up connector state after a transaction has ended.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   * @param connectorStatus - Connector status to reset
   */
  public static async cleanupEndedTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus
  ): Promise<void> {
    if (
      connectorStatus.transactionStarted !== true &&
      connectorStatus.transactionPending !== true
    ) {
      return
    }
    OCPP20ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId)
    const postTransactionDelay = chargingStation.stationInfo?.postTransactionDelay ?? 0
    if (postTransactionDelay > 0) {
      delete connectorStatus.transactionId
      await sleep(secondsToMilliseconds(postTransactionDelay))
      if (!chargingStation.started) {
        return
      }
    }
    resetConnectorStatus(connectorStatus)
    connectorStatus.locked = false
    await sendPostTransactionStatus(chargingStation, connectorId)
  }

  /**
   * OCPP 2.0.1 §8.1-§8.3 RetryBackOff reconnection delay computation.
   * @param chargingStation - Target charging station
   * @param retryCount - Current websocket connection retry count
   * @returns Reconnect delay in milliseconds
   */
  public static computeReconnectDelay (
    chargingStation: ChargingStation,
    retryCount: number
  ): number {
    const waitMinimum = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.RetryBackOffWaitMinimum,
      30
    )
    const randomRange = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.RetryBackOffRandomRange,
      10
    )
    const repeatTimes = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.RetryBackOffRepeatTimes,
      5
    )
    return computeExponentialBackOffDelay({
      baseDelayMs: secondsToMilliseconds(waitMinimum),
      jitterMs: secondsToMilliseconds(randomRange),
      maxRetries: repeatTimes,
      retryNumber: Math.max(0, retryCount - 1),
    })
  }

  /**
   * OCPP 2.0 Incoming Request Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestPayloadConfigs = (): [
    OCPP20IncomingRequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP20ServiceUtils.incomingRequestSchemaNames, 'Request.json')

  /**
   * Configuration for OCPP 2.0 Incoming Request Response validators
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestResponsePayloadConfigs = (): [
    OCPP20IncomingRequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP20ServiceUtils.incomingRequestSchemaNames, 'Response.json')

  /**
   * Factory options for OCPP 2.0 payload validators
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0 validators
   */
  public static createPayloadOptions = (moduleName: string, methodName: string) =>
    PayloadValidatorOptions(
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
  ][] => createPayloadConfigs(OCPP20ServiceUtils.outgoingRequestSchemaNames, 'Request.json')

  /**
   * OCPP 2.0 Response Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createResponsePayloadConfigs = (): [
    OCPP20RequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP20ServiceUtils.outgoingRequestSchemaNames, 'Response.json')

  /**
   * Enforce ItemsPerMessage and BytesPerMessage limits on request data.
   * @param chargingStation - Charging station providing log prefix
   * @param chargingStation.logPrefix - Log prefix function
   * @param moduleName - Module name for logging context
   * @param context - Method name for logging context
   * @param data - Array of variable data items to validate
   * @param itemsLimit - Maximum allowed items per message (0 = unlimited)
   * @param bytesLimit - Maximum allowed bytes per message (0 = unlimited)
   * @param buildRejected - Factory function to build rejection results
   * @param logger - Logger instance for debug output
   * @param logger.debug - Debug logging function
   * @returns Object indicating whether data was rejected and the rejection results
   */
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

  /**
   * Enforce BytesPerMessage limit after results have been computed.
   * @param chargingStation - Charging station providing log prefix
   * @param chargingStation.logPrefix - Log prefix function
   * @param moduleName - Module name for logging context
   * @param context - Method name for logging context
   * @param originalData - Original variable data items
   * @param currentResults - Computed results to check against byte limit
   * @param bytesLimit - Maximum allowed bytes per message (0 = unlimited)
   * @param buildRejected - Factory function to build rejection results
   * @param logger - Logger instance for debug output
   * @param logger.debug - Debug logging function
   * @returns Original results if within limit, or rejection results if exceeded
   */
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

  /**
   * Retrieve the AlignedDataCtrlr interval in milliseconds.
   * @param chargingStation - Target charging station
   * @returns Aligned data interval in milliseconds
   */
  public static getAlignedDataInterval (chargingStation: ChargingStation): number {
    return OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20RequiredVariableName.AlignedDataInterval,
      900
    )
  }

  /**
   * Retrieve the SampledDataCtrlr TxEndedInterval in milliseconds.
   * @param chargingStation - Target charging station
   * @returns Transaction ended meter values interval in milliseconds
   */
  public static getTxEndedInterval (chargingStation: ChargingStation): number {
    return OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.SampledDataCtrlr,
      OCPP20RequiredVariableName.TxEndedInterval,
      0
    )
  }

  /**
   * Retrieve the SampledDataCtrlr TxUpdatedInterval in milliseconds.
   * @param chargingStation - Target charging station
   * @returns Transaction updated meter values interval in milliseconds
   */
  public static getTxUpdatedInterval (chargingStation: ChargingStation): number {
    return OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.SampledDataCtrlr,
      OCPP20RequiredVariableName.TxUpdatedInterval,
      Constants.DEFAULT_TX_UPDATED_INTERVAL_SECONDS
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

  public static readVariableAsBoolean (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultValue: boolean
  ): boolean {
    const value = OCPP20ServiceUtils.readVariableValue(chargingStation, componentName, variableName)
    return value != null ? convertToBoolean(value) : defaultValue
  }

  public static readVariableAsInteger (
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

  public static readVariableAsString (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultValue = ''
  ): string {
    return (
      OCPP20ServiceUtils.readVariableValue(chargingStation, componentName, variableName) ??
      defaultValue
    )
  }

  public static readVariableValue (
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
    if (
      isNotEmptyArray<OCPP20GetVariableResultType>(results) &&
      results[0].attributeValue != null
    ) {
      return results[0].attributeValue
    }
    return undefined
  }

  /**
   * Deauthorize an active transaction per OCPP 2.0.1 E05 requirements.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier with the active transaction
   * @param evseId - Optional EVSE identifier
   * @returns Promise resolving to the TransactionEvent response
   */
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

  /**
   * Stop an active transaction by sending a TransactionEvent(Ended).
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier with the active transaction
   * @param evseId - Optional EVSE identifier
   * @param triggerReason - Trigger reason for the stop event
   * @param stoppedReason - Reason the transaction was stopped
   * @returns Promise resolving to the TransactionEvent response
   */
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

  /**
   * Send queued TransactionEvent requests accumulated while offline.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier whose queue to drain
   */
  public static async sendQueuedTransactionEvents (
    chargingStation: ChargingStation,
    connectorId: number
  ): Promise<void> {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (
      connectorStatus?.transactionEventQueue == null ||
      !isNotEmptyArray(connectorStatus.transactionEventQueue)
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

  /**
   * Send a TransactionEvent request to the CSMS, or queue it if offline.
   * @param chargingStation - Target charging station
   * @param eventType - Transaction event type (Started, Updated, Ended)
   * @param triggerReason - Reason that triggered the event
   * @param connectorId - Connector identifier
   * @param transactionId - Transaction identifier
   * @param options - Additional transaction event options
   * @returns Promise resolving to the TransactionEvent response
   */
  public static async sendTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    triggerReason: OCPP20TriggerReasonEnumType,
    connectorId: number,
    transactionId: string,
    options: Omit<OCPP20TransactionEventOptions, 'eventType'> = {}
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
        })
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

  /**
   * Start periodic collection of TxEnded meter values for a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   * @param interval - Collection interval in milliseconds
   */
  public static startEndedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    interval: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus == null) {
      return
    }
    connectorStatus.transactionEndedMeterValues = []
    if (interval <= 0) {
      return
    }
    if (connectorStatus.transactionEndedMeterValuesSetInterval != null) {
      OCPP20ServiceUtils.stopEndedMeterValues(chargingStation, connectorId)
    }
    connectorStatus.transactionEndedMeterValuesSetInterval = setInterval(() => {
      const cs = chargingStation.getConnectorStatus(connectorId)
      if (cs?.transactionStarted === true && cs.transactionId != null) {
        const measurandsKey = buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxEndedMeasurands
        )
        const meterValue = buildMeterValue(
          chargingStation,
          cs.transactionId,
          interval,
          measurandsKey
        ) as OCPP20MeterValue
        if (isNotEmptyArray(meterValue.sampledValue)) {
          cs.transactionEndedMeterValues?.push(meterValue)
        }
      }
    }, clampToSafeTimerValue(interval))
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.startEndedMeterValues: TxEndedInterval started every ${formatDurationMilliSeconds(interval)}`
    )
  }

  public static async startTransactionOnConnector (
    chargingStation: ChargingStation,
    connectorId: number,
    idTag?: string
  ): Promise<StartTransactionResult> {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    let transactionId = connectorStatus?.transactionId as string | undefined
    if (transactionId == null) {
      transactionId = generateUUID()
      if (connectorStatus != null) {
        connectorStatus.transactionId = transactionId
      }
      OCPP20ServiceUtils.resetTransactionSequenceNumber(chargingStation, connectorId)
    }
    const startedMeterValues = OCPP20ServiceUtils.buildTransactionStartedMeterValues(
      chargingStation,
      transactionId
    )
    if (isNotEmptyArray(startedMeterValues) && connectorStatus != null) {
      connectorStatus.transactionBeginMeterValue = startedMeterValues[0] as MeterValue
    }
    const response = await OCPP20ServiceUtils.sendTransactionEvent(
      chargingStation,
      OCPP20TransactionEventEnumType.Started,
      OCPP20TriggerReasonEnumType.Authorized,
      connectorId,
      transactionId,
      {
        idToken:
          idTag != null ? { idToken: idTag, type: OCPP20IdTokenEnumType.ISO14443 } : undefined,
        ...(isNotEmptyArray(startedMeterValues) && { meterValue: startedMeterValues }),
      }
    )
    return {
      accepted:
        response.idTokenInfo == null ||
        response.idTokenInfo.status === OCPP20AuthorizationStatusEnumType.Accepted,
    }
  }

  /**
   * Start periodic TransactionEvent(Updated) with meter values for a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   * @param interval - Sending interval in milliseconds
   */
  public static startUpdatedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    interval: number
  ): void {
    const initialConnectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (initialConnectorStatus == null) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: Connector ${connectorId.toString()} not found`
      )
      return
    }
    if (interval <= 0) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: TxUpdatedInterval is ${interval.toString()}, not starting periodic TransactionEvent`
      )
      return
    }
    if (initialConnectorStatus.transactionUpdatedMeterValuesSetInterval != null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: TxUpdatedInterval already started, stopping first`
      )
      OCPP20ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId)
    }
    initialConnectorStatus.transactionUpdatedMeterValuesSetInterval = setInterval(() => {
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
                `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: Error terminating deauthorized transaction:`,
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
            `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: Error sending periodic TransactionEvent:`,
            error
          )
        })
      }
    }, clampToSafeTimerValue(interval))
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: TxUpdatedInterval started every ${formatDurationMilliSeconds(interval)}`
    )
  }

  /**
   * Stop all active transactions on the charging station or a specific EVSE.
   * @param chargingStation - Target charging station
   * @param triggerReason - Trigger reason for stop events
   * @param stoppedReason - Reason the transactions were stopped
   * @param evseId - Optional EVSE identifier to limit scope
   */
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
      for (const {
        connectorId,
        connectorStatus,
        evseId: connectorEvseId,
      } of chargingStation.iterateConnectors(true)) {
        if (connectorStatus.transactionId != null) {
          terminationPromises.push(
            OCPP20ServiceUtils.requestStopTransaction(
              chargingStation,
              connectorId,
              connectorEvseId,
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
    if (isNotEmptyArray(terminationPromises)) {
      await Promise.all(terminationPromises)
    }
  }

  /**
   * Stop periodic TxEnded meter value collection for a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   */
  public static stopEndedMeterValues (chargingStation: ChargingStation, connectorId: number): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus?.transactionEndedMeterValuesSetInterval != null) {
      clearInterval(connectorStatus.transactionEndedMeterValuesSetInterval)
      delete connectorStatus.transactionEndedMeterValuesSetInterval
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.stopEndedMeterValues: TxEndedInterval stopped`
      )
    }
  }

  public static async stopTransactionOnConnector (
    chargingStation: ChargingStation,
    connectorId: number,
    reason?: StopTransactionReason
  ): Promise<StopTransactionResult> {
    const evseId = chargingStation.getEvseIdByConnectorId(connectorId)
    if (evseId == null) {
      logger.warn(
        `${chargingStation.logPrefix()} stopTransactionOnConnector: cannot resolve EVSE ID for connector ${connectorId.toString()}, skipping`
      )
      return { accepted: false }
    }
    const { stoppedReason, triggerReason } = mapStopReasonToOCPP20(reason)
    const response = await OCPP20ServiceUtils.requestStopTransaction(
      chargingStation,
      connectorId,
      evseId,
      triggerReason,
      stoppedReason
    )
    return {
      accepted:
        response.idTokenInfo == null ||
        response.idTokenInfo.status === OCPP20AuthorizationStatusEnumType.Accepted,
    }
  }

  /**
   * Stop periodic TransactionEvent(Updated) sending for a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   */
  public static stopUpdatedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus?.transactionUpdatedMeterValuesSetInterval != null) {
      clearInterval(connectorStatus.transactionUpdatedMeterValuesSetInterval)
      delete connectorStatus.transactionUpdatedMeterValuesSetInterval
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.stopUpdatedMeterValues: TxUpdatedInterval stopped`
      )
    }
  }

  public static updateAuthorizationCache (
    chargingStation: ChargingStation,
    idToken: OCPP20IdTokenType,
    idTokenInfo: OCPP20IdTokenInfoType
  ): void {
    try {
      const authService = OCPPAuthServiceFactory.getInstance(chargingStation)
      authService.updateCacheEntry(
        idToken.idToken,
        mapOCPP20AuthorizationStatus(idTokenInfo.status),
        idTokenInfo.cacheExpiryDateTime,
        mapOCPP20TokenType(idToken.type)
      )
    } catch (error: unknown) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.updateAuthorizationCache: Error updating auth cache:`,
        error
      )
    }
  }

  private static buildTransactionEndedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    transactionId: number | string
  ): OCPP20MeterValue[] {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    const endedMeterValues = (connectorStatus?.transactionEndedMeterValues ??
      []) as OCPP20MeterValue[]
    const beginMeterValue = connectorStatus?.transactionBeginMeterValue as
      | OCPP20MeterValue
      | undefined

    try {
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.SampledDataCtrlr,
        OCPP20RequiredVariableName.TxEndedMeasurands
      )
      const finalMeterValue = buildMeterValue(
        chargingStation,
        transactionId,
        0,
        measurandsKey,
        OCPP20ReadingContextEnumType.TRANSACTION_END
      ) as OCPP20MeterValue
      if (isNotEmptyArray(finalMeterValue.sampledValue)) {
        return [
          ...(beginMeterValue != null ? [beginMeterValue] : []),
          ...endedMeterValues,
          finalMeterValue,
        ]
      }
    } catch (error) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEndedMeterValues: ${(error as Error).message}`
      )
    }
    const meterValues: OCPP20MeterValue[] = [
      ...(beginMeterValue != null ? [beginMeterValue] : []),
      ...endedMeterValues,
    ]
    return isNotEmptyArray(meterValues) ? meterValues : []
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
    this.stopEndedMeterValues(chargingStation, connectorId)
    const endedMeterValues = this.buildTransactionEndedMeterValues(
      chargingStation,
      connectorId,
      transactionId
    )

    const response = await this.sendTransactionEvent(
      chargingStation,
      OCPP20TransactionEventEnumType.Ended,
      triggerReason,
      connectorId,
      transactionId,
      {
        evseId,
        meterValue: isNotEmptyArray(endedMeterValues) ? endedMeterValues : undefined,
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
  commandParams: OCPP20TransactionEventOptions
): OCPP20TransactionEventRequest {
  const eventType = commandParams.eventType
  const defaultTriggerReason =
    eventType === OCPP20TransactionEventEnumType.Ended
      ? OCPP20TriggerReasonEnumType.RemoteStop
      : OCPP20TriggerReasonEnumType.Authorized
  const triggerReason = commandParams.triggerReason ?? defaultTriggerReason
  const inputEvse = commandParams.evse
  const connectorId = commandParams.connectorId ?? inputEvse?.connectorId ?? inputEvse?.id ?? 1
  const transactionId =
    commandParams.transactionId ??
    (eventType === OCPP20TransactionEventEnumType.Ended
      ? (chargingStation.getConnectorStatus(connectorId)?.transactionId?.toString() ??
        generateUUID())
      : generateUUID())

  if (!validateIdentifierString(transactionId, 36)) {
    const errorMsg = `Invalid transaction ID format (must be non-empty string ≤36 characters): ${transactionId}`
    logger.error(`${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: ${errorMsg}`)
    throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
  }

  const evseId = commandParams.evseId ?? chargingStation.getEvseIdByConnectorId(connectorId)
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

  const chargingState =
    commandParams.chargingState ??
    (eventType === OCPP20TransactionEventEnumType.Ended
      ? undefined
      : connectorStatus.transactionStarted === true
        ? OCPP20ChargingStateEnumType.Charging
        : OCPP20ChargingStateEnumType.EVConnected)
  if (chargingState !== undefined) {
    transactionInfo.chargingState = chargingState
  }
  if (commandParams.stoppedReason !== undefined) {
    transactionInfo.stoppedReason = commandParams.stoppedReason
  }
  if (commandParams.remoteStartId !== undefined) {
    transactionInfo.remoteStartId = commandParams.remoteStartId
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
  if (commandParams.idToken !== undefined && connectorStatus.transactionIdTokenSent !== true) {
    transactionEventRequest.idToken = commandParams.idToken
    connectorStatus.transactionIdTokenSent = true
  }
  if (commandParams.meterValue !== undefined && isNotEmptyArray(commandParams.meterValue)) {
    transactionEventRequest.meterValue = commandParams.meterValue
  }
  if (commandParams.cableMaxCurrent !== undefined) {
    transactionEventRequest.cableMaxCurrent = commandParams.cableMaxCurrent
  }
  if (commandParams.numberOfPhasesUsed !== undefined) {
    transactionEventRequest.numberOfPhasesUsed = commandParams.numberOfPhasesUsed
  }
  if (commandParams.offline !== undefined) {
    transactionEventRequest.offline = commandParams.offline
  }
  if (commandParams.reservationId !== undefined) {
    transactionEventRequest.reservationId = commandParams.reservationId
  }
  if (commandParams.customData !== undefined) {
    transactionEventRequest.customData = commandParams.customData
  }

  logger.debug(
    `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: Building TransactionEvent for trigger ${triggerReason}`
  )

  return transactionEventRequest
}
