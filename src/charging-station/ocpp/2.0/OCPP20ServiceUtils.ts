// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { JSONSchemaType } from 'ajv'

import type { ChargingStation } from '../../../charging-station/index.js'

import {
  ConnectorStatusEnum,
  type GenericResponse,
  type JsonType,
  OCPP20IncomingRequestCommand,
  OCPP20RequestCommand,
  OCPP20TransactionEventEnumType,
  type OCPP20TransactionEventRequest,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
} from '../../../types/index.js'
import { OCPP20ReasonEnumType } from '../../../types/ocpp/2.0/Transaction.js'
import { logger, validateUUID } from '../../../utils/index.js'
import { OCPPServiceUtils, sendAndSetConnectorStatus } from '../OCPPServiceUtils.js'
import { OCPP20Constants } from './OCPP20Constants.js'

export class OCPP20ServiceUtils extends OCPPServiceUtils {
  /**
   * Factory options for OCPP 2.0 Incoming Request Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0 incoming request validators
   */
  public static createIncomingRequestFactoryOptions = (moduleName: string, methodName: string) =>
    OCPP20ServiceUtils.PayloadValidatorOptions(
      OCPPVersion.VERSION_201,
      'assets/json-schemas/ocpp/2.0',
      moduleName,
      methodName
    )

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
   * Factory options for OCPP 2.0 Incoming Request Response Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0 incoming request response validators
   */
  public static createIncomingRequestResponseFactoryOptions = (
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
   * Factory options for OCPP 2.0 Request Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0 validators
   */
  public static createRequestFactoryOptions = (moduleName: string, methodName: string) =>
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
  ]

  /**
   * Factory options for OCPP 2.0 Response Service
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0 response validators
   */
  public static createResponseFactoryOptions = (moduleName: string, methodName: string) =>
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
  ]

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
    return OCPP20ServiceUtils.parseJsonSchemaFile<T>(
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

      const transactionEventRequest: OCPP20TransactionEventRequest = {
        eventType: OCPP20TransactionEventEnumType.Ended,
        evse: {
          id: evseId,
        },
        seqNo: 0, // This should be managed by the transaction sequence
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

      await sendAndSetConnectorStatus(chargingStation, connectorId, ConnectorStatusEnum.Available)

      return OCPP20Constants.OCPP_RESPONSE_ACCEPTED
    }
    return OCPP20Constants.OCPP_RESPONSE_REJECTED
  }
}
