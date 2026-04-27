import type { ValidateFunction } from 'ajv'

import { Client, type FTPResponse } from 'basic-ftp'
import {
  addSeconds,
  differenceInSeconds,
  type Interval,
  isDate,
  secondsToMilliseconds,
} from 'date-fns'
import { maxTime } from 'date-fns/constants'
import { randomInt } from 'node:crypto'
import { createWriteStream, readdirSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { create } from 'tar'

import {
  canProceedChargingProfile,
  type ChargingStation,
  checkChargingStationState,
  getConfigurationKey,
  getConnectorChargingProfiles,
  getIdTagsFile,
  prepareChargingProfileKind,
  removeExpiredReservations,
  resetAuthorizeConnectorStatus,
  setConfigurationKeyValue,
} from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  type ChangeConfigurationRequest,
  type ChangeConfigurationResponse,
  type ClearCacheResponse,
  ConfigurationSection,
  type ConnectorStatus,
  ErrorType,
  type GenericResponse,
  GenericStatus,
  type GetConfigurationRequest,
  type GetConfigurationResponse,
  type GetDiagnosticsRequest,
  type GetDiagnosticsResponse,
  type IncomingRequestCommand,
  type IncomingRequestHandler,
  type JsonType,
  type LogConfiguration,
  OCPP16AuthorizationStatus,
  OCPP16AvailabilityType,
  type OCPP16BootNotificationRequest,
  type OCPP16BootNotificationResponse,
  type OCPP16CancelReservationRequest,
  type OCPP16ChangeAvailabilityRequest,
  type OCPP16ChangeAvailabilityResponse,
  OCPP16ChargePointStatus,
  type OCPP16ChargingProfile,
  OCPP16ChargingProfilePurposeType,
  type OCPP16ChargingSchedule,
  type OCPP16ClearChargingProfileRequest,
  type OCPP16ClearChargingProfileResponse,
  type OCPP16DataTransferRequest,
  type OCPP16DataTransferResponse,
  OCPP16DiagnosticsStatus,
  type OCPP16DiagnosticsStatusNotificationRequest,
  type OCPP16DiagnosticsStatusNotificationResponse,
  OCPP16FirmwareStatus,
  type OCPP16FirmwareStatusNotificationRequest,
  type OCPP16FirmwareStatusNotificationResponse,
  type OCPP16GetCompositeScheduleRequest,
  type OCPP16GetCompositeScheduleResponse,
  type OCPP16GetLocalListVersionResponse,
  type OCPP16HeartbeatRequest,
  type OCPP16HeartbeatResponse,
  OCPP16IncomingRequestCommand,
  OCPP16MessageTrigger,
  type OCPP16MeterValue,
  type OCPP16MeterValuesRequest,
  type OCPP16MeterValuesResponse,
  OCPP16RequestCommand,
  type OCPP16ReserveNowRequest,
  type OCPP16ReserveNowResponse,
  type OCPP16SendLocalListRequest,
  type OCPP16SendLocalListResponse,
  OCPP16StandardParametersKey,
  type OCPP16StartTransactionRequest,
  type OCPP16StartTransactionResponse,
  type OCPP16StatusNotificationRequest,
  type OCPP16StatusNotificationResponse,
  OCPP16StopTransactionReason,
  OCPP16SupportedFeatureProfiles,
  type OCPP16TriggerMessageRequest,
  type OCPP16TriggerMessageResponse,
  OCPP16TriggerMessageStatus,
  type OCPP16UpdateFirmwareRequest,
  type OCPP16UpdateFirmwareResponse,
  OCPP16UpdateType,
  type OCPPConfigurationKey,
  OCPPVersion,
  type RemoteStartTransactionRequest,
  type RemoteStopTransactionRequest,
  ReservationTerminationReason,
  type ResetRequest,
  type SetChargingProfileRequest,
  type SetChargingProfileResponse,
  type UnlockConnectorRequest,
  type UnlockConnectorResponse,
} from '../../../types/index.js'
import {
  Configuration,
  convertToDate,
  convertToInt,
  convertToIntOrNaN,
  ensureError,
  formatDurationMilliSeconds,
  handleIncomingRequestError,
  isEmpty,
  isNotEmptyArray,
  isNotEmptyString,
  logger,
  sleep,
  truncateId,
} from '../../../utils/index.js'
import { AuthContext, type DifferentialAuthEntry, OCPPAuthServiceFactory } from '../auth/index.js'
import { sendAndSetConnectorStatus } from '../OCPPConnectorStatusOperations.js'
import { OCPPConstants } from '../OCPPConstants.js'
import { OCPPIncomingRequestService } from '../OCPPIncomingRequestService.js'
import { isIdTagAuthorized } from '../OCPPServiceOperations.js'
import {
  buildMeterValue,
  createPayloadValidatorMap,
  isConnectorIdValid,
  isIncomingRequestCommandSupported,
  isMessageTriggerSupported,
} from '../OCPPServiceUtils.js'
import { OCPP16Constants } from './OCPP16Constants.js'
import { OCPP16ServiceUtils } from './OCPP16ServiceUtils.js'

const moduleName = 'OCPP16IncomingRequestService'

/**
 * OCPP 1.6 Incoming Request Service - handles and processes all incoming requests
 * from the Central System (CS) to the Charging Station (CP) using OCPP 1.6 protocol.
 *
 * This service class is responsible for:
 * - **Request Reception**: Receiving and routing OCPP 1.6 incoming requests from Central System
 * - **Payload Validation**: Validating incoming request payloads against OCPP 1.6 JSON schemas
 * - **Request Processing**: Executing business logic for each OCPP 1.6 request type
 * - **Response Generation**: Creating and sending appropriate responses back to Central System
 * - **Error Handling**: Managing protocol-level and application-level errors
 *
 * Supported OCPP 1.6 Incoming Request Types:
 * - **Configuration Management**: ChangeConfiguration, GetConfiguration, GetLocalListVersion
 * - **Remote Operations**: RemoteStartTransaction, RemoteStopTransaction, UnlockConnector
 * - **Firmware Management**: GetDiagnostics, UpdateFirmware, Reset
 * - **Reservation Management**: ReserveNow, CancelReservation
 * - **Charging Profiles**: SetChargingProfile, ClearChargingProfile, GetCompositeSchedule
 * - **Monitoring**: GetLocalListVersion, TriggerMessage
 *
 * Architecture Pattern:
 * This class extends OCPPIncomingRequestService and implements OCPP 1.6-specific
 * request handling logic. It uses a handler mapping pattern where each request type
 * is mapped to a specific handler method, providing clean separation of concerns.
 *
 * Validation Workflow:
 * 1. Incoming request received and parsed
 * 2. Payload validated against OCPP 1.6 JSON schema
 * 3. Request routed to appropriate handler method
 * 4. Business logic executed with charging station state management
 * 5. Response payload validated and sent back to Central System
 * @see {@link validateIncomingRequestPayload} Request payload validation method
 * @see {@link handleRequestRemoteStartTransaction} Example request handler
 */

export class OCPP16IncomingRequestService extends OCPPIncomingRequestService {
  protected readonly csmsName = 'central system'
  protected readonly incomingRequestHandlers: Map<IncomingRequestCommand, IncomingRequestHandler>

  protected readonly moduleName = moduleName

  protected payloadValidatorFunctions: Map<OCPP16IncomingRequestCommand, ValidateFunction<JsonType>>

  protected readonly pendingStateBlockedCommands: IncomingRequestCommand[] = [
    OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
    OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
  ]

