// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import { secondsToMilliseconds } from 'date-fns'

import type { ChargingStation } from '../../../charging-station/index.js'
import type { OCPP20IdTokenEnumType } from '../../../types/index.js'

import { OCPPError } from '../../../exception/index.js'
import {
  AttributeEnumType,
  CertificateSigningUseEnumType,
  ChangeAvailabilityStatusEnumType,
  ConnectorEnumType,
  type ConnectorStatus,
  ConnectorStatusEnum,
  CustomerInformationStatusEnumType,
  DataEnumType,
  DataTransferStatusEnumType,
  DeleteCertificateStatusEnumType,
  ErrorType,
  type EvseStatus,
  type FirmwareType,
  GenericDeviceModelStatusEnumType,
  GenericStatus,
  GetCertificateIdUseEnumType,
  GetInstalledCertificateStatusEnumType,
  GetVariableStatusEnumType,
  type IncomingRequestCommand,
  type IncomingRequestHandler,
  InstallCertificateStatusEnumType,
  InstallCertificateUseEnumType,
  type JsonType,
  LogStatusEnumType,
  MessageTriggerEnumType,
  type OCPP20BootNotificationRequest,
  type OCPP20BootNotificationResponse,
  type OCPP20CertificateSignedRequest,
  type OCPP20CertificateSignedResponse,
  type OCPP20ChangeAvailabilityRequest,
  type OCPP20ChangeAvailabilityResponse,
  OCPP20ChargingProfileKindEnumType,
  OCPP20ChargingProfilePurposeEnumType,
  type OCPP20ChargingProfileType,
  OCPP20ChargingRateUnitEnumType,
  type OCPP20ChargingScheduleType,
  type OCPP20ClearCacheResponse,
  OCPP20ComponentName,
  OCPP20ConnectorStatusEnumType,
  type OCPP20CustomerInformationRequest,
  type OCPP20CustomerInformationResponse,
  type OCPP20DataTransferRequest,
  type OCPP20DataTransferResponse,
  type OCPP20DeleteCertificateRequest,
  type OCPP20DeleteCertificateResponse,
  OCPP20DeviceInfoVariableName,
  OCPP20FirmwareStatusEnumType,
  type OCPP20FirmwareStatusNotificationRequest,
  type OCPP20FirmwareStatusNotificationResponse,
  type OCPP20GetBaseReportRequest,
  type OCPP20GetBaseReportResponse,
  type OCPP20GetInstalledCertificateIdsRequest,
  type OCPP20GetInstalledCertificateIdsResponse,
  type OCPP20GetLogRequest,
  type OCPP20GetLogResponse,
  type OCPP20GetTransactionStatusRequest,
  type OCPP20GetTransactionStatusResponse,
  type OCPP20GetVariablesRequest,
  type OCPP20GetVariablesResponse,
  type OCPP20HeartbeatRequest,
  type OCPP20HeartbeatResponse,
  type OCPP20IdTokenType,
  OCPP20IncomingRequestCommand,
  type OCPP20InstallCertificateRequest,
  type OCPP20InstallCertificateResponse,
  type OCPP20LogStatusNotificationRequest,
  type OCPP20LogStatusNotificationResponse,
  type OCPP20MeterValue,
  type OCPP20MeterValuesRequest,
  type OCPP20MeterValuesResponse,
  type OCPP20NotifyCustomerInformationRequest,
  type OCPP20NotifyCustomerInformationResponse,
  type OCPP20NotifyReportRequest,
  type OCPP20NotifyReportResponse,
  OCPP20OperationalStatusEnumType,
  OCPP20OptionalVariableName,
  OCPP20ReasonEnumType,
  OCPP20RequestCommand,
  type OCPP20RequestStartTransactionRequest,
  type OCPP20RequestStartTransactionResponse,
  type OCPP20RequestStopTransactionRequest,
  type OCPP20RequestStopTransactionResponse,
  OCPP20RequiredVariableName,
  type OCPP20ResetRequest,
  type OCPP20ResetResponse,
  type OCPP20SecurityEventNotificationRequest,
  type OCPP20SecurityEventNotificationResponse,
  type OCPP20SetNetworkProfileRequest,
  type OCPP20SetNetworkProfileResponse,
  type OCPP20SetVariablesRequest,
  type OCPP20SetVariablesResponse,
  type OCPP20StatusNotificationRequest,
  type OCPP20StatusNotificationResponse,
  OCPP20TransactionEventEnumType,
  type OCPP20TriggerMessageRequest,
  type OCPP20TriggerMessageResponse,
  OCPP20TriggerReasonEnumType,
  type OCPP20UnlockConnectorRequest,
  type OCPP20UnlockConnectorResponse,
  type OCPP20UpdateFirmwareRequest,
  type OCPP20UpdateFirmwareResponse,
  OCPP20VendorVariableName,
  OCPPVersion,
  ReasonCodeEnumType,
  RegistrationStatusEnumType,
  ReportBaseEnumType,
  type ReportDataType,
  RequestStartStopStatusEnumType,
  ResetEnumType,
  ResetStatusEnumType,
  SetNetworkProfileStatusEnumType,
  SetVariableStatusEnumType,
  StopTransactionReason,
  TriggerMessageStatusEnumType,
  UnlockStatusEnumType,
  UpdateFirmwareStatusEnumType,
  UploadLogStatusEnumType,
} from '../../../types/index.js'
import {
  convertToDate,
  convertToIntOrNaN,
  generateUUID,
  isEmpty,
  isNotEmptyString,
  logger,
  promiseWithTimeout,
  sleep,
  truncateId,
  validateUUID,
} from '../../../utils/index.js'
import { buildConfigKey, getConfigurationKey } from '../../ConfigurationKeyUtils.js'
import {
  hasPendingReservation,
  hasPendingReservations,
  resetConnectorStatus,
} from '../../Helpers.js'
import {
  AuthContext,
  AuthorizationStatus,
  mapOCPP20TokenType,
  OCPPAuthServiceFactory,
} from '../auth/index.js'
import {
  restoreConnectorStatus,
  sendAndSetConnectorStatus,
} from '../OCPPConnectorStatusOperations.js'
import { OCPPIncomingRequestService } from '../OCPPIncomingRequestService.js'
import {
  buildMeterValue,
  createPayloadValidatorMap,
  isIncomingRequestCommandSupported,
} from '../OCPPServiceUtils.js'
import {
  type GetInstalledCertificatesResult,
  hasCertificateManager,
  type StoreCertificateResult,
} from './OCPP20CertificateManager.js'
import { OCPP20CertSigningRetryManager } from './OCPP20CertSigningRetryManager.js'
import { OCPP20Constants } from './OCPP20Constants.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'
import { OCPP20VariableManager } from './OCPP20VariableManager.js'
import { getVariableMetadata, VARIABLE_REGISTRY } from './OCPP20VariableRegistry.js'

const moduleName = 'OCPP20IncomingRequestService'

interface StationInfoReportField {
  property: 'chargePointModel' | 'chargePointSerialNumber' | 'chargePointVendor' | 'firmwareVersion'
  variable: OCPP20DeviceInfoVariableName
}

const STATION_INFO_FIELDS_FULL: readonly StationInfoReportField[] = Object.freeze([
  { property: 'chargePointModel', variable: OCPP20DeviceInfoVariableName.Model },
  { property: 'chargePointVendor', variable: OCPP20DeviceInfoVariableName.VendorName },
  { property: 'chargePointSerialNumber', variable: OCPP20DeviceInfoVariableName.SerialNumber },
  { property: 'firmwareVersion', variable: OCPP20DeviceInfoVariableName.FirmwareVersion },
])

const STATION_INFO_FIELDS_SUMMARY: readonly StationInfoReportField[] = Object.freeze([
  { property: 'chargePointModel', variable: OCPP20DeviceInfoVariableName.Model },
  { property: 'chargePointVendor', variable: OCPP20DeviceInfoVariableName.VendorName },
  { property: 'firmwareVersion', variable: OCPP20DeviceInfoVariableName.FirmwareVersion },
])

const buildStationInfoReportData = (
  chargingStation: ChargingStation,
  fields: readonly StationInfoReportField[]
): ReportDataType[] => {
  const stationInfo = chargingStation.stationInfo
  if (stationInfo == null) {
    return []
  }
  const reportData: ReportDataType[] = []
  for (const { property, variable } of fields) {
    const value = stationInfo[property]
    if (value != null) {
      reportData.push({
        component: { name: OCPP20ComponentName.ChargingStation },
        variable: { name: variable },
        variableAttribute: [{ type: AttributeEnumType.Actual, value }],
        variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: false },
      })
    }
  }
  return reportData
}

interface OCPP20StationState {
  activeFirmwareUpdateAbortController?: AbortController
  activeFirmwareUpdateRequestId?: number
  certSigningRetryManager?: OCPP20CertSigningRetryManager
  isDrainingSecurityEvents: boolean
  preInoperativeConnectorStatuses: Map<number, OCPP20ConnectorStatusEnumType>
  reportDataCache: Map<number, ReportDataType[]>
  securityEventQueue: QueuedSecurityEvent[]
}

interface QueuedSecurityEvent {
  retryCount?: number
  techInfo?: string
  timestamp: Date
  type: string
}

export class OCPP20IncomingRequestService extends OCPPIncomingRequestService {
  protected readonly csmsName = 'CSMS'
  protected readonly incomingRequestHandlers: Map<IncomingRequestCommand, IncomingRequestHandler>

  protected readonly moduleName = moduleName

  protected payloadValidatorFunctions: Map<OCPP20IncomingRequestCommand, ValidateFunction<JsonType>>

  protected readonly pendingStateBlockedCommands: IncomingRequestCommand[] = [
    OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
    OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
  ]

  private readonly stationsState = new WeakMap<ChargingStation, OCPP20StationState>()

