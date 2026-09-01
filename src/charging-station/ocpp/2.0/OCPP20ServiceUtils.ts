import { secondsToMilliseconds } from 'date-fns'

import type { ConnectorStatus, QueuedTransactionEvent } from '../../../types/ConnectorStatus.js'

import { type ChargingStation, resetConnectorStatus } from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  AvailabilityType,
  type ConnectorStatusEnum,
  ErrorType,
  type MeterValue,
  MeterValueUnit,
  OCPP20AuthorizationStatusEnumType,
  OCPP20ChargingStateEnumType,
  OCPP20ComponentName,
  OCPP20ConnectorStatusEnumType,
  type OCPP20EVSEType,
  type OCPP20GetVariableResultType,
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenInfoType,
  type OCPP20IdTokenType,
  OCPP20IncomingRequestCommand,
  OCPP20MeasurandEnumType,
  type OCPP20MeterValue,
  type OCPP20MeterValuesRequest,
  type OCPP20MeterValuesResponse,
  OCPP20OptionalVariableName,
  OCPP20ReadingContextEnumType,
  OCPP20ReasonEnumType,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  type OCPP20SampledValue,
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
  type RequestParams,
  type SampledValueTemplate,
  type StartTransactionResult,
  type StatusNotificationOptions,
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
  getErrorMessage,
  interruptibleSleep,
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
  buildClockAlignedConnectorMeterValue,
  buildMeterValue,
  createPayloadConfigs,
  PayloadValidatorOptions,
} from '../OCPPServiceUtils.js'
import { OCPP20Constants } from './OCPP20Constants.js'
import { mapStopReasonToOCPP20 } from './OCPP20RequestBuilders.js'
import { OCPP20VariableManager } from './OCPP20VariableManager.js'
import { getVariableMetadata } from './OCPP20VariableRegistry.js'

const moduleName = 'OCPP20ServiceUtils'

export const isOCPP20ConnectorStatus = (
  status: ConnectorStatusEnum
): status is OCPP20ConnectorStatusEnumType =>
  Object.values(OCPP20ConnectorStatusEnumType).some(value => value === status)

export interface RejectionReason {
  additionalInfo: string
  reasonCode: ReasonCodeEnumType
}

const hasQueuedEndedEvent = (connectorStatus: ConnectorStatus): boolean =>
  connectorStatus.transactionId != null &&
  connectorStatus.transactionEventQueue?.some(
    queuedEvent =>
      queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended &&
      queuedEvent.request.transactionInfo.transactionId ===
        connectorStatus.transactionId?.toString()
  ) === true

const hasOngoingTransaction = (connectorStatus: ConnectorStatus): boolean =>
  connectorStatus.transactionEnding !== true &&
  !hasQueuedEndedEvent(connectorStatus) &&
  (connectorStatus.transactionStarting === true ||
    (connectorStatus.transactionStarted === true && connectorStatus.transactionId != null))

const hasPeriodicTransactionEnergySamples = (chargingStation: ChargingStation): boolean => {
  const configuredMeasurands = getConfigurationKey(
    chargingStation,
    buildConfigKey(
      OCPP20ComponentName.SampledDataCtrlr,
      OCPP20RequiredVariableName.TxUpdatedMeasurands
    )
  )?.value
  return (
    configuredMeasurands == null ||
    configuredMeasurands
      .split(',')
      .some(
        measurand =>
          measurand.trim() === (OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER as string)
      )
  )
}
interface AdditiveUnitFamily {
  baseUnit: string
  kiloUnit?: string
}

interface ClockAlignedMeterValuesSendState {
  inFlight?: Promise<void>
  pending?: PendingClockAlignedMeterValuesRequest
}

interface PendingClockAlignedMeterValuesRequest {
  request: OCPP20MeterValuesRequest
  responseTimeoutMs: number
}

const getClockAlignedAdditiveUnitFamily = (
  measurand: OCPP20MeasurandEnumType | undefined,
  configuredUnit: string | undefined
): AdditiveUnitFamily | undefined => {
  let family: AdditiveUnitFamily | undefined
  if (measurand?.startsWith('Current.') === true) {
    family = { baseUnit: MeterValueUnit.AMP }
  } else if (measurand?.startsWith('Energy.Active.') === true) {
    family = { baseUnit: MeterValueUnit.WATT_HOUR, kiloUnit: MeterValueUnit.KILO_WATT_HOUR }
  } else if (measurand?.startsWith('Energy.Reactive.') === true) {
    family = { baseUnit: MeterValueUnit.VAR_HOUR, kiloUnit: MeterValueUnit.KILO_VAR_HOUR }
  } else if (measurand?.startsWith('Energy.Apparent.') === true) {
    family = { baseUnit: MeterValueUnit.VOLT_AMP_HOUR, kiloUnit: MeterValueUnit.KILO_VOLT_AMP_HOUR }
  } else if (
    measurand?.startsWith('Power.') === true &&
    measurand !== OCPP20MeasurandEnumType.POWER_FACTOR
  ) {
    family = measurand.startsWith('Power.Reactive.')
      ? { baseUnit: MeterValueUnit.VAR, kiloUnit: MeterValueUnit.KILO_VAR }
      : { baseUnit: MeterValueUnit.WATT, kiloUnit: MeterValueUnit.KILO_WATT }
  }
  if (
    family != null &&
    configuredUnit != null &&
    configuredUnit !== family.baseUnit &&
    configuredUnit !== family.kiloUnit
  ) {
    return undefined
  }
  return family
}

const normalizeClockAlignedAdditiveSample = (
  sampledValue: OCPP20SampledValue,
  unitFamily: AdditiveUnitFamily
): OCPP20SampledValue => {
  const configuredUnit = sampledValue.unitOfMeasure?.unit
  const namedUnitMultiplier =
    configuredUnit === unitFamily.kiloUnit ? Constants.UNIT_DIVIDER_KILO : 1
  const decimalMultiplier = 10 ** (sampledValue.unitOfMeasure?.multiplier ?? 0)
  return {
    ...sampledValue,
    unitOfMeasure: {
      ...sampledValue.unitOfMeasure,
      multiplier: 0,
      unit: unitFamily.baseUnit,
    },
    value: sampledValue.value * namedUnitMultiplier * decimalMultiplier,
  }
}