  /**
   * Constructs an OCPP 1.6 Incoming Request Service with request handlers, validators, and event listeners.
   */
  public constructor () {
    super(OCPPVersion.VERSION_16)
    this.incomingRequestHandlers = new Map<IncomingRequestCommand, IncomingRequestHandler>([
      [
        OCPP16IncomingRequestCommand.CANCEL_RESERVATION,
        this.toRequestHandler(this.handleRequestCancelReservation.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_AVAILABILITY,
        this.toRequestHandler(this.handleRequestChangeAvailability.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.CHANGE_CONFIGURATION,
        this.toRequestHandler(this.handleRequestChangeConfiguration.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CACHE,
        this.toRequestHandler(this.handleRequestClearCache.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE,
        this.toRequestHandler(this.handleRequestClearChargingProfile.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.DATA_TRANSFER,
        this.toRequestHandler(this.handleRequestDataTransfer.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.GET_COMPOSITE_SCHEDULE,
        this.toRequestHandler(this.handleRequestGetCompositeSchedule.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.GET_CONFIGURATION,
        this.toRequestHandler(this.handleRequestGetConfiguration.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
        this.toRequestHandler(this.handleRequestGetDiagnostics.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.GET_LOCAL_LIST_VERSION,
        this.toRequestHandler(this.handleRequestGetLocalListVersion.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        this.toRequestHandler(this.handleRequestRemoteStartTransaction.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
        this.toRequestHandler(this.handleRequestRemoteStopTransaction.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.RESERVE_NOW,
        this.toRequestHandler(this.handleRequestReserveNow.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.RESET,
        this.toRequestHandler(this.handleRequestReset.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.SEND_LOCAL_LIST,
        this.toRequestHandler(this.handleRequestSendLocalList.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE,
        this.toRequestHandler(this.handleRequestSetChargingProfile.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        this.toRequestHandler(this.handleRequestTriggerMessage.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.UNLOCK_CONNECTOR,
        this.toRequestHandler(this.handleRequestUnlockConnector.bind(this)),
      ],
      [
        OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
        this.toRequestHandler(this.handleRequestUpdateFirmware.bind(this)),
      ],
    ])
    this.payloadValidatorFunctions = createPayloadValidatorMap(
      OCPP16ServiceUtils.createIncomingRequestPayloadConfigs(),
      OCPP16ServiceUtils.createPayloadOptions(moduleName, 'constructor'),
      this.ajv
    )
    // Handle incoming request events
    this.on(
      OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
      (
        chargingStation: ChargingStation,
        request: RemoteStartTransactionRequest,
        response: GenericResponse
      ) => {
        if (response.status === GenericStatus.Accepted) {
          const { connectorId, idTag } = request
          if (connectorId != null) {
            const connectorStatus = chargingStation.getConnectorStatus(connectorId)
            if (connectorStatus != null) {
              connectorStatus.transactionRemoteStarted = true
            }
          }
          chargingStation.ocppRequestService
            .requestHandler<Partial<OCPP16StartTransactionRequest>, OCPP16StartTransactionResponse>(
              chargingStation,
              OCPP16RequestCommand.START_TRANSACTION,
              {
                connectorId,
                idTag,
              }
            )
            .then(response => {
              if (response.idTagInfo.status === OCPP16AuthorizationStatus.ACCEPTED) {
                logger.debug(
                  `${chargingStation.logPrefix()} ${moduleName}.constructor: Remote start transaction ACCEPTED on ${
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    chargingStation.stationInfo?.chargingStationId
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                  }#${connectorId?.toString()} for idTag '${truncateId(idTag)}'`
                )
              } else {
                logger.debug(
                  `${chargingStation.logPrefix()} ${moduleName}.constructor: Remote start transaction REJECTED on ${
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    chargingStation.stationInfo?.chargingStationId
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                  }#${connectorId?.toString()} for idTag '${truncateId(idTag)}'`
                )
              }
              return undefined
            })
            .catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.constructor: Remote start transaction error:`,
                error
              )
            })
        }
      }
    )
    this.on(
      OCPP16IncomingRequestCommand.REMOTE_STOP_TRANSACTION,
      (
        chargingStation: ChargingStation,
        request: RemoteStopTransactionRequest,
        response: GenericResponse
      ) => {
        if (response.status === GenericStatus.Accepted) {
          const { transactionId } = request
          const connectorId = chargingStation.getConnectorIdByTransactionId(transactionId)
          if (connectorId == null) {
            return
          }
          OCPP16ServiceUtils.remoteStopTransaction(chargingStation, connectorId)
            .then(response => {
              if (response.status === GenericStatus.Accepted) {
                logger.debug(
                  `${chargingStation.logPrefix()} ${moduleName}.constructor: Remote stop transaction ACCEPTED on ${
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    chargingStation.stationInfo?.chargingStationId
                  }#${connectorId.toString()} for transaction '${transactionId.toString()}'`
                )
              } else {
                logger.debug(
                  `${chargingStation.logPrefix()} ${moduleName}.constructor: Remote stop transaction REJECTED on ${
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    chargingStation.stationInfo?.chargingStationId
                  }#${connectorId.toString()} for transaction '${transactionId.toString()}'`
                )
              }
              return undefined
            })
            .catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.constructor: Remote stop transaction error:`,
                error
              )
            })
        }
      }
    )
    this.on(
      OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
      (
        chargingStation: ChargingStation,
        request: OCPP16TriggerMessageRequest,
        response: OCPP16TriggerMessageResponse
      ) => {
        if (response.status !== OCPP16TriggerMessageStatus.ACCEPTED) {
          return
        }
        const { connectorId, requestedMessage } = request
        const errorHandler = (error: unknown): void => {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.constructor: Trigger ${requestedMessage} error:`,
            error
          )
        }
        switch (requestedMessage) {
          case OCPP16MessageTrigger.BootNotification:
            chargingStation.ocppRequestService
              .requestHandler<
                OCPP16BootNotificationRequest,
                OCPP16BootNotificationResponse
              >(chargingStation, OCPP16RequestCommand.BOOT_NOTIFICATION, chargingStation.bootNotificationRequest as OCPP16BootNotificationRequest, { skipBufferingOnError: true, triggerMessage: true })
              .catch(errorHandler)
            break
          case OCPP16MessageTrigger.DiagnosticsStatusNotification:
            chargingStation.ocppRequestService
              .requestHandler<
                OCPP16DiagnosticsStatusNotificationRequest,
                OCPP16DiagnosticsStatusNotificationResponse
              >(
                chargingStation,
                OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
                {
                  // §4.4 + §7.24: Idle when not busy uploading diagnostics
                  status:
                    chargingStation.stationInfo?.diagnosticsStatus ===
                    OCPP16DiagnosticsStatus.Uploading
                      ? OCPP16DiagnosticsStatus.Uploading
                      : OCPP16DiagnosticsStatus.Idle,
                },
                {
                  triggerMessage: true,
                }
              )
              .catch(errorHandler)
            break
          case OCPP16MessageTrigger.FirmwareStatusNotification:
            chargingStation.ocppRequestService
              .requestHandler<
                OCPP16FirmwareStatusNotificationRequest,
                OCPP16FirmwareStatusNotificationResponse
              >(
                chargingStation,
                OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
                {
                  // §4.5 + §7.25: Idle when not busy downloading/installing firmware
                  status:
                    chargingStation.stationInfo?.firmwareStatus ===
                      OCPP16FirmwareStatus.Downloading ||
                    chargingStation.stationInfo?.firmwareStatus ===
                      OCPP16FirmwareStatus.Downloaded ||
                    chargingStation.stationInfo?.firmwareStatus === OCPP16FirmwareStatus.Installing
                      ? chargingStation.stationInfo.firmwareStatus
                      : OCPP16FirmwareStatus.Idle,
                },
                {
                  triggerMessage: true,
                }
              )
              .catch(errorHandler)
            break
          case OCPP16MessageTrigger.Heartbeat:
            chargingStation.ocppRequestService
              .requestHandler<OCPP16HeartbeatRequest, OCPP16HeartbeatResponse>(
                chargingStation,
                OCPP16RequestCommand.HEARTBEAT,
                undefined,
                {
                  triggerMessage: true,
                }
              )
              .catch(errorHandler)
            break
          case OCPP16MessageTrigger.MeterValues:
            if (connectorId != null) {
              const connectorStatus = chargingStation.getConnectorStatus(connectorId)
              if (
                connectorStatus?.transactionStarted === true &&
                connectorStatus.transactionId != null
              ) {
                chargingStation.ocppRequestService
                  .requestHandler<OCPP16MeterValuesRequest, OCPP16MeterValuesResponse>(
                    chargingStation,
                    OCPP16RequestCommand.METER_VALUES,
                    {
                      connectorId,
                      meterValue: [
                        buildMeterValue(
                          chargingStation,
                          convertToInt(connectorStatus.transactionId),
                          0
                        ) as OCPP16MeterValue,
                      ],
                      transactionId: convertToInt(connectorStatus.transactionId),
                    },
                    {
                      triggerMessage: true,
                    }
                  )
                  .catch(errorHandler)
              }
            } else {
              for (let id = 1; id <= chargingStation.getNumberOfConnectors(); id++) {
                const cs = chargingStation.getConnectorStatus(id)
                if (cs?.transactionStarted === true && cs.transactionId != null) {
                  chargingStation.ocppRequestService
                    .requestHandler<OCPP16MeterValuesRequest, OCPP16MeterValuesResponse>(
                      chargingStation,
                      OCPP16RequestCommand.METER_VALUES,
                      {
                        connectorId: id,
                        meterValue: [
                          buildMeterValue(
                            chargingStation,
                            convertToInt(cs.transactionId),
                            0
                          ) as OCPP16MeterValue,
                        ],
                        transactionId: convertToInt(cs.transactionId),
                      },
                      {
                        triggerMessage: true,
                      }
                    )
                    .catch(errorHandler)
                }
              }
            }
            break
          case OCPP16MessageTrigger.StatusNotification:
            if (connectorId != null) {
              chargingStation.ocppRequestService
                .requestHandler<OCPP16StatusNotificationRequest, OCPP16StatusNotificationResponse>(
                  chargingStation,
                  OCPP16RequestCommand.STATUS_NOTIFICATION,
                  {
                    connectorId,
                    status: chargingStation.getConnectorStatus(connectorId)
                      ?.status as OCPP16ChargePointStatus,
                  } as unknown as OCPP16StatusNotificationRequest,
                  {
                    triggerMessage: true,
                  }
                )
                .catch(errorHandler)
            } else {
              for (const { connectorId, connectorStatus } of chargingStation.iterateConnectors()) {
                chargingStation.ocppRequestService
                  .requestHandler<
                    OCPP16StatusNotificationRequest,
                    OCPP16StatusNotificationResponse
                  >(
                    chargingStation,
                    OCPP16RequestCommand.STATUS_NOTIFICATION,
                    {
                      connectorId,
                      status: connectorStatus.status as OCPP16ChargePointStatus,
                    } as unknown as OCPP16StatusNotificationRequest,
                    {
                      triggerMessage: true,
                    }
                  )
                  .catch(errorHandler)
              }
            }
            break
        }
      }
    )
    this.on(
      OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
      (
        chargingStation: ChargingStation,
        request: OCPP16UpdateFirmwareRequest,
        _response: OCPP16UpdateFirmwareResponse
      ) => {
        const retrieveDate = convertToDate(request.retrieveDate)
        if (retrieveDate == null) return
        const now = Date.now()
        if (retrieveDate.getTime() <= now) {
          this.updateFirmwareSimulation(chargingStation).catch((error: unknown) => {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.constructor: UpdateFirmware simulation error:`,
              error
            )
          })
        } else {
          setTimeout(() => {
            this.updateFirmwareSimulation(chargingStation).catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.constructor: UpdateFirmware simulation error:`,
                error
              )
            })
          }, retrieveDate.getTime() - now)
        }
      }
    )
  }

  /**
   * Stops the incoming request service for the given charging station.
   * @param chargingStation - Target charging station
   */
  public override stop (chargingStation: ChargingStation): void {
    /* no-op for OCPP 1.6 */
  }

  /**
   * Checks whether the given incoming request command is supported by the charging station.
   * @param chargingStation - Target charging station
   * @param commandName - Incoming request command to check
   * @returns Whether the command is supported
   */
  protected isIncomingRequestCommandSupported (
    chargingStation: ChargingStation,
    commandName: IncomingRequestCommand
  ): boolean {
    return isIncomingRequestCommandSupported(
      chargingStation,
      commandName as OCPP16IncomingRequestCommand
    )
  }

  private composeCompositeSchedule (
    chargingStation: ChargingStation,
    chargingProfiles: OCPP16ChargingProfile[],
    duration: number,
    connectorStatus: ConnectorStatus | undefined
  ): OCPP16ChargingSchedule | undefined {
    const currentDate = new Date()
    const compositeScheduleInterval: Interval = {
      end: addSeconds(currentDate, duration),
      start: currentDate,
    }
    let previousCompositeSchedule: OCPP16ChargingSchedule | undefined
    let compositeSchedule: OCPP16ChargingSchedule | undefined
    for (const chargingProfile of chargingProfiles) {
      if (chargingProfile.chargingSchedule.startSchedule == null) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.composeCompositeSchedule: Charging profile id ${chargingProfile.chargingProfileId.toString()} has no startSchedule defined. Trying to set it to the ${connectorStatus != null ? 'connector current transaction start date' : 'current date'}`
        )
        chargingProfile.chargingSchedule.startSchedule =
          connectorStatus != null ? connectorStatus.transactionStart : currentDate
      }
      if (!isDate(chargingProfile.chargingSchedule.startSchedule)) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.composeCompositeSchedule: Charging profile id ${chargingProfile.chargingProfileId.toString()} startSchedule property is not a Date instance. Trying to convert it to a Date instance`
        )
        chargingProfile.chargingSchedule.startSchedule = convertToDate(
          chargingProfile.chargingSchedule.startSchedule
        )
      }
      if (
        chargingProfile.chargingSchedule.duration == null &&
        chargingProfile.chargingSchedule.startSchedule != null
      ) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.composeCompositeSchedule: Charging profile id ${chargingProfile.chargingProfileId.toString()} has no duration defined and will be set to the maximum time allowed`
        )
        chargingProfile.chargingSchedule.duration = differenceInSeconds(
          maxTime,
          chargingProfile.chargingSchedule.startSchedule
        )
      }
      if (
        !prepareChargingProfileKind(
          connectorStatus,
          chargingProfile,
          compositeScheduleInterval.start,
          chargingStation.logPrefix()
        )
      ) {
        continue
      }
      if (
        !canProceedChargingProfile(
          chargingProfile,
          compositeScheduleInterval.start,
          chargingStation.logPrefix()
        )
      ) {
        continue
      }
      compositeSchedule = OCPP16ServiceUtils.composeChargingSchedules(
        previousCompositeSchedule,
        chargingProfile.chargingSchedule,
        compositeScheduleInterval
      )
      previousCompositeSchedule = compositeSchedule
    }
    return compositeSchedule
  }

  private async handleRequestCancelReservation (
    chargingStation: ChargingStation,
    commandPayload: OCPP16CancelReservationRequest
  ): Promise<GenericResponse> {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.Reservation,
        OCPP16IncomingRequestCommand.CANCEL_RESERVATION
      )
    ) {
      return OCPP16Constants.OCPP_CANCEL_RESERVATION_RESPONSE_REJECTED
    }
    try {
      const { reservationId } = commandPayload
      const reservation = chargingStation.getReservationBy('reservationId', reservationId)
      if (reservation == null) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestCancelReservation: Reservation with id ${reservationId.toString()} does not exist on charging station`
        )
        return OCPP16Constants.OCPP_CANCEL_RESERVATION_RESPONSE_REJECTED
      }
      await chargingStation.removeReservation(
        reservation,
        ReservationTerminationReason.RESERVATION_CANCELED
      )
      return OCPP16Constants.OCPP_CANCEL_RESERVATION_RESPONSE_ACCEPTED
    } catch (error) {
      return (
        handleIncomingRequestError<GenericResponse>(
          chargingStation,
          OCPP16IncomingRequestCommand.CANCEL_RESERVATION,
          ensureError(error),
          {
            errorResponse: OCPP16Constants.OCPP_CANCEL_RESERVATION_RESPONSE_REJECTED,
          }
        ) ?? OCPP16Constants.OCPP_CANCEL_RESERVATION_RESPONSE_REJECTED
      )
    }
  }

  private async handleRequestChangeAvailability (
    chargingStation: ChargingStation,
    commandPayload: OCPP16ChangeAvailabilityRequest
  ): Promise<OCPP16ChangeAvailabilityResponse> {
    const { connectorId, type } = commandPayload
    if (!chargingStation.hasConnector(connectorId)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestChangeAvailability: Trying to change the availability of a non existing connector id ${connectorId.toString()}`
      )
      return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_REJECTED
    }
    const chargePointStatus: OCPP16ChargePointStatus =
      type === OCPP16AvailabilityType.Operative
        ? OCPP16ChargePointStatus.Available
        : OCPP16ChargePointStatus.Unavailable
    if (connectorId === 0) {
      const response = await OCPP16ServiceUtils.changeAvailability(
        chargingStation,
        chargingStation
          .iterateConnectors()
          .map(({ connectorId }) => connectorId)
          .toArray(),
        chargePointStatus,
        type
      )
      return response
    } else if (
      connectorId > 0 &&
      (chargingStation.isChargingStationAvailable() ||
        (!chargingStation.isChargingStationAvailable() &&
          type === OCPP16AvailabilityType.Inoperative))
    ) {
      if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true) {
        const connectorStatus = chargingStation.getConnectorStatus(connectorId)
        if (connectorStatus != null) {
          connectorStatus.availability = type
        }
        return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_SCHEDULED
      }
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      if (connectorStatus != null) {
        connectorStatus.availability = type
      }
      await sendAndSetConnectorStatus(chargingStation, {
        connectorId,
        status: chargePointStatus,
      } as OCPP16StatusNotificationRequest)
      return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_ACCEPTED
    }
    return OCPP16Constants.OCPP_AVAILABILITY_RESPONSE_REJECTED
  }

  private handleRequestChangeConfiguration (
    chargingStation: ChargingStation,
    commandPayload: ChangeConfigurationRequest
  ): ChangeConfigurationResponse {
    const { key, value } = commandPayload
    const keyToChange = getConfigurationKey(chargingStation, key, true)
    if (keyToChange?.readonly === true) {
      return OCPP16Constants.OCPP_CONFIGURATION_RESPONSE_REJECTED
    } else if (keyToChange?.readonly === false) {
      const integerKeys = new Set([
        OCPP16StandardParametersKey.ConnectionTimeOut,
        OCPP16StandardParametersKey.HeartBeatInterval,
        OCPP16StandardParametersKey.HeartbeatInterval,
        OCPP16StandardParametersKey.MeterValueSampleInterval,
        OCPP16StandardParametersKey.TransactionMessageAttempts,
        OCPP16StandardParametersKey.TransactionMessageRetryInterval,
        OCPP16StandardParametersKey.WebSocketPingInterval,
      ])
      if (integerKeys.has(keyToChange.key as OCPP16StandardParametersKey)) {
        const numValue = Number(value)
        if (!Number.isInteger(numValue) || numValue < 0) {
          return OCPP16Constants.OCPP_CONFIGURATION_RESPONSE_REJECTED
        }
      }
      let valueChanged = false
      if (keyToChange.value !== value) {
        setConfigurationKeyValue(chargingStation, key, value, true)
        valueChanged = true
      }
      let triggerHeartbeatRestart = false
      if (
        (keyToChange.key as OCPP16StandardParametersKey) ===
          OCPP16StandardParametersKey.HeartBeatInterval &&
        valueChanged
      ) {
        setConfigurationKeyValue(
          chargingStation,
          OCPP16StandardParametersKey.HeartbeatInterval,
          value
        )
        triggerHeartbeatRestart = true
      }
      if (
        (keyToChange.key as OCPP16StandardParametersKey) ===
          OCPP16StandardParametersKey.HeartbeatInterval &&
        valueChanged
      ) {
        setConfigurationKeyValue(
          chargingStation,
          OCPP16StandardParametersKey.HeartBeatInterval,
          value
        )
        triggerHeartbeatRestart = true
      }
      if (triggerHeartbeatRestart) {
        chargingStation.restartHeartbeat()
      }
      if (
        (keyToChange.key as OCPP16StandardParametersKey) ===
          OCPP16StandardParametersKey.WebSocketPingInterval &&
        valueChanged
      ) {
        chargingStation.restartWebSocketPing()
      }
      if (
        (keyToChange.key as OCPP16StandardParametersKey) ===
          OCPP16StandardParametersKey.MeterValueSampleInterval &&
        chargingStation.getNumberOfRunningTransactions() > 0 &&
        valueChanged
      ) {
        for (
          let connectorId = 1;
          connectorId <= chargingStation.getNumberOfConnectors();
          connectorId++
        ) {
          if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true) {
            OCPP16ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId)
            OCPP16ServiceUtils.startUpdatedMeterValues(
              chargingStation,
              connectorId,
              secondsToMilliseconds(convertToInt(value))
            )
          }
        }
      }
      if (keyToChange.reboot === true) {
        return OCPP16Constants.OCPP_CONFIGURATION_RESPONSE_REBOOT_REQUIRED
      }
      return OCPP16Constants.OCPP_CONFIGURATION_RESPONSE_ACCEPTED
    }
    return OCPP16Constants.OCPP_CONFIGURATION_RESPONSE_NOT_SUPPORTED
  }

  private handleRequestClearCache (chargingStation: ChargingStation): ClearCacheResponse {
    const idTagsFile =
      chargingStation.stationInfo != null ? getIdTagsFile(chargingStation.stationInfo) : undefined
    if (idTagsFile != null && chargingStation.idTagsCache.deleteIdTags(idTagsFile)) {
      return OCPPConstants.OCPP_RESPONSE_ACCEPTED
    }
    return OCPPConstants.OCPP_RESPONSE_REJECTED
  }

  private handleRequestClearChargingProfile (
    chargingStation: ChargingStation,
    commandPayload: OCPP16ClearChargingProfileRequest
  ): OCPP16ClearChargingProfileResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16IncomingRequestCommand.CLEAR_CHARGING_PROFILE
      )
    ) {
      return OCPP16Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN
    }
    const { connectorId } = commandPayload
    if (connectorId != null) {
      if (!chargingStation.hasConnector(connectorId)) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestClearChargingProfile: Trying to clear a charging profile(s) to a non existing connector id ${connectorId.toString()}`
        )
        return OCPP16Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN
      }
      const connectorStatus = chargingStation.getConnectorStatus(connectorId)
      if (isNotEmptyArray(connectorStatus?.chargingProfiles)) {
        const { chargingProfilePurpose, id, stackLevel } = commandPayload
        if (id == null && chargingProfilePurpose == null && stackLevel == null) {
          connectorStatus.chargingProfiles = []
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.handleRequestClearChargingProfile: All charging profile(s) cleared on connector id ${connectorId.toString()}`
          )
          return OCPP16Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED
        }
        const clearedCP = OCPP16ServiceUtils.clearChargingProfiles(
          chargingStation,
          commandPayload,
          connectorStatus.chargingProfiles as OCPP16ChargingProfile[]
        )
        if (clearedCP) {
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.handleRequestClearChargingProfile: Matching charging profile(s) cleared on connector id ${connectorId.toString()}`
          )
          return OCPP16Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED
        }
      }
    } else {
      let clearedCP = false
      for (const { connectorStatus } of chargingStation.iterateConnectors()) {
        const clearedConnectorCP = OCPP16ServiceUtils.clearChargingProfiles(
          chargingStation,
          commandPayload,
          connectorStatus.chargingProfiles as OCPP16ChargingProfile[]
        )
        if (clearedConnectorCP && !clearedCP) {
          clearedCP = true
        }
      }
      if (clearedCP) {
        return OCPP16Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED
      }
    }
    return OCPP16Constants.OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN
  }

  private handleRequestDataTransfer (
    chargingStation: ChargingStation,
    commandPayload: OCPP16DataTransferRequest
  ): OCPP16DataTransferResponse {
    const { messageId, vendorId } = commandPayload
    try {
      if (vendorId !== chargingStation.stationInfo?.chargePointVendor) {
        return OCPP16Constants.OCPP_DATA_TRANSFER_RESPONSE_UNKNOWN_VENDOR_ID
      }
      if (messageId != null) {
        return OCPP16Constants.OCPP_DATA_TRANSFER_RESPONSE_UNKNOWN_MESSAGE_ID
      }
      return OCPP16Constants.OCPP_DATA_TRANSFER_RESPONSE_ACCEPTED
    } catch (error) {
      return (
        handleIncomingRequestError<OCPP16DataTransferResponse>(
          chargingStation,
          OCPP16IncomingRequestCommand.DATA_TRANSFER,
          ensureError(error),
          { errorResponse: OCPP16Constants.OCPP_DATA_TRANSFER_RESPONSE_REJECTED }
        ) ?? OCPP16Constants.OCPP_DATA_TRANSFER_RESPONSE_REJECTED
      )
    }
  }

  private handleRequestGetCompositeSchedule (
    chargingStation: ChargingStation,
    commandPayload: OCPP16GetCompositeScheduleRequest
  ): OCPP16GetCompositeScheduleResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16IncomingRequestCommand.GET_COMPOSITE_SCHEDULE
      )
    ) {
      return OCPP16Constants.OCPP_RESPONSE_REJECTED
    }
    const { chargingRateUnit, connectorId, duration } = commandPayload
    if (!chargingStation.hasConnector(connectorId)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetCompositeSchedule: Trying to get composite schedule to a non existing connector id ${connectorId.toString()}`
      )
      return OCPP16Constants.OCPP_RESPONSE_REJECTED
    }
    if (connectorId === 0) {
      if (chargingRateUnit != null) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetCompositeSchedule: Get composite schedule with a specified rate unit is not yet supported, no conversion will be done`
        )
      }
      const allChargingProfiles: OCPP16ChargingProfile[] = []
      for (let id = 0; id <= chargingStation.getNumberOfConnectors(); id++) {
        if (chargingStation.hasConnector(id)) {
          allChargingProfiles.push(
            ...(getConnectorChargingProfiles(chargingStation, id) as OCPP16ChargingProfile[])
          )
        }
      }
      if (isEmpty(allChargingProfiles)) {
        return OCPP16Constants.OCPP_RESPONSE_REJECTED
      }
      const compositeSchedule = this.composeCompositeSchedule(
        chargingStation,
        allChargingProfiles,
        duration,
        undefined
      )
      if (compositeSchedule != null) {
        return {
          chargingSchedule: compositeSchedule,
          connectorId: 0,
          scheduleStart: compositeSchedule.startSchedule,
          status: GenericStatus.Accepted,
        }
      }
      return OCPP16Constants.OCPP_RESPONSE_REJECTED
    }
    if (chargingRateUnit != null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetCompositeSchedule: Get composite schedule with a specified rate unit is not yet supported, no conversion will be done`
      )
    }
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (
      isEmpty(connectorStatus?.chargingProfiles) &&
      isEmpty(chargingStation.getConnectorStatus(0)?.chargingProfiles)
    ) {
      return OCPP16Constants.OCPP_RESPONSE_REJECTED
    }
    const chargingProfiles = getConnectorChargingProfiles(
      chargingStation,
      connectorId
    ) as OCPP16ChargingProfile[]
    const compositeSchedule = this.composeCompositeSchedule(
      chargingStation,
      chargingProfiles,
      duration,
      connectorStatus
    )
    if (compositeSchedule != null) {
      return {
        chargingSchedule: compositeSchedule,
        connectorId,
        scheduleStart: compositeSchedule.startSchedule,
        status: GenericStatus.Accepted,
      }
    }
    return OCPP16Constants.OCPP_RESPONSE_REJECTED
  }

  private handleRequestGetConfiguration (
    chargingStation: ChargingStation,
    commandPayload: GetConfigurationRequest
  ): GetConfigurationResponse {
    const { key } = commandPayload
    const configurationKey: OCPPConfigurationKey[] = []
    const unknownKey: string[] = []
    if (key == null || isEmpty(key)) {
      for (const configKey of chargingStation.ocppConfiguration?.configurationKey ?? []) {
        if (!OCPP16ServiceUtils.isConfigurationKeyVisible(configKey)) {
          continue
        }
        configurationKey.push({
          key: configKey.key,
          readonly: configKey.readonly,
          value: configKey.value,
        })
      }
    } else if (isNotEmptyArray(key)) {
      for (const k of key) {
        const keyFound = getConfigurationKey(chargingStation, k, true)
        if (keyFound != null) {
          if (!OCPP16ServiceUtils.isConfigurationKeyVisible(keyFound)) {
            continue
          }
          configurationKey.push({
            key: keyFound.key,
            readonly: keyFound.readonly,
            value: keyFound.value,
          })
        } else {
          unknownKey.push(k)
        }
      }
    }
    return {
      configurationKey,
      unknownKey,
    }
  }

  private async handleRequestGetDiagnostics (
    chargingStation: ChargingStation,
    commandPayload: GetDiagnosticsRequest
  ): Promise<GetDiagnosticsResponse> {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.FirmwareManagement,
        OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
      )
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetDiagnostics: Cannot get diagnostics: feature profile not supported`
      )
      return OCPP16Constants.OCPP_RESPONSE_EMPTY
    }
    const { location } = commandPayload
    const uri = new URL(location)
    if (uri.protocol.startsWith('ftp:')) {
      let ftpClient: Client | undefined
      try {
        const logConfiguration = Configuration.getConfigurationSection<LogConfiguration>(
          ConfigurationSection.log
        )
        const logFile = logConfiguration.file
        if (logFile == null) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetDiagnostics: Cannot get diagnostics: log file not configured`
          )
          return OCPP16Constants.OCPP_RESPONSE_EMPTY
        }
        const logFiles = readdirSync(
          resolve((fileURLToPath(import.meta.url), '../', dirname(logFile)))
        )
          .filter(file => file.endsWith(extname(logFile)))
          .map(file => join(dirname(logFile), file))
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        const diagnosticsArchive = `${chargingStation.stationInfo?.chargingStationId}_logs.tar.gz`
        create({ gzip: true }, logFiles).pipe(createWriteStream(diagnosticsArchive))
        ftpClient = new Client()
        const accessResponse = await ftpClient.access({
          host: uri.hostname,
          ...(isNotEmptyString(uri.port) && { port: convertToInt(uri.port) }),
          ...(isNotEmptyString(uri.username) && { user: uri.username }),
          ...(isNotEmptyString(uri.password) && { password: uri.password }),
        })
        let uploadResponse: FTPResponse | undefined
        if (accessResponse.code === 220) {
          ftpClient.trackProgress(info => {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetDiagnostics: ${(
                info.bytes / 1024
              ).toString()} bytes transferred from diagnostics archive ${info.name}`
            )
            if (chargingStation.stationInfo != null) {
              chargingStation.stationInfo.diagnosticsStatus = OCPP16DiagnosticsStatus.Uploading
            }
            chargingStation.ocppRequestService
              .requestHandler<
                OCPP16DiagnosticsStatusNotificationRequest,
                OCPP16DiagnosticsStatusNotificationResponse
              >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
                status: OCPP16DiagnosticsStatus.Uploading,
              })
              .catch((error: unknown) => {
                logger.error(
                  `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetDiagnostics: Error while sending '${
                    OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION
                  }'`,
                  error
                )
              })
          })
          uploadResponse = await ftpClient.uploadFrom(
            join(resolve(dirname(fileURLToPath(import.meta.url)), '../'), diagnosticsArchive),
            `${uri.pathname}${diagnosticsArchive}`
          )
          if (uploadResponse.code === 226) {
            await chargingStation.ocppRequestService.requestHandler<
              OCPP16DiagnosticsStatusNotificationRequest,
              OCPP16DiagnosticsStatusNotificationResponse
            >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
              status: OCPP16DiagnosticsStatus.Uploaded,
            })
            if (chargingStation.stationInfo != null) {
              chargingStation.stationInfo.diagnosticsStatus = OCPP16DiagnosticsStatus.Uploaded
            }
            ftpClient.close()
            return { fileName: diagnosticsArchive }
          }
          throw new OCPPError(
            ErrorType.GENERIC_ERROR,
            `Diagnostics transfer failed with error code ${accessResponse.code.toString()}|${uploadResponse.code.toString()}`,
            OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
          )
        }
        throw new OCPPError(
          ErrorType.GENERIC_ERROR,
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Diagnostics transfer failed with error code ${accessResponse.code.toString()}|${uploadResponse?.code.toString()}`,
          OCPP16IncomingRequestCommand.GET_DIAGNOSTICS
        )
      } catch (error) {
        await chargingStation.ocppRequestService.requestHandler<
          OCPP16DiagnosticsStatusNotificationRequest,
          OCPP16DiagnosticsStatusNotificationResponse
        >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
          status: OCPP16DiagnosticsStatus.UploadFailed,
        })
        if (chargingStation.stationInfo != null) {
          chargingStation.stationInfo.diagnosticsStatus = OCPP16DiagnosticsStatus.UploadFailed
        }
        ftpClient?.close()
        return (
          handleIncomingRequestError<GetDiagnosticsResponse>(
            chargingStation,
            OCPP16IncomingRequestCommand.GET_DIAGNOSTICS,
            ensureError(error),
            { errorResponse: OCPP16Constants.OCPP_RESPONSE_EMPTY }
          ) ?? OCPP16Constants.OCPP_RESPONSE_EMPTY
        )
      }
    } else {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetDiagnostics: Unsupported protocol ${
          uri.protocol
        } to transfer the diagnostic logs archive`
      )
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16DiagnosticsStatusNotificationRequest,
        OCPP16DiagnosticsStatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION, {
        status: OCPP16DiagnosticsStatus.UploadFailed,
      })
      if (chargingStation.stationInfo != null) {
        chargingStation.stationInfo.diagnosticsStatus = OCPP16DiagnosticsStatus.UploadFailed
      }
      return OCPP16Constants.OCPP_RESPONSE_EMPTY
    }
  }

  /**
   * Handles OCPP 1.6 GetLocalListVersion request from central system.
   * Returns the version number of the local authorization list.
   * @param chargingStation - The charging station instance processing the request
   * @returns GetLocalListVersionResponse with list version
   */
  private handleRequestGetLocalListVersion (
    chargingStation: ChargingStation
  ): OCPP16GetLocalListVersionResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.LocalAuthListManagement,
        OCPP16IncomingRequestCommand.GET_LOCAL_LIST_VERSION
      )
    ) {
      return OCPP16Constants.OCPP_GET_LOCAL_LIST_VERSION_RESPONSE_NOT_SUPPORTED
    }
    try {
      const authService = OCPPAuthServiceFactory.getInstance(chargingStation)
      const manager = authService.getLocalAuthListManager()
      if (manager == null) {
        return OCPP16Constants.OCPP_GET_LOCAL_LIST_VERSION_RESPONSE_NOT_SUPPORTED
      }
      return { listVersion: manager.getVersion() }
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetLocalListVersion: Error getting version:`,
        error
      )
      return OCPP16Constants.OCPP_GET_LOCAL_LIST_VERSION_RESPONSE_NOT_SUPPORTED
    }
  }

  /**
   * Handles OCPP 1.6 RemoteStartTransaction request from central system
   * Initiates charging transaction on specified or available connector
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - RemoteStartTransaction request payload with connector and ID tag
   * @returns Promise resolving to GenericResponse indicating operation success or failure
   */
  private async handleRequestRemoteStartTransaction (
    chargingStation: ChargingStation,
    commandPayload: RemoteStartTransactionRequest
  ): Promise<GenericResponse> {
    if (commandPayload.connectorId == null) {
      for (
        let connectorId = 1;
        connectorId <= chargingStation.getNumberOfConnectors();
        connectorId++
      ) {
        if (
          chargingStation.isConnectorAvailable(connectorId) &&
          chargingStation.getConnectorStatus(connectorId)?.transactionStarted === false &&
          !OCPP16ServiceUtils.hasReservation(chargingStation, connectorId, commandPayload.idTag)
        ) {
          commandPayload.connectorId = connectorId
          break
        }
      }
      if (commandPayload.connectorId == null) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestRemoteStartTransaction: Remote start transaction REJECTED on ${
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            chargingStation.stationInfo?.chargingStationId
          }, idTag '${truncateId(commandPayload.idTag)}': no available connector found`
        )
        return OCPP16Constants.OCPP_RESPONSE_REJECTED
      }
    }
    const { chargingProfile, connectorId: transactionConnectorId, idTag } = commandPayload
    if (!chargingStation.hasConnector(transactionConnectorId)) {
      return this.notifyRemoteStartTransactionRejected(
        chargingStation,
        transactionConnectorId,
        idTag
      )
    }
    // Reject during finishing delay — connector is still physically occupied
    if (
      (chargingStation.stationInfo?.finishingStatusDelay ?? 0) > 0 &&
      chargingStation.getConnectorStatus(transactionConnectorId)?.status ===
        OCPP16ChargePointStatus.Finishing
    ) {
      return this.notifyRemoteStartTransactionRejected(
        chargingStation,
        transactionConnectorId,
        idTag
      )
    }
    if (
      !chargingStation.isChargingStationAvailable() ||
      !chargingStation.isConnectorAvailable(transactionConnectorId)
    ) {
      return this.notifyRemoteStartTransactionRejected(
        chargingStation,
        transactionConnectorId,
        idTag
      )
    }
    // idTag authorization check required
    if (
      chargingStation.getAuthorizeRemoteTxRequests() &&
      !(await isIdTagAuthorized(
        chargingStation,
        transactionConnectorId,
        idTag,
        AuthContext.REMOTE_START
      ))
    ) {
      return this.notifyRemoteStartTransactionRejected(
        chargingStation,
        transactionConnectorId,
        idTag
      )
    }
    if (
      chargingProfile != null &&
      !this.setRemoteStartTransactionChargingProfile(
        chargingStation,
        transactionConnectorId,
        chargingProfile
      )
    ) {
      return this.notifyRemoteStartTransactionRejected(
        chargingStation,
        transactionConnectorId,
        idTag
      )
    }
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestRemoteStartTransaction: Remote start transaction ACCEPTED on ${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        chargingStation.stationInfo?.chargingStationId
      }#${transactionConnectorId.toString()}, idTag '${truncateId(idTag)}'`
    )
    return OCPP16Constants.OCPP_RESPONSE_ACCEPTED
  }

  private handleRequestRemoteStopTransaction (
    chargingStation: ChargingStation,
    commandPayload: RemoteStopTransactionRequest
  ): GenericResponse {
    const { transactionId } = commandPayload
    if (chargingStation.getConnectorIdByTransactionId(transactionId) != null) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRemoteStopTransaction: Remote stop transaction ACCEPTED for transactionId '${transactionId.toString()}'`
      )
      return OCPP16Constants.OCPP_RESPONSE_ACCEPTED
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestRemoteStopTransaction: Remote stop transaction REJECTED for transactionId '${transactionId.toString()}'`
    )
    return OCPP16Constants.OCPP_RESPONSE_REJECTED
  }

  private async handleRequestReserveNow (
    chargingStation: ChargingStation,
    commandPayload: OCPP16ReserveNowRequest
  ): Promise<OCPP16ReserveNowResponse> {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.Reservation,
        OCPP16IncomingRequestCommand.RESERVE_NOW
      )
    ) {
      return OCPP16Constants.OCPP_RESERVATION_RESPONSE_REJECTED
    }
    commandPayload.expiryDate = convertToDate(commandPayload.expiryDate) ?? new Date()
    const { connectorId, idTag, reservationId } = commandPayload
    if (!chargingStation.hasConnector(connectorId)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestReserveNow: Trying to reserve a non existing connector id ${connectorId.toString()}`
      )
      return OCPP16Constants.OCPP_RESERVATION_RESPONSE_REJECTED
    }
    if (connectorId > 0 && !chargingStation.isConnectorAvailable(connectorId)) {
      return OCPP16Constants.OCPP_RESERVATION_RESPONSE_REJECTED
    }
    if (connectorId === 0 && !chargingStation.getReserveConnectorZeroSupported()) {
      return OCPP16Constants.OCPP_RESERVATION_RESPONSE_REJECTED
    }
    if (!(await isIdTagAuthorized(chargingStation, connectorId, idTag, AuthContext.RESERVATION))) {
      return OCPP16Constants.OCPP_RESERVATION_RESPONSE_REJECTED
    }
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus == null) {
      return OCPP16Constants.OCPP_RESERVATION_RESPONSE_REJECTED
    }
    resetAuthorizeConnectorStatus(connectorStatus)
    let response: OCPP16ReserveNowResponse
    try {
      await removeExpiredReservations(chargingStation)
      switch (connectorStatus.status) {
        case OCPP16ChargePointStatus.Charging:
        case OCPP16ChargePointStatus.Finishing:
        case OCPP16ChargePointStatus.Preparing:
        case OCPP16ChargePointStatus.SuspendedEV:
        case OCPP16ChargePointStatus.SuspendedEVSE:
          response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_OCCUPIED
          break
        case OCPP16ChargePointStatus.Faulted:
          response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_FAULTED
          break
        case OCPP16ChargePointStatus.Unavailable:
          response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_UNAVAILABLE
          break
        case OCPP16ChargePointStatus.Reserved:
          if (!chargingStation.isConnectorReservable(reservationId, idTag, connectorId)) {
            response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_OCCUPIED
            break
          }
        // eslint-disable-next-line no-fallthrough
        default:
          if (!chargingStation.isConnectorReservable(reservationId, idTag)) {
            response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_OCCUPIED
            break
          }
          await chargingStation.addReservation({
            id: commandPayload.reservationId,
            ...commandPayload,
          })
          response = OCPP16Constants.OCPP_RESERVATION_RESPONSE_ACCEPTED
          break
      }
      return response
    } catch (error) {
      const errorConnectorStatus = chargingStation.getConnectorStatus(connectorId)
      if (errorConnectorStatus != null) {
        errorConnectorStatus.status = OCPP16ChargePointStatus.Available
      }
      return (
        handleIncomingRequestError<OCPP16ReserveNowResponse>(
          chargingStation,
          OCPP16IncomingRequestCommand.RESERVE_NOW,
          ensureError(error),
          { errorResponse: OCPP16Constants.OCPP_RESERVATION_RESPONSE_FAULTED }
        ) ?? OCPP16Constants.OCPP_RESERVATION_RESPONSE_FAULTED
      )
    }
  }

  /**
   * Handles incoming Reset request and initiates station reset
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - Reset request payload containing reset type
   * @returns OCPP response indicating acceptance of the reset request
   */
  private handleRequestReset (
    chargingStation: ChargingStation,
    commandPayload: ResetRequest
  ): GenericResponse {
    const { type } = commandPayload
    const reason = `${type}Reset` as OCPP16StopTransactionReason
    const graceful = reason === OCPP16StopTransactionReason.SOFT_RESET
    chargingStation.reset(reason, graceful).catch((error: unknown) => {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Reset error:`,
        error
      )
    })
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: ${type} reset request received, simulating it. The station will be back online in ${formatDurationMilliSeconds(
        chargingStation.stationInfo?.resetTime ?? 0
      )}`
    )
    return OCPP16Constants.OCPP_RESPONSE_ACCEPTED
  }

  private handleRequestSendLocalList (
    chargingStation: ChargingStation,
    commandPayload: OCPP16SendLocalListRequest
  ): OCPP16SendLocalListResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.LocalAuthListManagement,
        OCPP16IncomingRequestCommand.SEND_LOCAL_LIST
      )
    ) {
      return OCPP16Constants.OCPP_SEND_LOCAL_LIST_RESPONSE_NOT_SUPPORTED
    }
    try {
      const authService = OCPPAuthServiceFactory.getInstance(chargingStation)
      if (!chargingStation.getLocalAuthListEnabled()) {
        return OCPP16Constants.OCPP_SEND_LOCAL_LIST_RESPONSE_NOT_SUPPORTED
      }
      const manager = authService.getLocalAuthListManager()
      if (manager == null) {
        return OCPP16Constants.OCPP_SEND_LOCAL_LIST_RESPONSE_NOT_SUPPORTED
      }
      if (commandPayload.listVersion <= 0) {
        return OCPP16Constants.OCPP_SEND_LOCAL_LIST_RESPONSE_FAILED
      }
      const sendLocalListMaxLength = getConfigurationKey(
        chargingStation,
        OCPP16StandardParametersKey.SendLocalListMaxLength
      )
      if (sendLocalListMaxLength?.value != null) {
        const maxLength = convertToIntOrNaN(sendLocalListMaxLength.value)
        if (
          Number.isInteger(maxLength) &&
          maxLength > 0 &&
          commandPayload.localAuthorizationList != null &&
          commandPayload.localAuthorizationList.length > maxLength
        ) {
          return OCPP16Constants.OCPP_SEND_LOCAL_LIST_RESPONSE_FAILED
        }
      }
      const { listVersion, localAuthorizationList, updateType } = commandPayload
      if (updateType === OCPP16UpdateType.Full) {
        const entries = (localAuthorizationList ?? []).map(item => ({
          expiryDate:
            item.idTagInfo?.expiryDate != null
              ? convertToDate(item.idTagInfo.expiryDate)
              : undefined,
          identifier: item.idTag,
          parentId: item.idTagInfo?.parentIdTag,
          status: item.idTagInfo?.status ?? OCPP16AuthorizationStatus.INVALID,
        }))
        manager.setEntries(entries, listVersion)
      } else {
        // OCPP 1.6 §5.15: For differential updates, version must be greater than current
        const currentVersion = manager.getVersion()
        if (listVersion <= currentVersion) {
          return OCPP16Constants.OCPP_SEND_LOCAL_LIST_RESPONSE_VERSION_MISMATCH
        }
        const diffEntries: DifferentialAuthEntry[] = (localAuthorizationList ?? []).map(item => ({
          expiryDate:
            item.idTagInfo?.expiryDate != null
              ? convertToDate(item.idTagInfo.expiryDate)
              : undefined,
          identifier: item.idTag,
          parentId: item.idTagInfo?.parentIdTag,
          status: item.idTagInfo?.status,
        }))
        manager.applyDifferentialUpdate(diffEntries, listVersion)
      }
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestSendLocalList: Local auth list updated (${updateType}), version=${String(listVersion)}`
      )
      return OCPP16Constants.OCPP_SEND_LOCAL_LIST_RESPONSE_ACCEPTED
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestSendLocalList: Error updating local auth list:`,
        error
      )
      return OCPP16Constants.OCPP_SEND_LOCAL_LIST_RESPONSE_FAILED
    }
  }

  private handleRequestSetChargingProfile (
    chargingStation: ChargingStation,
    commandPayload: SetChargingProfileRequest
  ): SetChargingProfileResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.SmartCharging,
        OCPP16IncomingRequestCommand.SET_CHARGING_PROFILE
      )
    ) {
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_NOT_SUPPORTED
    }
    const { connectorId, csChargingProfiles } = commandPayload
    if (!chargingStation.hasConnector(connectorId)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetChargingProfile: Trying to set charging profile(s) to a non existing connector id ${connectorId.toString()}`
      )
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED
    }
    if (
      csChargingProfiles.chargingProfilePurpose ===
        OCPP16ChargingProfilePurposeType.CHARGE_POINT_MAX_PROFILE &&
      connectorId !== 0
    ) {
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED
    }
    if (
      csChargingProfiles.chargingProfilePurpose === OCPP16ChargingProfilePurposeType.TX_PROFILE &&
      connectorId === 0
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetChargingProfile: Trying to set transaction charging profile(s) on connector ${connectorId.toString()}`
      )
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED
    }
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (
      csChargingProfiles.chargingProfilePurpose === OCPP16ChargingProfilePurposeType.TX_PROFILE &&
      connectorId > 0 &&
      connectorStatus?.transactionStarted === false
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetChargingProfile: Trying to set transaction charging profile(s) on connector ${connectorId.toString()} without a started transaction`
      )
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED
    }
    if (
      csChargingProfiles.chargingProfilePurpose === OCPP16ChargingProfilePurposeType.TX_PROFILE &&
      connectorId > 0 &&
      connectorStatus?.transactionStarted === true &&
      csChargingProfiles.transactionId != null &&
      csChargingProfiles.transactionId !== connectorStatus.transactionId
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetChargingProfile: Trying to set transaction charging profile(s) on connector ${connectorId.toString()} with a different transaction id ${
          csChargingProfiles.transactionId.toString()
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        } than the started transaction id ${connectorStatus.transactionId?.toString()}`
      )
      return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED
    }
    OCPP16ServiceUtils.setChargingProfile(chargingStation, connectorId, csChargingProfiles)
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetChargingProfile: Charging profile(s) set on connector id ${connectorId.toString()}: %j`,
      csChargingProfiles
    )
    return OCPP16Constants.OCPP_SET_CHARGING_PROFILE_RESPONSE_ACCEPTED
  }

  private handleRequestTriggerMessage (
    chargingStation: ChargingStation,
    commandPayload: OCPP16TriggerMessageRequest
  ): OCPP16TriggerMessageResponse {
    const { connectorId, requestedMessage } = commandPayload
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.RemoteTrigger,
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE
      ) ||
      !isMessageTriggerSupported(chargingStation, requestedMessage)
    ) {
      return OCPP16Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED
    }
    if (
      connectorId != null &&
      !isConnectorIdValid(
        chargingStation,
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        connectorId
      )
    ) {
      return OCPP16Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_REJECTED
    }
    switch (requestedMessage) {
      case OCPP16MessageTrigger.BootNotification:
      case OCPP16MessageTrigger.DiagnosticsStatusNotification:
      case OCPP16MessageTrigger.FirmwareStatusNotification:
      case OCPP16MessageTrigger.Heartbeat:
      case OCPP16MessageTrigger.MeterValues:
      case OCPP16MessageTrigger.StatusNotification:
        return OCPP16Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED
      default:
        return OCPP16Constants.OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED
    }
  }

  private async handleRequestUnlockConnector (
    chargingStation: ChargingStation,
    commandPayload: UnlockConnectorRequest
  ): Promise<UnlockConnectorResponse> {
    const { connectorId } = commandPayload
    if (!chargingStation.hasConnector(connectorId)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUnlockConnector: Trying to unlock a non existing connector id ${connectorId.toString()}`
      )
      return OCPP16Constants.OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED
    }
    if (connectorId === 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUnlockConnector: Trying to unlock connector id ${connectorId.toString()}`
      )
      return OCPP16Constants.OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED
    }
    if (chargingStation.getConnectorStatus(connectorId)?.transactionStarted === true) {
      const stopResponse = await OCPP16ServiceUtils.stopTransactionOnConnector(
        chargingStation,
        connectorId,
        OCPP16StopTransactionReason.UNLOCK_COMMAND
      )
      if (stopResponse.idTagInfo?.status === OCPP16AuthorizationStatus.ACCEPTED) {
        return OCPP16Constants.OCPP_RESPONSE_UNLOCKED
      }
      return OCPP16Constants.OCPP_RESPONSE_UNLOCK_FAILED
    }
    await sendAndSetConnectorStatus(chargingStation, {
      connectorId,
      status: OCPP16ChargePointStatus.Available,
    } as OCPP16StatusNotificationRequest)
    chargingStation.unlockConnector(connectorId)
    return OCPP16Constants.OCPP_RESPONSE_UNLOCKED
  }

  private handleRequestUpdateFirmware (
    chargingStation: ChargingStation,
    commandPayload: OCPP16UpdateFirmwareRequest
  ): OCPP16UpdateFirmwareResponse {
    if (
      !OCPP16ServiceUtils.checkFeatureProfile(
        chargingStation,
        OCPP16SupportedFeatureProfiles.FirmwareManagement,
        OCPP16IncomingRequestCommand.UPDATE_FIRMWARE
      )
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUpdateFirmware: Cannot simulate firmware update: feature profile not supported`
      )
      return OCPP16Constants.OCPP_RESPONSE_EMPTY
    }
    commandPayload.retrieveDate = convertToDate(commandPayload.retrieveDate) ?? new Date()
    if (
      chargingStation.stationInfo?.firmwareStatus === OCPP16FirmwareStatus.Downloading ||
      chargingStation.stationInfo?.firmwareStatus === OCPP16FirmwareStatus.Downloaded ||
      chargingStation.stationInfo?.firmwareStatus === OCPP16FirmwareStatus.Installing
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUpdateFirmware: Cannot simulate firmware update: firmware update is already in progress`
      )
      return OCPP16Constants.OCPP_RESPONSE_EMPTY
    }
    return OCPP16Constants.OCPP_RESPONSE_EMPTY
  }

  private notifyRemoteStartTransactionRejected (
    chargingStation: ChargingStation,
    connectorId: number,
    idTag: string
  ): GenericResponse {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.notifyRemoteStartTransactionRejected: Remote start transaction REJECTED on ${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        chargingStation.stationInfo?.chargingStationId
      }#${connectorId.toString()}, idTag '${truncateId(idTag)}', availability '${
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        connectorStatus?.availability
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      }', status '${connectorStatus?.status}'`
    )
    return OCPP16Constants.OCPP_RESPONSE_REJECTED
  }

  private setRemoteStartTransactionChargingProfile (
    chargingStation: ChargingStation,
    connectorId: number,
    chargingProfile: OCPP16ChargingProfile
  ): boolean {
    if (
      chargingProfile.chargingProfilePurpose === OCPP16ChargingProfilePurposeType.TX_PROFILE &&
      chargingProfile.transactionId == null
    ) {
      OCPP16ServiceUtils.setChargingProfile(chargingStation, connectorId, chargingProfile)
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.setRemoteStartTransactionChargingProfile: Charging profile(s) set at remote start transaction on ${
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          chargingStation.stationInfo?.chargingStationId
        }#${connectorId.toString()}`,
        chargingProfile
      )
      return true
    }
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.setRemoteStartTransactionChargingProfile: Not allowed to set ${
        chargingProfile.chargingProfilePurpose
      } charging profile(s)${chargingProfile.transactionId != null ? ' with transactionId set' : ''} at remote start transaction`
    )
    return false
  }

  private async updateFirmwareSimulation (
    chargingStation: ChargingStation,
    maxDelay = 30,
    minDelay = 15
  ): Promise<void> {
    if (!checkChargingStationState(chargingStation, chargingStation.logPrefix())) {
      return
    }
    for (const { connectorId, connectorStatus } of chargingStation.iterateConnectors(true)) {
      if (connectorStatus.transactionStarted === false) {
        await sendAndSetConnectorStatus(chargingStation, {
          connectorId,
          status: OCPP16ChargePointStatus.Unavailable,
        } as OCPP16StatusNotificationRequest)
      }
    }
    await chargingStation.ocppRequestService.requestHandler<
      OCPP16FirmwareStatusNotificationRequest,
      OCPP16FirmwareStatusNotificationResponse
    >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      status: OCPP16FirmwareStatus.Downloading,
    })
    if (chargingStation.stationInfo != null) {
      chargingStation.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Downloading
    }
    if (
      chargingStation.stationInfo?.firmwareUpgrade?.failureStatus ===
      OCPP16FirmwareStatus.DownloadFailed
    ) {
      await sleep(secondsToMilliseconds(randomInt(minDelay, maxDelay + 1)))
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16FirmwareStatusNotificationRequest,
        OCPP16FirmwareStatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
        status: chargingStation.stationInfo.firmwareUpgrade.failureStatus,
      })
      chargingStation.stationInfo.firmwareStatus =
        chargingStation.stationInfo.firmwareUpgrade.failureStatus
      return
    }
    await sleep(secondsToMilliseconds(randomInt(minDelay, maxDelay + 1)))
    await chargingStation.ocppRequestService.requestHandler<
      OCPP16FirmwareStatusNotificationRequest,
      OCPP16FirmwareStatusNotificationResponse
    >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      status: OCPP16FirmwareStatus.Downloaded,
    })
    if (chargingStation.stationInfo != null) {
      chargingStation.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Downloaded
    }
    let wasTransactionsStarted = false
    let transactionsStarted: boolean
    do {
      const runningTransactions = chargingStation.getNumberOfRunningTransactions()
      if (runningTransactions > 0) {
        const waitTime = secondsToMilliseconds(15)
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.updateFirmwareSimulation: ${runningTransactions.toString()} transaction(s) in progress, waiting ${formatDurationMilliSeconds(
            waitTime
          )} before continuing firmware update simulation`
        )
        await sleep(waitTime)
        transactionsStarted = true
        wasTransactionsStarted = true
      } else {
        for (const { connectorId, connectorStatus } of chargingStation.iterateConnectors(true)) {
          if (connectorStatus.status !== OCPP16ChargePointStatus.Unavailable) {
            await sendAndSetConnectorStatus(chargingStation, {
              connectorId,
              status: OCPP16ChargePointStatus.Unavailable,
            } as OCPP16StatusNotificationRequest)
          }
        }
        transactionsStarted = false
      }
    } while (transactionsStarted)
    !wasTransactionsStarted &&
      (await sleep(secondsToMilliseconds(randomInt(minDelay, maxDelay + 1))))
    if (!checkChargingStationState(chargingStation, chargingStation.logPrefix())) {
      return
    }
    await chargingStation.ocppRequestService.requestHandler<
      OCPP16FirmwareStatusNotificationRequest,
      OCPP16FirmwareStatusNotificationResponse
    >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      status: OCPP16FirmwareStatus.Installing,
    })
    if (chargingStation.stationInfo != null) {
      chargingStation.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Installing
    }
    if (
      chargingStation.stationInfo?.firmwareUpgrade?.failureStatus ===
      OCPP16FirmwareStatus.InstallationFailed
    ) {
      await sleep(secondsToMilliseconds(randomInt(minDelay, maxDelay + 1)))
      await chargingStation.ocppRequestService.requestHandler<
        OCPP16FirmwareStatusNotificationRequest,
        OCPP16FirmwareStatusNotificationResponse
      >(chargingStation, OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
        status: chargingStation.stationInfo.firmwareUpgrade.failureStatus,
      })
      chargingStation.stationInfo.firmwareStatus =
        chargingStation.stationInfo.firmwareUpgrade.failureStatus
      return
    }
    if (chargingStation.stationInfo?.firmwareUpgrade?.reset === true) {
      await sleep(secondsToMilliseconds(randomInt(minDelay, maxDelay + 1)))
      await chargingStation.reset(OCPP16StopTransactionReason.REBOOT)
    }
  }
}
