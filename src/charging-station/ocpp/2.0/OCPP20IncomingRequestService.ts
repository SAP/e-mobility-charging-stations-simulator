// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import { secondsToMilliseconds } from 'date-fns'

import type { ChargingStation } from '../../../charging-station/index.js'
import type {
  OCPP20ChargingProfileType,
  OCPP20ChargingScheduleType,
  OCPP20IdTokenType,
} from '../../../types/ocpp/2.0/Transaction.js'

import { OCPPError } from '../../../exception/index.js'
import {
  AttributeEnumType,
  CertificateSigningUseEnumType,
  ChangeAvailabilityStatusEnumType,
  ConnectorEnumType,
  ConnectorStatusEnum,
  CustomerInformationStatusEnumType,
  DataEnumType,
  DataTransferStatusEnumType,
  DeleteCertificateStatusEnumType,
  ErrorType,
  type EvseStatus,
  FirmwareStatus,
  FirmwareStatusEnumType,
  GenericDeviceModelStatusEnumType,
  GenericStatus,
  GetCertificateIdUseEnumType,
  GetInstalledCertificateStatusEnumType,
  GetVariableStatusEnumType,
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
  OCPP20IncomingRequestCommand,
  type OCPP20InstallCertificateRequest,
  type OCPP20InstallCertificateResponse,
  type OCPP20LogStatusNotificationRequest,
  type OCPP20LogStatusNotificationResponse,
  OCPP20MeasurandEnumType,
  type OCPP20MeterValuesRequest,
  type OCPP20MeterValuesResponse,
  type OCPP20NotifyCustomerInformationRequest,
  type OCPP20NotifyCustomerInformationResponse,
  type OCPP20NotifyReportRequest,
  type OCPP20NotifyReportResponse,
  OCPP20ReadingContextEnumType,
  OCPP20RequestCommand,
  type OCPP20RequestStartTransactionRequest,
  type OCPP20RequestStartTransactionResponse,
  type OCPP20RequestStopTransactionRequest,
  type OCPP20RequestStopTransactionResponse,
  OCPP20RequiredVariableName,
  type OCPP20ResetRequest,
  type OCPP20ResetResponse,
  type OCPP20SetNetworkProfileRequest,
  type OCPP20SetNetworkProfileResponse,
  type OCPP20SetVariablesRequest,
  type OCPP20SetVariablesResponse,
  type OCPP20StatusNotificationRequest,
  type OCPP20StatusNotificationResponse,
  type OCPP20TriggerMessageRequest,
  type OCPP20TriggerMessageResponse,
  type OCPP20UnlockConnectorRequest,
  type OCPP20UnlockConnectorResponse,
  type OCPP20UpdateFirmwareRequest,
  type OCPP20UpdateFirmwareResponse,
  OCPPVersion,
  OperationalStatusEnumType,
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
  OCPP20ChargingProfileKindEnumType,
  OCPP20ChargingProfilePurposeEnumType,
  OCPP20ChargingRateUnitEnumType,
  OCPP20ReasonEnumType,
} from '../../../types/ocpp/2.0/Transaction.js'
import {
  Constants,
  generateUUID,
  isAsyncFunction,
  logger,
  sleep,
  validateUUID,
} from '../../../utils/index.js'
import {
  getIdTagsFile,
  hasPendingReservation,
  hasPendingReservations,
  resetConnectorStatus,
} from '../../Helpers.js'
import { OCPPAuthServiceFactory } from '../auth/services/OCPPAuthServiceFactory.js'
import { OCPPIncomingRequestService } from '../OCPPIncomingRequestService.js'
import { restoreConnectorStatus, sendAndSetConnectorStatus } from '../OCPPServiceUtils.js'
import {
  type GetInstalledCertificatesResult,
  hasCertificateManager,
  type StoreCertificateResult,
} from './OCPP20CertificateManager.js'
import { OCPP20Constants } from './OCPP20Constants.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'
import { OCPP20VariableManager } from './OCPP20VariableManager.js'
import { getVariableMetadata, VARIABLE_REGISTRY } from './OCPP20VariableRegistry.js'

const moduleName = 'OCPP20IncomingRequestService'

export class OCPP20IncomingRequestService extends OCPPIncomingRequestService {
  protected payloadValidatorFunctions: Map<OCPP20IncomingRequestCommand, ValidateFunction<JsonType>>

  private readonly incomingRequestHandlers: Map<
    OCPP20IncomingRequestCommand,
    IncomingRequestHandler
  >

  private readonly reportDataCache: Map<number, ReportDataType[]>