const aggregateClockAlignedSamples = (
  meterValues: readonly OCPP20MeterValue[],
  numberOfPhases: number
): OCPP20SampledValue[] => {
  const samples = new Map<string, OCPP20SampledValue>()
  for (const meterValue of meterValues) {
    const meterSamples = new Map<string, { additive: boolean; sampledValue: OCPP20SampledValue }>()
    const buildKey = (sample: OCPP20SampledValue, additive: boolean): string =>
      JSON.stringify([
        sample.measurand,
        sample.context,
        sample.location,
        sample.phase,
        sample.customData,
        ...(additive ? [] : [sample.unitOfMeasure?.unit, sample.unitOfMeasure?.multiplier]),
      ])
    for (const sampledValue of meterValue.sampledValue) {
      const additiveUnitFamily = getClockAlignedAdditiveUnitFamily(
        sampledValue.measurand,
        sampledValue.unitOfMeasure?.unit
      )
      const normalizedSample =
        additiveUnitFamily != null
          ? normalizeClockAlignedAdditiveSample(sampledValue, additiveUnitFamily)
          : sampledValue
      meterSamples.set(buildKey(normalizedSample, additiveUnitFamily != null), {
        additive: additiveUnitFamily != null,
        sampledValue: normalizedSample,
      })
    }

    const additiveGroups = new Map<
      string,
      { aggregatePresent: boolean; byLine: Map<string, OCPP20SampledValue> }
    >()
    for (const { additive, sampledValue } of meterSamples.values()) {
      if (!additive) continue
      const groupKey = JSON.stringify([
        sampledValue.measurand,
        sampledValue.context,
        sampledValue.location,
        sampledValue.customData,
      ])
      const group = additiveGroups.get(groupKey) ?? {
        aggregatePresent: false,
        byLine: new Map<string, OCPP20SampledValue>(),
      }
      if (sampledValue.phase == null) {
        group.aggregatePresent = true
      } else {
        const lineMatch = /^L([123])(?:-N)?$/.exec(sampledValue.phase)
        if (lineMatch?.[1] != null && !group.byLine.has(lineMatch[1])) {
          group.byLine.set(lineMatch[1], sampledValue)
        }
      }
      additiveGroups.set(groupKey, group)
    }
    for (const { aggregatePresent, byLine } of additiveGroups.values()) {
      if (aggregatePresent || byLine.size < Math.max(1, numberOfPhases)) continue
      const values = [...byLine.values()]
      const first = values[0]
      const total = values.reduce((sum, sample) => sum + sample.value, 0)
      const aggregate = {
        ...first,
        phase: undefined,
        value: first.measurand?.startsWith('Current.') === true ? total / values.length : total,
      }
      meterSamples.set(buildKey(aggregate, true), { additive: true, sampledValue: aggregate })
    }

    for (const [key, { additive, sampledValue }] of meterSamples) {
      const existing = samples.get(key)
      if (existing != null && additive) {
        existing.value += sampledValue.value
        continue
      }
      if (existing == null) {
        const aggregate = { ...sampledValue }
        delete aggregate.signedMeterValue
        samples.set(key, aggregate)
      }
    }
  }
  return [...samples.values()]
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class OCPP20ServiceUtils {
  private static readonly clockAlignedMeterValuesSendStates = new WeakMap<
    ChargingStation,
    Map<number, ClockAlignedMeterValuesSendState>
  >()

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

  private static readonly saturatedTransactionEventQueues = new WeakSet<ConnectorStatus>()
  private static readonly transactionEventQueueDrains = new WeakSet<ConnectorStatus>()
  private static readonly transactionEventSendChains = new WeakMap<
    ConnectorStatus,
    Promise<unknown>
  >()

  /**
   * @param chargingStation - Target charging station for EVSE resolution
   * @param commandParams - StatusNotification input; `connectorStatus` takes precedence over `status`
   * @returns Formatted OCPP 2.0.1 StatusNotification request payload
   * @throws {OCPPError} When the EVSE id cannot be resolved or the connector status is missing/not a valid OCPP 2.0.1 status
   */
  public static buildStatusNotificationRequest (
    chargingStation: ChargingStation,
    commandParams: StatusNotificationOptions
  ): OCPP20StatusNotificationRequest {
    const { connectorId, evseId } = commandParams
    const connectorStatus = commandParams.connectorStatus ?? commandParams.status
    const resolvedEvseId = evseId ?? chargingStation.getEvseIdByConnectorId(connectorId)
    if (resolvedEvseId === undefined) {
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Cannot build status notification payload: evseId is undefined for connector ${connectorId.toString()}`,
        RequestCommand.STATUS_NOTIFICATION
      )
    }
    if (connectorStatus == null || !isOCPP20ConnectorStatus(connectorStatus)) {
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Cannot build status notification payload: invalid connector status for connector ${connectorId.toString()}`,
        RequestCommand.STATUS_NOTIFICATION
      )
    }
    return {
      connectorId,
      connectorStatus,
      evseId: resolvedEvseId,
      timestamp: new Date(),
    } satisfies OCPP20StatusNotificationRequest
  }

  /**
   * Build meter values for the start of a transaction.
   * @param chargingStation - Target charging station
   * @param transactionId - Transaction identifier
   * @returns Array of OCPP 2.0.1 meter values at transaction begin
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
        `${chargingStation.logPrefix()} ${moduleName}.buildTransactionStartedMeterValues: ${getErrorMessage(error)}`
      )
      return []
    }
  }

  /**
   * Clean up connector state after a transaction has ended.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   * @param connectorStatus - Connector status to reset
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   * @param expectedTransactionId - Transaction that is allowed to own the connector cleanup
   */
  public static async cleanupEndedTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus,
    evseId?: number,
    expectedTransactionId?: string
  ): Promise<void> {
    if (
      expectedTransactionId != null &&
      connectorStatus.transactionId?.toString() !== expectedTransactionId
    ) {
      return
    }
    if (
      connectorStatus.transactionStarted !== true &&
      connectorStatus.transactionPending !== true
    ) {
      return
    }
    // Snapshot transactionId BEFORE any mutation below deletes it, so the
    // coherent session (if any) can still be destroyed after the reset.
    const txId = connectorStatus.transactionId
    OCPP20ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId, evseId)
    const postTransactionDelay = chargingStation.stationInfo?.postTransactionDelay ?? 0
    const lifecycleAbortSignal = (chargingStation as { lifecycleAbortSignal?: AbortSignal })
      .lifecycleAbortSignal
    if (postTransactionDelay > 0) {
      delete connectorStatus.transactionId
      // Destroy the coherent session BEFORE sleeping so an intervening
      // stop cannot leak it. `destroyCoherentSession` is idempotent so the
      // post-sleep call remains valid.
      chargingStation.destroyCoherentSession(txId)
      if (lifecycleAbortSignal == null) {
        await sleep(secondsToMilliseconds(postTransactionDelay))
      } else {
        await interruptibleSleep(secondsToMilliseconds(postTransactionDelay), lifecycleAbortSignal)
      }
    }
    resetConnectorStatus(connectorStatus)
    chargingStation.destroyCoherentSession(txId)
    connectorStatus.locked = false
    chargingStation.saveTransactionEventQueues()
    if (!chargingStation.started || lifecycleAbortSignal?.aborted === true) {
      connectorStatus.status =
        chargingStation.isChargingStationAvailable() &&
        connectorStatus.availability === AvailabilityType.Operative
          ? OCPP20ConnectorStatusEnumType.Available
          : OCPP20ConnectorStatusEnumType.Unavailable
      return
    }
    sendPostTransactionStatus(chargingStation, connectorId, evseId, {
      responseTimeoutMs: OCPP20ServiceUtils.readVariableAsIntervalMs(
        chargingStation,
        OCPP20ComponentName.OCPPCommCtrlr,
        OCPP20RequiredVariableName.MessageTimeout,
        Constants.DEFAULT_MESSAGE_TIMEOUT_SECONDS
      ),
      waitForResponse: false,
    }).catch((error: unknown) => {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.cleanupEndedTransaction: Failed to send post-transaction status:`,
        error
      )
    })
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
      OCPP20Constants.DEFAULT_RETRY_BACKOFF_WAIT_MINIMUM_SECONDS
    )
    const randomRange = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.RetryBackOffRandomRange,
      OCPP20Constants.DEFAULT_RETRY_BACKOFF_RANDOM_RANGE_SECONDS
    )
    const repeatTimes = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.RetryBackOffRepeatTimes,
      OCPP20Constants.DEFAULT_RETRY_BACKOFF_REPEAT_TIMES
    )
    return computeExponentialBackOffDelay({
      baseDelayMs: secondsToMilliseconds(waitMinimum),
      jitterMs: secondsToMilliseconds(randomRange),
      maxRetries: repeatTimes,
      retryNumber: Math.max(0, retryCount - 1),
    })
  }

  /**
   * OCPP 2.0.1 Incoming Request Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestPayloadConfigs = (): [
    OCPP20IncomingRequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP20ServiceUtils.incomingRequestSchemaNames, 'Request.json')

  /**
   * Configuration for OCPP 2.0.1 Incoming Request Response validators
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestResponsePayloadConfigs = (): [
    OCPP20IncomingRequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP20ServiceUtils.incomingRequestSchemaNames, 'Response.json')

  /**
   * Factory options for OCPP 2.0.1 payload validators
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0.1 validators
   */
  public static createPayloadOptions = (moduleName: string, methodName: string) =>
    PayloadValidatorOptions(
      OCPPVersion.VERSION_201,
      'assets/json-schemas/ocpp/2.0',
      moduleName,
      methodName
    )

  /**
   * OCPP 2.0.1 Request Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createRequestPayloadConfigs = (): [
    OCPP20RequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP20ServiceUtils.outgoingRequestSchemaNames, 'Request.json')

  /**
   * OCPP 2.0.1 Response Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createResponsePayloadConfigs = (): [
    OCPP20RequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP20ServiceUtils.outgoingRequestSchemaNames, 'Response.json')

  /**
   * One tick of the station-scoped clock-aligned MeterValues sweep (#2011
   * Category 2F, J01.FR.14/J01.FR.20/J01.FR.21/J01.FR.22). Called by the
   * station-level aligned timer; every gate is re-read per tick so
   * configuration changes take effect without re-arming:
   * - `AlignedDataCtrlr.Interval <= 0` disables transmission (spec §2.2). Read
   *   raw (not via {@link OCPP20ServiceUtils.getAlignedDataInterval}) because
   *   `readVariableAsIntervalMs` clamps non-positive values to the default.
   * - `AlignedDataCtrlr.Enabled=false` (the default) disables the feature.
   * - The station-scoped `SendDuringIdle=true` suppresses the whole sweep
   *   while any transaction is ongoing (J01.FR.20).
   * EVSEs without a transaction get one aggregated `MeterValuesRequest` with
   * ReadingContext Sample.Clock while online. Each active connector reports
   * its sample in `TransactionEvent(Updated, MeterValueClock)` and queues it
   * while offline so transaction identity and sequence state remain attached.
   * @param chargingStation - Target charging station
   * @param timestamp - UTC slot timestamp shared by every message in this sweep
   */
  public static async emitClockAlignedMeterValues (
    chargingStation: ChargingStation,
    timestamp = new Date()
  ): Promise<void> {
    const alignedDataIntervalSeconds =
      OCPP20ServiceUtils.readAlignedDataIntervalSeconds(chargingStation)
    if (alignedDataIntervalSeconds == null || alignedDataIntervalSeconds === 0) {
      return
    }
    const alignedDataEnabled = OCPP20ServiceUtils.readVariableAsBoolean(
      chargingStation,
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20RequiredVariableName.Enabled,
      false
    )
    if (!alignedDataEnabled) {
      return
    }
    const sendDuringIdle = OCPP20ServiceUtils.isAlignedDataSendDuringIdleEnabled(chargingStation)
    // J01.FR.20: the station-scoped value suppresses the whole charging
    // station. More specific EVSE values are applied in the EVSE sweep below.
    // A pending remote start is not ongoing until its Started event is accepted.
    if (
      sendDuringIdle &&
      chargingStation
        .iterateConnectors(true)
        .some(({ connectorStatus }) => hasOngoingTransaction(connectorStatus))
    ) {
      return
    }
    const responseTimeoutMs = OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20RequiredVariableName.MessageTimeout,
      Constants.DEFAULT_MESSAGE_TIMEOUT_SECONDS,
      'Default'
    )
    const measurandsKey = buildConfigKey(
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20RequiredVariableName.Measurands
    )
    const periodicTransactionEnergySamples = hasPeriodicTransactionEnergySamples(chargingStation)
    const canSendNonTransactional =
      chargingStation.isWebSocketConnectionOpened() && chargingStation.inAcceptedState()
    const pendingRequests: { evseId: number; send: () => Promise<void> }[] = []
    const physicalMeterValues: OCPP20MeterValue[] = []
    const evses = [...chargingStation.iterateEvses()].sort(
      ({ evseId: left }, { evseId: right }) => {
        if (left === 0) return 1
        if (right === 0) return -1
        return left - right
      }
    )
    for (const { evseId, evseStatus } of evses) {
      let evseInTransaction = false
      for (const connectorStatus of evseStatus.connectors.values()) {
        if (hasOngoingTransaction(connectorStatus)) {
          evseInTransaction = true
          break
        }
      }
      const usesEvseMeterTemplate = evseId !== 0 && isNotEmptyArray(evseStatus.MeterValues)
      const evseEnergyActiveImportRegisterValue = usesEvseMeterTemplate
        ? [...evseStatus.connectors.values()].reduce(
            (total, connectorStatus) =>
              total + Math.max(0, connectorStatus.energyActiveImportRegisterValue ?? 0),
            0
          )
        : undefined
      const suppressEvseEmission =
        evseId !== 0 &&
        evseInTransaction &&
        OCPP20ServiceUtils.isAlignedDataSendDuringIdleEnabled(chargingStation, evseId)
      const meterValues: OCPP20MeterValue[] = []
      const sampledValueTemplates: SampledValueTemplate[] = []
      let idleMeterConnectorId: number | undefined
      for (const [connectorId, connectorStatus] of evseStatus.connectors) {
        if (!evseInTransaction && usesEvseMeterTemplate && idleMeterConnectorId != null) continue
        // A transaction whose Ended delivery is in flight already reports as
        // an idle meter point; it must not emit another Updated event.
        // Only accepted Started transactions get TransactionEvent(Updated).
        // A pending remote start remains idle until then and reports through
        // the non-transactional MeterValues path.
        const transactionId =
          connectorStatus.transactionEnding !== true &&
          !hasQueuedEndedEvent(connectorStatus) &&
          connectorStatus.transactionStarted === true &&
          connectorStatus.transactionId != null
            ? connectorStatus.transactionId
            : undefined
        if (evseInTransaction && transactionId == null && usesEvseMeterTemplate) continue
        try {
          const meterValue = buildClockAlignedConnectorMeterValue(
            chargingStation,
            {
              connectorId,
              ...((!periodicTransactionEnergySamples ||
                connectorStatus.transactionRestored === true) &&
                transactionId != null && { advanceEnergy: true }),
              ...(evseId === 0 && {
                idle: !chargingStation
                  .iterateConnectors(true)
                  .some(({ connectorStatus }) => hasOngoingTransaction(connectorStatus)),
                sampledValueBaseline: aggregateClockAlignedSamples(
                  physicalMeterValues,
                  chargingStation.getNumberOfPhases()
                ).filter(
                  sampledValue => sampledValue.measurand !== OCPP20MeasurandEnumType.STATE_OF_CHARGE
                ),
              }),
              ...(usesEvseMeterTemplate &&
                (!evseInTransaction ||
                  chargingStation.stationInfo?.meteringPerTransaction !== true) && {
                energyRegisterWhOverride: evseEnergyActiveImportRegisterValue,
              }),
              evseId,
              timestamp,
              ...(transactionId != null && { transactionId }),
            },
            secondsToMilliseconds(alignedDataIntervalSeconds),
            measurandsKey,
            OCPP20ReadingContextEnumType.SAMPLE_CLOCK
          )
          if (!isNotEmptyArray(meterValue.sampledValue)) continue
          if (
            evseId !== 0 &&
            !isNotEmptyArray(evseStatus.MeterValues) &&
            isNotEmptyArray(connectorStatus.MeterValues)
          ) {
            sampledValueTemplates.push(...connectorStatus.MeterValues)
          }
          if (evseId !== 0) physicalMeterValues.push(meterValue)
          if (transactionId != null) {
            if (!suppressEvseEmission) {
              pendingRequests.push({
                evseId,
                send: () =>
                  OCPP20ServiceUtils.sendTransactionEvent(
                    chargingStation,
                    OCPP20TransactionEventEnumType.Updated,
                    OCPP20TriggerReasonEnumType.MeterValueClock,
                    connectorId,
                    transactionId.toString(),
                    { evseId, meterValue: [meterValue], timestamp },
                    {
                      responseTimeoutMs,
                      skipBufferingOnError: false,
                      throwError: true,
                    }
                  )
                    .then(() => undefined)
                    .catch((error: unknown) => {
                      logger.error(
                        `${chargingStation.logPrefix()} ${moduleName}.emitClockAlignedMeterValues: Error sending clock-aligned '${OCPP20RequestCommand.TRANSACTION_EVENT}':`,
                        error
                      )
                    }),
              })
            }
          } else {
            idleMeterConnectorId ??= connectorId
            meterValues.push(meterValue)
          }
        } catch (error: unknown) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.emitClockAlignedMeterValues: ${getErrorMessage(error)}`
          )
        }
      }
      if (
        suppressEvseEmission ||
        !canSendNonTransactional ||
        evseInTransaction ||
        !isNotEmptyArray(meterValues)
      ) {
        continue
      }
      let requestMeterValues = meterValues
      if (evseId !== 0 && meterValues.length > 1 && idleMeterConnectorId != null) {
        const energyRegisterWhOverride = [...evseStatus.connectors.values()].reduce(
          (total, connectorStatus) =>
            total + Math.max(0, connectorStatus.energyActiveImportRegisterValue ?? 0),
          0
        )
        requestMeterValues = [
          buildClockAlignedConnectorMeterValue(
            chargingStation,
            {
              connectorId: idleMeterConnectorId,
              energyRegisterWhOverride,
              evseId,
              idle: true,
              sampledValueBaseline: aggregateClockAlignedSamples(
                meterValues,
                chargingStation.getNumberOfPhases()
              ),
              ...(isNotEmptyArray(sampledValueTemplates) && { sampledValueTemplates }),
              timestamp,
            },
            secondsToMilliseconds(alignedDataIntervalSeconds),
            measurandsKey,
            OCPP20ReadingContextEnumType.SAMPLE_CLOCK
          ),
        ]
      }
      pendingRequests.push({
        evseId,
        send: () =>
          OCPP20ServiceUtils.sendClockAlignedMeterValuesRequest(
            chargingStation,
            evseId,
            { evseId, meterValue: requestMeterValues },
            responseTimeoutMs
          ),
      })
    }
    await Promise.all(
      pendingRequests
        .sort(({ evseId: left }, { evseId: right }) => left - right)
        .map(({ send }) => send())
    )
  }

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
      Constants.DEFAULT_ALIGNED_DATA_INTERVAL_SECONDS
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
   * Returns whether autonomous clock-aligned data generation is enabled.
   * @param chargingStation - Target charging station
   * @returns Whether clock-aligned data generation is enabled
   */
  public static isAlignedDataEnabled (chargingStation: ChargingStation): boolean {
    return OCPP20ServiceUtils.readVariableAsBoolean(
      chargingStation,
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20RequiredVariableName.Enabled,
      false
    )
  }

  /**
   * Resolves `AlignedDataCtrlr.SendDuringIdle`, optionally for one EVSE.
   * EVSE-scoped values fall back to the station-wide value when absent.
   * @param chargingStation - Target charging station
   * @param evseId - Optional EVSE scope
   * @returns The SendDuringIdle variable value
   */
  public static isAlignedDataSendDuringIdleEnabled (
    chargingStation: ChargingStation,
    evseId?: number
  ): boolean {
    return OCPP20ServiceUtils.readVariableAsBoolean(
      chargingStation,
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20OptionalVariableName.SendDuringIdle,
      false,
      evseId
    )
  }

  public static readAlignedDataIntervalSeconds (
    chargingStation: ChargingStation
  ): number | undefined {
    const value =
      OCPP20ServiceUtils.readVariableValue(
        chargingStation,
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.AlignedDataInterval
      ) ?? Constants.DEFAULT_ALIGNED_DATA_INTERVAL_SECONDS.toString()
    if (!/^[0-9]+$/.test(value)) {
      logger.warn(
        `${moduleName}.readAlignedDataIntervalSeconds: Invalid integer '${value}' for AlignedDataCtrlr.Interval`
      )
      return
    }
    const intervalSeconds = Number(value)
    if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds > Constants.SECONDS_PER_DAY) {
      logger.warn(
        `${moduleName}.readAlignedDataIntervalSeconds: Out-of-range value '${value}' for AlignedDataCtrlr.Interval`
      )
      return
    }
    return intervalSeconds
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
    defaultValue: boolean,
    evseId?: number
  ): boolean {
    const value = OCPP20ServiceUtils.readVariableValue(
      chargingStation,
      componentName,
      variableName,
      undefined,
      evseId
    )
    return value != null ? convertToBoolean(value) : defaultValue
  }

  public static readVariableAsInteger (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultValue: number,
    componentInstance?: string
  ): number {
    const value = OCPP20ServiceUtils.readVariableValue(
      chargingStation,
      componentName,
      variableName,
      componentInstance
    )
    if (value != null) {
      try {
        return convertToInt(value)
      } catch {
        logger.warn(
          `${moduleName}.readVariableAsInteger: Cannot convert '${value}' to integer for ${buildConfigKey(componentName, variableName)}, using default ${defaultValue.toString()}`
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
    variableName: string,
    componentInstance?: string,
    evseId?: number
  ): string | undefined {
    const variableManager = OCPP20VariableManager.getInstance()
    const results = variableManager.getVariables(chargingStation, [
      {
        component: {
          name: componentName,
          ...(componentInstance != null && { instance: componentInstance }),
          ...(evseId != null && { evse: { id: evseId } }),
        },
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
      connectorId,
      evseId
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
      connectorId,
      evseId
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
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   */
  public static async sendQueuedTransactionEvents (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): Promise<void> {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    if (connectorStatus == null) return
    await OCPP20ServiceUtils.serializeTransactionEventDelivery(connectorStatus, () =>
      OCPP20ServiceUtils.drainQueuedTransactionEvents(
        chargingStation,
        connectorId,
        connectorStatus,
        evseId
      )
    )
  }

  /**
   * Send a TransactionEvent request to the CSMS, or queue it if offline.
   * @param chargingStation - Target charging station
   * @param eventType - Transaction event type (Started, Updated, Ended)
   * @param triggerReason - Reason that triggered the event
   * @param connectorId - Connector identifier
   * @param transactionId - Transaction identifier
   * @param options - Additional transaction event options
   * @param requestParams - Optional transport behavior overrides
   * @returns Promise resolving to the TransactionEvent response
   */
  public static async sendTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    triggerReason: OCPP20TriggerReasonEnumType,
    connectorId: number,
    transactionId: string,
    options: Omit<OCPP20TransactionEventOptions, 'eventType'> = {},
    requestParams?: RequestParams
  ): Promise<OCPP20TransactionEventResponse> {
    try {
      const evseId = typeof options.evseId === 'number' ? options.evseId : undefined
      const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
      if (connectorStatus == null) {
        const errorMsg = `Cannot find connector status for connector ${connectorId.toString()}`
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: ${errorMsg}`
        )
        throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
      }
      const reservePublicKey = (request: OCPP20TransactionEventRequest): boolean => {
        const reservesPublicKey =
          connectorStatus.publicKeySentInTransaction !== true &&
          connectorStatus.transactionId?.toString() === transactionId &&
          request.meterValue?.some(meterValue =>
            meterValue.sampledValue.some(
              sampledValue => (sampledValue.signedMeterValue?.publicKey.length ?? 0) > 0
            )
          ) === true
        if (reservesPublicKey) connectorStatus.publicKeySentInTransaction = true
        return reservesPublicKey
      }

      const webSocketOpen = chargingStation.isWebSocketConnectionOpened()
      const canSend = webSocketOpen && chargingStation.inAcceptedState()
      if (!canSend && requestParams?.skipBufferingOnError === true) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Dropping non-buffered TransactionEvent while the station cannot send transaction messages`
        )
        return { idTokenInfo: undefined }
      }
      const transactionEventRequest = buildTransactionEvent(chargingStation, {
        connectorId,
        eventType,
        transactionId,
        ...options,
        triggerReason,
        ...(!webSocketOpen && { offline: true }),
      })
      const reservesPublicKey = reservePublicKey(transactionEventRequest)
      if (!canSend) {
        OCPP20ServiceUtils.enqueueTransactionEvent(
          chargingStation,
          connectorStatus,
          transactionEventRequest,
          transactionEventRequest.offline === true
        )
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Station ${webSocketOpen ? 'not accepted' : 'offline'}, queueing TransactionEvent with seqNo=${transactionEventRequest.seqNo.toString()}`
        )
        return { idTokenInfo: undefined }
      }
      if (
        eventType === OCPP20TransactionEventEnumType.Updated &&
        OCPP20ServiceUtils.transactionEventSendChains.has(connectorStatus)
      ) {
        OCPP20ServiceUtils.enqueueTransactionEvent(
          chargingStation,
          connectorStatus,
          transactionEventRequest
        )
        OCPP20ServiceUtils.scheduleTransactionEventQueueDrain(
          chargingStation,
          connectorId,
          connectorStatus,
          evseId
        )
        return { idTokenInfo: undefined }
      }

      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Sending TransactionEvent for trigger ${triggerReason}`
      )
      const queuedEventsBeforeRequest = new Set(connectorStatus.transactionEventQueue ?? [])
      const deliveryState = { responseReceived: false, sent: false }
      try {
        return await OCPP20ServiceUtils.serializeTransactionEventDelivery(
          connectorStatus,
          async () => {
            if (queuedEventsBeforeRequest.size > 0) {
              await OCPP20ServiceUtils.drainQueuedTransactionEvents(
                chargingStation,
                connectorId,
                connectorStatus,
                evseId,
                queuedEventsBeforeRequest
              )
              if (
                connectorStatus.transactionEventQueue?.some(queuedEvent =>
                  queuedEventsBeforeRequest.has(queuedEvent)
                ) === true ||
                !chargingStation.isWebSocketConnectionOpened() ||
                !chargingStation.inAcceptedState()
              ) {
                OCPP20ServiceUtils.enqueueTransactionEvent(
                  chargingStation,
                  connectorStatus,
                  transactionEventRequest,
                  transactionEventRequest.offline === true
                )
                return { idTokenInfo: undefined }
              }
            }
            return OCPP20ServiceUtils.sendBuiltTransactionEvent(
              chargingStation,
              transactionEventRequest,
              {
                ...requestParams,
                onMessageSent: () => {
                  deliveryState.sent = true
                  requestParams?.onMessageSent?.()
                },
                onResponseReceived: () => {
                  deliveryState.responseReceived = true
                  requestParams?.onResponseReceived?.()
                },
                skipBufferingOnError: true,
              }
            )
          }
        )
      } catch (error) {
        if (
          !deliveryState.responseReceived &&
          requestParams?.skipBufferingOnError !== true &&
          (OCPP20ServiceUtils.isChargingStationStopping(chargingStation) ||
            !deliveryState.sent ||
            !chargingStation.isWebSocketConnectionOpened() ||
            !chargingStation.inAcceptedState())
        ) {
          OCPP20ServiceUtils.enqueueTransactionEvent(
            chargingStation,
            connectorStatus,
            transactionEventRequest,
            transactionEventRequest.offline === true
          )
          logger.info(
            `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Delivery interrupted, queueing TransactionEvent with seqNo=${transactionEventRequest.seqNo.toString()}`
          )
          return { idTokenInfo: undefined }
        }
        if (
          reservesPublicKey &&
          !deliveryState.sent &&
          connectorStatus.transactionId?.toString() === transactionId
        ) {
          connectorStatus.publicKeySentInTransaction = false
        }
        throw error
      }
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
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   */
  public static startEndedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    interval: number,
    evseId?: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    if (connectorStatus == null) {
      return
    }
    connectorStatus.transactionEndedMeterValues ??= []
    if (interval <= 0) {
      return
    }
    if (connectorStatus.transactionEndedMeterValuesSetInterval != null) {
      OCPP20ServiceUtils.stopEndedMeterValues(chargingStation, connectorId, evseId)
    }
    connectorStatus.transactionEndedMeterValuesSetInterval = setInterval(() => {
      const cs = chargingStation.getConnectorStatus(connectorId, evseId)
      if (
        cs?.transactionStarted === true &&
        cs.transactionEnding !== true &&
        cs.transactionId != null
      ) {
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
    // Create coherent session BEFORE building the Transaction.Started MeterValue
    // so the coherent gate in `buildMeterValue` runs against a live session
    // (E02.FR.09 measurands from a physics-consistent initial state).
    // Idempotent — a duplicate call from the response handler is a no-op.
    chargingStation.createCoherentSession(transactionId, connectorId)
    const startedMeterValues = OCPP20ServiceUtils.buildTransactionStartedMeterValues(
      chargingStation,
      transactionId
    )
    if (isNotEmptyArray(startedMeterValues) && connectorStatus != null) {
      connectorStatus.transactionBeginMeterValue = startedMeterValues[0] as MeterValue
    }
    let response
    if (connectorStatus != null) connectorStatus.transactionStarting = true
    try {
      response = await OCPP20ServiceUtils.sendTransactionEvent(
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
    } catch (error) {
      // A failed Started delivery must not leak identity/sequence state into
      // the next transaction attempt. Both cleanup operations are idempotent.
      resetConnectorStatus(connectorStatus)
      chargingStation.destroyCoherentSession(transactionId)
      throw error
    } finally {
      if (connectorStatus != null) connectorStatus.transactionStarting = false
    }
    const accepted =
      response.idTokenInfo == null ||
      response.idTokenInfo.status === OCPP20AuthorizationStatusEnumType.Accepted
    if (accepted && connectorStatus != null && connectorStatus.transactionStarted !== true) {
      const evseId = chargingStation.getEvseIdByConnectorId(connectorId)
      connectorStatus.transactionStarted = true
      connectorStatus.transactionPending = false
      connectorStatus.transactionIdTag ??= idTag
      connectorStatus.transactionStart ??= new Date()
      connectorStatus.transactionEnergyActiveImportRegisterValue ??= 0
      connectorStatus.locked = true
      connectorStatus.status = OCPP20ConnectorStatusEnumType.Occupied
      OCPP20ServiceUtils.startUpdatedMeterValues(
        chargingStation,
        connectorId,
        OCPP20ServiceUtils.getTxUpdatedInterval(chargingStation),
        evseId
      )
      OCPP20ServiceUtils.startEndedMeterValues(
        chargingStation,
        connectorId,
        OCPP20ServiceUtils.getTxEndedInterval(chargingStation),
        evseId
      )
    }
    return { accepted }
  }

  /**
   * Start periodic TransactionEvent(Updated) with meter values for a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   * @param interval - Sending interval in milliseconds
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   */
  public static startUpdatedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    interval: number,
    evseId?: number
  ): void {
    const initialConnectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
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
    delete initialConnectorStatus.transactionRestored
    if (initialConnectorStatus.transactionUpdatedMeterValuesSetInterval != null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: TxUpdatedInterval already started, stopping first`
      )
      OCPP20ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId, evseId)
    }
    initialConnectorStatus.transactionUpdatedMeterValuesSetInterval = setInterval(() => {
      const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
      if (
        connectorStatus?.transactionStarted === true &&
        connectorStatus.transactionEnding !== true &&
        connectorStatus.transactionId != null
      ) {
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
            const resolvedEvseId = evseId ?? chargingStation.getEvseIdByConnectorId(connectorId)
            OCPP20ServiceUtils.terminateTransaction(
              chargingStation,
              connectorId,
              connectorStatus,
              connectorStatus.transactionId.toString(),
              OCPP20TriggerReasonEnumType.Deauthorized,
              OCPP20ReasonEnumType.DeAuthorized,
              resolvedEvseId
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
          interval,
          buildConfigKey(
            OCPP20ComponentName.SampledDataCtrlr,
            OCPP20RequiredVariableName.TxUpdatedMeasurands
          )
        ) as OCPP20MeterValue
        // OCPP 2.0.1 `MeterValueType.sampledValue` cardinality is `1..*`, while
        // `TransactionEventRequest.meterValue` is `0..*`: when `TxUpdatedMeasurands`
        // yields no sampled values, omit the `meterValue` field entirely rather
        // than send an empty-wrapper schema violation.
        const eventPayload = {
          ...(isNotEmptyArray(meterValue.sampledValue) && { meterValue: [meterValue] }),
          ...(evseId != null && { evseId }),
        }
        OCPP20ServiceUtils.sendTransactionEvent(
          chargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          connectorStatus.transactionId as string,
          eventPayload
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
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   */
  public static stopEndedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
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
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   */
  public static stopUpdatedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
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

  /**
   * Waits until all transaction-event work currently serialized for a connector has settled.
   * New work chained while waiting is included before this method resolves.
   * @param connectorStatus - Connector whose delivery chain must settle
   */
  public static async waitForTransactionEventDelivery (
    connectorStatus: ConnectorStatus
  ): Promise<void> {
    let pending = OCPP20ServiceUtils.transactionEventSendChains.get(connectorStatus)
    while (pending != null) {
      await pending.catch(() => undefined)
      const next = OCPP20ServiceUtils.transactionEventSendChains.get(connectorStatus)
      if (next === pending) return
      pending = next
    }
  }

  private static buildTransactionEndedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    transactionId: number | string,
    evseId?: number
  ): OCPP20MeterValue[] {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    const endedMeterValues = (connectorStatus?.transactionEndedMeterValues ??
      []) as OCPP20MeterValue[]
    const beginMeterValue = connectorStatus?.transactionBeginMeterValue as
      OCPP20MeterValue | undefined

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
        `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEndedMeterValues: ${getErrorMessage(error)}`
      )
    }
    const meterValues: OCPP20MeterValue[] = [
      ...(beginMeterValue != null ? [beginMeterValue] : []),
      ...endedMeterValues,
    ]
    return isNotEmptyArray(meterValues) ? meterValues : []
  }

  private static async drainQueuedTransactionEvents (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus,
    evseId?: number,
    eligibleEvents?: ReadonlySet<QueuedTransactionEvent>
  ): Promise<void> {
    const queue: QueuedTransactionEvent[] = connectorStatus.transactionEventQueue ?? []
    if (queue.length === 0) return
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Sending ${queue.length.toString()} queued TransactionEvents for connector ${connectorId.toString()}`
    )

    const responseTimeoutMs = OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20RequiredVariableName.MessageTimeout,
      Constants.DEFAULT_MESSAGE_TIMEOUT_SECONDS,
      'Default'
    )
    let queueChanged = false
    while (queue.length > 0) {
      const queuedEvent = queue[0]
      if (eligibleEvents != null && !eligibleEvents.has(queuedEvent)) break
      const responseState = { received: false, sent: false }
      try {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Sending queued event with seqNo=${queuedEvent.seqNo.toString()}`
        )
        await OCPP20ServiceUtils.sendBuiltTransactionEvent(chargingStation, queuedEvent.request, {
          onMessageSent: () => {
            responseState.sent = true
          },
          onResponseReceived: () => {
            responseState.received = true
          },
          responseTimeoutMs,
          skipBufferingOnError: true,
        })
        if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended) {
          await OCPP20ServiceUtils.cleanupEndedTransaction(
            chargingStation,
            connectorId,
            connectorStatus,
            evseId,
            queuedEvent.request.transactionInfo.transactionId
          )
        }
        queue.shift()
        queueChanged = true
      } catch (error) {
        if (
          !OCPP20ServiceUtils.isChargingStationStopping(chargingStation) &&
          (responseState.received || chargingStation.isWebSocketConnectionOpened())
        ) {
          if (!responseState.sent) {
            const publicKey = Array.isArray(queuedEvent.request.meterValue)
              ? queuedEvent.request.meterValue
                .flatMap(meterValue =>
                  Array.isArray(meterValue.sampledValue) ? meterValue.sampledValue : []
                )
                .map(sampledValue => sampledValue.signedMeterValue?.publicKey)
                .find(key => key != null && key.length > 0)
              : undefined
            const nextSignedSample = queue
              .slice(1)
              .filter(
                remainingEvent =>
                  remainingEvent.request.transactionInfo.transactionId ===
                  queuedEvent.request.transactionInfo.transactionId
              )
              .flatMap(remainingEvent =>
                Array.isArray(remainingEvent.request.meterValue)
                  ? remainingEvent.request.meterValue
                  : []
              )
              .flatMap(meterValue =>
                Array.isArray(meterValue.sampledValue) ? meterValue.sampledValue : []
              )
              .find(sampledValue => sampledValue.signedMeterValue != null)
            if (publicKey != null && nextSignedSample?.signedMeterValue != null) {
              nextSignedSample.signedMeterValue.publicKey = publicKey
            } else if (
              publicKey != null &&
              connectorStatus.transactionId?.toString() ===
                queuedEvent.request.transactionInfo.transactionId
            ) {
              connectorStatus.publicKeySentInTransaction = false
            }
          }
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Discarding queued TransactionEvent with seqNo=${queuedEvent.seqNo.toString()} ${responseState.received ? 'after its response handler failed' : 'after configured delivery attempts'}:`,
            error
          )
          if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended) {
            await OCPP20ServiceUtils.cleanupEndedTransaction(
              chargingStation,
              connectorId,
              connectorStatus,
              evseId,
              queuedEvent.request.transactionInfo.transactionId
            )
          }
          queue.shift()
          queueChanged = true
          continue
        }
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Connection lost while sending queued TransactionEvent with seqNo=${queuedEvent.seqNo.toString()}, preserving it and the remaining queue:`,
          error
        )
        break
      }
    }
    if (queueChanged) chargingStation.saveTransactionEventQueues()
  }

  private static enqueueTransactionEvent (
    chargingStation: ChargingStation,
    connectorStatus: ConnectorStatus,
    request: OCPP20TransactionEventRequest,
    markOffline = false
  ): void {
    if (markOffline) request.offline = true
    connectorStatus.transactionEventQueue ??= []
    const queue = connectorStatus.transactionEventQueue
    const transactionId = request.transactionInfo.transactionId
    const isUpdatedEvent = request.eventType === OCPP20TransactionEventEnumType.Updated
    const queueLimit = isUpdatedEvent
      ? Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH - 2
      : Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH
    if (queue.length >= queueLimit) {
      if (!OCPP20ServiceUtils.saturatedTransactionEventQueues.has(connectorStatus)) {
        OCPP20ServiceUtils.saturatedTransactionEventQueues.add(connectorStatus)
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.enqueueTransactionEvent: TransactionEvent queue reached its bounded update capacity; replacing intermediate updates until delivery resumes`
        )
      }
      let removedEvents: QueuedTransactionEvent[] = []
      const replaceableIndex = queue.findIndex(
        queuedEvent => queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated
      )
      if (replaceableIndex >= 0) {
        removedEvents = queue.splice(replaceableIndex, 1)
      } else if (!isUpdatedEvent) {
        const completedTransactionId = queue.find(
          queuedEvent => queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended
        )?.request.transactionInfo.transactionId
        if (completedTransactionId != null) {
          for (let index = queue.length - 1; index >= 0; index--) {
            if (queue[index].request.transactionInfo.transactionId === completedTransactionId) {
              removedEvents.push(...queue.splice(index, 1))
            }
          }
        }
      }
      if (removedEvents.length === 0 && !isUpdatedEvent) {
        const oldestLifecycleEvent = queue.shift()
        if (oldestLifecycleEvent != null) removedEvents.push(oldestLifecycleEvent)
      }
      if (removedEvents.length === 0) {
        const droppedPublicKey =
          request.meterValue
            ?.flatMap(meterValue => meterValue.sampledValue)
            .some(sampledValue => {
              const publicKey = sampledValue.signedMeterValue?.publicKey
              return typeof publicKey === 'string' && publicKey.length > 0
            }) === true
        if (droppedPublicKey) connectorStatus.publicKeySentInTransaction = false
        return
      }
      for (const removedEvent of removedEvents) {
        const removedTransactionId = removedEvent.request.transactionInfo.transactionId
        const removedPublicKey = removedEvent.request.meterValue
          ?.flatMap(meterValue => meterValue.sampledValue)
          .map(sampledValue => sampledValue.signedMeterValue?.publicKey)
          .find(publicKey => typeof publicKey === 'string' && publicKey.length > 0)
        if (removedPublicKey == null) continue
        const replacementRequest = [...queue.map(queuedEvent => queuedEvent.request), request].find(
          candidate =>
            candidate.transactionInfo.transactionId === removedTransactionId &&
            candidate.meterValue?.some(meterValue =>
              meterValue.sampledValue.some(sampledValue => sampledValue.signedMeterValue != null)
            ) === true
        )
        const replacementSignedSample = replacementRequest?.meterValue
          ?.flatMap(meterValue => meterValue.sampledValue)
          .find(sampledValue => sampledValue.signedMeterValue != null)
        if (replacementSignedSample?.signedMeterValue != null) {
          if (replacementSignedSample.signedMeterValue.publicKey.length === 0) {
            replacementSignedSample.signedMeterValue.publicKey = removedPublicKey
          }
        } else if (connectorStatus.transactionId?.toString() === removedTransactionId) {
          connectorStatus.publicKeySentInTransaction = false
        }
      }
    }
    const queuedEvent = { request, seqNo: request.seqNo, timestamp: new Date() }
    let insertionIndex = queue.length
    for (let index = queue.length - 1; index >= 0; index--) {
      const existingEvent = queue[index]
      if (existingEvent.request.transactionInfo.transactionId !== transactionId) continue
      if (existingEvent.seqNo === request.seqNo) return
      insertionIndex = index
      if (existingEvent.seqNo < request.seqNo) {
        insertionIndex = index + 1
        break
      }
    }
    queue.splice(insertionIndex, 0, queuedEvent)
    chargingStation.saveTransactionEventQueues()
  }

  private static isChargingStationStopping (chargingStation: ChargingStation): boolean {
    return (chargingStation as unknown as { isStopping?: () => boolean }).isStopping?.() === true
  }

  /**
   * Reads an integer and clamps it to its canonical Device Model bounds.
   * @param chargingStation - Target charging station
   * @param componentName - Device Model component name
   * @param variableName - Device Model variable name
   * @param defaultValue - Fallback value
   * @param componentInstance - Optional component instance
   * @returns The bounded integer value
   */
  private static readBoundedVariableAsInteger (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultValue: number,
    componentInstance?: string
  ): number {
    const value = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      componentName,
      variableName,
      defaultValue,
      componentInstance
    )
    const metadata = getVariableMetadata(componentName, variableName, componentInstance)
    return Math.min(metadata?.max ?? value, Math.max(metadata?.min ?? value, value))
  }

  private static readVariableAsIntervalMs (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultSeconds: number,
    componentInstance?: string
  ): number {
    const intervalSeconds = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      componentName,
      variableName,
      defaultSeconds,
      componentInstance
    )
    return intervalSeconds > 0
      ? secondsToMilliseconds(intervalSeconds)
      : secondsToMilliseconds(defaultSeconds)
  }

  private static resolveActiveTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): { connectorStatus: ConnectorStatus; transactionId: string } {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    if (
      connectorStatus?.transactionEnding !== true &&
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
          `${chargingStation.logPrefix()} ${moduleName}.resolveActiveTransaction: Non-string transaction ID ${transactionId} converted to string for OCPP 2.0.1`
        )
      }
      return { connectorStatus, transactionId }
    }
    throw new OCPPError(
      ErrorType.PROPERTY_CONSTRAINT_VIOLATION,
      `No active transaction on connector ${connectorId.toString()}`
    )
  }

  private static scheduleTransactionEventQueueDrain (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus,
    evseId?: number
  ): void {
    if (OCPP20ServiceUtils.transactionEventQueueDrains.has(connectorStatus)) return
    OCPP20ServiceUtils.transactionEventQueueDrains.add(connectorStatus)
    OCPP20ServiceUtils.sendQueuedTransactionEvents(chargingStation, connectorId, evseId)
      .finally(() => {
        OCPP20ServiceUtils.transactionEventQueueDrains.delete(connectorStatus)
        if (
          isNotEmptyArray(connectorStatus.transactionEventQueue) &&
          chargingStation.isWebSocketConnectionOpened() &&
          chargingStation.inAcceptedState()
        ) {
          OCPP20ServiceUtils.scheduleTransactionEventQueueDrain(
            chargingStation,
            connectorId,
            connectorStatus,
            evseId
          )
        }
      })
      .catch((error: unknown) => {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.scheduleTransactionEventQueueDrain: Error draining queued TransactionEvents:`,
          error
        )
      })
  }

  /**
   * Sends one pre-built TransactionEvent and applies the OCPP E13 retry policy
   * without rebuilding it, preserving its timestamp and sequence number.
   * @param chargingStation - Target charging station
   * @param request - Immutable TransactionEvent payload to send
   * @param requestParams - Transport behavior overrides
   * @returns The TransactionEvent response
   */
  private static async sendBuiltTransactionEvent (
    chargingStation: ChargingStation,
    request: OCPP20TransactionEventRequest,
    requestParams: RequestParams = {}
  ): Promise<OCPP20TransactionEventResponse> {
    const maximumAttempts = OCPP20ServiceUtils.readBoundedVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20RequiredVariableName.MessageAttempts,
      3,
      OCPP20RequestCommand.TRANSACTION_EVENT
    )
    const retryIntervalMs = secondsToMilliseconds(
      OCPP20ServiceUtils.readBoundedVariableAsInteger(
        chargingStation,
        OCPP20ComponentName.OCPPCommCtrlr,
        OCPP20RequiredVariableName.MessageAttemptInterval,
        5,
        OCPP20RequestCommand.TRANSACTION_EVENT
      )
    )
    const responseTimeoutMs =
      requestParams.responseTimeoutMs ??
      secondsToMilliseconds(
        OCPP20ServiceUtils.readBoundedVariableAsInteger(
          chargingStation,
          OCPP20ComponentName.OCPPCommCtrlr,
          OCPP20RequiredVariableName.MessageTimeout,
          Constants.DEFAULT_MESSAGE_TIMEOUT_SECONDS,
          'Default'
        )
      )
    const lifecycleAbortSignal = (chargingStation as { lifecycleAbortSignal?: AbortSignal })
      .lifecycleAbortSignal
    for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
      const deliveryState = { responseReceived: false, sent: false }
      try {
        return await chargingStation.ocppRequestService.requestHandler<
          OCPP20TransactionEventRequest,
          OCPP20TransactionEventResponse
        >(chargingStation, OCPP20RequestCommand.TRANSACTION_EVENT, request, {
          ...requestParams,
          onMessageSent: () => {
            deliveryState.sent = true
            requestParams.onMessageSent?.()
          },
          onResponseReceived: () => {
            deliveryState.responseReceived = true
            requestParams.onResponseReceived?.()
          },
          rawPayload: true,
          responseTimeoutMs,
          skipBufferingOnError: requestParams.skipBufferingOnError ?? false,
          throwError: true,
        })
      } catch (error) {
        if (deliveryState.responseReceived) throw error
        const bufferedBeforeSend =
          !deliveryState.sent && requestParams.skipBufferingOnError !== true
        if (
          bufferedBeforeSend ||
          !chargingStation.isWebSocketConnectionOpened() ||
          attempt >= maximumAttempts
        ) {
          throw error
        }
        const retryDelayMs = clampToSafeTimerValue(retryIntervalMs * attempt)
        if (lifecycleAbortSignal == null) {
          await sleep(retryDelayMs)
        } else {
          await interruptibleSleep(retryDelayMs, lifecycleAbortSignal)
          if (lifecycleAbortSignal.aborted) throw error
        }
      }
    }
    throw new OCPPError(
      ErrorType.GENERIC_ERROR,
      'TransactionEvent retry loop exhausted unexpectedly',
      OCPP20RequestCommand.TRANSACTION_EVENT
    )
  }

  /**
   * Serializes non-transactional aligned MeterValues per EVSE and coalesces
   * stalled intervals to the latest snapshot.
   * @param chargingStation - Target charging station
   * @param evseId - Meter point EVSE identifier
   * @param request - Latest aligned MeterValues request
   * @param responseTimeoutMs - Request response timeout in milliseconds
   * @returns The current bounded drain operation
   */
  private static sendClockAlignedMeterValuesRequest (
    chargingStation: ChargingStation,
    evseId: number,
    request: OCPP20MeterValuesRequest,
    responseTimeoutMs: number
  ): Promise<void> {
    let stationStates = OCPP20ServiceUtils.clockAlignedMeterValuesSendStates.get(chargingStation)
    if (stationStates == null) {
      stationStates = new Map<number, ClockAlignedMeterValuesSendState>()
      OCPP20ServiceUtils.clockAlignedMeterValuesSendStates.set(chargingStation, stationStates)
    }
    let state = stationStates.get(evseId)
    if (state == null) {
      state = {}
      stationStates.set(evseId, state)
    }
    state.pending = { request, responseTimeoutMs }
    if (state.inFlight != null) return state.inFlight

    const sendState = state
    const drain = async (): Promise<void> => {
      while (sendState.pending != null) {
        const pending = sendState.pending
        delete sendState.pending
        if (
          !chargingStation.isWebSocketConnectionOpened() ||
          !chargingStation.inAcceptedState() ||
          OCPP20ServiceUtils.isChargingStationStopping(chargingStation)
        ) {
          break
        }
        try {
          await chargingStation.ocppRequestService.requestHandler<
            OCPP20MeterValuesRequest,
            OCPP20MeterValuesResponse
          >(chargingStation, OCPP20RequestCommand.METER_VALUES, pending.request, {
            responseTimeoutMs: pending.responseTimeoutMs,
            skipBufferingOnError: true,
            throwError: true,
          })
        } catch (error: unknown) {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.emitClockAlignedMeterValues: Error sending clock-aligned '${OCPP20RequestCommand.METER_VALUES}':`,
            error
          )
        }
      }
    }
    const inFlight = drain().finally(() => {
      if (sendState.inFlight === inFlight) {
        delete sendState.inFlight
        if (sendState.pending == null) stationStates.delete(evseId)
      }
    })
    sendState.inFlight = inFlight
    return inFlight
  }

  private static async serializeTransactionEventDelivery<T>(
    connectorStatus: ConnectorStatus,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = OCPP20ServiceUtils.transactionEventSendChains.get(connectorStatus)
    const { promise: current, resolve } = Promise.withResolvers<undefined>()
    OCPP20ServiceUtils.transactionEventSendChains.set(connectorStatus, current)
    if (previous != null) await previous.catch(() => undefined)
    try {
      return await operation()
    } finally {
      resolve(undefined)
      if (OCPP20ServiceUtils.transactionEventSendChains.get(connectorStatus) === current) {
        OCPP20ServiceUtils.transactionEventSendChains.delete(connectorStatus)
      }
    }
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
    this.stopEndedMeterValues(chargingStation, connectorId, evseId)
    const endedMeterValues = this.buildTransactionEndedMeterValues(
      chargingStation,
      connectorId,
      transactionId,
      evseId
    )

    connectorStatus.transactionEnding = true
    let response: OCPP20TransactionEventResponse
    try {
      response = await this.sendTransactionEvent(
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
    } catch (error) {
      await OCPP20ServiceUtils.cleanupEndedTransaction(
        chargingStation,
        connectorId,
        connectorStatus,
        evseId,
        transactionId
      )
      throw error
    }

    await OCPP20ServiceUtils.cleanupEndedTransaction(
      chargingStation,
      connectorId,
      connectorStatus,
      evseId,
      transactionId
    )

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

  const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
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
    timestamp: commandParams.timestamp ?? new Date(),
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
    `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: Building ${OCPP20RequestCommand.TRANSACTION_EVENT} for trigger '${triggerReason}'`
  )

  return transactionEventRequest
}
