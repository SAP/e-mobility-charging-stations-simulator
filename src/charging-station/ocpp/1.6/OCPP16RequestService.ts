import type { ValidateFunction } from 'ajv'

import type { ChargingStation } from '../../../charging-station/index.js'
import type { OCPPResponseService } from '../OCPPResponseService.js'

import { OCPPError } from '../../../exception/index.js'
import {
  ChargePointErrorCode,
  ErrorType,
  type JsonType,
  OCPP16ChargePointStatus,
  type OCPP16MeterValue,
  OCPP16RequestCommand,
  type OCPP16StartTransactionRequest,
  type OCPP16StatusNotificationRequest,
  OCPPVersion,
} from '../../../types/index.js'
import { assertIsJsonObject, logger } from '../../../utils/index.js'
import { sendAndSetConnectorStatus } from '../OCPPConnectorStatusOperations.js'
import { OCPPRequestService } from '../OCPPRequestService.js'
import { createPayloadValidatorMap } from '../OCPPServiceUtils.js'
import { OCPP16Constants } from './OCPP16Constants.js'
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils.js'

const moduleName = 'OCPP16RequestService'

/**
 * OCPP 1.6 Request Service
 *
 * Handles outgoing OCPP 1.6 requests from the charging station to the Central System.
 * This service is responsible for:
 * - Building and validating request payloads according to OCPP 1.6 specification
 * - Managing request-response cycles with proper error handling
 * - Ensuring message integrity through JSON schema validation
 * - Providing type-safe interfaces for all supported OCPP 1.6 commands
 *
 * Key architectural components:
 * - Payload validation using AJV schema validators
 * - Standardized logging with charging station context
 * - Comprehensive error handling with OCPP-specific error types
 * - Integration with the broader OCPP service architecture
 * OCPPRequestService - Base class providing common OCPP functionality
 */
export class OCPP16RequestService extends OCPPRequestService {
  protected payloadValidatorFunctions: Map<OCPP16RequestCommand, ValidateFunction<JsonType>>

  /**
   * Constructs an OCPP 1.6 Request Service instance
   *
   * Initializes the service with OCPP 1.6-specific configurations including:
   * - JSON schema validators for all supported OCPP 1.6 request commands
   * - Response service integration for handling command responses
   * - AJV validation setup with proper error handling
   * @param ocppResponseService - The response service instance for handling responses
   */
  public constructor (ocppResponseService: OCPPResponseService) {
    super(OCPPVersion.VERSION_16, ocppResponseService, moduleName)
    this.payloadValidatorFunctions = createPayloadValidatorMap(
      OCPP16ServiceUtils.createRequestPayloadConfigs(),
      OCPP16ServiceUtils.createPayloadOptions(moduleName, 'constructor'),
      this.ajv
    )
  }