  public constructor () {
    super(OCPPVersion.VERSION_201)
    this.reportDataCache = new Map<number, ReportDataType[]>()
    this.incomingRequestHandlers = new Map<OCPP20IncomingRequestCommand, IncomingRequestHandler>([
      [
        OCPP20IncomingRequestCommand.CERTIFICATE_SIGNED,
        this.toHandler(this.handleRequestCertificateSigned.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.CHANGE_AVAILABILITY,
        this.toHandler(this.handleRequestChangeAvailability.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.CLEAR_CACHE,
        this.toHandler(this.handleRequestClearCache.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION,
        this.toHandler(this.handleRequestCustomerInformation.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.DATA_TRANSFER,
        this.toHandler(this.handleRequestDataTransfer.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.DELETE_CERTIFICATE,
        this.toHandler(this.handleRequestDeleteCertificate.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.GET_BASE_REPORT,
        this.toHandler(this.handleRequestGetBaseReport.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.GET_INSTALLED_CERTIFICATE_IDS,
        this.toHandler(this.handleRequestGetInstalledCertificateIds.bind(this)),
      ],
      [OCPP20IncomingRequestCommand.GET_LOG, this.toHandler(this.handleRequestGetLog.bind(this))],
      [
        OCPP20IncomingRequestCommand.GET_TRANSACTION_STATUS,
        this.toHandler(this.handleRequestGetTransactionStatus.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.GET_VARIABLES,
        this.toHandler(this.handleRequestGetVariables.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.INSTALL_CERTIFICATE,
        this.toHandler(this.handleRequestInstallCertificate.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
        this.toHandler(this.handleRequestStartTransaction.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
        this.toHandler(this.handleRequestStopTransaction.bind(this)),
      ],
      [OCPP20IncomingRequestCommand.RESET, this.toHandler(this.handleRequestReset.bind(this))],
      [
        OCPP20IncomingRequestCommand.SET_NETWORK_PROFILE,
        this.toHandler(this.handleRequestSetNetworkProfile.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.SET_VARIABLES,
        this.toHandler(this.handleRequestSetVariables.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        this.toHandler(this.handleRequestTriggerMessage.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.UNLOCK_CONNECTOR,
        this.toHandler(this.handleRequestUnlockConnector.bind(this)),
      ],
      [
        OCPP20IncomingRequestCommand.UPDATE_FIRMWARE,
        this.toHandler(this.handleRequestUpdateFirmware.bind(this)),
      ],
    ])
    this.payloadValidatorFunctions = OCPP20ServiceUtils.createPayloadValidatorMap(
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
        if (response.status === UpdateFirmwareStatusEnumType.Accepted) {
          this.simulateFirmwareUpdateLifecycle(
            chargingStation,
            request.requestId,
            request.firmware.signature
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
          case MessageTriggerEnumType.FirmwareStatusNotification:
            chargingStation.ocppRequestService
              .requestHandler<
                OCPP20FirmwareStatusNotificationRequest,
                OCPP20FirmwareStatusNotificationResponse
              >(chargingStation, OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION, { status: FirmwareStatusEnumType.Idle }, { skipBufferingOnError: true, triggerMessage: true })
              .catch(errorHandler)
            break
          case MessageTriggerEnumType.Heartbeat:
            chargingStation.ocppRequestService
              .requestHandler<
                OCPP20HeartbeatRequest,
                OCPP20HeartbeatResponse
              >(chargingStation, OCPP20RequestCommand.HEARTBEAT, {}, { skipBufferingOnError: true, triggerMessage: true })
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
            const evseId = evse?.id ?? 0
            chargingStation.ocppRequestService
              .requestHandler<OCPP20MeterValuesRequest, OCPP20MeterValuesResponse>(
                chargingStation,
                OCPP20RequestCommand.METER_VALUES,
                {
                  evseId,
                  meterValue: [
                    {
                      sampledValue: [
                        {
                          context: OCPP20ReadingContextEnumType.TRIGGER,
                          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                          value: 0,
                        },
                      ],
                      timestamp: new Date(),
                    },
                  ],
                },
                { skipBufferingOnError: true, triggerMessage: true }
              )
              .catch(errorHandler)
            break
          }
          case MessageTriggerEnumType.StatusNotification:
            this.triggerStatusNotification(chargingStation, evse, errorHandler)
            break
        }
      }
    )
  }

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
          additionalInfo: reason.info,

          reasonCode: ReasonCodeEnumType[reason.reasonCode as keyof typeof ReasonCodeEnumType],
        },
        attributeType: v.attributeType,
        component: v.component,
        variable: v.variable,
      }),
      logger
    )
    if (preEnforcement.rejected) {
      getVariablesResponse.getVariableResult =
        preEnforcement.results as typeof getVariablesResponse.getVariableResult
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
          additionalInfo: reason.info,

          reasonCode: ReasonCodeEnumType[reason.reasonCode as keyof typeof ReasonCodeEnumType],
        },
        attributeType: v.attributeType,
        component: v.component,
        variable: v.variable,
      }),
      logger
    ) as typeof getVariablesResponse.getVariableResult

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetVariables: Processed ${commandPayload.getVariableData.length.toString()} variable requests, returning ${results.length.toString()} results`
    )

    return getVariablesResponse
  }

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
          additionalInfo: reason.info,

          reasonCode: ReasonCodeEnumType[reason.reasonCode as keyof typeof ReasonCodeEnumType],
        },
        attributeType: v.attributeType ?? AttributeEnumType.Actual,
        component: v.component,
        variable: v.variable,
      }),
      logger
    )
    if (preEnforcement.rejected) {
      setVariablesResponse.setVariableResult =
        preEnforcement.results as typeof setVariablesResponse.setVariableResult
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
          additionalInfo: reason.info,

          reasonCode: ReasonCodeEnumType[reason.reasonCode as keyof typeof ReasonCodeEnumType],
        },
        attributeType: v.attributeType ?? AttributeEnumType.Actual,
        component: v.component,
        variable: v.variable,
      }),
      logger
    ) as typeof setVariablesResponse.setVariableResult

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetVariables: Processed ${commandPayload.setVariableData.length.toString()} variable requests, returning ${results.length.toString()} results`
    )

    return setVariablesResponse
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public async incomingRequestHandler<ReqType extends JsonType, ResType extends JsonType>(
    chargingStation: ChargingStation,
    messageId: string,
    commandName: OCPP20IncomingRequestCommand,
    commandPayload: ReqType
  ): Promise<void> {
    let response: ResType
    if (
      chargingStation.stationInfo?.ocppStrictCompliance === true &&
      chargingStation.inPendingState() &&
      (commandName === OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION ||
        commandName === OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION)
    ) {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          undefined,
          2
        )} while the charging station is in pending state on the CSMS`,
        commandName,
        commandPayload
      )
    }
    if (
      chargingStation.inAcceptedState() ||
      chargingStation.inPendingState() ||
      (chargingStation.stationInfo?.ocppStrictCompliance === false &&
        chargingStation.inUnknownState())
    ) {
      if (
        this.incomingRequestHandlers.has(commandName) &&
        OCPP20ServiceUtils.isIncomingRequestCommandSupported(chargingStation, commandName)
      ) {
        try {
          this.validateIncomingRequestPayload(chargingStation, commandName, commandPayload)
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const incomingRequestHandler = this.incomingRequestHandlers.get(commandName)!
          if (isAsyncFunction(incomingRequestHandler)) {
            response = (await incomingRequestHandler(chargingStation, commandPayload)) as ResType
          } else {
            response = incomingRequestHandler(chargingStation, commandPayload) as ResType
          }
        } catch (error) {
          // Log
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.incomingRequestHandler: Handle incoming request error:`,
            error
          )
          throw error
        }
      } else {
        // Throw exception
        throw new OCPPError(
          ErrorType.NOT_IMPLEMENTED,
          `${commandName} is not implemented to handle request PDU ${JSON.stringify(
            commandPayload,
            undefined,
            2
          )}`,
          commandName,
          commandPayload
        )
      }
    } else {
      throw new OCPPError(
        ErrorType.SECURITY_ERROR,
        `${commandName} cannot be issued to handle request PDU ${JSON.stringify(
          commandPayload,
          undefined,
          2
        )} while the charging station is not registered on the CSMS`,
        commandName,
        commandPayload
      )
    }
    // Send the built response
    await chargingStation.ocppRequestService.sendResponse(
      chargingStation,
      messageId,
      response,
      commandName
    )
    // Emit command name event to allow delayed handling only if there are listeners
    if (this.listenerCount(commandName) > 0) {
      this.emit(commandName, chargingStation, commandPayload, response)
    }
  }