  public constructor () {
    super(OCPPVersion.VERSION_201)
    this.incomingRequestHandlers = new Map<IncomingRequestCommand, IncomingRequestHandler>([
      [
        OCPP20IncomingRequestCommand.CERTIFICATE_SIGNED,
        this.toRequestHandler(this.handleRequestCertificateSigned.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.CHANGE_AVAILABILITY,
        this.toRequestHandler(this.handleRequestChangeAvailability.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.CLEAR_CACHE,
        this.toRequestHandler(this.handleRequestClearCache.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION,
        this.toRequestHandler(this.handleRequestCustomerInformation.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.DATA_TRANSFER,
        this.toRequestHandler(this.handleRequestDataTransfer.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.DELETE_CERTIFICATE,
        this.toRequestHandler(this.handleRequestDeleteCertificate.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.GET_BASE_REPORT,
        this.toRequestHandler(this.handleRequestGetBaseReport.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.GET_INSTALLED_CERTIFICATE_IDS,
        this.toRequestHandler(this.handleRequestGetInstalledCertificateIds.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.GET_LOG,
        this.toRequestHandler(this.handleRequestGetLog.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.GET_TRANSACTION_STATUS,
        this.toRequestHandler(this.handleRequestGetTransactionStatus.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.GET_VARIABLES,
        this.toRequestHandler(this.handleRequestGetVariables.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.INSTALL_CERTIFICATE,
        this.toRequestHandler(this.handleRequestInstallCertificate.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
        this.toRequestHandler(this.handleRequestStartTransaction.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
        this.toRequestHandler(this.handleRequestStopTransaction.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.RESET,
        this.toRequestHandler(this.handleRequestReset.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.SET_NETWORK_PROFILE,
        this.toRequestHandler(this.handleRequestSetNetworkProfile.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.SET_VARIABLES,
        this.toRequestHandler(this.handleRequestSetVariables.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        this.toRequestHandler(this.handleRequestTriggerMessage.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.UNLOCK_CONNECTOR,
        this.toRequestHandler(this.handleRequestUnlockConnector.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.UPDATE_FIRMWARE,
        this.toRequestHandler(this.handleRequestUpdateFirmware.bind(this)),
      ],
    ])
    this.payloadValidatorFunctions = createPayloadValidatorMap(
      OCPP20ServiceUtils.createIncomingRequestPayloadConfigs(),
      OCPP20ServiceUtils.createPayloadOptions(moduleName, 'constructor'),
      this.ajv
    )
    // Handle incoming request events
    this.on(
      OCPP20IncomingRequestCommand.GET_BASE_REPORT,
      (
        chargingStation: ChargingStation,
        request: OCPP20GetBaseReportRequest,
        response: OCPP20GetBaseReportResponse
      ) => {
        if (response.status === GenericDeviceModelStatusEnumType.Accepted) {
          this.sendNotifyReportRequest(chargingStation, request, response).catch(
            (error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.constructor: NotifyReport error:`,
                error
              )
            }
          )
        }
      }
    )
    this.on(
      OCPP20IncomingRequestCommand.UPDATE_FIRMWARE,
      (
        chargingStation: ChargingStation,
        request: OCPP20UpdateFirmwareRequest,
        response: OCPP20UpdateFirmwareResponse
      ) => {
        if (
          response.status === UpdateFirmwareStatusEnumType.Accepted ||
          response.status === UpdateFirmwareStatusEnumType.AcceptedCanceled
        ) {
          this.simulateFirmwareUpdateLifecycle(
            chargingStation,
            request.requestId,
            request.firmware,
            request.retries,
            request.retryInterval
          ).catch((error: unknown) => {
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.constructor: UpdateFirmware lifecycle error:`,
              error
            )
          })
        }
      }
    )
    this.on(
      OCPP20IncomingRequestCommand.GET_LOG,
      (
        chargingStation: ChargingStation,
        request: OCPP20GetLogRequest,
        response: OCPP20GetLogResponse
      ) => {
        if (response.status === LogStatusEnumType.Accepted) {
          this.simulateLogUploadLifecycle(chargingStation, request.requestId).catch(
            (error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.constructor: GetLog lifecycle error:`,
                error
              )
            }
          )
        }
      }
    )
    this.on(
      OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION,
      (
        chargingStation: ChargingStation,
        request: OCPP20CustomerInformationRequest,
        response: OCPP20CustomerInformationResponse
      ) => {
        if (response.status === CustomerInformationStatusEnumType.Accepted && request.report) {
          this.sendNotifyCustomerInformation(chargingStation, request.requestId).catch(
            (error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.constructor: CustomerInformation notification error:`,
                error
              )
            }
          )
        }
      }
    )
    // E02.FR.01: Send TransactionEvent(Started) after accepting remote start
    this.on(
      OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
      (
        chargingStation: ChargingStation,
        request: OCPP20RequestStartTransactionRequest,
        response: OCPP20RequestStartTransactionResponse
      ) => {
        if (response.status === RequestStartStopStatusEnumType.Accepted) {
          const connectorId = chargingStation.getConnectorIdByTransactionId(response.transactionId)
          if (connectorId != null && response.transactionId != null) {
            const startedMeterValues = OCPP20ServiceUtils.buildTransactionStartedMeterValues(
              chargingStation,
              response.transactionId
            )
            OCPP20ServiceUtils.sendTransactionEvent(
              chargingStation,
              OCPP20TransactionEventEnumType.Started,
              OCPP20TriggerReasonEnumType.RemoteStart,
              connectorId,
              response.transactionId,
              {
                ...(startedMeterValues.length > 0 && { meterValue: startedMeterValues }),
                remoteStartId: request.remoteStartId,
              }
            ).catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.constructor: TransactionEvent(Started) error:`,
                error
              )
            })
          }
        }
      }
    )
    this.on(
      OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
      (
        chargingStation: ChargingStation,
        request: OCPP20RequestStopTransactionRequest,
        response: OCPP20RequestStopTransactionResponse
      ) => {
        if (response.status === RequestStartStopStatusEnumType.Accepted) {
          const connectorId = chargingStation.getConnectorIdByTransactionId(request.transactionId)
          const evseId = chargingStation.getEvseIdByTransactionId(request.transactionId)
          if (connectorId != null && evseId != null) {
            OCPP20ServiceUtils.requestStopTransaction(chargingStation, connectorId, evseId).catch(
              (error: unknown) => {
                logger.error(
                  `${chargingStation.logPrefix()} ${moduleName}.constructor: RequestStopTransaction error:`,
                  error
                )
              }
            )
          }
        }
      }
    )
    this.on(
      OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
      (
        chargingStation: ChargingStation,
        request: OCPP20TriggerMessageRequest,
        response: OCPP20TriggerMessageResponse
      ) => {
        if (response.status !== TriggerMessageStatusEnumType.Accepted) {
          return
        }
        const { evse, requestedMessage } = request
        const errorHandler = (error: unknown): void => {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.constructor: Trigger ${requestedMessage} error:`,
            error
          )
        }
        switch (requestedMessage) {
          case MessageTriggerEnumType.BootNotification:
            chargingStation.ocppRequestService
              .requestHandler<
                OCPP20BootNotificationRequest,
                OCPP20BootNotificationResponse
              >(chargingStation, OCPP20RequestCommand.BOOT_NOTIFICATION, chargingStation.bootNotificationRequest as OCPP20BootNotificationRequest, { skipBufferingOnError: true, triggerMessage: true })
              .catch(errorHandler)
            break
          case MessageTriggerEnumType.FirmwareStatusNotification: {
            const firmwareStatus = this.hasFirmwareUpdateInProgress(chargingStation)
              ? (chargingStation.stationInfo?.firmwareStatus as OCPP20FirmwareStatusEnumType)
              : OCPP20FirmwareStatusEnumType.Idle
            const stationState = this.getStationState(chargingStation)
            chargingStation.ocppRequestService
              .requestHandler<
                OCPP20FirmwareStatusNotificationRequest,
                OCPP20FirmwareStatusNotificationResponse
              >(chargingStation, OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION, { requestId: stationState.activeFirmwareUpdateRequestId, status: firmwareStatus }, { skipBufferingOnError: true, triggerMessage: true })
              .catch(errorHandler)
            break
          }
          case MessageTriggerEnumType.Heartbeat:
            chargingStation.ocppRequestService
              .requestHandler<
                OCPP20HeartbeatRequest,
                OCPP20HeartbeatResponse
              >(chargingStation, OCPP20RequestCommand.HEARTBEAT, OCPP20Constants.OCPP_RESPONSE_EMPTY as OCPP20HeartbeatRequest, { skipBufferingOnError: true, triggerMessage: true })
              .catch(errorHandler)
            break
          case MessageTriggerEnumType.LogStatusNotification:
            chargingStation.ocppRequestService
              .requestHandler<
                OCPP20LogStatusNotificationRequest,
                OCPP20LogStatusNotificationResponse
              >(chargingStation, OCPP20RequestCommand.LOG_STATUS_NOTIFICATION, { status: UploadLogStatusEnumType.Idle }, { skipBufferingOnError: true, triggerMessage: true })
              .catch(errorHandler)
            break
          case MessageTriggerEnumType.MeterValues: {
            const targetEvseIds: number[] = []
            if (evse?.id != null && evse.id > 0) {
              targetEvseIds.push(evse.id)
            } else {
              for (const { evseId } of chargingStation.iterateEvses(true)) {
                targetEvseIds.push(evseId)
              }
            }
            let hasSentTransactionEvent = false
            for (const targetEvseId of targetEvseIds) {
              const evseStatus = chargingStation.getEvseStatus(targetEvseId)
              if (evseStatus == null) continue
              for (const [cId, connector] of evseStatus.connectors) {
                if (connector.transactionId == null) continue
                hasSentTransactionEvent = true
                const txUpdatedInterval = OCPP20ServiceUtils.getTxUpdatedInterval(chargingStation)
                const meterValue = buildMeterValue(
                  chargingStation,
                  connector.transactionId,
                  txUpdatedInterval
                ) as OCPP20MeterValue
                OCPP20ServiceUtils.sendTransactionEvent(
                  chargingStation,
                  OCPP20TransactionEventEnumType.Updated,
                  OCPP20TriggerReasonEnumType.Trigger,
                  cId,
                  connector.transactionId as string,
                  { meterValue: [meterValue] }
                ).catch(errorHandler)
              }
            }
            if (!hasSentTransactionEvent) {
              const meterValue: OCPP20MeterValue = {
                sampledValue: [{ value: 0 }],
                timestamp: new Date(),
              }
              chargingStation.ocppRequestService
                .requestHandler<OCPP20MeterValuesRequest, OCPP20MeterValuesResponse>(
                  chargingStation,
                  OCPP20RequestCommand.METER_VALUES,
                  {
                    evseId: evse?.id ?? 1,
                    meterValue: [meterValue],
                  },
                  { skipBufferingOnError: true, triggerMessage: true }
                )
                .catch(errorHandler)
            }
            break
          }
          case MessageTriggerEnumType.StatusNotification:
            this.triggerStatusNotification(chargingStation, evse, errorHandler)
            break
        }
      }
    )
  }

  public getCertSigningRetryManager (
    chargingStation: ChargingStation
  ): OCPP20CertSigningRetryManager {
    const state = this.getStationState(chargingStation)
    state.certSigningRetryManager ??= new OCPP20CertSigningRetryManager(chargingStation)
    return state.certSigningRetryManager
  }

  /**
   * Handle OCPP 2.0.1 GetVariables request from the CSMS.
   * @param chargingStation - Target charging station
   * @param commandPayload - GetVariables request payload
   * @returns GetVariables response with variable results
   */
  public handleRequestGetVariables (
    chargingStation: ChargingStation,
    commandPayload: OCPP20GetVariablesRequest
  ): OCPP20GetVariablesResponse {
    const getVariablesResponse: OCPP20GetVariablesResponse = {
      getVariableResult: [],
    }

    const variableManager = OCPP20VariableManager.getInstance()

    const { bytesLimit: enforceBytesLimit, itemsLimit: enforceItemsLimit } =
      OCPP20ServiceUtils.readMessageLimits(chargingStation)

    const variableData = commandPayload.getVariableData
    const preEnforcement = OCPP20ServiceUtils.enforceMessageLimits(
      chargingStation,
      moduleName,
      'handleRequestGetVariables',
      variableData,
      enforceItemsLimit,
      enforceBytesLimit,
      (v, reason) => ({
        attributeStatus: GetVariableStatusEnumType.Rejected,
        attributeStatusInfo: {
          additionalInfo: reason.additionalInfo,
          reasonCode: reason.reasonCode,
        },
        attributeType: v.attributeType,
        component: v.component,
        variable: v.variable,
      }),
      logger
    )
    if (preEnforcement.rejected) {
      getVariablesResponse.getVariableResult = preEnforcement.results
      return getVariablesResponse
    }

    const results = variableManager.getVariables(chargingStation, variableData)
    getVariablesResponse.getVariableResult = results

    getVariablesResponse.getVariableResult = OCPP20ServiceUtils.enforcePostCalculationBytesLimit(
      chargingStation,
      moduleName,
      'handleRequestGetVariables',
      variableData,
      results,
      enforceBytesLimit,
      (v, reason) => ({
        attributeStatus: GetVariableStatusEnumType.Rejected,
        attributeStatusInfo: {
          additionalInfo: reason.additionalInfo,
          reasonCode: reason.reasonCode,
        },
        attributeType: v.attributeType,
        component: v.component,
        variable: v.variable,
      }),
      logger
    )

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetVariables: Processed ${commandPayload.getVariableData.length.toString()} variable requests, returning ${results.length.toString()} results`
    )

    return getVariablesResponse
  }

  /**
   * Handle OCPP 2.0.1 SetVariables request from the CSMS.
   * @param chargingStation - Target charging station
   * @param commandPayload - SetVariables request payload
   * @returns SetVariables response with variable results
   */
  public handleRequestSetVariables (
    chargingStation: ChargingStation,
    commandPayload: OCPP20SetVariablesRequest
  ): OCPP20SetVariablesResponse {
    const setVariablesResponse: OCPP20SetVariablesResponse = {
      setVariableResult: [],
    }

    const { bytesLimit: enforceBytesLimit, itemsLimit: enforceItemsLimit } =
      OCPP20ServiceUtils.readMessageLimits(chargingStation)

    const variableManager = OCPP20VariableManager.getInstance()

    const variableData = commandPayload.setVariableData
    const preEnforcement = OCPP20ServiceUtils.enforceMessageLimits(
      chargingStation,
      moduleName,
      'handleRequestSetVariables',
      variableData,
      enforceItemsLimit,
      enforceBytesLimit,
      (v, reason) => ({
        attributeStatus: SetVariableStatusEnumType.Rejected,
        attributeStatusInfo: {
          additionalInfo: reason.additionalInfo,
          reasonCode: reason.reasonCode,
        },
        attributeType: v.attributeType ?? AttributeEnumType.Actual,
        component: v.component,
        variable: v.variable,
      }),
      logger
    )
    if (preEnforcement.rejected) {
      setVariablesResponse.setVariableResult = preEnforcement.results
      return setVariablesResponse
    }

    const results = variableManager.setVariables(chargingStation, variableData)
    setVariablesResponse.setVariableResult = OCPP20ServiceUtils.enforcePostCalculationBytesLimit(
      chargingStation,
      moduleName,
      'handleRequestSetVariables',
      variableData,
      results,
      enforceBytesLimit,
      (v, reason) => ({
        attributeStatus: SetVariableStatusEnumType.Rejected,
        attributeStatusInfo: {
          additionalInfo: reason.additionalInfo,
          reasonCode: reason.reasonCode,
        },
        attributeType: v.attributeType ?? AttributeEnumType.Actual,
        component: v.component,
        variable: v.variable,
      }),
      logger
    )

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetVariables: Processed ${commandPayload.setVariableData.length.toString()} variable requests, returning ${results.length.toString()} results`
    )

    return setVariablesResponse
  }

  /**
   * Stop the incoming request service and clean up per-station state.
   * @param chargingStation - Target charging station to stop
   */
  public override stop (chargingStation: ChargingStation): void {
    const stationState = this.stationsState.get(chargingStation)
    if (stationState != null) {
      stationState.activeFirmwareUpdateAbortController?.abort()
      this.stationsState.delete(chargingStation)
    }
    try {
      const variableManager = OCPP20VariableManager.getInstance()
      const stationId = chargingStation.stationInfo?.hashId
      variableManager.resetRuntimeOverrides(stationId)
      variableManager.invalidateMappingsCache(stationId)
      logger.debug(`${chargingStation.logPrefix()} ${moduleName}.stop: Per-station state cleared`)
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.stop: Error clearing per-station state:`,
        error
      )
    }
  }

  /**
   * Handles OCPP 2.0.1 ClearCache request by clearing the Authorization Cache
   * per OCPP 2.0.1 spec C11.FR.01
   * Per C11.FR.04: Returns Rejected if AuthCacheEnabled is false
   * @param chargingStation - The charging station instance
   * @returns Promise resolving to ClearCacheResponse
   */
  protected handleRequestClearCache (chargingStation: ChargingStation): OCPP20ClearCacheResponse {
    try {
      const authService = OCPPAuthServiceFactory.getInstance(chargingStation)
      // C11.FR.04: IF AuthCacheEnabled is false, CS SHALL send ClearCacheResponse with status Rejected
      const config = authService.getConfiguration()
      if (!config.authorizationCacheEnabled) {
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestClearCache: Authorization cache disabled, returning Rejected`
        )
        return OCPP20Constants.OCPP_RESPONSE_REJECTED
      }
      authService.clearCache()
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestClearCache: Authorization cache cleared`
      )
      return OCPP20Constants.OCPP_RESPONSE_ACCEPTED
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestClearCache: Error clearing cache:`,
        error
      )
      return OCPP20Constants.OCPP_RESPONSE_REJECTED
    }
  }

  /**
   * Check whether an incoming request command is supported by the charging station.
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
      commandName as OCPP20IncomingRequestCommand
    )
  }

  private async authorizeToken (
    chargingStation: ChargingStation,
    connectorId: number,
    tokenValue: string,
    tokenLabel: string,
    ocpp20TokenType: OCPP20IdTokenEnumType,
    context?: AuthContext
  ): Promise<boolean> {
    const authService = OCPPAuthServiceFactory.getInstance(chargingStation)
    const authResult = await authService.authorize({
      allowOffline: false,
      connectorId,
      context: context ?? AuthContext.REMOTE_START,
      identifier: {
        type: mapOCPP20TokenType(ocpp20TokenType),
        value: tokenValue,
      },
      timestamp: new Date(),
    })

    if (authResult.status !== AuthorizationStatus.ACCEPTED) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.authorizeToken: ${tokenLabel} '${truncateId(tokenValue)}' is not authorized`
      )
    }

    return authResult.status === AuthorizationStatus.ACCEPTED
  }

  private buildReportData (
    chargingStation: ChargingStation,
    reportBase: ReportBaseEnumType
  ): ReportDataType[] {
    if (!Object.values(ReportBaseEnumType).includes(reportBase)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.buildReportData: Invalid reportBase '${reportBase}'`
      )
      return []
    }

    const reportData: ReportDataType[] = []

    switch (reportBase) {
      case ReportBaseEnumType.ConfigurationInventory:
        if (chargingStation.ocppConfiguration?.configurationKey) {
          for (const configKey of chargingStation.ocppConfiguration.configurationKey) {
            reportData.push({
              component: {
                name: OCPP20ComponentName.OCPPCommCtrlr,
              },
              variable: {
                name: configKey.key,
              },
              variableAttribute: [
                {
                  type: AttributeEnumType.Actual,
                  value: configKey.value,
                },
              ],
              variableCharacteristics: {
                dataType: DataEnumType.string,
                supportsMonitoring: false,
              },
            })
          }
        }
        break

      case ReportBaseEnumType.FullInventory:
        reportData.push(...buildStationInfoReportData(chargingStation, STATION_INFO_FIELDS_FULL))

        if (chargingStation.ocppConfiguration?.configurationKey) {
          for (const configKey of chargingStation.ocppConfiguration.configurationKey) {
            const variableAttributes = []
            variableAttributes.push({
              type: AttributeEnumType.Actual,
              value: configKey.value,
            })

            reportData.push({
              component: { name: OCPP20ComponentName.OCPPCommCtrlr },
              variable: { name: configKey.key },
              variableAttribute: variableAttributes,
              variableCharacteristics: {
                dataType: DataEnumType.string,
                supportsMonitoring: false,
              },
            })
          }
        }

        try {
          const variableManager = OCPP20VariableManager.getInstance()
          const getVariableData: OCPP20GetVariablesRequest['getVariableData'] = []
          for (const variableMetadata of Object.values(VARIABLE_REGISTRY)) {
            const variableDescriptor: { instance?: string; name: string } = {
              name: variableMetadata.variable,
            }
            if (variableMetadata.instance) {
              variableDescriptor.instance = variableMetadata.instance
            }
            getVariableData.push({
              attributeType: AttributeEnumType.Actual,
              component: { name: variableMetadata.component },
              variable: variableDescriptor,
            })
            if (variableMetadata.supportedAttributes.includes(AttributeEnumType.MinSet)) {
              getVariableData.push({
                attributeType: AttributeEnumType.MinSet,
                component: { name: variableMetadata.component },
                variable: variableDescriptor,
              })
            }
            if (variableMetadata.supportedAttributes.includes(AttributeEnumType.MaxSet)) {
              getVariableData.push({
                attributeType: AttributeEnumType.MaxSet,
                component: { name: variableMetadata.component },
                variable: variableDescriptor,
              })
            }
          }
          const getResults = variableManager.getVariables(chargingStation, getVariableData)
          const grouped = new Map<
            string,
            {
              attributes: { type: AttributeEnumType; value?: string }[]
              component: ReportDataType['component']
              dataType: DataEnumType
              variable: ReportDataType['variable']
            }
          >()
          for (const r of getResults) {
            const key = `${r.component.name}::${r.variable.name}${r.variable.instance ? '::' + r.variable.instance : ''}`
            const variableMetadata = getVariableMetadata(
              r.component.name,
              r.variable.name,
              r.variable.instance
            )
            if (!variableMetadata) continue
            if (!grouped.has(key)) {
              grouped.set(key, {
                attributes: [],
                component: r.component,
                dataType: variableMetadata.dataType,
                variable: r.variable,
              })
            }
            if (r.attributeStatus === GetVariableStatusEnumType.Accepted) {
              const variableGroupEntry = grouped.get(key)
              if (variableGroupEntry) {
                variableGroupEntry.attributes.push({
                  type: r.attributeType ?? AttributeEnumType.Actual,
                  value: r.attributeValue,
                })
              }
            }
          }
          for (const entry of grouped.values()) {
            entry.attributes.sort((a, b) => {
              const order = [
                AttributeEnumType.Actual,
                AttributeEnumType.MinSet,
                AttributeEnumType.MaxSet,
              ]
              return order.indexOf(a.type) - order.indexOf(b.type)
            })
            if (entry.attributes.length > 0) {
              reportData.push({
                component: entry.component,
                variable: entry.variable,
                variableAttribute: entry.attributes,
                variableCharacteristics: { dataType: entry.dataType, supportsMonitoring: false },
              })
            }
          }
        } catch (error) {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.buildReportData: Error enriching FullInventory with registry variables:`,
            error
          )
        }

        if (chargingStation.hasEvses) {
          for (const { evseId, evseStatus } of chargingStation.iterateEvses()) {
            reportData.push({
              component: {
                evse: { id: evseId },
                name: OCPP20ComponentName.EVSE,
              },
              variable: { name: OCPP20DeviceInfoVariableName.AvailabilityState },
              variableAttribute: [
                { type: AttributeEnumType.Actual, value: evseStatus.availability },
              ],
              variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: true },
            })
          }
        }
        for (const {
          connectorId,
          connectorStatus,
          evseId,
        } of chargingStation.iterateConnectors()) {
          if (evseId == null && connectorId === 0) continue
          reportData.push({
            component: {
              evse: { connectorId, id: evseId ?? 1 },
              name: evseId != null ? OCPP20ComponentName.EVSE : OCPP20ComponentName.Connector,
            },
            variable: { name: OCPP20DeviceInfoVariableName.ConnectorType },
            variableAttribute: [
              {
                type: AttributeEnumType.Actual,
                value: connectorStatus.type ?? ConnectorEnumType.Unknown,
              },
            ],
            variableCharacteristics: {
              dataType: DataEnumType.string,
              supportsMonitoring: false,
            },
          })
        }
        break

      case ReportBaseEnumType.SummaryInventory:
        reportData.push(...buildStationInfoReportData(chargingStation, STATION_INFO_FIELDS_SUMMARY))

        reportData.push({
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20DeviceInfoVariableName.AvailabilityState },
          variableAttribute: [
            {
              type: AttributeEnumType.Actual,
              value: chargingStation.inAcceptedState()
                ? OCPP20ConnectorStatusEnumType.Available
                : OCPP20ConnectorStatusEnumType.Unavailable,
            },
          ],
          variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: true },
        })

        if (chargingStation.hasEvses) {
          for (const { evseId, evseStatus } of chargingStation.iterateEvses()) {
            reportData.push({
              component: {
                evse: { id: evseId },
                name: OCPP20ComponentName.EVSE,
              },
              variable: { name: OCPP20DeviceInfoVariableName.AvailabilityState },
              variableAttribute: [
                { type: AttributeEnumType.Actual, value: evseStatus.availability },
              ],
              variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: true },
            })
          }
        } else {
          for (const { connectorId, connectorStatus } of chargingStation.iterateConnectors(true)) {
            reportData.push({
              component: {
                evse: { connectorId, id: 1 },
                name: OCPP20ComponentName.Connector,
              },
              variable: { name: OCPP20DeviceInfoVariableName.AvailabilityState },
              variableAttribute: [
                {
                  type: AttributeEnumType.Actual,
                  value: connectorStatus.status ?? ConnectorStatusEnum.Unavailable,
                },
              ],
              variableCharacteristics: {
                dataType: DataEnumType.string,
                supportsMonitoring: true,
              },
            })
          }
        }
        break

      default:
        logger.warn(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `${chargingStation.logPrefix()} ${moduleName}.buildReportData: Unknown reportBase '${reportBase}'`
        )
    }

    return reportData
  }

  private clearActiveFirmwareUpdate (chargingStation: ChargingStation, requestId: number): void {
    const stationState = this.getStationState(chargingStation)
    if (stationState.activeFirmwareUpdateRequestId === requestId) {
      stationState.activeFirmwareUpdateAbortController = undefined
      stationState.activeFirmwareUpdateRequestId = undefined
    }
  }

  private connectorHasQueuedEvents (
    connectorStatus: ConnectorStatus,
    transactionId?: string
  ): boolean {
    const queue = connectorStatus.transactionEventQueue
    if (queue == null || queue.length === 0) {
      return false
    }
    if (transactionId == null) {
      return true
    }
    return queue.some(({ request }) => request.transactionInfo.transactionId === transactionId)
  }

  private getRestoredConnectorStatus (
    chargingStation: ChargingStation,
    connectorId: number
  ): OCPP20ConnectorStatusEnumType {
    const stationState = this.getStationState(chargingStation)
    const saved = stationState.preInoperativeConnectorStatuses.get(connectorId)
    if (saved != null) {
      stationState.preInoperativeConnectorStatuses.delete(connectorId)
      return saved
    }
    return OCPP20ConnectorStatusEnumType.Available
  }

  private getStationState (chargingStation: ChargingStation): OCPP20StationState {
    let state = this.stationsState.get(chargingStation)
    if (state == null) {
      state = {
        isDrainingSecurityEvents: false,
        preInoperativeConnectorStatuses: new Map(),
        reportDataCache: new Map(),
        securityEventQueue: [],
      }
      this.stationsState.set(chargingStation, state)
    }
    return state
  }

  private handleConnectorChangeAvailability (
    chargingStation: ChargingStation,
    evseId: number,
    connectorId: number,
    operationalStatus: OCPP20OperationalStatusEnumType,
    newConnectorStatus: OCPP20ConnectorStatusEnumType
  ): OCPP20ChangeAvailabilityResponse {
    if (!chargingStation.hasEvse(evseId)) {
      return {
        status: ChangeAvailabilityStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: `EVSE ${evseId.toString()} does not exist`,
          reasonCode: ReasonCodeEnumType.UnknownEvse,
        },
      }
    }

    const evseStatus = chargingStation.getEvseStatus(evseId)
    if (!evseStatus?.connectors.has(connectorId)) {
      return {
        status: ChangeAvailabilityStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: `Connector ${connectorId.toString()} on EVSE ${evseId.toString()} does not exist`,
          reasonCode: ReasonCodeEnumType.UnknownConnectorId,
        },
      }
    }

    const resolvedStatus =
      operationalStatus === OCPP20OperationalStatusEnumType.Operative
        ? this.getRestoredConnectorStatus(chargingStation, connectorId)
        : newConnectorStatus

    sendAndSetConnectorStatus(chargingStation, {
      connectorId,
      connectorStatus: resolvedStatus,
    } as unknown as OCPP20StatusNotificationRequest).catch((error: unknown) => {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleConnectorChangeAvailability: Error sending status notification for connector ${connectorId.toString()}:`,
        error
      )
    })

    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestChangeAvailability: Connector ${connectorId.toString()} on EVSE ${evseId.toString()} set to ${operationalStatus}`
    )
    return {
      status: ChangeAvailabilityStatusEnumType.Accepted,
    }
  }

  private handleCsLevelInoperative (
    chargingStation: ChargingStation,
    operationalStatus: OCPP20OperationalStatusEnumType,
    newConnectorStatus: OCPP20ConnectorStatusEnumType
  ): OCPP20ChangeAvailabilityResponse | undefined {
    let hasActiveTransactions = false
    for (const { evseId, evseStatus } of chargingStation.iterateEvses(true)) {
      if (this.hasEvseActiveTransactions(evseStatus)) {
        hasActiveTransactions = true
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestChangeAvailability: EVSE ${evseId.toString()} has active transaction, will be set Inoperative when transaction ends`
        )
      } else {
        evseStatus.availability = operationalStatus
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestChangeAvailability: EVSE ${evseId.toString()} set to ${operationalStatus} immediately (idle)`
        )
      }
    }
    if (hasActiveTransactions) {
      for (const { evseId, evseStatus } of chargingStation.iterateEvses(true)) {
        if (!this.hasEvseActiveTransactions(evseStatus)) {
          this.sendEvseStatusNotifications(chargingStation, evseId, newConnectorStatus)
        }
      }
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestChangeAvailability: Charging station partially set to ${operationalStatus}, some EVSEs scheduled`
      )
      return {
        status: ChangeAvailabilityStatusEnumType.Scheduled,
      }
    }
    return undefined
  }

  private handleEvseChangeAvailability (
    chargingStation: ChargingStation,
    evseId: number,
    operationalStatus: OCPP20OperationalStatusEnumType,
    newConnectorStatus: OCPP20ConnectorStatusEnumType
  ): OCPP20ChangeAvailabilityResponse {
    if (!chargingStation.hasEvse(evseId)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestChangeAvailability: EVSE ${evseId.toString()} not found, rejecting`
      )
      return {
        status: ChangeAvailabilityStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: `EVSE ${evseId.toString()} does not exist on charging station`,
          reasonCode: ReasonCodeEnumType.UnknownEvse,
        },
      }
    }

    const evseStatus = chargingStation.getEvseStatus(evseId)
    if (
      evseStatus != null &&
      operationalStatus === OCPP20OperationalStatusEnumType.Inoperative &&
      this.hasEvseActiveTransactions(evseStatus)
    ) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestChangeAvailability: EVSE ${evseId.toString()} has active transaction, scheduling availability change`
      )
      return {
        status: ChangeAvailabilityStatusEnumType.Scheduled,
      }
    }

    if (evseStatus != null) {
      evseStatus.availability = operationalStatus
    }
    if (operationalStatus === OCPP20OperationalStatusEnumType.Operative) {
      this.sendRestoredEvseStatusNotifications(chargingStation, evseId)
    } else {
      this.sendEvseStatusNotifications(chargingStation, evseId, newConnectorStatus)
    }

    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestChangeAvailability: EVSE ${evseId.toString()} set to ${operationalStatus}`
    )
    return {
      status: ChangeAvailabilityStatusEnumType.Accepted,
    }
  }

  /**
   * Handles OCPP 2.0 CertificateSigned request from central system
   * Receives signed certificate chain from CSMS and stores it in the charging station
   * Triggers websocket reconnect for ChargingStationCertificate type to use the new certificate
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - CertificateSigned request payload with certificate chain and type
   * @returns Promise resolving to CertificateSignedResponse indicating operation status
   */
  private async handleRequestCertificateSigned (
    chargingStation: ChargingStation,
    commandPayload: OCPP20CertificateSignedRequest
  ): Promise<OCPP20CertificateSignedResponse> {
    const { certificateChain, certificateType } = commandPayload

    if (!hasCertificateManager(chargingStation)) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestCertificateSigned: Certificate manager not available`
      )
      return {
        status: GenericStatus.Rejected,
        statusInfo: {
          additionalInfo: 'Certificate manager is not available on this charging station',
          reasonCode: ReasonCodeEnumType.InternalError,
        },
      }
    }

    if (!chargingStation.certificateManager.validateCertificateFormat(certificateChain)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestCertificateSigned: Invalid PEM format for certificate chain`
      )
      return {
        status: GenericStatus.Rejected,
        statusInfo: {
          additionalInfo: 'Certificate PEM format is invalid or malformed',
          reasonCode: ReasonCodeEnumType.InvalidCertificate,
        },
      }
    }

    // A02.FR.16: Enforce MaxCertificateChainSize — reject if chain exceeds configured limit
    const maxChainSizeKey = getConfigurationKey(
      chargingStation,
      buildConfigKey(
        OCPP20ComponentName.SecurityCtrlr,
        OCPP20OptionalVariableName.MaxCertificateChainSize
      )
    )
    if (maxChainSizeKey?.value != null) {
      const maxChainSize = convertToIntOrNaN(maxChainSizeKey.value)
      if (!Number.isNaN(maxChainSize) && maxChainSize > 0) {
        const chainByteSize = Buffer.byteLength(certificateChain, 'utf8')
        if (chainByteSize > maxChainSize) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.handleRequestCertificateSigned: Certificate chain size ${chainByteSize.toString()} bytes exceeds ${OCPP20OptionalVariableName.MaxCertificateChainSize as string} ${maxChainSize.toString()} bytes`
          )
          return {
            status: GenericStatus.Rejected,
            statusInfo: {
              additionalInfo: `Certificate chain size (${chainByteSize.toString()} bytes) exceeds ${OCPP20OptionalVariableName.MaxCertificateChainSize as string} (${maxChainSize.toString()} bytes)`,
              reasonCode: ReasonCodeEnumType.InvalidCertificate,
            },
          }
        }
      }
    }

    const x509Result = chargingStation.certificateManager.validateCertificateX509(certificateChain)
    if (!x509Result.valid) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestCertificateSigned: X.509 validation failed: ${x509Result.reason ?? 'Unknown'}`
      )
      this.sendSecurityEventNotification(
        chargingStation,
        'InvalidChargingStationCertificate',
        `X.509 validation failed: ${x509Result.reason ?? 'Unknown'}`
      )
      return {
        status: GenericStatus.Rejected,
        statusInfo: {
          additionalInfo: x509Result.reason ?? 'Certificate X.509 validation failed',
          reasonCode: ReasonCodeEnumType.InvalidCertificate,
        },
      }
    }

    try {
      const result = chargingStation.certificateManager.storeCertificate(
        chargingStation.stationInfo?.hashId ?? '',
        certificateType ?? CertificateSigningUseEnumType.ChargingStationCertificate,
        certificateChain
      )

      const storeResult = result instanceof Promise ? await result : result

      const success = typeof storeResult === 'boolean' ? storeResult : storeResult.success

      if (!success) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestCertificateSigned: Certificate chain storage rejected`
        )
        return {
          status: GenericStatus.Rejected,
          statusInfo: {
            additionalInfo: 'Certificate storage rejected the certificate chain as invalid',
            reasonCode: ReasonCodeEnumType.InvalidCertificate,
          },
        }
      }

      const effectiveCertificateType =
        certificateType ?? CertificateSigningUseEnumType.ChargingStationCertificate
      if (effectiveCertificateType === CertificateSigningUseEnumType.ChargingStationCertificate) {
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestCertificateSigned: Triggering websocket reconnect to use new ChargingStationCertificate`
        )
        chargingStation.closeWSConnection()
      }

      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestCertificateSigned: Certificate chain stored successfully`
      )
      // A02.FR.20: Cancel retry timer when CertificateSignedRequest is received and accepted
      this.getCertSigningRetryManager(chargingStation).cancelRetryTimer()
      return {
        status: GenericStatus.Accepted,
      }
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestCertificateSigned: Certificate chain storage failed`,
        error
      )
      return {
        status: GenericStatus.Rejected,
        statusInfo: {
          additionalInfo: 'Failed to store certificate chain due to a storage error',
          reasonCode: ReasonCodeEnumType.OutOfStorage,
        },
      }
    }
  }

  /**
   * Handles OCPP 2.0.1 ChangeAvailability request from central system (F03, F04).
   * Changes the operational status of the entire charging station or a specific EVSE.
   * Per G03.FR.01: EVSE level without ongoing transaction → Accepted
   * Per G03.FR.02: CS level without ongoing transaction → Accepted
   * Per G03.FR.03: EVSE level with ongoing transaction and Inoperative → Scheduled
   * Per G03.FR.04: CS level with some EVSEs having transactions and Inoperative → Scheduled
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - ChangeAvailability request payload with operationalStatus and optional evse
   * @returns ChangeAvailabilityResponse with Accepted, Rejected, or Scheduled
   */
  private handleRequestChangeAvailability (
    chargingStation: ChargingStation,
    commandPayload: OCPP20ChangeAvailabilityRequest
  ): OCPP20ChangeAvailabilityResponse {
    const { evse, operationalStatus } = commandPayload
    const evseIdLabel = evse?.id == null ? '' : ` for EVSE ${evse.id.toString()}`

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestChangeAvailability: Received ChangeAvailability request with operationalStatus=${operationalStatus}${evseIdLabel}`
    )

    if (operationalStatus === OCPP20OperationalStatusEnumType.Inoperative) {
      // G03.FR.07: Save current connector statuses before setting Inoperative
      this.savePreInoperativeStatuses(chargingStation, evse?.id)
    }

    const newConnectorStatus =
      operationalStatus === OCPP20OperationalStatusEnumType.Inoperative
        ? OCPP20ConnectorStatusEnumType.Unavailable
        : OCPP20ConnectorStatusEnumType.Available

    // EVSE-level change
    if (evse?.id != null && evse.id > 0) {
      if (evse.connectorId != null) {
        // Connector-level targeting
        return this.handleConnectorChangeAvailability(
          chargingStation,
          evse.id,
          evse.connectorId,
          operationalStatus,
          newConnectorStatus
        )
      }
      return this.handleEvseChangeAvailability(
        chargingStation,
        evse.id,
        operationalStatus,
        newConnectorStatus
      )
    }

    // CS-level change (no evse or evse.id === 0)
    if (operationalStatus === OCPP20OperationalStatusEnumType.Inoperative) {
      const result = this.handleCsLevelInoperative(
        chargingStation,
        operationalStatus,
        newConnectorStatus
      )
      if (result != null) {
        return result
      }
    }

    // Apply availability change to all EVSEs (for Operative, or Inoperative with no active transactions)
    for (const { evseStatus } of chargingStation.iterateEvses(true)) {
      evseStatus.availability = operationalStatus
    }
    if (operationalStatus === OCPP20OperationalStatusEnumType.Operative) {
      this.sendRestoredAllConnectorsStatusNotifications(chargingStation)
    } else {
      this.sendAllConnectorsStatusNotifications(chargingStation, newConnectorStatus)
    }

    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestChangeAvailability: Charging station set to ${operationalStatus}`
    )
    return {
      status: ChangeAvailabilityStatusEnumType.Accepted,
    }
  }

  /**
   * Handles OCPP 2.0.1 CustomerInformation request from central system.
   * Per TC_N_32_CS: CS must respond to CustomerInformation with Accepted for clear requests.
   * Simulator has no persistent customer data, so clear is accepted but no-op.
   * For report requests, sends empty NotifyCustomerInformation (simulator has no real data).
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - CustomerInformation request payload with clear/report flags
   * @returns CustomerInformationResponse with status
   */
  private handleRequestCustomerInformation (
    chargingStation: ChargingStation,
    commandPayload: OCPP20CustomerInformationRequest
  ): OCPP20CustomerInformationResponse {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestCustomerInformation: Received CustomerInformation request with clear=${commandPayload.clear.toString()}, report=${commandPayload.report.toString()}`
    )

    // N09.FR.09: Exactly one of {idToken, customerCertificate, customerIdentifier} must be provided when report=true
    if (commandPayload.report) {
      const identifierCount = [
        commandPayload.idToken,
        commandPayload.customerCertificate,
        commandPayload.customerIdentifier,
      ].filter(id => id != null).length

      if (identifierCount !== 1) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestCustomerInformation: N09.FR.09 violation - expected exactly 1 customer identifier when report=true, got ${identifierCount.toString()}`
        )
        return {
          status: CustomerInformationStatusEnumType.Invalid,
          statusInfo: {
            additionalInfo: 'Exactly one customer identifier must be provided when report=true',
            reasonCode: ReasonCodeEnumType.InvalidValue,
          },
        }
      }
    }

    if (commandPayload.clear) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestCustomerInformation: Clear request accepted (simulator has no persistent customer data)`
      )
      return {
        status: CustomerInformationStatusEnumType.Accepted,
      }
    }

    if (commandPayload.report) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestCustomerInformation: Report request accepted, sending empty NotifyCustomerInformation`
      )
      return {
        status: CustomerInformationStatusEnumType.Accepted,
      }
    }

    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestCustomerInformation: Neither clear nor report flag set, rejecting`
    )
    return {
      status: CustomerInformationStatusEnumType.Rejected,
      statusInfo: {
        additionalInfo: 'Neither clear nor report flag is set in CustomerInformation request',
        reasonCode: ReasonCodeEnumType.InvalidValue,
      },
    }
  }

  /**
   * Handles OCPP 2.0.1 DataTransfer request
   * Per TC_P_01_CS: CS with no vendor extensions must respond UnknownVendorId
   * @param chargingStation - The charging station instance
   * @param commandPayload - The DataTransfer request payload
   * @returns DataTransferResponse with UnknownVendorId status
   */
  private handleRequestDataTransfer (
    chargingStation: ChargingStation,
    commandPayload: OCPP20DataTransferRequest
  ): OCPP20DataTransferResponse {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestDataTransfer: Received DataTransfer request with vendorId '${commandPayload.vendorId}'`
    )
    // Per TC_P_01_CS: CS with no vendor extensions must respond UnknownVendorId
    return {
      status: DataTransferStatusEnumType.UnknownVendorId,
    }
  }

  /**
   * Handles OCPP 2.0 DeleteCertificate request from central system
   * Deletes a certificate matching the provided hash data from the charging station
   * Per M04.FR.06: ChargingStationCertificate cannot be deleted via DeleteCertificateRequest
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - DeleteCertificate request payload with certificate hash data
   * @returns Promise resolving to DeleteCertificateResponse with status
   */
  private async handleRequestDeleteCertificate (
    chargingStation: ChargingStation,
    commandPayload: OCPP20DeleteCertificateRequest
  ): Promise<OCPP20DeleteCertificateResponse> {
    const { certificateHashData } = commandPayload

    if (!hasCertificateManager(chargingStation)) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestDeleteCertificate: Certificate manager not available`
      )
      return {
        status: DeleteCertificateStatusEnumType.Failed,
        statusInfo: {
          additionalInfo: 'Certificate manager is not available on this charging station',
          reasonCode: ReasonCodeEnumType.InternalError,
        },
      }
    }

    try {
      // M04.FR.06: Check if the certificate to delete is a ChargingStationCertificate
      const isCSCertResult = chargingStation.certificateManager.isChargingStationCertificateHash(
        chargingStation.stationInfo?.hashId ?? '',
        certificateHashData
      )
      const isCSCert = isCSCertResult instanceof Promise ? await isCSCertResult : isCSCertResult

      if (isCSCert) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestDeleteCertificate: Attempted to delete ChargingStationCertificate (M04.FR.06)`
        )
        return {
          status: DeleteCertificateStatusEnumType.Failed,
          statusInfo: {
            additionalInfo: 'ChargingStationCertificate cannot be deleted (M04.FR.06)',
            reasonCode: ReasonCodeEnumType.NotSupported,
          },
        }
      }