  /**
   * Builds OCPP 1.6 request payloads with command-specific logic and validation
   *
   * This private method handles the construction of request payloads for various OCPP 1.6 commands.
   * It implements command-specific business logic including:
   * - Connector ID determination and validation
   * - Energy meter readings for transaction-related commands
   * - Transaction data aggregation (when enabled)
   * - IdTag extraction from charging station context
   * - Automatic timestamp generation for time-sensitive operations
   *
   * The method ensures that all required fields are populated according to OCPP 1.6 specification
   * requirements while handling optional parameters and station-specific configurations.
   * @template Request - The expected type of the constructed request payload
   * @param chargingStation - The charging station instance containing context and configuration
   * @param commandName - The OCPP 1.6 command being processed (e.g., 'StartTransaction', 'StopTransaction')
   * @param commandParams - Optional parameters provided by the caller for payload construction
   * @returns The fully constructed and validated request payload ready for transmission
   */
  protected buildRequestPayload (
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType
  ): JsonType {
    let connectorId: number | undefined
    let energyActiveImportRegister: number
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building '${commandName}' payload`
    )
    switch (commandName) {
      case OCPP16RequestCommand.BOOT_NOTIFICATION:
      case OCPP16RequestCommand.DATA_TRANSFER:
      case OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION:
      case OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION:
      case OCPP16RequestCommand.METER_VALUES:
        return commandParams ?? OCPP16Constants.OCPP_REQUEST_EMPTY
      case OCPP16RequestCommand.HEARTBEAT:
        return OCPP16Constants.OCPP_REQUEST_EMPTY
    }
    assertIsJsonObject(
      commandParams,
      new OCPPError(
        ErrorType.PROTOCOL_ERROR,
        `'${commandName}' command requires object parameters`,
        commandName
      )
    )
    const params = commandParams
    switch (commandName) {
      case OCPP16RequestCommand.AUTHORIZE:
        return {
          idTag: OCPP16Constants.OCPP_DEFAULT_IDTAG,
          ...params,
        }
      case OCPP16RequestCommand.START_TRANSACTION:
        return {
          idTag: OCPP16Constants.OCPP_DEFAULT_IDTAG,
          meterStart: chargingStation.getEnergyActiveImportRegisterByConnectorId(
            params.connectorId as number,
            true
          ),
          timestamp: new Date(),
          ...(OCPP16ServiceUtils.hasReservation(
            chargingStation,
            params.connectorId as number,
            params.idTag as string
          ) && {
            reservationId: chargingStation.getReservationBy(
              'connectorId',
              chargingStation.getConnectorStatus(0)?.status === OCPP16ChargePointStatus.Reserved
                ? 0
                : (params.connectorId as number)
            )?.reservationId,
          }),
          ...params,
        }
      case OCPP16RequestCommand.STATUS_NOTIFICATION:
        return OCPP16ServiceUtils.buildStatusNotificationRequest({
          errorCode: ChargePointErrorCode.NO_ERROR,
          ...params,
        } as OCPP16StatusNotificationRequest)
      case OCPP16RequestCommand.STOP_TRANSACTION:
        ;(chargingStation.stationInfo?.transactionDataMeterValues === true ||
          OCPP16ServiceUtils.isSigningEnabled(chargingStation)) &&
          (connectorId = chargingStation.getConnectorIdByTransactionId(
            params.transactionId as number
          ))
        energyActiveImportRegister = chargingStation.getEnergyActiveImportRegisterByTransactionId(
          params.transactionId as number,
          true
        )
        {
          let transactionData: OCPP16MeterValue[] | undefined
          const transactionDataExplicit =
            chargingStation.stationInfo?.transactionDataMeterValues === true
          const signingForcesTransactionData = OCPP16ServiceUtils.isSigningEnabled(chargingStation)
          if ((transactionDataExplicit || signingForcesTransactionData) && connectorId != null) {
            if (transactionDataExplicit) {
              transactionData = OCPP16ServiceUtils.buildTransactionDataMeterValues(
                chargingStation.getConnectorStatus(connectorId)
                  ?.transactionBeginMeterValue as OCPP16MeterValue,
                OCPP16ServiceUtils.buildTransactionEndMeterValue(
                  chargingStation,
                  connectorId,
                  energyActiveImportRegister
                )
              )
            } else {
              try {
                transactionData = OCPP16ServiceUtils.buildTransactionDataMeterValues(
                  chargingStation.getConnectorStatus(connectorId)
                    ?.transactionBeginMeterValue as OCPP16MeterValue,
                  OCPP16ServiceUtils.buildTransactionEndMeterValue(
                    chargingStation,
                    connectorId,
                    energyActiveImportRegister
                  )
                )
              } catch (error) {
                logger.warn(
                  `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Failed to build signed transaction data meter values for StopTransaction:`,
                  error
                )
              }
            }
          }
          return {
            idTag: chargingStation.getTransactionIdTag(params.transactionId as number),
            meterStop: energyActiveImportRegister,
            timestamp: new Date(),
            ...(transactionData != null && { transactionData }),
            ...params,
          }
        }
      default: {
        // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
        const errorMsg = `Unsupported OCPP command ${commandName as string} for payload building`
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: ${errorMsg}`
        )
        throw new OCPPError(ErrorType.NOT_SUPPORTED, errorMsg, commandName, params)
      }
    }
  }

  /**
   * Runs the OCPP 1.6 pre-request actions hook: for StartTransaction it sends
   * and sets the connector status to Preparing before the request is sent.
   * @param chargingStation - The charging station instance making the request
   * @param commandName - The OCPP 1.6 command being sent
   * @param commandParams - Optional parameters provided by the caller
   */
  protected override async preRequestHook (
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType
  ): Promise<void> {
    switch (commandName) {
      case OCPP16RequestCommand.START_TRANSACTION:
        await sendAndSetConnectorStatus(chargingStation, {
          connectorId: (commandParams as OCPP16StartTransactionRequest).connectorId,
          status: OCPP16ChargePointStatus.Preparing,
        })
        break
    }
  }
}
