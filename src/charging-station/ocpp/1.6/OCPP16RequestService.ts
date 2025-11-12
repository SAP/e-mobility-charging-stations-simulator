// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import type { ChargingStation } from '../../../charging-station/index.js'
import type { OCPPResponseService } from '../OCPPResponseService.js'

import { OCPPError } from '../../../exception/index.js'
import {
  ErrorType,
  type JsonObject,
  type JsonType,
  OCPP16ChargePointStatus,
  OCPP16RequestCommand,
  type OCPP16StartTransactionRequest,
  OCPPVersion,
  type RequestParams,
} from '../../../types/index.js'
import { Constants, generateUUID, logger } from '../../../utils/index.js'
import { OCPPRequestService } from '../OCPPRequestService.js'
import { OCPP16Constants } from './OCPP16Constants.js'
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils.js'

const moduleName = 'OCPP16RequestService'

/**
 * OCPP 1.6 Request Service
 *
 * Handles outgoing OCPP 1.6 requests from the charging station to the central system.
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
    super(OCPPVersion.VERSION_16, ocppResponseService)
    this.payloadValidatorFunctions = OCPP16ServiceUtils.createPayloadValidatorMap(
      OCPP16ServiceUtils.createRequestPayloadConfigs(),
      OCPP16ServiceUtils.createRequestPayloadOptions(moduleName, 'constructor'),
      this.ajv
    )
    this.buildRequestPayload = this.buildRequestPayload.bind(this)
  }

  /**
   * Handles OCPP 1.6 request processing with full validation and error handling
   *
   * This method serves as the main entry point for all outgoing OCPP 1.6 requests.
   * It performs the following operations:
   * - Validates that the requested command is supported by the charging station
   * - Builds and validates the request payload according to OCPP 1.6 schemas
   * - Sends the request to the central system with proper error handling
   * - Processes responses with comprehensive logging and error recovery
   *
   * The method ensures type safety through generic type parameters while maintaining
   * backward compatibility with the OCPP 1.6 specification.
   * @template RequestType - The expected type of the request parameters
   * @template ResponseType - The expected type of the response from the central system
   * @param chargingStation - The charging station instance making the request
   * @param commandName - The OCPP 1.6 command to execute (e.g., 'StartTransaction', 'StopTransaction')
   * @param commandParams - Optional parameters specific to the command being executed
   * @param params - Optional request parameters for controlling request behavior
   * @returns Promise resolving to the typed response from the central system
   * @throws {OCPPError} When the command is not supported or validation fails
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async requestHandler<RequestType extends JsonType, ResponseType extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    commandParams?: RequestType,
    params?: RequestParams
  ): Promise<ResponseType> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Processing '${commandName}' request`
    )
    if (OCPP16ServiceUtils.isRequestCommandSupported(chargingStation, commandName)) {
      try {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Building request payload for '${commandName}'`
        )
        const requestPayload = this.buildRequestPayload<RequestType>(
          chargingStation,
          commandName,
          commandParams
        )
        const messageId = generateUUID()
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Sending '${commandName}' request with message ID '${messageId}'`
        )
        // Pre request actions hook
        switch (commandName) {
          case OCPP16RequestCommand.START_TRANSACTION:
            await OCPP16ServiceUtils.sendAndSetConnectorStatus(
              chargingStation,
              (commandParams as OCPP16StartTransactionRequest).connectorId,
              OCPP16ChargePointStatus.Preparing
            )
            break
        }
        const response = (await this.sendMessage(
          chargingStation,
          messageId,
          requestPayload,
          commandName,
          params
        )) as ResponseType
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: '${commandName}' request completed successfully`
        )
        return response
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.requestHandler: Error processing '${commandName}' request:`,
          error
        )
        throw error
      }
    }
    // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
    const errorMsg = `Unsupported OCPP command ${commandName}`
    logger.error(`${chargingStation.logPrefix()} ${moduleName}.requestHandler: ${errorMsg}`)
    throw new OCPPError(ErrorType.NOT_SUPPORTED, errorMsg, commandName, commandParams)
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  private buildRequestPayload<Request extends JsonType>(
    chargingStation: ChargingStation,
    commandName: OCPP16RequestCommand,
    commandParams?: JsonType
  ): Request {
    let connectorId: number | undefined
    let energyActiveImportRegister: number
    commandParams = commandParams as JsonObject
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: Building ${commandName} payload`
    )
    switch (commandName) {
      case OCPP16RequestCommand.AUTHORIZE:
        return {
          idTag: Constants.DEFAULT_IDTAG,
          ...commandParams,
        } as unknown as Request
      case OCPP16RequestCommand.BOOT_NOTIFICATION:
        return commandParams as unknown as Request
      case OCPP16RequestCommand.DATA_TRANSFER:
        return commandParams as unknown as Request
      case OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION:
        return commandParams as unknown as Request
      case OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION:
        return commandParams as unknown as Request
      case OCPP16RequestCommand.HEARTBEAT:
        return OCPP16Constants.OCPP_REQUEST_EMPTY as unknown as Request
      case OCPP16RequestCommand.METER_VALUES:
        return commandParams as unknown as Request
      case OCPP16RequestCommand.START_TRANSACTION:
        return {
          idTag: Constants.DEFAULT_IDTAG,
          meterStart: chargingStation.getEnergyActiveImportRegisterByConnectorId(
            commandParams.connectorId as number,
            true
          ),
          timestamp: new Date(),
          ...(OCPP16ServiceUtils.hasReservation(
            chargingStation,
            commandParams.connectorId as number,
            commandParams.idTag as string
          ) && {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            reservationId: chargingStation.getReservationBy(
              'connectorId',
              chargingStation.getConnectorStatus(0)?.status === OCPP16ChargePointStatus.Reserved
                ? 0
                : (commandParams.connectorId as number)
            )!.reservationId,
          }),
          ...commandParams,
        } as unknown as Request
      case OCPP16RequestCommand.STATUS_NOTIFICATION:
        return commandParams as unknown as Request
      case OCPP16RequestCommand.STOP_TRANSACTION:
        chargingStation.stationInfo?.transactionDataMeterValues === true &&
          (connectorId = chargingStation.getConnectorIdByTransactionId(
            commandParams.transactionId as number
          ))
        energyActiveImportRegister = chargingStation.getEnergyActiveImportRegisterByTransactionId(
          commandParams.transactionId as number,
          true
        )
        return {
          idTag: chargingStation.getTransactionIdTag(commandParams.transactionId as number),
          meterStop: energyActiveImportRegister,
          timestamp: new Date(),
          ...(chargingStation.stationInfo?.transactionDataMeterValues === true && {
            transactionData: OCPP16ServiceUtils.buildTransactionDataMeterValues(
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              chargingStation.getConnectorStatus(connectorId!)!.transactionBeginMeterValue!,
              OCPP16ServiceUtils.buildTransactionEndMeterValue(
                chargingStation,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                connectorId!,
                energyActiveImportRegister
              )
            ),
          }),
          ...commandParams,
        } as unknown as Request
      default: {
        // OCPPError usage here is debatable: it's an error in the OCPP stack but not targeted to sendError().
        const errorMsg = `Unsupported OCPP command ${commandName as string} for payload building`
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.buildRequestPayload: ${errorMsg}`
        )
        throw new OCPPError(ErrorType.NOT_SUPPORTED, errorMsg, commandName, commandParams)
      }
    }
  }
}