      const result = chargingStation.certificateManager.deleteCertificate(
        chargingStation.stationInfo?.hashId ?? '',
        certificateHashData
      )

      const deleteResult = result instanceof Promise ? await result : result

      if (deleteResult.status === DeleteCertificateStatusEnumType.NotFound) {
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestDeleteCertificate: Certificate not found`
        )
        return {
          status: DeleteCertificateStatusEnumType.NotFound,
        }
      }

      if (deleteResult.status === DeleteCertificateStatusEnumType.Accepted) {
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestDeleteCertificate: Certificate deleted successfully`
        )
        return {
          status: DeleteCertificateStatusEnumType.Accepted,
        }
      }

      return {
        status: DeleteCertificateStatusEnumType.Failed,
        statusInfo: {
          additionalInfo: 'Certificate deletion operation returned a failed status',
          reasonCode: ReasonCodeEnumType.InternalError,
        },
      }
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestDeleteCertificate: Certificate deletion failed`,
        error
      )
      return {
        status: DeleteCertificateStatusEnumType.Failed,
        statusInfo: {
          additionalInfo: 'Certificate deletion failed due to an unexpected error',
          reasonCode: ReasonCodeEnumType.InternalError,
        },
      }
    }
  }

  private handleRequestGetBaseReport (
    chargingStation: ChargingStation,
    commandPayload: OCPP20GetBaseReportRequest
  ): OCPP20GetBaseReportResponse {
    logger.debug(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetBaseReport: GetBaseReport request received with requestId ${commandPayload.requestId} and reportBase ${commandPayload.reportBase}`
    )

    if (!Object.values(ReportBaseEnumType).includes(commandPayload.reportBase)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetBaseReport: Unsupported reportBase ${commandPayload.reportBase}`
      )
      return {
        status: GenericDeviceModelStatusEnumType.NotSupported,
      }
    }

    const stationState = this.getStationState(chargingStation)
    const cached = stationState.reportDataCache.get(commandPayload.requestId)
    const reportData = cached ?? this.buildReportData(chargingStation, commandPayload.reportBase)
    if (!cached && reportData.length > 0) {
      stationState.reportDataCache.set(commandPayload.requestId, reportData)
    }
    if (reportData.length === 0) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetBaseReport: No data available for reportBase ${commandPayload.reportBase}`
      )
      return {
        status: GenericDeviceModelStatusEnumType.EmptyResultSet,
      }
    }
    return {
      status: GenericDeviceModelStatusEnumType.Accepted,
    }
  }

  /**
   * Handles OCPP 2.0 GetInstalledCertificateIds request from central system
   * Returns list of installed certificates matching the optional filter types
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - GetInstalledCertificateIds request payload with optional certificate type filter
   * @returns Promise resolving to GetInstalledCertificateIdsResponse with status and certificate chain data
   */
  private async handleRequestGetInstalledCertificateIds (
    chargingStation: ChargingStation,
    commandPayload: OCPP20GetInstalledCertificateIdsRequest
  ): Promise<OCPP20GetInstalledCertificateIdsResponse> {
    const { certificateType } = commandPayload

    if (!hasCertificateManager(chargingStation)) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetInstalledCertificateIds: Certificate manager not available`
      )
      return {
        status: GetInstalledCertificateStatusEnumType.NotFound,
        statusInfo: {
          additionalInfo: 'Certificate manager is not available on this charging station',
          reasonCode: ReasonCodeEnumType.InternalError,
        },
      }
    }

    try {
      const filterTypes = certificateType?.map(ct => {
        if (ct === GetCertificateIdUseEnumType.V2GCertificateChain) {
          return InstallCertificateUseEnumType.V2GRootCertificate
        }
        return ct as unknown as InstallCertificateUseEnumType
      })

      const methodResult = chargingStation.certificateManager.getInstalledCertificates(
        chargingStation.stationInfo?.hashId ?? '',
        filterTypes
      )
      const result: GetInstalledCertificatesResult =
        methodResult instanceof Promise ? await methodResult : methodResult

      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetInstalledCertificateIds: Retrieved ${String(result.certificateHashDataChain.length)} certificates`
      )

      return {
        certificateHashDataChain:
          result.certificateHashDataChain.length > 0 ? result.certificateHashDataChain : undefined,
        status:
          result.certificateHashDataChain.length > 0
            ? GetInstalledCertificateStatusEnumType.Accepted
            : GetInstalledCertificateStatusEnumType.NotFound,
      }
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetInstalledCertificateIds: Failed to retrieve certificates`,
        error
      )
      return {
        status: GetInstalledCertificateStatusEnumType.NotFound,
        statusInfo: {
          additionalInfo: 'Failed to retrieve installed certificates due to an unexpected error',
          reasonCode: ReasonCodeEnumType.InternalError,
        },
      }
    }
  }

  /**
   * Handles OCPP 2.0.1 GetLog request from central system.
   * Accepts the log upload request and simulates the log upload lifecycle
   * by sending LogStatusNotification messages through a state machine:
   * Uploading → Uploaded
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - GetLog request payload with log type, requestId, and log parameters
   * @returns GetLogResponse with Accepted status and simulated filename
   */
  private handleRequestGetLog (
    chargingStation: ChargingStation,
    commandPayload: OCPP20GetLogRequest
  ): OCPP20GetLogResponse {
    const { logType, requestId } = commandPayload

    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetLog: Received GetLog request with requestId ${requestId.toString()} for logType '${logType}'`
    )

    return {
      filename: 'simulator-log.txt',
      status: LogStatusEnumType.Accepted,
    }
  }

  /**
   * Handles OCPP 2.0.1 GetTransactionStatus request from central system.
   * Per D14, E28-E34: Returns transaction status with ongoingIndicator and messagesInQueue.
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - GetTransactionStatus request payload with optional transactionId
   * @returns GetTransactionStatusResponse with ongoingIndicator and messagesInQueue
   */
  private handleRequestGetTransactionStatus (
    chargingStation: ChargingStation,
    commandPayload: OCPP20GetTransactionStatusRequest
  ): OCPP20GetTransactionStatusResponse {
    const { transactionId } = commandPayload
    const transactionLabel = transactionId == null ? '' : ` for transaction ID ${transactionId}`

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetTransactionStatus: Received GetTransactionStatus request${transactionLabel}`
    )

    // E14.FR.06: When transactionId is omitted, ongoingIndicator SHALL NOT be set
    if (transactionId == null) {
      return {
        messagesInQueue: this.hasQueuedTransactionEvents(chargingStation),
      }
    }

    const evseId = chargingStation.getEvseIdByTransactionId(transactionId)

    return {
      messagesInQueue: this.hasQueuedTransactionEvents(chargingStation, transactionId),
      ongoingIndicator: evseId != null,
    }
  }

  private async handleRequestInstallCertificate (
    chargingStation: ChargingStation,
    commandPayload: OCPP20InstallCertificateRequest
  ): Promise<OCPP20InstallCertificateResponse> {
    const { certificate, certificateType } = commandPayload

    if (!hasCertificateManager(chargingStation)) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestInstallCertificate: Certificate manager not available`
      )
      return {
        status: InstallCertificateStatusEnumType.Failed,
        statusInfo: {
          additionalInfo: 'Certificate manager is not available on this charging station',
          reasonCode: ReasonCodeEnumType.InternalError,
        },
      }
    }

    if (!chargingStation.certificateManager.validateCertificateFormat(certificate)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestInstallCertificate: Invalid PEM format for certificate type ${certificateType}`
      )
      return {
        status: InstallCertificateStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: 'Certificate PEM format is invalid or malformed',
          reasonCode: ReasonCodeEnumType.InvalidCertificate,
        },
      }
    }

    const x509Result = chargingStation.certificateManager.validateCertificateX509(certificate)
    if (!x509Result.valid) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestInstallCertificate: X.509 validation failed for type ${certificateType}: ${x509Result.reason ?? 'Unknown'}`
      )
      return {
        status: InstallCertificateStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: x509Result.reason ?? 'Certificate X.509 validation failed',
          reasonCode: ReasonCodeEnumType.InvalidCertificate,
        },
      }
    }

    try {
      const rawResult = chargingStation.certificateManager.storeCertificate(
        chargingStation.stationInfo?.hashId ?? '',
        certificateType,
        certificate
      )
      const resultPromise: Promise<StoreCertificateResult> =
        rawResult instanceof Promise
          ? promiseWithTimeout(
            rawResult,
            OCPP20Constants.HANDLER_TIMEOUT_MS,
              `storeCertificate timed out after ${OCPP20Constants.HANDLER_TIMEOUT_MS.toString()}ms`
          )
          : Promise.resolve(rawResult)
      const storeResult: StoreCertificateResult = await resultPromise

      if (!storeResult.success) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestInstallCertificate: Certificate storage rejected for type ${certificateType}`
        )
        return {
          status: InstallCertificateStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: 'Certificate storage rejected the certificate as invalid',
            reasonCode: ReasonCodeEnumType.InvalidCertificate,
          },
        }
      }

      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestInstallCertificate: Certificate installed successfully for type ${certificateType}`
      )
      return {
        status: InstallCertificateStatusEnumType.Accepted,
      }
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestInstallCertificate: Certificate storage failed for type ${certificateType}`,
        error
      )
      return {
        status: InstallCertificateStatusEnumType.Failed,
        statusInfo: {
          additionalInfo: 'Failed to store certificate due to a storage error',
          reasonCode: ReasonCodeEnumType.OutOfStorage,
        },
      }
    }
  }

  private async handleRequestReset (
    chargingStation: ChargingStation,
    commandPayload: OCPP20ResetRequest
  ): Promise<OCPP20ResetResponse> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Reset request received with type ${commandPayload.type}${commandPayload.evseId !== undefined ? ` for EVSE ${commandPayload.evseId.toString()}` : ''}`
    )

    const { evseId, type } = commandPayload

    if (
      !OCPP20ServiceUtils.readVariableAsBoolean(
        chargingStation,
        OCPP20ComponentName.EVSE,
        'AllowReset',
        true
      )
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: AllowReset is false, rejecting reset request`
      )
      return {
        status: ResetStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: 'AllowReset variable is set to false',
          reasonCode: ReasonCodeEnumType.NotEnabled,
        },
      }
    }

    if (this.hasFirmwareUpdateInProgress(chargingStation)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Firmware update in progress, rejecting reset request`
      )
      return {
        status: ResetStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: 'Firmware update is in progress',
          reasonCode: ReasonCodeEnumType.FwUpdateInProgress,
        },
      }
    }

    if (evseId !== undefined && evseId > 0) {
      if (!chargingStation.hasEvses) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Charging station does not support EVSE-specific reset`
        )
        return {
          status: ResetStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: 'Charging station does not support resetting individual EVSE',
            reasonCode: ReasonCodeEnumType.UnsupportedRequest,
          },
        }
      }

      const evseExists = chargingStation.hasEvse(evseId)
      if (!evseExists) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: EVSE ${evseId.toString()} not found, rejecting reset request`
        )
        return {
          status: ResetStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: `EVSE ${evseId.toString()} does not exist on charging station`,
            reasonCode: ReasonCodeEnumType.UnknownEvse,
          },
        }
      }
    }

    const hasActiveTransactions = chargingStation.getNumberOfRunningTransactions() > 0

    let evseHasActiveTransactions = false
    if (evseId !== undefined && evseId > 0) {
      const evse = chargingStation.getEvseStatus(evseId)
      if (evse != null) {
        evseHasActiveTransactions = this.hasEvseActiveTransactions(evse)
      }
    }

    try {
      if (type === ResetEnumType.Immediate) {
        if (evseId !== undefined && evseId > 0) {
          if (evseHasActiveTransactions) {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Immediate EVSE reset with active transaction, will terminate transaction and reset EVSE ${evseId.toString()}`
            )

            await this.terminateEvseTransactions(
              chargingStation,
              evseId,
              OCPP20ReasonEnumType.ImmediateReset
            )
            this.scheduleEvseReset(chargingStation, evseId, true)

            return {
              status: ResetStatusEnumType.Accepted,
            }
          } else {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Immediate EVSE reset without active transactions for EVSE ${evseId.toString()}`
            )

            this.scheduleEvseReset(chargingStation, evseId, false)

            return {
              status: ResetStatusEnumType.Accepted,
            }
          }
        } else {
          if (hasActiveTransactions) {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Immediate reset with active transactions, will terminate transactions and reset`
            )

            await this.terminateAllTransactions(
              chargingStation,
              OCPP20ReasonEnumType.ImmediateReset
            )
            chargingStation.reset(StopTransactionReason.REMOTE).catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Error during immediate reset:`,
                error
              )
            })

            return {
              status: ResetStatusEnumType.Accepted,
            }
          } else {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Immediate reset without active transactions`
            )

            this.sendAllConnectorsStatusNotifications(
              chargingStation,
              OCPP20ConnectorStatusEnumType.Unavailable
            )
            chargingStation.reset(StopTransactionReason.REMOTE).catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Error during immediate reset:`,
                error
              )
            })

            return {
              status: ResetStatusEnumType.Accepted,
            }
          }
        }
      } else {
        if (evseId !== undefined && evseId > 0) {
          const evse = chargingStation.getEvseStatus(evseId)
          if (evse != null && !this.isEvseIdle(chargingStation, evse)) {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: OnIdle EVSE reset scheduled for EVSE ${evseId.toString()}, waiting for idle state`
            )

            this.scheduleEvseResetOnIdle(chargingStation, evseId)

            return {
              status: ResetStatusEnumType.Scheduled,
            }
          } else {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: OnIdle EVSE reset - EVSE ${evseId.toString()} is idle, resetting immediately`
            )

            this.scheduleEvseReset(chargingStation, evseId, false)

            return {
              status: ResetStatusEnumType.Accepted,
            }
          }
        } else {
          if (!this.isChargingStationIdle(chargingStation)) {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: OnIdle reset scheduled, waiting for idle state`
            )

            this.scheduleResetOnIdle(chargingStation)

            return {
              status: ResetStatusEnumType.Scheduled,
            }
          } else {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: OnIdle reset - charging station is idle, resetting immediately`
            )

            chargingStation.reset(StopTransactionReason.REMOTE).catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Error during OnIdle reset:`,
                error
              )
            })

            return {
              status: ResetStatusEnumType.Accepted,
            }
          }
        }
      }
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Error handling reset request:`,
        error
      )

      return {
        status: ResetStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: 'Internal error occurred while processing reset request',
          reasonCode: ReasonCodeEnumType.InternalError,
        },
      }
    }
  }

  /**
   * Handles OCPP 2.0.1 SetNetworkProfile request from central system.
   * Per B09.FR.01: Validates configurationSlot and connectionData, returns Accepted for valid requests.
   * The simulator accepts the request but does not perform actual network profile switching.
   *
   * **Simulator limitations** (documented, not implemented):
   * - B09.FR.04: securityProfile downgrade detection requires persistent SecurityProfile state
   * - B09.FR.05: configurationSlot vs NetworkConfigurationPriority cross-check requires device model query
   * @param chargingStation - The charging station instance
   * @param commandPayload - The SetNetworkProfile request payload
   * @returns SetNetworkProfileResponse with Accepted or Rejected status
   */
  private handleRequestSetNetworkProfile (
    chargingStation: ChargingStation,
    commandPayload: OCPP20SetNetworkProfileRequest
  ): OCPP20SetNetworkProfileResponse {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetNetworkProfile: Received SetNetworkProfile request`
    )

    // Validate configurationSlot is a positive integer (B09.FR.02)
    if (
      !Number.isInteger(commandPayload.configurationSlot) ||
      commandPayload.configurationSlot <= 0
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetNetworkProfile: Invalid configurationSlot: ${commandPayload.configurationSlot.toString()}`
      )
      return {
        status: SetNetworkProfileStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: 'ConfigurationSlot must be a positive integer',
          reasonCode: ReasonCodeEnumType.InvalidNetworkConf,
        },
      }
    }

    const currentSecurityProfile = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.SecurityCtrlr,
      OCPP20RequiredVariableName.SecurityProfile,
      0
    )
    const newSecurityProfile = commandPayload.connectionData.securityProfile
    if (newSecurityProfile < currentSecurityProfile) {
      // B09.FR.04 (errata 2025-09): Check AllowSecurityProfileDowngrade before rejecting
      const allowDowngrade = OCPP20ServiceUtils.readVariableAsBoolean(
        chargingStation,
        OCPP20ComponentName.SecurityCtrlr,
        'AllowSecurityProfileDowngrade',
        false
      )

      // B09.FR.31 (errata 2025-09 §2.12): Allow downgrade except to profile 1 when enabled
      if (!allowDowngrade || newSecurityProfile <= 1) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetNetworkProfile: Rejected security profile downgrade: ${newSecurityProfile.toString()} < ${currentSecurityProfile.toString()}`
        )
        return {
          status: SetNetworkProfileStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: `Security profile downgrade not allowed: current=${currentSecurityProfile.toString()}, requested=${newSecurityProfile.toString()}`,
            reasonCode: ReasonCodeEnumType.NoSecurityDowngrade,
          },
        }
      }
    }

    const priorityValue = OCPP20ServiceUtils.readVariableAsString(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20RequiredVariableName.NetworkConfigurationPriority
    )
    if (priorityValue.length > 0) {
      const priorities = priorityValue.split(',').map(Number)
      if (!priorities.includes(commandPayload.configurationSlot)) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetNetworkProfile: Slot ${commandPayload.configurationSlot.toString()} not in NetworkConfigurationPriority`
        )
        return {
          status: SetNetworkProfileStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: `Configuration slot ${commandPayload.configurationSlot.toString()} is not in NetworkConfigurationPriority list`,
            reasonCode: ReasonCodeEnumType.InvalidConfSlot,
          },
        }
      }
    }

    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetNetworkProfile: Accepting SetNetworkProfile request for slot ${commandPayload.configurationSlot.toString()}`
    )
    return {
      status: SetNetworkProfileStatusEnumType.Accepted,
    }
  }

  /**
   * Handles OCPP 2.0 RequestStartTransaction request from central system
   * Initiates charging transaction on specified EVSE with enhanced authorization
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - RequestStartTransaction request payload with EVSE, ID token and profiles
   * @returns Promise resolving to RequestStartTransactionResponse with status and transaction details
   */
  private async handleRequestStartTransaction (
    chargingStation: ChargingStation,
    commandPayload: OCPP20RequestStartTransactionRequest
  ): Promise<OCPP20RequestStartTransactionResponse> {
    const { chargingProfile, evseId, groupIdToken, idToken, remoteStartId } = commandPayload
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Remote start transaction request received on EVSE ${evseId?.toString() ?? 'undefined'} with idToken '${truncateId(idToken.idToken)}' and remoteStartId ${remoteStartId.toString()}`
    )

    let resolvedEvseId = evseId
    if (resolvedEvseId == null) {
      resolvedEvseId = this.selectAvailableEvse(chargingStation)
      if (resolvedEvseId == null) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: No available EVSE for remote start`
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: 'No available EVSE found for remote start',
            reasonCode: ReasonCodeEnumType.NotFound,
          },
        }
      }
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Auto-selected EVSE ${resolvedEvseId.toString()}`
      )
    }

    const evse = chargingStation.getEvseStatus(resolvedEvseId)
    if (evse == null) {
      const errorMsg = `EVSE ${resolvedEvseId.toString()} does not exist on charging station`
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: ${errorMsg}`
      )
      throw new OCPPError(
        ErrorType.PROPERTY_CONSTRAINT_VIOLATION,
        errorMsg,
        OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
        commandPayload
      )
    }
    const connectorId = chargingStation.getConnectorIdByEvseId(resolvedEvseId)
    const connectorStatus =
      connectorId != null ? chargingStation.getConnectorStatus(connectorId) : null

    if (connectorStatus == null || connectorId == null) {
      const errorMsg = `Connector ${connectorId?.toString() ?? 'undefined'} status is undefined`
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: ${errorMsg}`
      )
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        errorMsg,
        OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
        commandPayload
      )
    }

    if (
      connectorStatus.transactionStarted === true ||
      connectorStatus.transactionPending === true
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Connector ${connectorId.toString()} already has an active or pending transaction`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: `Connector ${connectorId.toString()} already has an active or pending transaction`,
          reasonCode: ReasonCodeEnumType.TxInProgress,
        },
        transactionId: generateUUID(),
      }
    }

    const shouldAuthorizeRemoteStart = OCPP20ServiceUtils.readVariableAsBoolean(
      chargingStation,
      OCPP20ComponentName.AuthCtrlr,
      OCPP20RequiredVariableName.AuthorizeRemoteStart,
      true
    )

    let isAuthorized = true
    if (shouldAuthorizeRemoteStart) {
      // C12.FR.09: Check MasterPassGroupId before authorization
      const masterPassGroupId = OCPP20ServiceUtils.readVariableValue(
        chargingStation,
        OCPP20ComponentName.AuthCtrlr,
        'MasterPassGroupId'
      )
      if (
        masterPassGroupId != null &&
        masterPassGroupId.length > 0 &&
        groupIdToken?.idToken === masterPassGroupId
      ) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: IdToken with MasterPassGroupId group cannot start a transaction`
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: 'MasterPassGroupId tokens cannot start transactions',
            reasonCode: ReasonCodeEnumType.InvalidIdToken,
          },
          transactionId: generateUUID(),
        }
      }

      try {
        isAuthorized = await this.authorizeToken(
          chargingStation,
          connectorId,
          idToken.idToken,
          'IdToken',
          idToken.type
        )
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Authorization error for '${truncateId(idToken.idToken)}':`,
          error
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: 'Authorization error occurred',
            reasonCode: ReasonCodeEnumType.InternalError,
          },
          transactionId: generateUUID(),
        }
      }
    } else {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: AuthorizeRemoteStart=false, skipping authorization`
      )
    }

    if (!isAuthorized) {
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: `IdToken '${truncateId(idToken.idToken)}' is not authorized`,
          reasonCode: ReasonCodeEnumType.InvalidIdToken,
        },
        transactionId: generateUUID(),
      }
    }

    if (groupIdToken != null) {
      let isGroupAuthorized = false
      try {
        isGroupAuthorized = await this.authorizeToken(
          chargingStation,
          connectorId,
          groupIdToken.idToken,
          'GroupIdToken',
          groupIdToken.type
        )
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Group authorization error for '${truncateId(groupIdToken.idToken)}':`,
          error
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: 'Group authorization error occurred',
            reasonCode: ReasonCodeEnumType.InternalError,
          },
          transactionId: generateUUID(),
        }
      }
      if (!isGroupAuthorized) {
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: `GroupIdToken '${truncateId(groupIdToken.idToken)}' is not authorized`,
            reasonCode: ReasonCodeEnumType.InvalidIdToken,
          },
          transactionId: generateUUID(),
        }
      }
    }

    if (chargingProfile != null) {
      // OCPP 2.0.1 §2.10: RequestStartTransaction requires chargingProfilePurpose = TxProfile
      if (
        chargingProfile.chargingProfilePurpose !== OCPP20ChargingProfilePurposeEnumType.TxProfile
      ) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: ChargingProfile must have purpose TxProfile for RequestStartTransaction, got ${chargingProfile.chargingProfilePurpose}`
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: 'ChargingProfile must have purpose TxProfile',
            reasonCode: ReasonCodeEnumType.InvalidProfile,
          },
          transactionId: generateUUID(),
        }
      }

      // OCPP 2.0.1 §2.10: transactionId MUST NOT be set in RequestStartTransaction
      if (chargingProfile.transactionId != null) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: ChargingProfile transactionId must not be set for RequestStartTransaction`
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: 'ChargingProfile transactionId must not be set',
            reasonCode: ReasonCodeEnumType.InvalidValue,
          },
          transactionId: generateUUID(),
        }
      }
      let isValidProfile = false
      try {
        isValidProfile = this.validateChargingProfile(
          chargingStation,
          chargingProfile,
          resolvedEvseId
        )
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Charging profile validation error:`,
          error
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: 'Charging profile validation error',
            reasonCode: ReasonCodeEnumType.InternalError,
          },
          transactionId: generateUUID(),
        }
      }
      if (!isValidProfile) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Invalid charging profile`
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          statusInfo: {
            additionalInfo: 'Invalid charging profile',
            reasonCode: ReasonCodeEnumType.InvalidProfile,
          },
          transactionId: generateUUID(),
        }
      }
    }

    const transactionId = generateUUID()

    try {
      // E01.FR.07 + E01.FR.16 + E03.FR.01: ensure clean transaction state for new transaction
      OCPP20ServiceUtils.resetTransactionSequenceNumber(chargingStation, connectorId)
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Setting transaction state for connector ${connectorId.toString()}, transaction ID: ${transactionId}`
      )
      connectorStatus.transactionPending = true
      connectorStatus.transactionId = transactionId
      connectorStatus.transactionIdTag = idToken.idToken
      connectorStatus.transactionGroupIdToken = groupIdToken?.idToken
      connectorStatus.transactionStart = new Date()
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.remoteStartId = remoteStartId
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Transaction state set successfully for connector ${connectorId.toString()}`
      )

      if (chargingProfile != null) {
        connectorStatus.chargingProfiles ??= []
        connectorStatus.chargingProfiles.push(chargingProfile)
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Charging profile stored for transaction ${transactionId}`
        )
      }

      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Remote start transaction ACCEPTED on #${connectorId.toString()} for idToken '${truncateId(idToken.idToken)}'`
      )

      return {
        status: RequestStartStopStatusEnumType.Accepted,
        transactionId,
      }
    } catch (error) {
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId, resolvedEvseId)
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Error starting transaction:`,
        error
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: 'Error starting transaction',
          reasonCode: ReasonCodeEnumType.InternalError,
        },
        transactionId: generateUUID(),
      }
    }
  }

  private handleRequestStopTransaction (
    chargingStation: ChargingStation,
    commandPayload: OCPP20RequestStopTransactionRequest
  ): OCPP20RequestStopTransactionResponse {
    const { transactionId } = commandPayload
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestStopTransaction: Remote stop transaction request received for transaction ID ${transactionId as string}`
    )

    if (!validateUUID(transactionId)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStopTransaction: Invalid transaction ID format (expected UUID): ${transactionId as string}`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: 'Invalid transaction ID format',
          reasonCode: ReasonCodeEnumType.InvalidValue,
        },
      }
    }

    const evseId = chargingStation.getEvseIdByTransactionId(transactionId)
    if (evseId == null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStopTransaction: Transaction ID ${transactionId as string} does not exist on any EVSE`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: `Transaction ID ${transactionId as string} does not exist`,
          reasonCode: ReasonCodeEnumType.TxNotFound,
        },
      }
    }

    const connectorId = chargingStation.getConnectorIdByTransactionId(transactionId)
    if (connectorId == null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStopTransaction: Transaction ID ${transactionId as string} does not exist on any connector`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: `Transaction ID ${transactionId as string} does not exist on any connector`,
          reasonCode: ReasonCodeEnumType.TxNotFound,
        },
      }
    }

    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestStopTransaction: Remote stop transaction ACCEPTED for transactionId '${transactionId as string}'`
    )
    return {
      status: RequestStartStopStatusEnumType.Accepted,
    }
  }

  private handleRequestTriggerMessage (
    chargingStation: ChargingStation,
    commandPayload: OCPP20TriggerMessageRequest
  ): OCPP20TriggerMessageResponse {
    try {
      const { evse, requestedMessage } = commandPayload

      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestTriggerMessage: TriggerMessage received for '${requestedMessage}'${evse?.id !== undefined ? ` on EVSE ${evse.id.toString()}` : ''}`
      )

      switch (requestedMessage) {
        case MessageTriggerEnumType.BootNotification:
          if (
            chargingStation.bootNotificationResponse?.status === RegistrationStatusEnumType.ACCEPTED
          ) {
            return {
              status: TriggerMessageStatusEnumType.Rejected,
              statusInfo: {
                additionalInfo: 'BootNotification already accepted (F06.FR.17)',
                reasonCode: ReasonCodeEnumType.NotEnabled,
              },
            }
          }
          return { status: TriggerMessageStatusEnumType.Accepted }

        case MessageTriggerEnumType.FirmwareStatusNotification:
        case MessageTriggerEnumType.Heartbeat:
        case MessageTriggerEnumType.LogStatusNotification:
          return { status: TriggerMessageStatusEnumType.Accepted }

        case MessageTriggerEnumType.MeterValues:
        case MessageTriggerEnumType.StatusNotification: {
          const evseValidation = this.validateTriggerMessageEvse(chargingStation, evse)
          if (evseValidation != null) {
            return evseValidation
          }
          return { status: TriggerMessageStatusEnumType.Accepted }
        }

        default:
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.handleRequestTriggerMessage: Unsupported message trigger '${requestedMessage}'`
          )
          return {
            status: TriggerMessageStatusEnumType.NotImplemented,
            statusInfo: {
              additionalInfo: `Message trigger '${requestedMessage}' is not implemented`,
              reasonCode: ReasonCodeEnumType.UnsupportedRequest,
            },
          }
      }
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestTriggerMessage: Error handling trigger message request:`,
        error
      )

      return {
        status: TriggerMessageStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: 'Internal error occurred while processing trigger message request',
          reasonCode: ReasonCodeEnumType.InternalError,
        },
      }
    }
  }

  private async handleRequestUnlockConnector (
    chargingStation: ChargingStation,
    commandPayload: OCPP20UnlockConnectorRequest
  ): Promise<OCPP20UnlockConnectorResponse> {
    try {
      const { connectorId, evseId } = commandPayload

      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUnlockConnector: UnlockConnector received for EVSE ${evseId.toString()} connector ${connectorId.toString()}`
      )

      if (!chargingStation.hasEvses) {
        return {
          status: UnlockStatusEnumType.UnknownConnector,
          statusInfo: {
            additionalInfo: 'Charging station does not support EVSEs',
            reasonCode: ReasonCodeEnumType.UnsupportedRequest,
          },
        }
      }

      if (!chargingStation.hasEvse(evseId)) {
        return {
          status: UnlockStatusEnumType.UnknownConnector,
          statusInfo: {
            additionalInfo: `EVSE ${evseId.toString()} does not exist`,
            reasonCode: ReasonCodeEnumType.UnknownEvse,
          },
        }
      }

      const evseStatus = chargingStation.getEvseStatus(evseId)
      if (evseStatus?.connectors.has(connectorId) !== true) {
        return {
          status: UnlockStatusEnumType.UnknownConnector,
          statusInfo: {
            additionalInfo: `Connector ${connectorId.toString()} does not exist on EVSE ${evseId.toString()}`,
            reasonCode: ReasonCodeEnumType.UnknownConnectorId,
          },
        }
      }

      // F05.FR.02: Check for ongoing authorized transaction on the specified connector
      const targetConnector = evseStatus.connectors.get(connectorId)
      if (targetConnector?.transactionId != null) {
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestUnlockConnector: Ongoing authorized transaction on connector ${connectorId.toString()} of EVSE ${evseId.toString()}`
        )
        return {
          status: UnlockStatusEnumType.OngoingAuthorizedTransaction,
          statusInfo: {
            additionalInfo: `Connector ${connectorId.toString()} on EVSE ${evseId.toString()} has an ongoing authorized transaction`,
            reasonCode: ReasonCodeEnumType.TxInProgress,
          },
        }
      }

      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUnlockConnector: Unlocking connector ${connectorId.toString()} on EVSE ${evseId.toString()}`
      )

      await sendAndSetConnectorStatus(chargingStation, {
        connectorId,
        connectorStatus: ConnectorStatusEnum.Available,
        evseId,
      } as unknown as OCPP20StatusNotificationRequest)

      chargingStation.unlockConnector(connectorId)
      return { status: UnlockStatusEnumType.Unlocked }
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUnlockConnector: Error handling unlock connector request:`,
        error
      )

      return {
        status: UnlockStatusEnumType.UnlockFailed,
        statusInfo: {
          additionalInfo: 'Internal error occurred while processing unlock connector request',
          reasonCode: ReasonCodeEnumType.InternalError,
        },
      }
    }
  }

  /**
   * Handles OCPP 2.0.1 UpdateFirmware request from central system.
   * Accepts the firmware update request and simulates the firmware update lifecycle
   * by sending FirmwareStatusNotification messages through a state machine:
   * Downloading → Downloaded → [SignatureVerified] → Installing → Installed
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - UpdateFirmware request payload with firmware details and requestId
   * @returns UpdateFirmwareResponse with Accepted status
   */
  private handleRequestUpdateFirmware (
    chargingStation: ChargingStation,
    commandPayload: OCPP20UpdateFirmwareRequest
  ): OCPP20UpdateFirmwareResponse {
    const { firmware, requestId } = commandPayload

    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestUpdateFirmware: Received UpdateFirmware request with requestId ${requestId.toString()} for location '${firmware.location}'`
    )

    // C10: Validate signing certificate PEM format if present
    if (isNotEmptyString(firmware.signingCertificate)) {
      if (
        !hasCertificateManager(chargingStation) ||
        !chargingStation.certificateManager.validateCertificateFormat(firmware.signingCertificate)
      ) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestUpdateFirmware: Invalid PEM format for signing certificate`
        )
        this.sendSecurityEventNotification(
          chargingStation,
          'InvalidFirmwareSigningCertificate',
          `Invalid signing certificate PEM for requestId ${requestId.toString()}`
        )
        return {
          status: UpdateFirmwareStatusEnumType.InvalidCertificate,
        }
      }
    }

    const hasActiveTransactions = chargingStation
      .iterateEvses(true)
      .some(({ evseStatus }) => this.hasEvseActiveTransactions(evseStatus))
    if (hasActiveTransactions) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUpdateFirmware: Active transactions detected — installation will be deferred until idle`
      )
    }

    // H10: Cancel any in-progress firmware update
    const stationState = this.getStationState(chargingStation)
    if (stationState.activeFirmwareUpdateAbortController != null) {
      const previousRequestId = stationState.activeFirmwareUpdateRequestId
      stationState.activeFirmwareUpdateAbortController.abort()
      stationState.activeFirmwareUpdateAbortController = undefined
      stationState.activeFirmwareUpdateRequestId = undefined
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestUpdateFirmware: Canceled previous firmware update (requestId ${String(previousRequestId)})`
      )
      return {
        status: UpdateFirmwareStatusEnumType.AcceptedCanceled,
      }
    }

    return {
      status: UpdateFirmwareStatusEnumType.Accepted,
    }
  }

  /**
   * Checks if a specific EVSE has any active transactions.
   * @param evse - The EVSE to check
   * @returns true if any connector on the EVSE has an active transaction
   */
  private hasEvseActiveTransactions (evse: EvseStatus): boolean {
    for (const connector of evse.connectors.values()) {
      if (connector.transactionId != null) {
        return true
      }
    }
    return false
  }

  /**
   * Checks if a specific EVSE has any non-expired reservations.
   * @param evse - The EVSE to check
   * @returns true if any connector on the EVSE has a pending reservation
   */
  private hasEvsePendingReservations (evse: EvseStatus): boolean {
    for (const connector of evse.connectors.values()) {
      if (hasPendingReservation(connector)) {
        return true
      }
    }
    return false
  }

  /**
   * Checks if firmware update is in progress per OCPP 2.0.1 Errata idle definition.
   * @param chargingStation - The charging station instance
   * @returns true if firmware update is in progress (Downloading, Downloaded, or Installing)
   */
  private hasFirmwareUpdateInProgress (chargingStation: ChargingStation): boolean {
    const firmwareStatus = chargingStation.stationInfo?.firmwareStatus
    return (
      firmwareStatus === OCPP20FirmwareStatusEnumType.Downloading ||
      firmwareStatus === OCPP20FirmwareStatusEnumType.Downloaded ||
      firmwareStatus === OCPP20FirmwareStatusEnumType.Installing ||
      firmwareStatus === OCPP20FirmwareStatusEnumType.DownloadScheduled ||
      firmwareStatus === OCPP20FirmwareStatusEnumType.DownloadPaused ||
      firmwareStatus === OCPP20FirmwareStatusEnumType.InstallScheduled ||
      firmwareStatus === OCPP20FirmwareStatusEnumType.InstallRebooting ||
      firmwareStatus === OCPP20FirmwareStatusEnumType.SignatureVerified
    )
  }

  private hasQueuedTransactionEvents (
    chargingStation: ChargingStation,
    transactionId?: string
  ): boolean {
    for (const { connectorStatus } of chargingStation.iterateConnectors()) {
      if (this.connectorHasQueuedEvents(connectorStatus, transactionId)) {
        return true
      }
    }
    return false
  }

  private isAuthorizedToStopTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    presentedIdToken: OCPP20IdTokenType,
    presentedGroupIdToken?: OCPP20IdTokenType
  ): boolean {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (
      connectorStatus?.transactionStarted !== true &&
      connectorStatus?.transactionPending !== true
    ) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.isAuthorizedToStopTransaction: No active transaction on connector ${connectorId.toString()}`
      )
      return false
    }

    // C01.FR.03(a): Same idToken as the one used to start the transaction
    if (presentedIdToken.idToken === connectorStatus.transactionIdTag) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.isAuthorizedToStopTransaction: Same idToken as start token - authorized locally`
      )
      return true
    }

    // C01.FR.03(b) / C09.FR.03 / C09.FR.07:
    // Different valid idToken with same GroupIdToken as start → authorize locally
    if (
      connectorStatus.transactionGroupIdToken != null &&
      presentedGroupIdToken?.idToken != null &&
      presentedGroupIdToken.idToken === connectorStatus.transactionGroupIdToken
    ) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.isAuthorizedToStopTransaction: Same GroupIdToken as start token - authorized locally without AuthorizationRequest`
      )
      return true
    }

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.isAuthorizedToStopTransaction: IdToken '${truncateId(presentedIdToken.idToken)}' not authorized to stop transaction on connector ${connectorId.toString()}`
    )
    return false
  }

  /**
   * Checks if charging station is idle per OCPP 2.0.1 Errata definition.
   * Idle means: no active transactions, no firmware update in progress, no pending reservations.
   * Note: Log uploads and cable lock state are not tracked in the simulator.
   * @param chargingStation - The charging station instance
   * @returns true if charging station is idle
   */
  private isChargingStationIdle (chargingStation: ChargingStation): boolean {
    return (
      chargingStation.getNumberOfRunningTransactions() === 0 &&
      !this.hasFirmwareUpdateInProgress(chargingStation) &&
      !hasPendingReservations(chargingStation)
    )
  }

  /**
   * Checks if a specific EVSE is idle per OCPP 2.0.1 Errata definition.
   * Idle means: no active transactions on EVSE, no firmware update in progress, no pending reservations on EVSE.
   * @param chargingStation - The charging station instance
   * @param evse - The EVSE to check
   * @returns true if EVSE is idle
   */
  private isEvseIdle (chargingStation: ChargingStation, evse: EvseStatus): boolean {
    return (
      !this.hasEvseActiveTransactions(evse) &&
      !this.hasFirmwareUpdateInProgress(chargingStation) &&
      !this.hasEvsePendingReservations(evse)
    )
  }

  private isValidFirmwareLocation (location: string): boolean {
    try {
      const url = new URL(location)
      return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ftp:'
    } catch {
      return false
    }
  }

  /**
   * Reset connector status on start transaction error
   * @param chargingStation - The charging station instance
   * @param connectorId - The connector ID that needs rollback
   * @param evseId - The EVSE ID
   */
  private async resetConnectorOnStartTransactionError (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): Promise<void> {
    OCPP20ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId)
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    resetConnectorStatus(connectorStatus)
    await restoreConnectorStatus(chargingStation, connectorId, connectorStatus)
  }

  /**
   * Saves current connector statuses before Inoperative is applied, for later restoration.
   * @param chargingStation - The charging station instance
   * @param evseId - Optional EVSE ID to scope the save; if omitted, saves all EVSEs
   */
  private savePreInoperativeStatuses (chargingStation: ChargingStation, evseId?: number): void {
    const stationState = this.getStationState(chargingStation)
    const evseIds =
      evseId != null && evseId > 0
        ? [evseId]
        : chargingStation
          .iterateEvses(true)
          .map(({ evseId }) => evseId)
          .toArray()
    for (const id of evseIds) {
      const evseStatus = chargingStation.getEvseStatus(id)
      if (evseStatus != null) {
        for (const [connectorId, connector] of evseStatus.connectors) {
          if (
            connector.status != null &&
            !stationState.preInoperativeConnectorStatuses.has(connectorId)
          ) {
            stationState.preInoperativeConnectorStatuses.set(
              connectorId,
              connector.status as unknown as OCPP20ConnectorStatusEnumType
            )
          }
        }
      }
    }
  }

  /**
   * Schedules EVSE reset with optional transaction termination
   * @param chargingStation - The charging station instance
   * @param evseId - The EVSE identifier to reset
   * @param hasActiveTransactions - Whether there are active transactions to handle
   */
  private scheduleEvseReset (
    chargingStation: ChargingStation,
    evseId: number,
    hasActiveTransactions: boolean
  ): void {
    this.sendEvseStatusNotifications(
      chargingStation,
      evseId,
      OCPP20ConnectorStatusEnumType.Unavailable
    )

    setImmediate(() => {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.scheduleEvseReset: Executing EVSE ${evseId.toString()} reset${hasActiveTransactions ? ' after transaction termination' : ''}`
      )
      setTimeout(() => {
        const evse = chargingStation.getEvseStatus(evseId)
        if (evse) {
          for (const [connectorId] of evse.connectors) {
            const connectorStatus = chargingStation.getConnectorStatus(connectorId)
            restoreConnectorStatus(chargingStation, connectorId, connectorStatus).catch(
              (error: unknown) => {
                logger.error(
                  `${chargingStation.logPrefix()} ${moduleName}.scheduleEvseReset: Error restoring connector ${connectorId.toString()} status:`,
                  error
                )
              }
            )
          }
          logger.info(
            `${chargingStation.logPrefix()} ${moduleName}.scheduleEvseReset: EVSE ${evseId.toString()} reset completed`
          )
        }
      }, OCPP20Constants.RESET_DELAY_MS)
    })
  }

  /**
   * Schedules EVSE reset on idle (when no active transactions)
   * @param chargingStation - The charging station instance
   * @param evseId - The EVSE identifier to reset
   */
  private scheduleEvseResetOnIdle (chargingStation: ChargingStation, evseId: number): void {
    const monitorInterval = setInterval(() => {
      const evse = chargingStation.getEvseStatus(evseId)
      if (evse != null) {
        if (this.isEvseIdle(chargingStation, evse)) {
          clearInterval(monitorInterval)
          logger.info(
            `${chargingStation.logPrefix()} ${moduleName}.scheduleEvseResetOnIdle: EVSE ${evseId.toString()} is now idle, executing reset`
          )
          this.scheduleEvseReset(chargingStation, evseId, false)
        }
      } else {
        clearInterval(monitorInterval)
      }
    }, OCPP20Constants.RESET_IDLE_MONITOR_INTERVAL_MS)
  }

  /**
   * Schedules charging station reset on idle (when no active transactions)
   * @param chargingStation - The charging station instance
   */
  private scheduleResetOnIdle (chargingStation: ChargingStation): void {
    const monitorInterval = setInterval(() => {
      if (this.isChargingStationIdle(chargingStation)) {
        clearInterval(monitorInterval)
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.scheduleResetOnIdle: Charging station is now idle, executing reset`
        )
        chargingStation.reset(StopTransactionReason.REMOTE).catch((error: unknown) => {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.scheduleResetOnIdle: Error during scheduled reset:`,
            error
          )
        })
      }
    }, OCPP20Constants.RESET_IDLE_MONITOR_INTERVAL_MS)
  }

  private selectAvailableEvse (chargingStation: ChargingStation): number | undefined {
    for (const { evseId, evseStatus } of chargingStation.iterateEvses(true)) {
      if (
        evseStatus.availability !== OCPP20OperationalStatusEnumType.Inoperative &&
        !this.hasEvseActiveTransactions(evseStatus)
      ) {
        return evseId
      }
    }
    return undefined
  }

  private sendAllConnectorsStatusNotifications (
    chargingStation: ChargingStation,
    status: OCPP20ConnectorStatusEnumType
  ): void {
    for (const { connectorId } of chargingStation.iterateConnectors()) {
      sendAndSetConnectorStatus(chargingStation, {
        connectorId,
        connectorStatus: status,
      } as unknown as OCPP20StatusNotificationRequest).catch((error: unknown) => {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.sendAllConnectorsStatusNotifications: Error sending status notification for connector ${connectorId.toString()}:`,
          error
        )
      })
    }
  }

  /**
   * Sends status notifications for all connectors on the specified EVSE
   * @param chargingStation - The charging station instance
   * @param evseId - The EVSE identifier
   * @param status - The connector status to send
   */
  private sendEvseStatusNotifications (
    chargingStation: ChargingStation,
    evseId: number,
    status: OCPP20ConnectorStatusEnumType
  ): void {
    const evse = chargingStation.getEvseStatus(evseId)
    if (evse) {
      for (const [connectorId] of evse.connectors) {
        sendAndSetConnectorStatus(chargingStation, {
          connectorId,
          connectorStatus: status,
        } as unknown as OCPP20StatusNotificationRequest).catch((error: unknown) => {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.sendEvseStatusNotifications: Error sending status notification for connector ${connectorId.toString()}:`,
            error
          )
        })
      }
    }
  }

  private sendFirmwareStatusNotification (
    chargingStation: ChargingStation,
    status: OCPP20FirmwareStatusEnumType,
    requestId: number
  ): Promise<OCPP20FirmwareStatusNotificationResponse> {
    if (chargingStation.stationInfo != null) {
      chargingStation.stationInfo.firmwareStatus = status
    }
    return chargingStation.ocppRequestService.requestHandler<
      OCPP20FirmwareStatusNotificationRequest,
      OCPP20FirmwareStatusNotificationResponse
    >(chargingStation, OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      requestId,
      status,
    })
  }

  private sendLogStatusNotification (
    chargingStation: ChargingStation,
    status: UploadLogStatusEnumType,
    requestId: number
  ): Promise<OCPP20LogStatusNotificationResponse> {
    return chargingStation.ocppRequestService.requestHandler<
      OCPP20LogStatusNotificationRequest,
      OCPP20LogStatusNotificationResponse
    >(chargingStation, OCPP20RequestCommand.LOG_STATUS_NOTIFICATION, {
      requestId,
      status,
    })
  }

  private async sendNotifyCustomerInformation (
    chargingStation: ChargingStation,
    requestId: number
  ): Promise<void> {
    // Simulator has no persistent customer data, so send empty data.
    // Uses pagination pattern (seqNo/tbc) consistent with sendNotifyReportRequest.
    const dataChunks = ['']

    for (let seqNo = 0; seqNo < dataChunks.length; seqNo++) {
      const isLastChunk = seqNo === dataChunks.length - 1

      const notifyCustomerInformationRequest: OCPP20NotifyCustomerInformationRequest = {
        data: dataChunks[seqNo],
        generatedAt: new Date(),
        requestId,
        seqNo,
        tbc: !isLastChunk,
      }

      await chargingStation.ocppRequestService.requestHandler<
        OCPP20NotifyCustomerInformationRequest,
        OCPP20NotifyCustomerInformationResponse
      >(
        chargingStation,
        OCPP20RequestCommand.NOTIFY_CUSTOMER_INFORMATION,
        notifyCustomerInformationRequest
      )

      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.sendNotifyCustomerInformation: NotifyCustomerInformation sent seqNo=${seqNo.toString()} for requestId ${requestId.toString()} (tbc=${(!isLastChunk).toString()})`
      )
    }

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.sendNotifyCustomerInformation: Completed NotifyCustomerInformation for requestId ${requestId.toString()} in ${dataChunks.length.toString()} message(s)`
    )
  }

  private async sendNotifyReportRequest (
    chargingStation: ChargingStation,
    request: OCPP20GetBaseReportRequest,
    response: OCPP20GetBaseReportResponse
  ): Promise<void> {
    const { reportBase, requestId } = request
    const stationState = this.getStationState(chargingStation)
    const cached = stationState.reportDataCache.get(requestId)
    const reportData = cached ?? this.buildReportData(chargingStation, reportBase)

    const maxItemsPerMessage = 100
    const chunks = []
    for (let i = 0; i < reportData.length; i += maxItemsPerMessage) {
      chunks.push(reportData.slice(i, i + maxItemsPerMessage))
    }

    if (chunks.length === 0) {
      chunks.push(undefined) // undefined means reportData will be omitted from the request
    }

    for (let seqNo = 0; seqNo < chunks.length; seqNo++) {
      const isLastChunk = seqNo === chunks.length - 1
      const chunk = chunks[seqNo]

      const notifyReportRequest: OCPP20NotifyReportRequest = {
        generatedAt: new Date(),
        requestId,
        seqNo,
        tbc: !isLastChunk,
        ...(chunk !== undefined && chunk.length > 0 && { reportData: chunk }),
      }

      await chargingStation.ocppRequestService.requestHandler<
        OCPP20NotifyReportRequest,
        OCPP20NotifyReportResponse
      >(chargingStation, OCPP20RequestCommand.NOTIFY_REPORT, notifyReportRequest)

      logger.debug(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${chargingStation.logPrefix()} ${moduleName}.sendNotifyReportRequest: NotifyReport sent seqNo=${seqNo} for requestId ${requestId} with ${chunk?.length ?? 0} report items (tbc=${!isLastChunk})`
      )
    }

    logger.debug(
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${chargingStation.logPrefix()} ${moduleName}.sendNotifyReportRequest: Completed NotifyReport for requestId ${requestId} with ${reportData.length} total items in ${chunks.length} message(s)`
    )
    stationState.reportDataCache.delete(requestId)
  }

  private sendQueuedSecurityEvents (chargingStation: ChargingStation): void {
    const stationState = this.getStationState(chargingStation)
    if (
      stationState.isDrainingSecurityEvents ||
      !chargingStation.isWebSocketConnectionOpened() ||
      stationState.securityEventQueue.length === 0
    ) {
      return
    }
    stationState.isDrainingSecurityEvents = true
    const queue = stationState.securityEventQueue
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.sendQueuedSecurityEvents: Draining ${queue.length.toString()} queued security event(s)`
    )
    const drainNextEvent = (): void => {
      if (queue.length === 0 || !chargingStation.isWebSocketConnectionOpened()) {
        stationState.isDrainingSecurityEvents = false
        return
      }
      const event = queue.shift()
      if (event == null) {
        stationState.isDrainingSecurityEvents = false
        return
      }
      chargingStation.ocppRequestService
        .requestHandler<
          OCPP20SecurityEventNotificationRequest,
          OCPP20SecurityEventNotificationResponse
        >(chargingStation, OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION, {
          timestamp: event.timestamp,
          type: event.type,
          ...(event.techInfo !== undefined && { techInfo: event.techInfo }),
        })
        .then(() => {
          drainNextEvent()
          return undefined
        })
        .catch((error: unknown) => {
          const retryCount = (event.retryCount ?? 0) + 1
          if (retryCount >= OCPP20Constants.MAX_SECURITY_EVENT_SEND_ATTEMPTS) {
            logger.warn(
              `${chargingStation.logPrefix()} ${moduleName}.sendQueuedSecurityEvents: Discarding event '${event.type}' after ${retryCount.toString()} failed attempts`,
              error
            )
            drainNextEvent()
            return
          }
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.sendQueuedSecurityEvents: Failed to send queued event '${event.type}' (attempt ${retryCount.toString()}/${OCPP20Constants.MAX_SECURITY_EVENT_SEND_ATTEMPTS.toString()})`,
            error
          )
          queue.unshift({ ...event, retryCount })
          stationState.isDrainingSecurityEvents = false
          setTimeout(() => {
            this.sendQueuedSecurityEvents(chargingStation)
          }, OCPP20Constants.SECURITY_EVENT_RETRY_DELAY_MS)
        })
    }
    drainNextEvent()
  }

  private sendRestoredAllConnectorsStatusNotifications (chargingStation: ChargingStation): void {
    for (const { connectorId } of chargingStation.iterateConnectors(true)) {
      const restoredStatus = this.getRestoredConnectorStatus(chargingStation, connectorId)
      sendAndSetConnectorStatus(chargingStation, {
        connectorId,
        connectorStatus: restoredStatus,
      } as unknown as OCPP20StatusNotificationRequest).catch((error: unknown) => {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.sendRestoredAllConnectorsStatusNotifications: Error sending status notification for connector ${connectorId.toString()}:`,
          error
        )
      })
    }
  }

  private sendRestoredEvseStatusNotifications (
    chargingStation: ChargingStation,
    evseId: number
  ): void {
    const evse = chargingStation.getEvseStatus(evseId)
    if (evse) {
      for (const [connectorId] of evse.connectors) {
        const restoredStatus = this.getRestoredConnectorStatus(chargingStation, connectorId)
        sendAndSetConnectorStatus(chargingStation, {
          connectorId,
          connectorStatus: restoredStatus,
        } as unknown as OCPP20StatusNotificationRequest).catch((error: unknown) => {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.sendRestoredEvseStatusNotifications: Error sending status notification for connector ${connectorId.toString()}:`,
            error
          )
        })
      }
    }
  }

  private sendSecurityEventNotification (
    chargingStation: ChargingStation,
    type: string,
    techInfo?: string
  ): void {
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.sendSecurityEventNotification: [SecurityEvent] type=${type}${techInfo != null ? `, techInfo=${techInfo}` : ''}`
    )
    this.getStationState(chargingStation).securityEventQueue.push({
      timestamp: new Date(),
      type,
      ...(techInfo !== undefined && { techInfo }),
    })
    this.sendQueuedSecurityEvents(chargingStation)
  }

  /**
   * Simulates a firmware update lifecycle through status progression per OCPP 2.0.1 L01/L02.
   * Sequence: [DownloadScheduled] → Downloading → Downloaded/DownloadFailed →
   *           [SignatureVerified] → [InstallScheduled] → Installing → Installed
   * @param chargingStation - The charging station instance
   * @param requestId - The request ID from the UpdateFirmware request
   * @param firmware - The firmware details including location, dates, and optional signature
   * @param retries - Number of download retry attempts before reporting DownloadFailed (L01.FR.30)
   * @param retryInterval - Seconds between download retry attempts
   */
  private async simulateFirmwareUpdateLifecycle (
    chargingStation: ChargingStation,
    requestId: number,
    firmware: FirmwareType,
    retries?: number,
    retryInterval?: number
  ): Promise<void> {
    const { installDateTime, location, retrieveDateTime, signature } = firmware

    // H10: Set up abort controller for cancellation support
    const abortController = new AbortController()
    const stationState = this.getStationState(chargingStation)
    stationState.activeFirmwareUpdateAbortController = abortController
    stationState.activeFirmwareUpdateRequestId = requestId

    const checkAborted = (): boolean => abortController.signal.aborted

    // C12: If retrieveDateTime is in the future, send DownloadScheduled and wait
    const now = Date.now()
    const retrieveTime = convertToDate(retrieveDateTime)?.getTime() ?? now
    if (retrieveTime > now) {
      await this.sendFirmwareStatusNotification(
        chargingStation,
        OCPP20FirmwareStatusEnumType.DownloadScheduled,
        requestId
      )
      await sleep(retrieveTime - now)
      if (checkAborted()) return
    }

    await this.sendFirmwareStatusNotification(
      chargingStation,
      OCPP20FirmwareStatusEnumType.Downloading,
      requestId
    )

    await sleep(OCPP20Constants.FIRMWARE_STATUS_DELAY_MS)
    if (checkAborted()) return

    // H9: If firmware location is empty or malformed, send DownloadFailed and stop
    if (isEmpty(location) || !this.isValidFirmwareLocation(location)) {
      // L01.FR.30: Simulate download retries before reporting DownloadFailed
      const maxRetries = retries ?? 0
      const retryDelayMs = secondsToMilliseconds(retryInterval ?? 0)
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.simulateFirmwareUpdateLifecycle: Download failed for requestId ${requestId.toString()} - invalid location '${location}' (attempt ${attempt.toString()}/${maxRetries.toString()}, retrying in ${retryInterval?.toString() ?? '0'}s)`
        )
        await sleep(retryDelayMs)
        if (checkAborted()) return
        await this.sendFirmwareStatusNotification(
          chargingStation,
          OCPP20FirmwareStatusEnumType.Downloading,
          requestId
        )
        await sleep(OCPP20Constants.FIRMWARE_STATUS_DELAY_MS)
        if (checkAborted()) return
      }
      await this.sendFirmwareStatusNotification(
        chargingStation,
        OCPP20FirmwareStatusEnumType.DownloadFailed,
        requestId
      )
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.simulateFirmwareUpdateLifecycle: Download failed for requestId ${requestId.toString()} - invalid location '${location}'${maxRetries > 0 ? ` (exhausted ${maxRetries.toString()} retries)` : ''}`
      )
      this.clearActiveFirmwareUpdate(chargingStation, requestId)
      return
    }

    await this.sendFirmwareStatusNotification(
      chargingStation,
      OCPP20FirmwareStatusEnumType.Downloaded,
      requestId
    )

    if (signature != null) {
      await sleep(OCPP20Constants.FIRMWARE_VERIFY_DELAY_MS)
      if (checkAborted()) return

      // L01.FR.04: Simulate signature verification
      const simulateFailure = OCPP20ServiceUtils.readVariableAsBoolean(
        chargingStation,
        OCPP20ComponentName.FirmwareCtrlr as string,
        OCPP20VendorVariableName.SimulateSignatureVerificationFailure as string,
        false
      )

      if (simulateFailure) {
        // L01.FR.03: InvalidSignature + SecurityEventNotification
        await this.sendFirmwareStatusNotification(
          chargingStation,
          OCPP20FirmwareStatusEnumType.InvalidSignature,
          requestId
        )
        this.sendSecurityEventNotification(
          chargingStation,
          'InvalidFirmwareSignature',
          `Firmware signature verification failed for requestId ${requestId.toString()}`
        )
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.simulateFirmwareUpdateLifecycle: Firmware signature verification failed for requestId ${requestId.toString()} (simulated)`
        )
        this.clearActiveFirmwareUpdate(chargingStation, requestId)
        return
      }

      await this.sendFirmwareStatusNotification(
        chargingStation,
        OCPP20FirmwareStatusEnumType.SignatureVerified,
        requestId
      )
    }

    // C12: If installDateTime is in the future, send InstallScheduled and wait
    if (installDateTime != null) {
      const currentTime = Date.now()
      const installTime = convertToDate(installDateTime)?.getTime() ?? currentTime
      if (installTime > currentTime) {
        await this.sendFirmwareStatusNotification(
          chargingStation,
          OCPP20FirmwareStatusEnumType.InstallScheduled,
          requestId
        )
        await sleep(installTime - currentTime)
        if (checkAborted()) return
      }
    }

    // L01.FR.06: Wait for active transactions to end before installing
    // L01.FR.07: Set idle connectors to Unavailable when AllowNewSessionsPendingFirmwareUpdate is false/absent
    const hasActiveTransactionsBeforeInstall = chargingStation
      .iterateEvses(true)
      .some(({ evseStatus }) => this.hasEvseActiveTransactions(evseStatus))
    if (hasActiveTransactionsBeforeInstall) {
      const allowNewSessions = OCPP20ServiceUtils.readVariableAsBoolean(
        chargingStation,
        OCPP20ComponentName.ChargingStation,
        'AllowNewSessionsPendingFirmwareUpdate',
        false
      )
      while (
        !checkAborted() &&
        chargingStation
          .iterateEvses(true)
          .some(({ evseStatus }) => this.hasEvseActiveTransactions(evseStatus))
      ) {
        // L01.FR.07: Set newly-available EVSE to Unavailable on each iteration
        if (!allowNewSessions) {
          for (const { evseId, evseStatus } of chargingStation.iterateEvses(true)) {
            if (!this.hasEvseActiveTransactions(evseStatus)) {
              this.sendEvseStatusNotifications(
                chargingStation,
                evseId,
                OCPP20ConnectorStatusEnumType.Unavailable
              )
            }
          }
        }
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.simulateFirmwareUpdateLifecycle: Waiting for active transactions to end before installing (L01.FR.06)`
        )
        await sleep(OCPP20Constants.FIRMWARE_INSTALL_DELAY_MS)
      }
    }
    if (checkAborted()) return

    await this.sendFirmwareStatusNotification(
      chargingStation,
      OCPP20FirmwareStatusEnumType.Installing,
      requestId
    )

    await sleep(OCPP20Constants.RESET_DELAY_MS)
    if (checkAborted()) return
    await this.sendFirmwareStatusNotification(
      chargingStation,
      OCPP20FirmwareStatusEnumType.Installed,
      requestId
    )

    // H11: Send SecurityEventNotification for successful firmware update
    this.sendSecurityEventNotification(
      chargingStation,
      'FirmwareUpdated',
      `Firmware update completed for requestId ${requestId.toString()}`
    )

    this.clearActiveFirmwareUpdate(chargingStation, requestId)
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.simulateFirmwareUpdateLifecycle: Firmware update simulation completed for requestId ${requestId.toString()}`
    )
  }

  /**
   * Simulates a log upload lifecycle through status progression using chained setTimeout calls.
   * Sequence: Uploading → Uploaded
   * @param chargingStation - The charging station instance
   * @param requestId - The request ID from the GetLog request
   */
  private async simulateLogUploadLifecycle (
    chargingStation: ChargingStation,
    requestId: number
  ): Promise<void> {
    await this.sendLogStatusNotification(
      chargingStation,
      UploadLogStatusEnumType.Uploading,
      requestId
    )

    await sleep(OCPP20Constants.LOG_UPLOAD_STEP_DELAY_MS)
    await this.sendLogStatusNotification(
      chargingStation,
      UploadLogStatusEnumType.Uploaded,
      requestId
    )

    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.simulateLogUploadLifecycle: Log upload simulation completed for requestId ${requestId.toString()}`
    )
  }

  /**
   * Terminates all active transactions on the charging station using OCPP 2.0 TransactionEventRequest
   * @param chargingStation - The charging station instance
   * @param reason - The reason for transaction termination
   */
  private async terminateAllTransactions (
    chargingStation: ChargingStation,
    reason: OCPP20ReasonEnumType
  ): Promise<void> {
    await OCPP20ServiceUtils.stopAllTransactions(
      chargingStation,
      OCPP20TriggerReasonEnumType.ResetCommand,
      reason
    )
  }

  /**
   * Terminates all active transactions on the specified EVSE using OCPP 2.0 TransactionEventRequest
   * @param chargingStation - The charging station instance
   * @param evseId - The EVSE identifier to terminate transactions on
   * @param reason - The reason for transaction termination
   */
  private async terminateEvseTransactions (
    chargingStation: ChargingStation,
    evseId: number,
    reason: OCPP20ReasonEnumType
  ): Promise<void> {
    await OCPP20ServiceUtils.stopAllTransactions(
      chargingStation,
      OCPP20TriggerReasonEnumType.ResetCommand,
      reason,
      evseId
    )
  }

  private triggerAllEvseStatusNotifications (
    chargingStation: ChargingStation,
    errorHandler: (error: unknown) => void
  ): void {
    for (const { connectorId, connectorStatus, evseId } of chargingStation.iterateConnectors(
      true
    )) {
      const resolvedStatus = connectorStatus.status ?? ConnectorStatusEnum.Available
      chargingStation.ocppRequestService
        .requestHandler<
          OCPP20StatusNotificationRequest,
          OCPP20StatusNotificationResponse
        >(chargingStation, OCPP20RequestCommand.STATUS_NOTIFICATION, { connectorId, connectorStatus: resolvedStatus, evseId } as unknown as OCPP20StatusNotificationRequest, { skipBufferingOnError: true, triggerMessage: true })
        .catch(errorHandler)
    }
  }

  private triggerStatusNotification (
    chargingStation: ChargingStation,
    evse: OCPP20TriggerMessageRequest['evse'],
    errorHandler: (error: unknown) => void
  ): void {
    if (evse?.id !== undefined && evse.id > 0 && evse.connectorId !== undefined) {
      const evseStatus = chargingStation.getEvseStatus(evse.id)
      const connectorStatus = evseStatus?.connectors.get(evse.connectorId)
      const resolvedStatus = connectorStatus?.status ?? ConnectorStatusEnum.Available
      chargingStation.ocppRequestService
        .requestHandler<
          OCPP20StatusNotificationRequest,
          OCPP20StatusNotificationResponse
        >(chargingStation, OCPP20RequestCommand.STATUS_NOTIFICATION, { connectorId: evse.connectorId, connectorStatus: resolvedStatus, evseId: evse.id } as unknown as OCPP20StatusNotificationRequest, { skipBufferingOnError: true, triggerMessage: true })
        .catch(errorHandler)
    } else if (chargingStation.hasEvses) {
      this.triggerAllEvseStatusNotifications(chargingStation, errorHandler)
    }
  }

  private validateChargingProfile (
    chargingStation: ChargingStation,
    chargingProfile: OCPP20ChargingProfileType,
    evseId: number
  ): boolean {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Validating charging profile ${chargingProfile.id.toString()} for EVSE ${evseId.toString()}`
    )

    if (chargingProfile.stackLevel < 0 || chargingProfile.stackLevel > 9) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Invalid stack level ${chargingProfile.stackLevel.toString()}, must be 0-9`
      )
      return false
    }

    if (chargingProfile.id <= 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Invalid charging profile ID ${chargingProfile.id.toString()}, must be positive`
      )
      return false
    }

    if (!chargingStation.hasEvses && evseId > 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: EVSE ${evseId.toString()} not supported by this charging station`
      )
      return false
    }

    if (chargingStation.hasEvses && evseId > chargingStation.getNumberOfEvses()) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: EVSE ${evseId.toString()} exceeds available EVSEs (${chargingStation.getNumberOfEvses().toString()})`
      )
      return false
    }

    if (chargingProfile.chargingSchedule.length === 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Charging profile must contain at least one charging schedule`
      )
      return false
    }

    const now = new Date()
    const validFromDate = convertToDate(chargingProfile.validFrom)
    const validToDate = convertToDate(chargingProfile.validTo)
    if (validFromDate && validToDate) {
      if (validFromDate >= validToDate) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: validFrom must be before validTo`
        )
        return false
      }
    }

    if (validToDate && validToDate <= now) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Charging profile already expired`
      )
      return false
    }

    if (
      chargingProfile.recurrencyKind &&
      chargingProfile.chargingProfileKind !== OCPP20ChargingProfileKindEnumType.Recurring
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: recurrencyKind only valid for Recurring profile kind`
      )
      return false
    }

    if (
      chargingProfile.chargingProfileKind === OCPP20ChargingProfileKindEnumType.Recurring &&
      !chargingProfile.recurrencyKind
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Recurring profile kind requires recurrencyKind`
      )
      return false
    }

    for (const [scheduleIndex, schedule] of chargingProfile.chargingSchedule.entries()) {
      if (
        !this.validateChargingSchedule(
          chargingStation,
          schedule,
          scheduleIndex,
          chargingProfile,
          evseId
        )
      ) {
        return false
      }
    }

    if (!this.validateChargingProfilePurpose(chargingStation, chargingProfile, evseId)) {
      return false
    }

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Charging profile ${chargingProfile.id.toString()} validation passed`
    )
    return true
  }

  /**
   * Validates charging profile purpose-specific business rules
   * @param chargingStation - The charging station instance
   * @param chargingProfile - The charging profile to validate
   * @param evseId - EVSE identifier
   * @returns True if purpose validation passes, false otherwise
   */
  private validateChargingProfilePurpose (
    chargingStation: ChargingStation,
    chargingProfile: OCPP20ChargingProfileType,
    evseId: number
  ): boolean {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfilePurpose: Validating purpose-specific rules for profile ${chargingProfile.id.toString()} with purpose ${chargingProfile.chargingProfilePurpose}`
    )

    switch (chargingProfile.chargingProfilePurpose) {
      case OCPP20ChargingProfilePurposeEnumType.ChargingStationExternalConstraints:
        if (evseId !== 0) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfilePurpose: ChargingStationExternalConstraints must apply to EVSE 0, got EVSE ${evseId.toString()}`
          )
          return false
        }
        break

      case OCPP20ChargingProfilePurposeEnumType.ChargingStationMaxProfile:
        if (evseId !== 0) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfilePurpose: ChargingStationMaxProfile must apply to EVSE 0, got EVSE ${evseId.toString()}`
          )
          return false
        }
        break

      case OCPP20ChargingProfilePurposeEnumType.TxDefaultProfile:
        break

      case OCPP20ChargingProfilePurposeEnumType.TxProfile:
        if (evseId === 0) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfilePurpose: TxProfile cannot apply to EVSE 0, must target specific EVSE`
          )
          return false
        }

        if (!chargingProfile.transactionId) {
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfilePurpose: TxProfile without transactionId - may be for future use`
          )
        }
        break

      default:
        logger.warn(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfilePurpose: Unknown charging profile purpose: ${chargingProfile.chargingProfilePurpose}`
        )
        return false
    }

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfilePurpose: Purpose validation passed for profile ${chargingProfile.id.toString()}`
    )
    return true
  }

  /**
   * Validates an individual charging schedule within a charging profile
   * @param chargingStation - The charging station instance
   * @param schedule - The charging schedule to validate
   * @param scheduleIndex - Index of the schedule in the profile's schedule array
   * @param chargingProfile - The parent charging profile
   * @param evseId - EVSE identifier
   * @returns True if schedule is valid, false otherwise
   */
  private validateChargingSchedule (
    chargingStation: ChargingStation,
    schedule: OCPP20ChargingScheduleType,
    scheduleIndex: number,
    chargingProfile: OCPP20ChargingProfileType,
    evseId: number
  ): boolean {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Validating schedule ${scheduleIndex.toString()} (ID: ${schedule.id.toString()}) in profile ${chargingProfile.id.toString()}`
    )

    if (schedule.id <= 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Invalid schedule ID ${schedule.id.toString()}, must be positive`
      )
      return false
    }

    if (schedule.chargingSchedulePeriod.length === 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Schedule must contain at least one charging schedule period`
      )
      return false
    }

    if (!Object.values(OCPP20ChargingRateUnitEnumType).includes(schedule.chargingRateUnit)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Invalid charging rate unit: ${schedule.chargingRateUnit}`
      )
      return false
    }

    if (schedule.duration !== undefined && schedule.duration <= 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Schedule duration must be positive if specified`
      )
      return false
    }

    if (schedule.minChargingRate !== undefined && schedule.minChargingRate < 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Minimum charging rate cannot be negative`
      )
      return false
    }

    const startScheduleDate = convertToDate(schedule.startSchedule)
    const validFromDate = convertToDate(chargingProfile.validFrom)
    const validToDate = convertToDate(chargingProfile.validTo)

    if (startScheduleDate != null && validFromDate != null && startScheduleDate < validFromDate) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Schedule start time cannot be before profile validFrom`
      )
      return false
    }

    if (startScheduleDate != null && validToDate != null && startScheduleDate >= validToDate) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Schedule start time must be before profile validTo`
      )
      return false
    }

    let previousStartPeriod = -1
    for (const [periodIndex, period] of schedule.chargingSchedulePeriod.entries()) {
      if (period.startPeriod < 0) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Period ${periodIndex.toString()} start time cannot be negative`
        )
        return false
      }

      if (period.startPeriod <= previousStartPeriod) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Period ${periodIndex.toString()} start time must be greater than previous period`
        )
        return false
      }
      previousStartPeriod = period.startPeriod

      if (period.limit <= 0) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Period ${periodIndex.toString()} charging limit must be positive`
        )
        return false
      }

      if (schedule.minChargingRate !== undefined && period.limit < schedule.minChargingRate) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Period ${periodIndex.toString()} limit cannot be below minimum charging rate`
        )
        return false
      }

      if (period.numberPhases !== undefined) {
        if (period.numberPhases < 1 || period.numberPhases > 3) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Period ${periodIndex.toString()} number of phases must be 1-3`
          )
          return false
        }

        if (
          period.phaseToUse !== undefined &&
          (period.phaseToUse < 1 || period.phaseToUse > period.numberPhases)
        ) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Period ${periodIndex.toString()} phaseToUse must be between 1 and numberPhases`
          )
          return false
        }
      }
    }

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Schedule ${scheduleIndex.toString()} validation passed`
    )
    return true
  }

  private validateTriggerMessageEvse (
    chargingStation: ChargingStation,
    evse: OCPP20TriggerMessageRequest['evse']
  ): OCPP20TriggerMessageResponse | undefined {
    if (evse?.id === undefined || evse.id <= 0) {
      return undefined
    }
    if (!chargingStation.hasEvses) {
      return {
        status: TriggerMessageStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: 'Charging station does not support EVSEs',
          reasonCode: ReasonCodeEnumType.UnsupportedRequest,
        },
      }
    }
    if (!chargingStation.hasEvse(evse.id)) {
      return {
        status: TriggerMessageStatusEnumType.Rejected,
        statusInfo: {
          additionalInfo: `EVSE ${evse.id.toString()} does not exist`,
          reasonCode: ReasonCodeEnumType.UnknownEvse,
        },
      }
    }
    return undefined
  }
}