  public override stop (chargingStation: ChargingStation): void {
    try {
      OCPP20VariableManager.getInstance().resetRuntimeOverrides()
      logger.debug(`${chargingStation.logPrefix()} ${moduleName}.stop: Runtime overrides cleared`)
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.stop: Error clearing runtime overrides:`,
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
  protected async handleRequestClearCache (
    chargingStation: ChargingStation
  ): Promise<OCPP20ClearCacheResponse> {
    try {
      const authService = await OCPPAuthServiceFactory.getInstance(chargingStation)
      // C11.FR.04: IF AuthCacheEnabled is false, CS SHALL send ClearCacheResponse with status Rejected
      const config = authService.getConfiguration()
      if (!config.authorizationCacheEnabled) {
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestClearCache: Authorization cache disabled, returning Rejected (C11.FR.04)`
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
                  type: AttributeEnumType.Actual as string,
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
        if (chargingStation.stationInfo) {
          const stationInfo = chargingStation.stationInfo
          if (stationInfo.chargePointModel) {
            reportData.push({
              component: { name: OCPP20ComponentName.ChargingStation },
              variable: { name: OCPP20DeviceInfoVariableName.Model },
              variableAttribute: [
                { type: AttributeEnumType.Actual as string, value: stationInfo.chargePointModel },
              ],
              variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: false },
            })
          }
          if (stationInfo.chargePointVendor) {
            reportData.push({
              component: { name: OCPP20ComponentName.ChargingStation },
              variable: { name: OCPP20DeviceInfoVariableName.VendorName },
              variableAttribute: [
                { type: AttributeEnumType.Actual as string, value: stationInfo.chargePointVendor },
              ],
              variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: false },
            })
          }
          if (stationInfo.chargePointSerialNumber) {
            reportData.push({
              component: { name: OCPP20ComponentName.ChargingStation },
              variable: { name: OCPP20DeviceInfoVariableName.SerialNumber },
              variableAttribute: [
                {
                  type: AttributeEnumType.Actual as string,
                  value: stationInfo.chargePointSerialNumber,
                },
              ],
              variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: false },
            })
          }
          if (stationInfo.firmwareVersion) {
            reportData.push({
              component: { name: OCPP20ComponentName.ChargingStation },
              variable: { name: OCPP20DeviceInfoVariableName.FirmwareVersion },
              variableAttribute: [
                { type: AttributeEnumType.Actual as string, value: stationInfo.firmwareVersion },
              ],
              variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: false },
            })
          }
        }

        if (chargingStation.ocppConfiguration?.configurationKey) {
          for (const configKey of chargingStation.ocppConfiguration.configurationKey) {
            const variableAttributes = []
            variableAttributes.push({
              type: AttributeEnumType.Actual as string,
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
              attributes: { type: string; value?: string }[]
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
              const entry = grouped.get(key)
              if (entry) {
                entry.attributes.push({ type: r.attributeType as string, value: r.attributeValue })
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
              return (
                order.indexOf(a.type as AttributeEnumType) -
                order.indexOf(b.type as AttributeEnumType)
              )
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
          for (const [evseId, evse] of chargingStation.evses) {
            reportData.push({
              component: {
                evse: { id: evseId },
                name: OCPP20ComponentName.EVSE,
              },
              variable: { name: OCPP20DeviceInfoVariableName.AvailabilityState },
              variableAttribute: [
                { type: AttributeEnumType.Actual as string, value: evse.availability },
              ],
              variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: true },
            })
            if (evse.connectors.size > 0) {
              for (const [connectorId, connector] of evse.connectors) {
                reportData.push({
                  component: {
                    evse: { connectorId, id: evseId },
                    name: OCPP20ComponentName.EVSE,
                  },
                  variable: { name: OCPP20DeviceInfoVariableName.ConnectorType },
                  variableAttribute: [
                    {
                      type: AttributeEnumType.Actual as string,
                      value: connector.type ?? ConnectorEnumType.Unknown,
                    },
                  ],
                  variableCharacteristics: {
                    dataType: DataEnumType.string,
                    supportsMonitoring: false,
                  },
                })
              }
            }
          }
        } else {
          for (const [connectorId, connector] of chargingStation.connectors) {
            if (connectorId > 0) {
              reportData.push({
                component: {
                  evse: { connectorId, id: 1 },
                  name: OCPP20ComponentName.Connector,
                },
                variable: { name: OCPP20DeviceInfoVariableName.ConnectorType },
                variableAttribute: [
                  {
                    type: AttributeEnumType.Actual as string,
                    value: connector.type ?? ConnectorEnumType.Unknown,
                  },
                ],
                variableCharacteristics: {
                  dataType: DataEnumType.string,
                  supportsMonitoring: false,
                },
              })
            }
          }
        }
        break

      case ReportBaseEnumType.SummaryInventory:
        if (chargingStation.stationInfo) {
          const stationInfo = chargingStation.stationInfo
          if (stationInfo.chargePointModel) {
            reportData.push({
              component: { name: OCPP20ComponentName.ChargingStation },
              variable: { name: OCPP20DeviceInfoVariableName.Model },
              variableAttribute: [
                { type: AttributeEnumType.Actual as string, value: stationInfo.chargePointModel },
              ],
              variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: false },
            })
          }
          if (stationInfo.chargePointVendor) {
            reportData.push({
              component: { name: OCPP20ComponentName.ChargingStation },
              variable: { name: OCPP20DeviceInfoVariableName.VendorName },
              variableAttribute: [
                { type: AttributeEnumType.Actual as string, value: stationInfo.chargePointVendor },
              ],
              variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: false },
            })
          }
          if (stationInfo.firmwareVersion) {
            reportData.push({
              component: { name: OCPP20ComponentName.ChargingStation },
              variable: { name: OCPP20DeviceInfoVariableName.FirmwareVersion },
              variableAttribute: [
                { type: AttributeEnumType.Actual as string, value: stationInfo.firmwareVersion },
              ],
              variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: false },
            })
          }
        }

        reportData.push({
          component: { name: OCPP20ComponentName.ChargingStation },
          variable: { name: OCPP20DeviceInfoVariableName.AvailabilityState },
          variableAttribute: [
            {
              type: AttributeEnumType.Actual as string,
              value: chargingStation.inAcceptedState()
                ? OCPP20ConnectorStatusEnumType.Available
                : OCPP20ConnectorStatusEnumType.Unavailable,
            },
          ],
          variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: true },
        })

        if (chargingStation.hasEvses) {
          for (const [evseId, evse] of chargingStation.evses) {
            reportData.push({
              component: {
                evse: { id: evseId },
                name: OCPP20ComponentName.EVSE,
              },
              variable: { name: OCPP20DeviceInfoVariableName.AvailabilityState },
              variableAttribute: [
                { type: AttributeEnumType.Actual as string, value: evse.availability },
              ],
              variableCharacteristics: { dataType: DataEnumType.string, supportsMonitoring: true },
            })
          }
        } else {
          for (const [connectorId, connector] of chargingStation.connectors) {
            if (connectorId > 0) {
              reportData.push({
                component: {
                  evse: { connectorId, id: 1 },
                  name: OCPP20ComponentName.Connector,
                },
                variable: { name: OCPP20DeviceInfoVariableName.AvailabilityState },
                variableAttribute: [
                  {
                    type: AttributeEnumType.Actual as string,
                    value: connector.status ?? ConnectorStatusEnum.Unavailable,
                  },
                ],
                variableCharacteristics: {
                  dataType: DataEnumType.string,
                  supportsMonitoring: true,
                },
              })
            }
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

  private getTxUpdatedInterval (chargingStation: ChargingStation): number {
    const variableManager = OCPP20VariableManager.getInstance()
    const results = variableManager.getVariables(chargingStation, [
      {
        component: { name: OCPP20ComponentName.SampledDataCtrlr },
        variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
      },
    ])
    if (results.length > 0 && results[0].attributeValue != null) {
      const intervalSeconds = parseInt(results[0].attributeValue, 10)
      if (!isNaN(intervalSeconds) && intervalSeconds > 0) {
        return secondsToMilliseconds(intervalSeconds)
      }
    }
    return secondsToMilliseconds(Constants.DEFAULT_TX_UPDATED_INTERVAL)
  }

  private handleCsLevelInoperative (
    chargingStation: ChargingStation,
    operationalStatus: OperationalStatusEnumType,
    newConnectorStatus: OCPP20ConnectorStatusEnumType
  ): OCPP20ChangeAvailabilityResponse | undefined {
    let hasActiveTransactions = false
    for (const [evseId, evseStatus] of chargingStation.evses) {
      if (evseId === 0) {
        continue
      }
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
      for (const [evseId, evseStatus] of chargingStation.evses) {
        if (evseId > 0 && !this.hasEvseActiveTransactions(evseStatus)) {
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
    operationalStatus: OperationalStatusEnumType,
    newConnectorStatus: OCPP20ConnectorStatusEnumType
  ): OCPP20ChangeAvailabilityResponse {
    if (!chargingStation.evses.has(evseId)) {
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
      operationalStatus === OperationalStatusEnumType.Inoperative &&
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
    this.sendEvseStatusNotifications(chargingStation, evseId, newConnectorStatus)

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

    const newConnectorStatus =
      operationalStatus === OperationalStatusEnumType.Inoperative
        ? OCPP20ConnectorStatusEnumType.Unavailable
        : OCPP20ConnectorStatusEnumType.Available

    // EVSE-level change
    if (evse?.id != null && evse.id > 0) {
      return this.handleEvseChangeAvailability(
        chargingStation,
        evse.id,
        operationalStatus,
        newConnectorStatus
      )
    }

    // CS-level change (no evse or evse.id === 0)
    if (operationalStatus === OperationalStatusEnumType.Inoperative) {
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
    for (const [evseId, evseStatus] of chargingStation.evses) {
      if (evseId > 0) {
        evseStatus.availability = operationalStatus
      }
    }
    this.sendAllConnectorsStatusNotifications(chargingStation, newConnectorStatus)

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

    const cached = this.reportDataCache.get(commandPayload.requestId)
    const reportData = cached ?? this.buildReportData(chargingStation, commandPayload.reportBase)
    if (!cached && reportData.length > 0) {
      this.reportDataCache.set(commandPayload.requestId, reportData)
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
        // Simulator has no persistent offline message buffer
        messagesInQueue: false,
      }
    }

    const evseId = chargingStation.getEvseIdByTransactionId(transactionId)

    return {
      // Simulator has no persistent offline message buffer
      messagesInQueue: false,
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

    try {
      const rawResult = chargingStation.certificateManager.storeCertificate(
        chargingStation.stationInfo?.hashId ?? '',
        certificateType,
        certificate
      )
      const resultPromise: Promise<StoreCertificateResult> =
        rawResult instanceof Promise
          ? withTimeout(rawResult, OCPP20Constants.HANDLER_TIMEOUT_MS, 'storeCertificate')
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

    const variableManager = OCPP20VariableManager.getInstance()
    const allowResetResults = variableManager.getVariables(chargingStation, [
      {
        component: { name: OCPP20ComponentName.EVSE },
        variable: { name: 'AllowReset' },
      },
    ])
    if (allowResetResults.length > 0 && allowResetResults[0].attributeValue === 'false') {
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

      const evseExists = chargingStation.evses.has(evseId)
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
   * Handles OCPP 2.0.1 SetNetworkProfile request from central system
   * Per TC_B_43_CS: CS must respond to SetNetworkProfile at minimum with Rejected
   * The simulator does not support network profile switching
   * @param chargingStation - The charging station instance
   * @param commandPayload - The SetNetworkProfile request payload
   * @returns SetNetworkProfileResponse with Rejected status
   */
  private handleRequestSetNetworkProfile (
    chargingStation: ChargingStation,
    commandPayload: OCPP20SetNetworkProfileRequest
  ): OCPP20SetNetworkProfileResponse {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetNetworkProfile: Received SetNetworkProfile request`
    )
    // Per TC_B_43_CS: CS must respond to SetNetworkProfile at minimum with Rejected
    return {
      status: SetNetworkProfileStatusEnumType.Rejected,
      statusInfo: {
        additionalInfo: 'Simulator does not support network profile configuration',
        reasonCode: ReasonCodeEnumType.UnsupportedRequest,
      },
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
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Remote start transaction request received on EVSE ${evseId?.toString() ?? 'undefined'} with idToken ${idToken.idToken} and remoteStartId ${remoteStartId.toString()}`
    )

    if (evseId == null) {
      const errorMsg = 'EVSE ID is required for RequestStartTransaction'
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

    const evse = chargingStation.getEvseStatus(evseId)
    if (evse == null) {
      const errorMsg = `EVSE ${evseId.toString()} does not exist on charging station`
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
    const connectorId: number | undefined = evse.connectors.keys().next().value
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

    if (connectorStatus.transactionStarted === true) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Connector ${connectorId.toString()} already has an active transaction`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        transactionId: generateUUID(),
      }
    }

    let isAuthorized = false
    try {
      isAuthorized = this.isIdTokenAuthorized(chargingStation, idToken)
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Authorization error for ${idToken.idToken}:`,
        error
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        transactionId: generateUUID(),
      }
    }

    if (!isAuthorized) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: IdToken ${idToken.idToken} is not authorized`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        transactionId: generateUUID(),
      }
    }

    if (groupIdToken != null) {
      let isGroupAuthorized = false
      try {
        isGroupAuthorized = this.isIdTokenAuthorized(chargingStation, groupIdToken)
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Group authorization error for ${groupIdToken.idToken}:`,
          error
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          transactionId: generateUUID(),
        }
      }

      if (!isGroupAuthorized) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: GroupIdToken ${groupIdToken.idToken} is not authorized`
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
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
          transactionId: generateUUID(),
        }
      }
      let isValidProfile = false
      try {
        isValidProfile = this.validateChargingProfile(chargingStation, chargingProfile, evseId)
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Charging profile validation error:`,
          error
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          transactionId: generateUUID(),
        }
      }
      if (!isValidProfile) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Invalid charging profile`
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          transactionId: generateUUID(),
        }
      }
    }

    const transactionId = generateUUID()

    try {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Setting transaction state for connector ${connectorId.toString()}, transaction ID: ${transactionId}`
      )
      connectorStatus.transactionStarted = true
      connectorStatus.transactionId = transactionId
      connectorStatus.transactionIdTag = idToken.idToken
      connectorStatus.transactionStart = new Date()
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.remoteStartId = remoteStartId
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Transaction state set successfully for connector ${connectorId.toString()}`
      )

      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Updating connector ${connectorId.toString()} status to Occupied`
      )
      await sendAndSetConnectorStatus(
        chargingStation,
        connectorId,
        ConnectorStatusEnum.Occupied,
        evseId
      )

      if (chargingProfile != null) {
        connectorStatus.chargingProfiles ??= []
        connectorStatus.chargingProfiles.push(chargingProfile)
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Charging profile stored for transaction ${transactionId}`
        )
      }

      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Remote start transaction ACCEPTED on #${connectorId.toString()} for idToken '${idToken.idToken}'`
      )

      return {
        status: RequestStartStopStatusEnumType.Accepted,
        transactionId,
      }
    } catch (error) {
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId, evseId)
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Error starting transaction:`,
        error
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        transactionId: generateUUID(),
      }
    }
  }

  private async handleRequestStopTransaction (
    chargingStation: ChargingStation,
    commandPayload: OCPP20RequestStopTransactionRequest
  ): Promise<OCPP20RequestStopTransactionResponse> {
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
      }
    }

    const evseId = chargingStation.getEvseIdByTransactionId(transactionId)
    if (evseId == null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStopTransaction: Transaction ID ${transactionId as string} does not exist on any EVSE`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
      }
    }

    const connectorId = chargingStation.getConnectorIdByTransactionId(transactionId)
    if (connectorId == null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStopTransaction: Transaction ID ${transactionId as string} does not exist on any connector`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
      }
    }

    try {
      const stopResponse = await OCPP20ServiceUtils.requestStopTransaction(
        chargingStation,
        connectorId,
        evseId
      )

      if (stopResponse.status === GenericStatus.Accepted) {
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStopTransaction: Remote stop transaction ACCEPTED for transactionId '${transactionId as string}'`
        )
        return {
          status: RequestStartStopStatusEnumType.Accepted,
        }
      }

      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStopTransaction: Remote stop transaction REJECTED for transactionId '${transactionId as string}'`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
      }
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStopTransaction: Error occurred during remote stop transaction for transaction ID ${transactionId as string} on connector ${connectorId.toString()}:`,
        error
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
      }
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

      if (evse?.id !== undefined && evse.id > 0) {
        if (!chargingStation.hasEvses) {
          return {
            status: TriggerMessageStatusEnumType.Rejected,
            statusInfo: {
              additionalInfo: 'Charging station does not support EVSEs',
              reasonCode: ReasonCodeEnumType.UnsupportedRequest,
            },
          }
        }
        if (!chargingStation.evses.has(evse.id)) {
          return {
            status: TriggerMessageStatusEnumType.Rejected,
            statusInfo: {
              additionalInfo: `EVSE ${evse.id.toString()} does not exist`,
              reasonCode: ReasonCodeEnumType.UnknownEvse,
            },
          }
        }
      }

      switch (requestedMessage) {
        case MessageTriggerEnumType.BootNotification:
          // F06.FR.17: Reject BootNotification trigger if last boot was already Accepted
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
          return { status: TriggerMessageStatusEnumType.Accepted }

        case MessageTriggerEnumType.Heartbeat:
          return { status: TriggerMessageStatusEnumType.Accepted }

        case MessageTriggerEnumType.LogStatusNotification:
          return { status: TriggerMessageStatusEnumType.Accepted }

        case MessageTriggerEnumType.MeterValues:
          return { status: TriggerMessageStatusEnumType.Accepted }

        case MessageTriggerEnumType.StatusNotification:
          return { status: TriggerMessageStatusEnumType.Accepted }

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

      if (!chargingStation.evses.has(evseId)) {
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

      await sendAndSetConnectorStatus(
        chargingStation,
        connectorId,
        ConnectorStatusEnum.Available,
        evseId
      )

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
      firmwareStatus === FirmwareStatus.Downloading ||
      firmwareStatus === FirmwareStatus.Downloaded ||
      firmwareStatus === FirmwareStatus.Installing
    )
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

  private isIdTokenAuthorized (
    chargingStation: ChargingStation,
    idToken: OCPP20IdTokenType
  ): boolean {
    /**
     * OCPP 2.0 Authorization Logic Implementation
     *
     * OCPP 2.0 handles authorization differently from 1.6:
     * 1. Check if authorization is required (LocalAuthorizeOffline, AuthorizeRemoteStart variables)
     * 2. Local authorization list validation if enabled
     * 3. For OCPP 2.0, there's no explicit AuthorizeRequest - authorization is validated
     *    through configuration variables and local auth lists
     * 4. Remote validation through TransactionEvent if needed
     */

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.isIdTokenAuthorized: Validating idToken ${idToken.idToken} of type ${idToken.type}`
    )

    try {
      const localAuthListEnabled = chargingStation.getLocalAuthListEnabled()
      const remoteAuthorizationEnabled = chargingStation.stationInfo?.remoteAuthorization ?? true

      if (!localAuthListEnabled && !remoteAuthorizationEnabled) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.isIdTokenAuthorized: Both local and remote authorization are disabled. Allowing access but this may indicate misconfiguration.`
        )
        return true
      }

      if (localAuthListEnabled) {
        const isLocalAuthorized = this.isIdTokenLocalAuthorized(chargingStation, idToken.idToken)
        if (isLocalAuthorized) {
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.isIdTokenAuthorized: IdToken ${idToken.idToken} authorized via local auth list`
          )
          return true
        }
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.isIdTokenAuthorized: IdToken ${idToken.idToken} not found in local auth list`
        )
      }

      // In OCPP 2.0, remote authorization happens during TransactionEvent processing
      if (remoteAuthorizationEnabled) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.isIdTokenAuthorized: Remote authorization enabled but no explicit remote auth mechanism in OCPP 2.0 - deferring to transaction event validation`
        )
        return true
      }

      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.isIdTokenAuthorized: IdToken ${idToken.idToken} authorization failed - not found in local list and remote auth not configured`
      )
      return false
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.isIdTokenAuthorized: Error during authorization validation for ${idToken.idToken}:`,
        error
      )
      return false
    }
  }

  /**
   * Check if idToken is authorized in local authorization list
   * @param chargingStation - The charging station instance
   * @param idTokenString - The ID token string to validate
   * @returns true if authorized locally, false otherwise
   */
  private isIdTokenLocalAuthorized (
    chargingStation: ChargingStation,
    idTokenString: string
  ): boolean {
    try {
      return (
        chargingStation.hasIdTags() &&
        chargingStation.idTagsCache
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          .getIdTags(getIdTagsFile(chargingStation.stationInfo!)!)
          ?.includes(idTokenString) === true
      )
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.isIdTokenLocalAuthorized: Error checking local authorization for ${idTokenString}:`,
        error
      )
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
    chargingStation.stopMeterValues(connectorId)
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    resetConnectorStatus(connectorStatus)
    await restoreConnectorStatus(chargingStation, connectorId, connectorStatus)
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
      }, 1000)
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
    }, 5000)
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
    }, 5000)
  }

  /**
   * Sends status notifications for all connectors on the charging station
   * @param chargingStation - The charging station instance
   * @param status - The connector status to send
   */
  private sendAllConnectorsStatusNotifications (
    chargingStation: ChargingStation,
    status: OCPP20ConnectorStatusEnumType
  ): void {
    for (const [, evse] of chargingStation.evses) {
      for (const [connectorId] of evse.connectors) {
        sendAndSetConnectorStatus(
          chargingStation,
          connectorId,
          status as ConnectorStatusEnum
        ).catch((error: unknown) => {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.sendAllConnectorsStatusNotifications: Error sending status notification for connector ${connectorId.toString()}:`,
            error
          )
        })
      }
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
        sendAndSetConnectorStatus(
          chargingStation,
          connectorId,
          status as ConnectorStatusEnum
        ).catch((error: unknown) => {
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
    status: FirmwareStatusEnumType,
    requestId: number
  ): Promise<OCPP20FirmwareStatusNotificationResponse> {
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
    const notifyCustomerInformationRequest: OCPP20NotifyCustomerInformationRequest = {
      data: '',
      generatedAt: new Date(),
      requestId,
      seqNo: 0,
      tbc: false,
    }
    await chargingStation.ocppRequestService.requestHandler<
      OCPP20NotifyCustomerInformationRequest,
      OCPP20NotifyCustomerInformationResponse
    >(
      chargingStation,
      OCPP20RequestCommand.NOTIFY_CUSTOMER_INFORMATION,
      notifyCustomerInformationRequest
    )
  }

  private async sendNotifyReportRequest (
    chargingStation: ChargingStation,
    request: OCPP20GetBaseReportRequest,
    response: OCPP20GetBaseReportResponse
  ): Promise<void> {
    const { reportBase, requestId } = request
    const cached = this.reportDataCache.get(requestId)
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
    this.reportDataCache.delete(requestId)
  }

  /**
   * Simulates a firmware update lifecycle through status progression using chained setTimeout calls.
   * Sequence: Downloading → Downloaded → [SignatureVerified if signature present] → Installing → Installed
   * @param chargingStation - The charging station instance
   * @param requestId - The request ID from the UpdateFirmware request
   * @param signature - Optional firmware signature; triggers SignatureVerified step if present
   */
  private async simulateFirmwareUpdateLifecycle (
    chargingStation: ChargingStation,
    requestId: number,
    signature?: string
  ): Promise<void> {
    await this.sendFirmwareStatusNotification(
      chargingStation,
      FirmwareStatusEnumType.Downloading,
      requestId
    )

    await sleep(1000)
    await this.sendFirmwareStatusNotification(
      chargingStation,
      FirmwareStatusEnumType.Downloaded,
      requestId
    )

    if (signature != null) {
      await sleep(500)
      await this.sendFirmwareStatusNotification(
        chargingStation,
        FirmwareStatusEnumType.SignatureVerified,
        requestId
      )
    }

    await sleep(1000)
    await this.sendFirmwareStatusNotification(
      chargingStation,
      FirmwareStatusEnumType.Installing,
      requestId
    )

    await sleep(1000)
    await this.sendFirmwareStatusNotification(
      chargingStation,
      FirmwareStatusEnumType.Installed,
      requestId
    )

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

    await sleep(1000)
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
    const terminationPromises: Promise<unknown>[] = []

    for (const [evseId, evse] of chargingStation.evses) {
      for (const [connectorId, connector] of evse.connectors) {
        if (connector.transactionId != null) {
          logger.info(
            `${chargingStation.logPrefix()} ${moduleName}.terminateAllTransactions: Terminating transaction ${connector.transactionId.toString()} on connector ${connectorId.toString()}`
          )
          terminationPromises.push(
            OCPP20ServiceUtils.requestStopTransaction(chargingStation, connectorId, evseId).catch(
              (error: unknown) => {
                logger.error(
                  `${chargingStation.logPrefix()} ${moduleName}.terminateAllTransactions: Error terminating transaction on connector ${connectorId.toString()}:`,
                  error
                )
              }
            )
          )
        }
      }
    }

    if (terminationPromises.length > 0) {
      await Promise.all(terminationPromises)
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.terminateAllTransactions: All transactions terminated on charging station`
      )
    }
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
    const evse = chargingStation.getEvseStatus(evseId)
    if (!evse) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.terminateEvseTransactions: EVSE ${evseId.toString()} not found`
      )
      return
    }

    const terminationPromises: Promise<unknown>[] = []
    for (const [connectorId, connector] of evse.connectors) {
      if (connector.transactionId != null) {
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.terminateEvseTransactions: Terminating transaction ${connector.transactionId.toString()} on connector ${connectorId.toString()}`
        )
        terminationPromises.push(
          OCPP20ServiceUtils.requestStopTransaction(chargingStation, connectorId, evseId).catch(
            (error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.terminateEvseTransactions: Error terminating transaction on connector ${connectorId.toString()}:`,
                error
              )
            }
          )
        )
      }
    }

    if (terminationPromises.length > 0) {
      await Promise.all(terminationPromises)
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.terminateEvseTransactions: All transactions terminated on EVSE ${evseId.toString()}`
      )
    }
  }

  private toHandler (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (chargingStation: ChargingStation, commandPayload: any) => JsonType | Promise<JsonType>
  ): IncomingRequestHandler {
    return handler as IncomingRequestHandler
  }

  private triggerAllEvseStatusNotifications (
    chargingStation: ChargingStation,
    errorHandler: (error: unknown) => void
  ): void {
    for (const [evseId, evseStatus] of chargingStation.evses) {
      if (evseId > 0) {
        for (const [connectorId, connectorStatus] of evseStatus.connectors) {
          const resolvedConnectorStatus =
            connectorStatus.status != null
              ? (connectorStatus.status as unknown as OCPP20ConnectorStatusEnumType)
              : OCPP20ConnectorStatusEnumType.Available
          chargingStation.ocppRequestService
            .requestHandler<OCPP20StatusNotificationRequest, OCPP20StatusNotificationResponse>(
              chargingStation,
              OCPP20RequestCommand.STATUS_NOTIFICATION,
              {
                connectorId,
                connectorStatus: resolvedConnectorStatus,
                evseId,
                timestamp: new Date(),
              },
              { skipBufferingOnError: true, triggerMessage: true }
            )
            .catch(errorHandler)
        }
      }
    }
  }

  private triggerStatusNotification (
    chargingStation: ChargingStation,
    evse: OCPP20TriggerMessageRequest['evse'],
    errorHandler: (error: unknown) => void
  ): void {
    if (evse?.id !== undefined && evse.id > 0 && evse.connectorId !== undefined) {
      const evseStatus = chargingStation.evses.get(evse.id)
      const connectorStatus = evseStatus?.connectors.get(evse.connectorId)
      const resolvedStatus =
        connectorStatus?.status != null
          ? (connectorStatus.status as unknown as OCPP20ConnectorStatusEnumType)
          : OCPP20ConnectorStatusEnumType.Available
      chargingStation.ocppRequestService
        .requestHandler<OCPP20StatusNotificationRequest, OCPP20StatusNotificationResponse>(
          chargingStation,
          OCPP20RequestCommand.STATUS_NOTIFICATION,
          {
            connectorId: evse.connectorId,
            connectorStatus: resolvedStatus,
            evseId: evse.id,
            timestamp: new Date(),
          },
          { skipBufferingOnError: true, triggerMessage: true }
        )
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
    if (chargingProfile.validFrom && chargingProfile.validTo) {
      if (chargingProfile.validFrom >= chargingProfile.validTo) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: validFrom must be before validTo`
        )
        return false
      }
    }

    if (chargingProfile.validTo && chargingProfile.validTo <= now) {
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

    if (
      schedule.startSchedule &&
      chargingProfile.validFrom &&
      schedule.startSchedule < chargingProfile.validFrom
    ) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Schedule start time cannot be before profile validFrom`
      )
      return false
    }

    if (
      schedule.startSchedule &&
      chargingProfile.validTo &&
      schedule.startSchedule >= chargingProfile.validTo
    ) {
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

/**
 * Races a promise against a timeout, clearing the timer on settlement to avoid leaks.
 * @param promise - The promise to race against the timeout
 * @param ms - Timeout duration in milliseconds
 * @param label - Descriptive label for the timeout error message
 * @returns The resolved value of the original promise, or rejects with a timeout error
 */
function withTimeout<T> (promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise.finally(() => {
      clearTimeout(timer)
    }),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms.toString()}ms`))
      }, ms)
    }),
  ])
}
