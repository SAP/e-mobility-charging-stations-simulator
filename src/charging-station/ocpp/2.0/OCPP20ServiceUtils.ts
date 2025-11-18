// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { JSONSchemaType } from 'ajv'

import { type ChargingStation, resetConnectorStatus } from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  ConnectorStatusEnum,
  type CustomDataType,
  ErrorType,
  type GenericResponse,
  type JsonType,
  type OCPP20IdTokenType,
  OCPP20IncomingRequestCommand,
  type OCPP20MeterValue,
  OCPP20RequestCommand,
  OCPP20TransactionEventEnumType,
  type OCPP20TransactionEventRequest,
  type OCPP20TransactionEventResponse,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
} from '../../../types/index.js'
import {
  OCPP20ChargingStateEnumType,
  type OCPP20EVSEType,
  OCPP20ReasonEnumType,
  type OCPP20TransactionContext,
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
    triggerReason: OCPP20TriggerReasonEnumType,
    connectorId: number,
    transactionId: string,
    options: {
      cableMaxCurrent?: number
      chargingState?: OCPP20ChargingStateEnumType
      customData?: CustomDataType
      evseId?: number
      idToken?: OCPP20IdTokenType
      meterValue?: OCPP20MeterValue[]
      numberOfPhasesUsed?: number
      offline?: boolean
      remoteStartId?: number
      reservationId?: number
      stoppedReason?: OCPP20ReasonEnumType
    } = {}
  ): OCPP20TransactionEventRequest {
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
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: Initialized sequence number to 0 for new transaction on connector ${connectorId.toString()}`
      )
    } else {
      // Increment for subsequent TransactionEvents
      connectorStatus.transactionSeqNo = connectorStatus.transactionSeqNo + 1
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: Incremented sequence number to ${connectorStatus.transactionSeqNo.toString()} for connector ${connectorId.toString()}`
      )
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
      `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: Built TransactionEvent - Type: ${eventType}, TriggerReason: ${triggerReason}, SeqNo: ${String(connectorStatus.transactionSeqNo)}, EVSE: ${String(evseId)}, Transaction: ${transactionId}`
    )

    return transactionEventRequest
  }

  /**
   * Build a TransactionEvent request with context-aware TriggerReason selection
   *
   * This overload automatically selects the appropriate TriggerReason based on the provided
   * context using the selectTriggerReason() method. This provides intelligent trigger reason
   * selection while maintaining full backward compatibility with the explicit triggerReason version.
   * @param chargingStation - The charging station instance
   * @param eventType - Transaction event type (Started, Updated, Ended)
   * @param context - Context information for intelligent TriggerReason selection
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
  public static buildTransactionEventWithContext (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    context: OCPP20TransactionContext,
    connectorId: number,
    transactionId: string,
    options: {
      cableMaxCurrent?: number
      chargingState?: OCPP20ChargingStateEnumType
      customData?: CustomDataType
      evseId?: number
      idToken?: OCPP20IdTokenType
      meterValue?: OCPP20MeterValue[]
      numberOfPhasesUsed?: number
      offline?: boolean
      remoteStartId?: number
      reservationId?: number
      stoppedReason?: OCPP20ReasonEnumType
    } = {}
  ): OCPP20TransactionEventRequest {
    // Automatically select appropriate TriggerReason based on context
    const triggerReason = OCPP20ServiceUtils.selectTriggerReason(eventType, context)

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEventWithContext: Auto-selected TriggerReason '${triggerReason}' for eventType '${eventType}' with context source '${context.source}'`
    )

    // Delegate to the main buildTransactionEvent method with the selected trigger reason
    return OCPP20ServiceUtils.buildTransactionEvent(
      chargingStation,
      eventType,
      triggerReason,
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
    // Priority 1: Remote Commands (highest priority)
    if (context.source === 'remote_command' && context.command != null) {
      switch (context.command) {
        case 'RequestStartTransaction':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected RemoteStart for RequestStartTransaction command`
          )
          return OCPP20TriggerReasonEnumType.RemoteStart
        case 'RequestStopTransaction':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected RemoteStop for RequestStopTransaction command`
          )
          return OCPP20TriggerReasonEnumType.RemoteStop
        case 'Reset':
          logger.debug(`${moduleName}.selectTriggerReason: Selected ResetCommand for Reset command`)
          return OCPP20TriggerReasonEnumType.ResetCommand
        case 'TriggerMessage':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected Trigger for TriggerMessage command`
          )
          return OCPP20TriggerReasonEnumType.Trigger
        case 'UnlockConnector':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected UnlockCommand for UnlockConnector command`
          )
          return OCPP20TriggerReasonEnumType.UnlockCommand
        default:
          logger.warn(
            `${moduleName}.selectTriggerReason: Unknown remote command ${String(context.command)}, defaulting to Trigger`
          )
          return OCPP20TriggerReasonEnumType.Trigger
      }
    }

    // Priority 2: Authorization Events
    if (context.source === 'local_authorization' && context.authorizationMethod != null) {
      if (context.isDeauthorized === true) {
        logger.debug(
          `${moduleName}.selectTriggerReason: Selected Deauthorized for deauthorization event`
        )
        return OCPP20TriggerReasonEnumType.Deauthorized
      }

      switch (context.authorizationMethod) {
        case 'groupIdToken':
        case 'idToken':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected Authorized for ${context.authorizationMethod} authorization`
          )
          return OCPP20TriggerReasonEnumType.Authorized
        case 'stopAuthorized':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected StopAuthorized for stop authorization`
          )
          return OCPP20TriggerReasonEnumType.StopAuthorized
        default:
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected Authorized for unknown authorization method ${String(context.authorizationMethod)}`
          )
          return OCPP20TriggerReasonEnumType.Authorized
      }
    }

    // Priority 3: Cable Physical Actions
    if (context.source === 'cable_action' && context.cableState != null) {
      switch (context.cableState) {
        case 'detected':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected EVDetected for cable/EV detection`
          )
          return OCPP20TriggerReasonEnumType.EVDetected
        case 'plugged_in':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected CablePluggedIn for cable plugged in event`
          )
          return OCPP20TriggerReasonEnumType.CablePluggedIn
        case 'unplugged':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected EVDeparted for cable unplugged event`
          )
          return OCPP20TriggerReasonEnumType.EVDeparted
        default:
          logger.warn(
            `${moduleName}.selectTriggerReason: Unknown cable state ${String(context.cableState)}, defaulting to CablePluggedIn`
          )
          return OCPP20TriggerReasonEnumType.CablePluggedIn
      }
    }

    // Priority 4: Charging State Changes
    if (context.source === 'charging_state' && context.chargingStateChange != null) {
      logger.debug(
        `${moduleName}.selectTriggerReason: Selected ChargingStateChanged for charging state transition`
      )
      return OCPP20TriggerReasonEnumType.ChargingStateChanged
    }

    // Priority 5: System Events
    if (context.source === 'system_event' && context.systemEvent != null) {
      switch (context.systemEvent) {
        case 'ev_communication_lost':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected EVCommunicationLost for EV communication lost event`
          )
          return OCPP20TriggerReasonEnumType.EVCommunicationLost
        case 'ev_connect_timeout':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected EVConnectTimeout for EV connect timeout event`
          )
          return OCPP20TriggerReasonEnumType.EVConnectTimeout
        case 'ev_departed':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected EVDeparted for EV departure system event`
          )
          return OCPP20TriggerReasonEnumType.EVDeparted
        case 'ev_detected':
          logger.debug(
            `${moduleName}.selectTriggerReason: Selected EVDetected for EV detection system event`
          )
          return OCPP20TriggerReasonEnumType.EVDetected
        default:
          logger.warn(
            `${moduleName}.selectTriggerReason: Unknown system event ${String(context.systemEvent)}, defaulting to EVDetected`
          )
          return OCPP20TriggerReasonEnumType.EVDetected
      }
    }

    // Priority 6: Meter Value Events
    if (context.source === 'meter_value') {
      if (context.isSignedDataReceived === true) {
        logger.debug(
          `${moduleName}.selectTriggerReason: Selected SignedDataReceived for signed meter value`
        )
        return OCPP20TriggerReasonEnumType.SignedDataReceived
      } else if (context.isPeriodicMeterValue === true) {
        logger.debug(
          `${moduleName}.selectTriggerReason: Selected MeterValuePeriodic for periodic meter value`
        )
        return OCPP20TriggerReasonEnumType.MeterValuePeriodic
      } else {
        logger.debug(
          `${moduleName}.selectTriggerReason: Selected MeterValueClock for clock-based meter value`
        )
        return OCPP20TriggerReasonEnumType.MeterValueClock
      }
    }

    // Priority 7: Energy and Time Limits
    if (context.source === 'energy_limit') {
      logger.debug(
        `${moduleName}.selectTriggerReason: Selected EnergyLimitReached for energy limit event`
      )
      return OCPP20TriggerReasonEnumType.EnergyLimitReached
    }

    if (context.source === 'time_limit') {
      logger.debug(
        `${moduleName}.selectTriggerReason: Selected TimeLimitReached for time limit event`
      )
      return OCPP20TriggerReasonEnumType.TimeLimitReached
    }

    // Priority 8: Abnormal Conditions (lowest priority, but important)
    if (context.source === 'abnormal_condition') {
      logger.debug(
        `${moduleName}.selectTriggerReason: Selected AbnormalCondition for abnormal condition: ${context.abnormalCondition ?? 'unknown'}`
      )
      return OCPP20TriggerReasonEnumType.AbnormalCondition
    }

    // Fallback: Unknown or missing context
    logger.warn(
      `${moduleName}.selectTriggerReason: No matching context found for source '${context.source}', defaulting to Trigger`
    )
    return OCPP20TriggerReasonEnumType.Trigger
  }

  /**
   * Send a TransactionEvent request to the CSMS
   *
   * This method combines transaction event building and sending in a single operation
   * with comprehensive error handling and logging.
   * @param chargingStation - The charging station instance
   * @param eventType - Transaction event type
   * @param triggerReason - Trigger reason for the event
   * @param connectorId - Connector identifier
   * @param transactionId - Transaction UUID
   * @param options - Optional parameters
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
   * @returns Promise<OCPP20TransactionEventResponse> - Response from CSMS
   */
  public static async sendTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    triggerReason: OCPP20TriggerReasonEnumType,
    connectorId: number,
    transactionId: string,
    options: {
      cableMaxCurrent?: number
      chargingState?: OCPP20ChargingStateEnumType
      customData?: CustomDataType
      evseId?: number
      idToken?: OCPP20IdTokenType
      meterValue?: OCPP20MeterValue[]
      numberOfPhasesUsed?: number
      offline?: boolean
      remoteStartId?: number
      reservationId?: number
      stoppedReason?: OCPP20ReasonEnumType
    } = {}
  ): Promise<OCPP20TransactionEventResponse> {
    try {
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
        `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Sending TransactionEvent - ${eventType} (${triggerReason}) for transaction ${transactionId}`
      )

      const response = await chargingStation.ocppRequestService.requestHandler<
        OCPP20TransactionEventRequest,
        OCPP20TransactionEventResponse
      >(chargingStation, OCPP20RequestCommand.TRANSACTION_EVENT, transactionEventRequest)

      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: TransactionEvent completed successfully`
      )

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
   *
   * This overload combines context-aware trigger reason selection with transaction event sending
   * in a single operation. It automatically selects the appropriate TriggerReason based on the
   * provided context and sends the event to the CSMS.
   * @param chargingStation - The charging station instance
   * @param eventType - Transaction event type
   * @param context - Context information for intelligent TriggerReason selection
   * @param connectorId - Connector identifier
   * @param transactionId - Transaction UUID
   * @param options - Optional parameters
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
   * @returns Promise<OCPP20TransactionEventResponse> - Response from CSMS
   */
  public static async sendTransactionEventWithContext (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    context: OCPP20TransactionContext,
    connectorId: number,
    transactionId: string,
    options: {
      cableMaxCurrent?: number
      chargingState?: OCPP20ChargingStateEnumType
      customData?: CustomDataType
      evseId?: number
      idToken?: OCPP20IdTokenType
      meterValue?: OCPP20MeterValue[]
      numberOfPhasesUsed?: number
      offline?: boolean
      remoteStartId?: number
      reservationId?: number
      stoppedReason?: OCPP20ReasonEnumType
    } = {}
  ): Promise<OCPP20TransactionEventResponse> {
    try {
      // Build the transaction event request with context-aware trigger reason
      const transactionEventRequest = OCPP20ServiceUtils.buildTransactionEventWithContext(
        chargingStation,
        eventType,
        context,
        connectorId,
        transactionId,
        options
      )

      // Send the request to CSMS
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEventWithContext: Sending TransactionEvent - ${eventType} (${transactionEventRequest.triggerReason}) for transaction ${transactionId}`
      )

      const response = await chargingStation.ocppRequestService.requestHandler<
        OCPP20TransactionEventRequest,
        OCPP20TransactionEventResponse
      >(chargingStation, OCPP20RequestCommand.TRANSACTION_EVENT, transactionEventRequest)

      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEventWithContext: TransactionEvent completed successfully`
      )

      return response
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEventWithContext: Failed to send TransactionEvent:`,
        error
      )
      throw error
    }
  }
}