/**
 * OCPP 2.0+ Incoming Request Service - handles and processes all incoming requests
 * from the Central System (CSMS) to the Charging Station using OCPP 2.0+ protocol.
 *
 * This service class is responsible for:
 * - **Request Reception**: Receiving and routing OCPP 2.0+ incoming requests from CSMS
 * - **Payload Validation**: Validating incoming request payloads against OCPP 2.0+ JSON schemas
 * - **Request Processing**: Executing business logic for each OCPP 2.0+ request type
 * - **Response Generation**: Creating and sending appropriate responses back to CSMS
 * - **Enhanced Features**: Supporting advanced OCPP 2.0+ features like variable management
 *
 * Supported OCPP 2.0+ Incoming Request Types:
 * - **Transaction Management**: RequestStartTransaction, RequestStopTransaction
 * - **Configuration Management**: SetVariables, GetVariables, GetBaseReport
 * - **Security Operations**: CertificatesSigned, SecurityEventNotification
 * - **Charging Management**: SetChargingProfile, ClearChargingProfile, GetChargingProfiles
 * - **Diagnostics**: TriggerMessage, GetLog, UpdateFirmware
 * - **Display Management**: SetDisplayMessage, ClearDisplayMessage
 * - **Customer Management**: ClearCache, SendLocalList
 *
 * Key OCPP 2.0+ Enhancements:
 * - **Variable Model**: Advanced configuration through standardized variable system
 * - **Enhanced Security**: Improved authentication and authorization mechanisms
 * - **Rich Messaging**: Support for display messages and customer information
 * - **Advanced Monitoring**: Comprehensive logging and diagnostic capabilities
 * - **Flexible Charging**: Enhanced charging profile management and scheduling
 *
 * Architecture Pattern:
 * This class extends OCPPIncomingRequestService and implements OCPP 2.0+-specific
 * request handling logic. It integrates with the OCPP20VariableManager for advanced
 * configuration management and maintains backward compatibility concepts while
 * providing next-generation OCPP features.
 *
 * Validation Workflow:
 * 1. Incoming request received and parsed
 * 2. Payload validated against OCPP 2.0+ JSON schema
 * 3. Request routed to appropriate handler method
 * 4. Business logic executed with variable model integration
 * 5. Response payload validated and sent back to CSMS
 * @see {@link validateIncomingRequestPayload} Request payload validation method
 * @see {@link handleRequestStartTransaction} Example OCPP 2.0+ request handler
 * @see {@link OCPP20VariableManager} Variable management integration
 */
