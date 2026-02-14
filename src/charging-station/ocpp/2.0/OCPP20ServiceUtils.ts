// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/* eslint-disable @typescript-eslint/unified-signatures */

import type { JSONSchemaType } from 'ajv'

import { type ChargingStation, resetConnectorStatus } from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  ConnectorStatusEnum,
  ErrorType,
  type GenericResponse,
  type JsonType,
  OCPP20IncomingRequestCommand,
  OCPP20RequestCommand,
  OCPP20TransactionEventEnumType,
  type OCPP20TransactionEventRequest,
  type OCPP20TransactionEventResponse,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
} from '../../../types/index.js'
import {
  type OCPP20EVSEType,
  OCPP20ReasonEnumType,
  type OCPP20TransactionContext,
  type OCPP20TransactionEventOptions,
  type OCPP20TransactionType,
} from '../../../types/ocpp/2.0/Transaction.js'
import { logger, validateUUID } from '../../../utils/index.js'
import { OCPPServiceUtils, sendAndSetConnectorStatus } from '../OCPPServiceUtils.js'
import { OCPP20Constants } from './OCPP20Constants.js'

const moduleName = 'OCPP20ServiceUtils'

export class OCPP20ServiceUtils extends OCPPServiceUtils {
  /**
   * Build a TransactionEvent request according to OCPP 2.0.1 specification
   *
   * This method creates a properly formatted TransactionEventRequest that complies with
   * OCPP 2.0.1 requirements including F01, E01, E06, and TriggerReason specifications.
   *
   * Key features:
   * - Automatic per-EVSE sequence number management
   * - Full TriggerReason validation (21 enum values)
   * - EVSE/connector mapping and validation
   * - Transaction UUID handling
   * - Comprehensive parameter validation
   * @param chargingStation - The charging station instance
   * @param eventType - Transaction event type (Started, Updated, Ended)
   * @param triggerReason - Reason that triggered the event (21 OCPP 2.0.1 values)
   * @param connectorId - Connector identifier
   * @param transactionId - Transaction UUID (required for all events)
   * @param options - Optional parameters for the transaction event
   * @param options.evseId
   * @param options.idToken
   * @param options.meterValue
   * @param options.chargingState
   * @param options.stoppedReason
   * @param options.remoteStartId
   * @param options.cableMaxCurrent
   * @param options.numberOfPhasesUsed
   * @param options.offline
   * @param options.reservationId
   * @param options.customData
   * @returns Promise<OCPP20TransactionEventRequest> - Built transaction event request
   * @throws {OCPPError} When parameters are invalid or EVSE mapping fails
   */
  public static buildTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    context: OCPP20TransactionContext,
    connectorId: number,
    transactionId: string,
    options?: OCPP20TransactionEventOptions
  ): OCPP20TransactionEventRequest
  public static buildTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    triggerReason: OCPP20TriggerReasonEnumType,
    connectorId: number,
    transactionId: string,
    options?: OCPP20TransactionEventOptions
  ): OCPP20TransactionEventRequest
  // Implementation with union type + type guard
  public static buildTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    triggerReasonOrContext: OCPP20TransactionContext | OCPP20TriggerReasonEnumType,
    connectorId: number,
    transactionId: string,
    options: OCPP20TransactionEventOptions = {}
  ): OCPP20TransactionEventRequest {
    // Type guard: distinguish between context object and direct trigger reason
    const isContext = typeof triggerReasonOrContext === 'object'
    const triggerReason = isContext
      ? this.selectTriggerReason(eventType, triggerReasonOrContext)
      : triggerReasonOrContext

    // Validate transaction ID format (must be UUID)
    if (!validateUUID(transactionId)) {
      const errorMsg = `Invalid transaction ID format (expected UUID): ${transactionId}`
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: ${errorMsg}`
      )
      throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
    }

    // Get or validate EVSE ID
    const evseId = options.evseId ?? chargingStation.getEvseIdByConnectorId(connectorId)
    if (evseId == null) {
      const errorMsg = `Cannot find EVSE ID for connector ${connectorId.toString()}`
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: ${errorMsg}`
      )
      throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
    }

    // Get connector status and manage sequence number
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus == null) {
      const errorMsg = `Cannot find connector status for connector ${connectorId.toString()}`
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: ${errorMsg}`
      )
      throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
    }

    // Per-EVSE sequence number management (OCPP 2.0.1 Section 1.3.2.1)
    // Initialize sequence number to 0 for new transactions, or increment for existing
    if (connectorStatus.transactionSeqNo == null) {
      // First TransactionEvent for this EVSE/connector - start at 0
      connectorStatus.transactionSeqNo = 0
    } else {
      // Increment for subsequent TransactionEvents
      connectorStatus.transactionSeqNo = connectorStatus.transactionSeqNo + 1
    }

    // Build EVSE object
    const evse: OCPP20EVSEType = {
      id: evseId,
    }

    // Add connector ID only if different from EVSE ID (OCPP 2.0.1 requirement)
    if (connectorId !== evseId) {
      evse.connectorId = connectorId
    }

    // Build transaction info object
    const transactionInfo: OCPP20TransactionType = {
      transactionId,
    }

    // Add optional transaction info fields
    if (options.chargingState !== undefined) {
      transactionInfo.chargingState = options.chargingState
    }
    if (options.stoppedReason !== undefined) {
      transactionInfo.stoppedReason = options.stoppedReason
    }
    if (options.remoteStartId !== undefined) {
      transactionInfo.remoteStartId = options.remoteStartId
    }

    // Build the complete TransactionEvent request
    const transactionEventRequest: OCPP20TransactionEventRequest = {
      eventType,
      evse,
      seqNo: connectorStatus.transactionSeqNo,
      timestamp: new Date(),
      transactionInfo,
      triggerReason,
    }

    // Add optional fields
    if (options.idToken !== undefined) {
      transactionEventRequest.idToken = options.idToken
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

  /**
   * Build a TransactionEvent request with context-aware TriggerReason selection
   * @deprecated Use buildTransactionEvent() with context parameter instead
   * @see buildTransactionEvent
   * @param chargingStation - The charging station instance
   * @param eventType - Transaction event type (Started, Updated, Ended)
   * @param context - Context information for intelligent TriggerReason selection
   * @param connectorId - Connector identifier
   * @param transactionId - Transaction UUID (required for all events)
   * @param options - Optional parameters for the transaction event
   * @returns OCPP20TransactionEventRequest - Built transaction event request
   * @throws {OCPPError} When parameters are invalid or EVSE mapping fails
   */
  public static buildTransactionEventWithContext (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    context: OCPP20TransactionContext,
    connectorId: number,
    transactionId: string,
    options: OCPP20TransactionEventOptions = {}
  ): OCPP20TransactionEventRequest {
    return OCPP20ServiceUtils.buildTransactionEvent(
      chargingStation,
      eventType,
      context,
      connectorId,
      transactionId,
      options
    )
  }

  /**
   * OCPP 2.0 Incoming Request Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestPayloadConfigs = (): [
    OCPP20IncomingRequestCommand,
    { schemaPath: string }
  ][] => [
    [
      OCPP20IncomingRequestCommand.CLEAR_CACHE,
      OCPP20ServiceUtils.PayloadValidatorConfig('ClearCacheRequest.json'),
    ],
    [
      OCPP20IncomingRequestCommand.GET_BASE_REPORT,
      OCPP20ServiceUtils.PayloadValidatorConfig('GetBaseReportRequest.json'),
    ],
    [
      OCPP20IncomingRequestCommand.GET_VARIABLES,
      OCPP20ServiceUtils.PayloadValidatorConfig('GetVariablesRequest.json'),
    ],
    [
      OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
      OCPP20ServiceUtils.PayloadValidatorConfig('RequestStartTransactionRequest.json'),
    ],
    [
      OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
      OCPP20ServiceUtils.PayloadValidatorConfig('RequestStopTransactionRequest.json'),
    ],
    [
      OCPP20IncomingRequestCommand.RESET,
      OCPP20ServiceUtils.PayloadValidatorConfig('ResetRequest.json'),
    ],
    [
      OCPP20IncomingRequestCommand.SET_VARIABLES,
      OCPP20ServiceUtils.PayloadValidatorConfig('SetVariablesRequest.json'),
    ],
  ]

  /**
   * Factory options for OCPP 2.0 Incoming Request Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0 incoming request validators
   */
  public static createIncomingRequestPayloadOptions = (moduleName: string, methodName: string) =>
    OCPP20ServiceUtils.PayloadValidatorOptions(
      OCPPVersion.VERSION_201,
      'assets/json-schemas/ocpp/2.0',
      moduleName,
      methodName
    )

  /**
   * Configuration for OCPP 2.0 Incoming Request Response validators
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestResponsePayloadConfigs = (): [
    OCPP20IncomingRequestCommand,
    { schemaPath: string }
  ][] => [
    [
      OCPP20IncomingRequestCommand.CLEAR_CACHE,
      OCPP20ServiceUtils.PayloadValidatorConfig('ClearCacheResponse.json'),
    ],
    [
      OCPP20IncomingRequestCommand.GET_BASE_REPORT,
      OCPP20ServiceUtils.PayloadValidatorConfig('GetBaseReportResponse.json'),
    ],
    [
      OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
      OCPP20ServiceUtils.PayloadValidatorConfig('RequestStartTransactionResponse.json'),
    ],
    [
      OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
      OCPP20ServiceUtils.PayloadValidatorConfig('RequestStopTransactionResponse.json'),
    ],
  ]

  /**
   * Factory options for OCPP 2.0 Incoming Request Response Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0 incoming request response validators
   */
  public static createIncomingRequestResponsePayloadOptions = (
    moduleName: string,
    methodName: string
  ) =>
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
  ][] => [
    [
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      OCPP20ServiceUtils.PayloadValidatorConfig('BootNotificationRequest.json'),
    ],
    [
      OCPP20RequestCommand.HEARTBEAT,
      OCPP20ServiceUtils.PayloadValidatorConfig('HeartbeatRequest.json'),
    ],
    [
      OCPP20RequestCommand.NOTIFY_REPORT,
      OCPP20ServiceUtils.PayloadValidatorConfig('NotifyReportRequest.json'),
    ],
    [
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      OCPP20ServiceUtils.PayloadValidatorConfig('StatusNotificationRequest.json'),
    ],
    [
      OCPP20RequestCommand.TRANSACTION_EVENT,
      OCPP20ServiceUtils.PayloadValidatorConfig('TransactionEventRequest.json'),
    ],
  ]

  /**
   * Factory options for OCPP 2.0 Request Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0 validators
   */
  public static createRequestPayloadOptions = (moduleName: string, methodName: string) =>
    OCPP20ServiceUtils.PayloadValidatorOptions(
      OCPPVersion.VERSION_201,
      'assets/json-schemas/ocpp/2.0',
      moduleName,
      methodName
    )

  /**
   * OCPP 2.0 Response Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createResponsePayloadConfigs = (): [
    OCPP20RequestCommand,
    { schemaPath: string }
  ][] => [
    [
      OCPP20RequestCommand.BOOT_NOTIFICATION,
      OCPP20ServiceUtils.PayloadValidatorConfig('BootNotificationResponse.json'),
    ],
    [
      OCPP20RequestCommand.HEARTBEAT,
      OCPP20ServiceUtils.PayloadValidatorConfig('HeartbeatResponse.json'),
    ],
    [
      OCPP20RequestCommand.NOTIFY_REPORT,
      OCPP20ServiceUtils.PayloadValidatorConfig('NotifyReportResponse.json'),
    ],
    [
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      OCPP20ServiceUtils.PayloadValidatorConfig('StatusNotificationResponse.json'),
    ],
    [
      OCPP20RequestCommand.TRANSACTION_EVENT,
      OCPP20ServiceUtils.PayloadValidatorConfig('TransactionEventResponse.json'),
    ],
  ]

  /**
   * Factory options for OCPP 2.0 Response Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0 response validators
   */
  public static createResponsePayloadOptions = (moduleName: string, methodName: string) =>
    OCPP20ServiceUtils.PayloadValidatorOptions(
      OCPPVersion.VERSION_201,
      'assets/json-schemas/ocpp/2.0',
      moduleName,
      methodName
    )

  public static enforceMessageLimits<
    T extends { attributeType?: unknown; component: unknown; variable: unknown }
  >(
    chargingStation: { logPrefix: () => string },
    moduleName: string,
    context: string,
    data: T[],
    itemsLimit: number,
    bytesLimit: number,
    buildRejected: (item: T, reason: { info: string; reasonCode: string }) => unknown,
    logger: { debug: (...args: unknown[]) => void }
  ): { rejected: boolean; results: unknown[] } {
    if (itemsLimit > 0 && data.length > itemsLimit) {
      const results = data.map(d =>
        buildRejected(d, {
          info: `ItemsPerMessage limit ${itemsLimit.toString()} exceeded (${data.length.toString()} requested)`,
          reasonCode: 'TooManyElements',
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
            info: `BytesPerMessage limit ${bytesLimit.toString()} exceeded (estimated ${estimatedSize.toString()} bytes)`,
            reasonCode: 'TooLargeElement',
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
    T extends { attributeType?: unknown; component: unknown; variable: unknown }
  >(
    chargingStation: { logPrefix: () => string },
    moduleName: string,
    context: string,
    originalData: T[],
    currentResults: unknown[],
    bytesLimit: number,
    buildRejected: (item: T, reason: { info: string; reasonCode: string }) => unknown,
    logger: { debug: (...args: unknown[]) => void }
  ): unknown[] {
    if (bytesLimit > 0) {
      try {
        const actualSize = Buffer.byteLength(JSON.stringify(currentResults), 'utf8')
        if (actualSize > bytesLimit) {
          const results = originalData.map(d =>
            buildRejected(d, {
              info: `BytesPerMessage limit ${bytesLimit.toString()} exceeded (actual ${actualSize.toString()} bytes)`,
              reasonCode: 'TooLargeElement',
            })
          )
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.${context}: Rejected all variables due to BytesPerMessage limit post calculation (${bytesLimit.toString()})`
          )
          return results
        }
      } catch {
        /* ignore */
      }
    }
    return currentResults
  }

  public static override parseJsonSchemaFile<T extends JsonType>(
    relativePath: string,
    moduleName?: string,
    methodName?: string
  ): JSONSchemaType<T> {
    return super.parseJsonSchemaFile<T>(
      relativePath,
      OCPPVersion.VERSION_201,
      moduleName,
      methodName
    )
  }

  public static async requestStopTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): Promise<GenericResponse> {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus?.transactionStarted && connectorStatus.transactionId != null) {
      // OCPP 2.0 validation: transactionId should be a valid UUID format
      let transactionId: string
      if (typeof connectorStatus.transactionId === 'string') {
        transactionId = connectorStatus.transactionId
      } else {
        transactionId = connectorStatus.transactionId.toString()
        logger.warn(
          `${chargingStation.logPrefix()} OCPP20ServiceUtils.remoteStopTransaction: Non-string transaction ID ${transactionId} converted to string for OCPP 2.0`
        )
      }

      if (!validateUUID(transactionId)) {
        logger.error(
          `${chargingStation.logPrefix()} OCPP20ServiceUtils.remoteStopTransaction: Invalid transaction ID format (expected UUID): ${transactionId}`
        )
        return OCPP20Constants.OCPP_RESPONSE_REJECTED
      }

      evseId = evseId ?? chargingStation.getEvseIdByConnectorId(connectorId)
      if (evseId == null) {
        logger.error(
          `${chargingStation.logPrefix()} OCPP20ServiceUtils.requestStopTransaction: Cannot find EVSE ID for connector ${connectorId.toString()}`
        )
        return OCPP20Constants.OCPP_RESPONSE_REJECTED
      }

      connectorStatus.transactionSeqNo = (connectorStatus.transactionSeqNo ?? 0) + 1

      const transactionEventRequest: OCPP20TransactionEventRequest = {
        eventType: OCPP20TransactionEventEnumType.Ended,
        evse: {
          id: evseId,
        },
        seqNo: connectorStatus.transactionSeqNo,
        timestamp: new Date(),
        transactionInfo: {
          stoppedReason: OCPP20ReasonEnumType.Remote,
          transactionId,
        },
        triggerReason: OCPP20TriggerReasonEnumType.RemoteStop,
      }

      await chargingStation.ocppRequestService.requestHandler<
        OCPP20TransactionEventRequest,
        OCPP20TransactionEventRequest
      >(chargingStation, OCPP20RequestCommand.TRANSACTION_EVENT, transactionEventRequest)

      resetConnectorStatus(connectorStatus)
      await sendAndSetConnectorStatus(chargingStation, connectorId, ConnectorStatusEnum.Available)

      return OCPP20Constants.OCPP_RESPONSE_ACCEPTED
    }
    return OCPP20Constants.OCPP_RESPONSE_REJECTED
  }

  /**
   * Resets the TransactionEvent sequence number for a connector when starting a new transaction.
   * According to OCPP 2.0.1 Section 1.3.2.1, sequence numbers should start at 0 for new transactions.
   * @param chargingStation - The charging station instance
   * @param connectorId - The connector ID for which to reset the sequence number
   */
  public static resetTransactionSequenceNumber (
    chargingStation: ChargingStation,
    connectorId: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus != null) {
      connectorStatus.transactionSeqNo = undefined // Reset to undefined, will be set to 0 on first use
      logger.debug(
        `${chargingStation.logPrefix()} OCPP20ServiceUtils.resetTransactionSequenceNumber: Reset sequence number for connector ${connectorId.toString()}`
      )
    }
  }

  /**
   * Intelligently select appropriate TriggerReason based on transaction context
   *
   * This method implements the E02.FR.17 requirement for context-aware TriggerReason selection.
   * It analyzes the transaction context to determine the most appropriate TriggerReason according
   * to OCPP 2.0.1 specification and best practices.
   *
   * Selection Logic (by priority):
   * 1. Remote commands (RequestStartTransaction, RequestStopTransaction, etc.) -> RemoteStart/RemoteStop
   * 2. Authorization events (token presented) -> Authorized/StopAuthorized/Deauthorized
   * 3. Cable physical actions -> CablePluggedIn
   * 4. Charging state transitions -> ChargingStateChanged
   * 5. System events (EV detection, communication) -> EVDetected/EVDeparted/EVCommunicationLost
   * 6. Meter value events -> MeterValuePeriodic/MeterValueClock
   * 7. Energy/Time limits -> EnergyLimitReached/TimeLimitReached
   * 8. Abnormal conditions -> AbnormalCondition
   * @param eventType - The transaction event type (Started, Updated, Ended)
   * @param context - Context information describing the trigger source and details
   * @returns OCPP20TriggerReasonEnumType - The most appropriate trigger reason
   */
  public static selectTriggerReason (
    eventType: OCPP20TransactionEventEnumType,
    context: OCPP20TransactionContext
  ): OCPP20TriggerReasonEnumType {
    const candidates = OCPP20Constants.TriggerReasonMapping.filter(
      (entry) => entry.source === context.source
    )

    for (const entry of candidates) {
      if (context.source === 'remote_command' && context.command != null) {
        if (
          (context.command === 'RequestStartTransaction' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.RemoteStart) ||
          (context.command === 'RequestStopTransaction' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.RemoteStop) ||
          (context.command === 'Reset' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.ResetCommand) ||
          (context.command === 'TriggerMessage' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.Trigger) ||
          (context.command === 'UnlockConnector' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.UnlockCommand)
        ) {
          return entry.triggerReason
        }
      }

      if (context.source === 'local_authorization' && context.authorizationMethod != null) {
        if (context.isDeauthorized === true) {
          if (entry.triggerReason === OCPP20TriggerReasonEnumType.Deauthorized) {
            return entry.triggerReason
          }
        } else if (
          (context.authorizationMethod === 'groupIdToken' ||
            context.authorizationMethod === 'idToken') &&
          entry.triggerReason === OCPP20TriggerReasonEnumType.Authorized
        ) {
          return entry.triggerReason
        } else if (
          context.authorizationMethod === 'stopAuthorized' &&
          entry.triggerReason === OCPP20TriggerReasonEnumType.StopAuthorized
        ) {
          return entry.triggerReason
        }
      }

      if (context.source === 'cable_action' && context.cableState != null) {
        if (
          (context.cableState === 'detected' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.EVDetected) ||
          (context.cableState === 'plugged_in' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.CablePluggedIn) ||
          (context.cableState === 'unplugged' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.EVDeparted)
        ) {
          return entry.triggerReason
        }
      }

      if (
        context.source === 'charging_state' &&
        context.chargingStateChange != null &&
        entry.triggerReason === OCPP20TriggerReasonEnumType.ChargingStateChanged
      ) {
        return entry.triggerReason
      }

      if (context.source === 'system_event' && context.systemEvent != null) {
        if (
          (context.systemEvent === 'ev_communication_lost' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.EVCommunicationLost) ||
          (context.systemEvent === 'ev_connect_timeout' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.EVConnectTimeout) ||
          (context.systemEvent === 'ev_departed' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.EVDeparted) ||
          (context.systemEvent === 'ev_detected' &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.EVDetected)
        ) {
          return entry.triggerReason
        }
      }

      if (context.source === 'meter_value') {
        if (
          (context.isSignedDataReceived === true &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.SignedDataReceived) ||
          (context.isPeriodicMeterValue === true &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.MeterValuePeriodic) ||
          (context.isSignedDataReceived !== true &&
            context.isPeriodicMeterValue !== true &&
            entry.triggerReason === OCPP20TriggerReasonEnumType.MeterValueClock)
        ) {
          return entry.triggerReason
        }
      }

      if (
        (context.source === 'energy_limit' &&
          entry.triggerReason === OCPP20TriggerReasonEnumType.EnergyLimitReached) ||
        (context.source === 'time_limit' &&
          entry.triggerReason === OCPP20TriggerReasonEnumType.TimeLimitReached)
      ) {
        return entry.triggerReason
      }

      if (
        context.source === 'abnormal_condition' &&
        entry.triggerReason === OCPP20TriggerReasonEnumType.AbnormalCondition
      ) {
        return entry.triggerReason
      }
    }

    logger.warn(
      `${moduleName}.selectTriggerReason: No matching context found for source '${context.source}', defaulting to Trigger`
    )
    return OCPP20TriggerReasonEnumType.Trigger
  }

  public static async sendTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    context: OCPP20TransactionContext,
    connectorId: number,
    transactionId: string,
    options?: OCPP20TransactionEventOptions
  ): Promise<OCPP20TransactionEventResponse>
  public static async sendTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    triggerReason: OCPP20TriggerReasonEnumType,
    connectorId: number,
    transactionId: string,
    options?: OCPP20TransactionEventOptions
  ): Promise<OCPP20TransactionEventResponse>
  // Implementation with union type + type guard
  public static async sendTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    triggerReasonOrContext: OCPP20TransactionContext | OCPP20TriggerReasonEnumType,
    connectorId: number,
    transactionId: string,
    options: OCPP20TransactionEventOptions = {}
  ): Promise<OCPP20TransactionEventResponse> {
    try {
      // Type guard: distinguish between context object and direct trigger reason
      const isContext = typeof triggerReasonOrContext === 'object'
      const triggerReason = isContext
        ? this.selectTriggerReason(eventType, triggerReasonOrContext)
        : triggerReasonOrContext

      // Build the transaction event request
      const transactionEventRequest = OCPP20ServiceUtils.buildTransactionEvent(
        chargingStation,
        eventType,
        triggerReason,
        connectorId,
        transactionId,
        options
      )

      // Send the request to CSMS
      logger.debug(
         `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Sending TransactionEvent for trigger ${triggerReason}`
      )

      const response = await chargingStation.ocppRequestService.requestHandler<
         OCPP20TransactionEventRequest,
         OCPP20TransactionEventResponse
       >(chargingStation, OCPP20RequestCommand.TRANSACTION_EVENT, transactionEventRequest)

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
   * Send a TransactionEvent request with context-aware TriggerReason selection
   * @deprecated Use sendTransactionEvent() with context parameter instead
   * @see sendTransactionEvent
   * @param chargingStation - The charging station instance
   * @param eventType - Transaction event type
   * @param context - Context information for intelligent TriggerReason selection
   * @param connectorId - Connector identifier
   * @param transactionId - Transaction UUID
   * @param options - Optional parameters
   * @returns Promise<OCPP20TransactionEventResponse> - Response from CSMS
   */
  public static async sendTransactionEventWithContext (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    context: OCPP20TransactionContext,
    connectorId: number,
    transactionId: string,
    options: OCPP20TransactionEventOptions = {}
  ): Promise<OCPP20TransactionEventResponse> {
    return OCPP20ServiceUtils.sendTransactionEvent(
      chargingStation,
      eventType,
      context,
      connectorId,
      transactionId,
      options
    )
  }
}
