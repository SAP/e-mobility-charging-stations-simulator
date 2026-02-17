import type { ValidateFunction } from 'ajv'

import type { ChargingStation } from '../../../charging-station/index.js'
import type {
  OCPP20ChargingProfileType,
  OCPP20ChargingScheduleType,
  OCPP20TransactionContext,
} from '../../../types/ocpp/2.0/Transaction.js'

import { OCPPError } from '../../../exception/index.js'
import {
  AttributeEnumType,
  ConnectorEnumType,
  ConnectorStatusEnum,
  DataEnumType,
  ErrorType,
  GenericDeviceModelStatusEnumType,
  GenericStatus,
  GetVariableStatusEnumType,
  type IncomingRequestHandler,
  type JsonType,
  OCPP20ComponentName,
  OCPP20ConnectorStatusEnumType,
  OCPP20DeviceInfoVariableName,
  type OCPP20GetBaseReportRequest,
  type OCPP20GetBaseReportResponse,
  type OCPP20GetVariablesRequest,
  type OCPP20GetVariablesResponse,
  OCPP20IncomingRequestCommand,
  type OCPP20NotifyReportRequest,
  type OCPP20NotifyReportResponse,
  OCPP20RequestCommand,
  type OCPP20RequestStartTransactionRequest,
  type OCPP20RequestStartTransactionResponse,
  type OCPP20RequestStopTransactionRequest,
  type OCPP20RequestStopTransactionResponse,
  OCPP20RequiredVariableName,
  type OCPP20ResetRequest,
  type OCPP20ResetResponse,
  type OCPP20SetVariablesRequest,
  type OCPP20SetVariablesResponse,
  OCPP20TransactionEventEnumType,
  OCPPVersion,
  ReasonCodeEnumType,
  ReportBaseEnumType,
  type ReportDataType,
  RequestStartStopStatusEnumType,
  ResetEnumType,
  ResetStatusEnumType,
  SetVariableStatusEnumType,
  StopTransactionReason,
} from '../../../types/index.js'
import {
  OCPP20ChargingProfileKindEnumType,
  OCPP20ChargingProfilePurposeEnumType,
  OCPP20ChargingRateUnitEnumType,
  OCPP20ReasonEnumType,
} from '../../../types/ocpp/2.0/Transaction.js'
import { StandardParametersKey } from '../../../types/ocpp/Configuration.js'
import {
  convertToIntOrNaN,
  generateUUID,
  isAsyncFunction,
  logger,
  validateUUID,
} from '../../../utils/index.js'
import { getConfigurationKey } from '../../ConfigurationKeyUtils.js'
import { resetConnectorStatus } from '../../Helpers.js'
import { OCPPIncomingRequestService } from '../OCPPIncomingRequestService.js'
import {
  OCPPServiceUtils,
  restoreConnectorStatus,
  sendAndSetConnectorStatus,
} from '../OCPPServiceUtils.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'
import { OCPP20VariableManager } from './OCPP20VariableManager.js'
import { getVariableMetadata, VARIABLE_REGISTRY } from './OCPP20VariableRegistry.js'

const moduleName = 'OCPP20IncomingRequestService'

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
 * @see {@link validatePayload} Request payload validation method
 * @see {@link handleRequestStartTransaction} Example OCPP 2.0+ request handler
 * @see {@link OCPP20VariableManager} Variable management integration
 */

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
        OCPP20IncomingRequestCommand.CLEAR_CACHE,
        super.handleRequestClearCache.bind(this) as IncomingRequestHandler,
      ],
      [
        OCPP20IncomingRequestCommand.GET_BASE_REPORT,
        this.handleRequestGetBaseReport.bind(this) as unknown as IncomingRequestHandler,
      ],
      [
        OCPP20IncomingRequestCommand.GET_VARIABLES,
        this.handleRequestGetVariables.bind(this) as unknown as IncomingRequestHandler,
      ],
      [
        OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
        this.handleRequestStartTransaction.bind(this) as unknown as IncomingRequestHandler,
      ],
      [
        OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
        this.handleRequestStopTransaction.bind(this) as unknown as IncomingRequestHandler,
      ],
      [
        OCPP20IncomingRequestCommand.RESET,
        this.handleRequestReset.bind(this) as unknown as IncomingRequestHandler,
      ],
      [
        OCPP20IncomingRequestCommand.SET_VARIABLES,
        this.handleRequestSetVariables.bind(this) as unknown as IncomingRequestHandler,
      ],
    ])
    this.payloadValidatorFunctions = OCPP20ServiceUtils.createPayloadValidatorMap(
      OCPP20ServiceUtils.createIncomingRequestPayloadConfigs(),
      OCPP20ServiceUtils.createIncomingRequestPayloadOptions(moduleName, 'constructor'),
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
    this.validatePayload = this.validatePayload.bind(this)
  }

  public handleRequestGetVariables (
    chargingStation: ChargingStation,
    commandPayload: OCPP20GetVariablesRequest
  ): OCPP20GetVariablesResponse {
    const getVariablesResponse: OCPP20GetVariablesResponse = {
      getVariableResult: [],
    }

    const variableManager = OCPP20VariableManager.getInstance()

    // Enforce ItemsPerMessage and BytesPerMessage limits if configured
    let enforceItemsLimit = 0
    let enforceBytesLimit = 0
    try {
      const itemsCfg = getConfigurationKey(
        chargingStation,
        OCPP20RequiredVariableName.ItemsPerMessage as unknown as StandardParametersKey
      )?.value
      const bytesCfg = getConfigurationKey(
        chargingStation,
        OCPP20RequiredVariableName.BytesPerMessage as unknown as StandardParametersKey
      )?.value
      if (itemsCfg && /^\d+$/.test(itemsCfg)) {
        enforceItemsLimit = convertToIntOrNaN(itemsCfg)
      }
      if (bytesCfg && /^\d+$/.test(bytesCfg)) {
        enforceBytesLimit = convertToIntOrNaN(bytesCfg)
      }
    } catch {
      /* ignore */
    }

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

    // Enforce ItemsPerMessageSetVariables and BytesPerMessageSetVariables limits if configured
    let enforceItemsLimit = 0
    let enforceBytesLimit = 0
    try {
      const itemsCfg = getConfigurationKey(
        chargingStation,
        OCPP20RequiredVariableName.ItemsPerMessage as unknown as StandardParametersKey
      )?.value
      const bytesCfg = getConfigurationKey(
        chargingStation,
        OCPP20RequiredVariableName.BytesPerMessage as unknown as StandardParametersKey
      )?.value
      if (itemsCfg && /^\d+$/.test(itemsCfg)) {
        enforceItemsLimit = convertToIntOrNaN(itemsCfg)
      }
      if (bytesCfg && /^\d+$/.test(bytesCfg)) {
        enforceBytesLimit = convertToIntOrNaN(bytesCfg)
      }
    } catch {
      /* ignore */
    }

    const variableManager = OCPP20VariableManager.getInstance()

    // Items per message enforcement
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
          this.validatePayload(chargingStation, commandName, commandPayload)
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

  private buildReportData (
    chargingStation: ChargingStation,
    reportBase: ReportBaseEnumType
  ): ReportDataType[] {
    // Validate reportBase parameter
    if (!Object.values(ReportBaseEnumType).includes(reportBase)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.buildReportData: Invalid reportBase '${reportBase}'`
      )
      return []
    }

    const reportData: ReportDataType[] = []

    switch (reportBase) {
      case ReportBaseEnumType.ConfigurationInventory:
        // Include OCPP configuration keys
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
        // 1. Charging Station information
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

        // 2. OCPP configuration
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

        // 3. Registered OCPP 2.0.1 variables
        try {
          const variableManager = OCPP20VariableManager.getInstance()
          // Build getVariableData array from VARIABLE_REGISTRY metadata
          const getVariableData: OCPP20GetVariablesRequest['getVariableData'] = []
          for (const variableMetadata of Object.values(VARIABLE_REGISTRY)) {
            // Include instance-scoped metadata; the OCPP Variable type supports instance under variable
            const variableDescriptor: { instance?: string; name: string } = {
              name: variableMetadata.variable,
            }
            if (variableMetadata.instance) {
              variableDescriptor.instance = variableMetadata.instance
            }
            // Always request Actual first
            getVariableData.push({
              attributeType: AttributeEnumType.Actual,
              component: { name: variableMetadata.component },
              variable: variableDescriptor,
            })
            // Request MinSet/MaxSet only if supported by metadata
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
          // Group results by component+variable preserving attribute ordering Actual, MinSet, MaxSet
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
          // Normalize attribute ordering
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

        // 4. EVSE and connector information
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
          // Fallback to connectors if no EVSE structure
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
          // Fallback to connectors if no EVSE structure
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

    // Cache report data for subsequent NotifyReport requests to avoid recomputation
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
   * Handles OCPP 2.0 Reset request from central system with enhanced EVSE-specific support
   * Initiates station or EVSE reset based on request parameters and transaction states
   * @param chargingStation - The charging station instance processing the request
   * @param commandPayload - Reset request payload with type and optional EVSE ID
   * @returns Promise resolving to ResetResponse indicating operation status
   */

  private async handleRequestReset (
    chargingStation: ChargingStation,
    commandPayload: OCPP20ResetRequest
  ): Promise<OCPP20ResetResponse> {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Reset request received with type ${commandPayload.type}${commandPayload.evseId !== undefined ? ` for EVSE ${commandPayload.evseId.toString()}` : ''}`
    )

    const { evseId, type } = commandPayload

    if (evseId !== undefined && evseId > 0) {
      // Check if the charging station supports EVSE-specific reset
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

      // Check if the EVSE exists
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

    // Check for active transactions
    const hasActiveTransactions = chargingStation.getNumberOfRunningTransactions() > 0

    // Check for EVSE-specific active transactions if evseId is provided
    let hasEvseActiveTransactions = false
    if (evseId !== undefined && evseId > 0) {
      // Check if there are active transactions on the specific EVSE
      const evse = chargingStation.evses.get(evseId)
      if (evse) {
        for (const [, connector] of evse.connectors) {
          if (connector.transactionId !== undefined) {
            hasEvseActiveTransactions = true
            break
          }
        }
      }
    }

    try {
      if (type === ResetEnumType.Immediate) {
        if (evseId !== undefined) {
          // EVSE-specific immediate reset
          if (hasEvseActiveTransactions) {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Immediate EVSE reset with active transaction, will terminate transaction and reset EVSE ${evseId.toString()}`
            )

            // Implement EVSE-specific transaction termination
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
            // Reset EVSE immediately
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Immediate EVSE reset without active transactions for EVSE ${evseId.toString()}`
            )

            this.scheduleEvseReset(chargingStation, evseId, false)

            return {
              status: ResetStatusEnumType.Accepted,
            }
          }
        } else {
          // Charging station immediate reset
          if (hasActiveTransactions) {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: Immediate reset with active transactions, will terminate transactions and reset`
            )

            // Implement proper transaction termination with TransactionEventRequest
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

            // Send StatusNotification(Unavailable) for all connectors
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
        // OnIdle reset
        if (evseId !== undefined) {
          // EVSE-specific OnIdle reset
          if (hasEvseActiveTransactions) {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: OnIdle EVSE reset scheduled for EVSE ${evseId.toString()}, waiting for transaction completion`
            )

            // Monitor EVSE for transaction completion and schedule reset when idle
            this.scheduleEvseResetOnIdle(chargingStation, evseId)

            return {
              status: ResetStatusEnumType.Scheduled,
            }
          } else {
            // No active transactions on EVSE, reset immediately
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: OnIdle EVSE reset without active transactions for EVSE ${evseId.toString()}`
            )

            this.scheduleEvseReset(chargingStation, evseId, false)

            return {
              status: ResetStatusEnumType.Accepted,
            }
          }
        } else {
          // Charging station OnIdle reset
          if (hasActiveTransactions) {
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: OnIdle reset scheduled, waiting for transaction completion`
            )

            this.scheduleResetOnIdle(chargingStation)

            return {
              status: ResetStatusEnumType.Scheduled,
            }
          } else {
            // No active transactions, reset immediately
            logger.info(
              `${chargingStation.logPrefix()} ${moduleName}.handleRequestReset: OnIdle reset without active transactions, resetting immediately`
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

    // Validate that EVSE ID is provided
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

    // Get the first connector for this EVSE
    const evse = chargingStation.evses.get(evseId)
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

    // Check if connector is available for a new transaction
    if (connectorStatus.transactionStarted === true) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Connector ${connectorId.toString()} already has an active transaction`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        transactionId: generateUUID(),
      }
    }

    // Authorize idToken - OCPP 2.0 always uses unified auth system
    let isAuthorized = false
    try {
      // Use unified auth system - pass idToken.idToken as string
      isAuthorized = await OCPPServiceUtils.isIdTagAuthorizedUnified(
        chargingStation,
        connectorId,
        idToken.idToken
      )
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

    // Authorize groupIdToken if provided
    if (groupIdToken != null) {
      let isGroupAuthorized = false
      try {
        // Use unified auth system for group token
        isGroupAuthorized = await OCPPServiceUtils.isIdTagAuthorizedUnified(
          chargingStation,
          connectorId,
          groupIdToken.idToken
        )
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

    // Validate charging profile if provided
    if (chargingProfile != null) {
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
      // Set connector transaction state
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Setting transaction state for connector ${connectorId.toString()}, transaction ID: ${transactionId}`
      )
      connectorStatus.transactionStarted = true
      connectorStatus.transactionId = transactionId
      // Reset sequence number for new transaction (OCPP 2.0.1 compliance)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(chargingStation, connectorId)
      connectorStatus.transactionIdTag = idToken.idToken
      connectorStatus.transactionStart = new Date()
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.remoteStartId = remoteStartId
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Transaction state set successfully for connector ${connectorId.toString()}`
      )

      // Update connector status to Occupied
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Updating connector ${connectorId.toString()} status to Occupied`
      )
      await sendAndSetConnectorStatus(
        chargingStation,
        connectorId,
        ConnectorStatusEnum.Occupied,
        evseId
      )

      // Store charging profile if provided
      if (chargingProfile != null) {
        connectorStatus.chargingProfiles ??= []
        connectorStatus.chargingProfiles.push(chargingProfile)
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestStartTransaction: Charging profile stored for transaction ${transactionId}`
        )
      }

      // Send TransactionEvent Started notification to CSMS with context-aware trigger reason selection
      // FR: F01.FR.17 - remoteStartId SHALL be included in TransactionEventRequest
      // FR: F02.FR.05 - idToken SHALL be included in TransactionEventRequest
      const context: OCPP20TransactionContext = {
        command: 'RequestStartTransaction',
        source: 'remote_command',
      }

      await OCPP20ServiceUtils.sendTransactionEvent(
        chargingStation,
        OCPP20TransactionEventEnumType.Started,
        context,
        connectorId,
        transactionId,
        {
          idToken,
          remoteStartId,
        }
      )

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
    // Send status notification for unavailable EVSE
    this.sendEvseStatusNotifications(
      chargingStation,
      evseId,
      OCPP20ConnectorStatusEnumType.Unavailable
    )

    // Schedule the actual EVSE reset
    setImmediate(() => {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.scheduleEvseReset: Executing EVSE ${evseId.toString()} reset${hasActiveTransactions ? ' after transaction termination' : ''}`
      )
      // Reset EVSE - this would typically involve resetting the EVSE hardware/software
      // For now, we'll restore connectors to available status after a short delay
      setTimeout(() => {
        const evse = chargingStation.evses.get(evseId)
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
    // Monitor for transaction completion and reset when idle
    const monitorInterval = setInterval(() => {
      const evse = chargingStation.evses.get(evseId)
      if (evse) {
        let hasActiveTransactions = false
        for (const [, connector] of evse.connectors) {
          if (connector.transactionId !== undefined) {
            hasActiveTransactions = true
            break
          }
        }

        if (!hasActiveTransactions) {
          clearInterval(monitorInterval)
          logger.info(
            `${chargingStation.logPrefix()} ${moduleName}.scheduleEvseResetOnIdle: EVSE ${evseId.toString()} is now idle, executing reset`
          )
          this.scheduleEvseReset(chargingStation, evseId, false)
        }
      } else {
        clearInterval(monitorInterval)
      }
    }, 5000) // Check every 5 seconds
  }

  /**
   * Schedules charging station reset on idle (when no active transactions)
   * @param chargingStation - The charging station instance
   */
  private scheduleResetOnIdle (chargingStation: ChargingStation): void {
    // Monitor for transaction completion and reset when idle
    const monitorInterval = setInterval(() => {
      const hasActiveTransactions = chargingStation.getNumberOfRunningTransactions() > 0

      if (!hasActiveTransactions) {
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
    }, 5000) // Check every 5 seconds
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
    const evse = chargingStation.evses.get(evseId)
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

  private async sendNotifyReportRequest (
    chargingStation: ChargingStation,
    request: OCPP20GetBaseReportRequest,
    response: OCPP20GetBaseReportResponse
  ): Promise<void> {
    const { reportBase, requestId } = request
    // Use cached report data if available (computed during GetBaseReport handling)
    const cached = this.reportDataCache.get(requestId)
    const reportData = cached ?? this.buildReportData(chargingStation, reportBase)

    // Fragment report data if needed (OCPP2 spec recommends max 100 items per message)
    const maxItemsPerMessage = 100
    const chunks = []
    for (let i = 0; i < reportData.length; i += maxItemsPerMessage) {
      chunks.push(reportData.slice(i, i + maxItemsPerMessage))
    }

    // Ensure we always send at least one message
    if (chunks.length === 0) {
      chunks.push(undefined) // undefined means reportData will be omitted from the request
    }

    // Send fragmented NotifyReport messages
    for (let seqNo = 0; seqNo < chunks.length; seqNo++) {
      const isLastChunk = seqNo === chunks.length - 1
      const chunk = chunks[seqNo]

      const notifyReportRequest: OCPP20NotifyReportRequest = {
        generatedAt: new Date(),
        requestId,
        seqNo,
        tbc: !isLastChunk,
        // Only include reportData if chunk is defined and not empty
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
    // Clear cache for requestId after successful completion
    this.reportDataCache.delete(requestId)
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
        if (connector.transactionId !== undefined) {
          logger.info(
            `${chargingStation.logPrefix()} ${moduleName}.terminateAllTransactions: Terminating transaction ${connector.transactionId.toString()} on connector ${connectorId.toString()}`
          )
          // Use the proper OCPP 2.0 transaction termination method
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
    const evse = chargingStation.evses.get(evseId)
    if (!evse) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.terminateEvseTransactions: EVSE ${evseId.toString()} not found`
      )
      return
    }

    const terminationPromises: Promise<unknown>[] = []
    for (const [connectorId, connector] of evse.connectors) {
      if (connector.transactionId !== undefined) {
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.terminateEvseTransactions: Terminating transaction ${connector.transactionId.toString()} on connector ${connectorId.toString()}`
        )
        // Use the proper OCPP 2.0 transaction termination method
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

  private validateChargingProfile (
    chargingStation: ChargingStation,
    chargingProfile: OCPP20ChargingProfileType,
    evseId: number
  ): boolean {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Validating charging profile ${chargingProfile.id.toString()} for EVSE ${evseId.toString()}`
    )

    // Basic validation - check required fields
    if (!chargingProfile.id || !chargingProfile.stackLevel) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Invalid charging profile - missing required fields`
      )
      return false
    }

    // Validate stack level range (OCPP 2.0 spec: 0-9)
    if (chargingProfile.stackLevel < 0 || chargingProfile.stackLevel > 9) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Invalid stack level ${chargingProfile.stackLevel.toString()}, must be 0-9`
      )
      return false
    }

    // Validate charging profile ID is positive
    if (chargingProfile.id <= 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Invalid charging profile ID ${chargingProfile.id.toString()}, must be positive`
      )
      return false
    }

    // Validate EVSE compatibility
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

    // Validate charging schedules array is not empty
    if (chargingProfile.chargingSchedule.length === 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Charging profile must contain at least one charging schedule`
      )
      return false
    }

    // Time constraints validation
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

    // Validate recurrency kind compatibility with profile kind
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

    // Validate each charging schedule
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

    // Profile purpose specific validations
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
        // ChargingStationExternalConstraints must apply to EVSE 0 (entire station)
        if (evseId !== 0) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfilePurpose: ChargingStationExternalConstraints must apply to EVSE 0, got EVSE ${evseId.toString()}`
          )
          return false
        }
        break

      case OCPP20ChargingProfilePurposeEnumType.ChargingStationMaxProfile:
        // ChargingStationMaxProfile must apply to EVSE 0 (entire station)
        if (evseId !== 0) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfilePurpose: ChargingStationMaxProfile must apply to EVSE 0, got EVSE ${evseId.toString()}`
          )
          return false
        }
        break

      case OCPP20ChargingProfilePurposeEnumType.TxDefaultProfile:
        // TxDefaultProfile can apply to EVSE 0 or specific EVSE
        // No additional constraints beyond general EVSE validation
        break

      case OCPP20ChargingProfilePurposeEnumType.TxProfile:
        // TxProfile must apply to a specific EVSE (not 0)
        if (evseId === 0) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfilePurpose: TxProfile cannot apply to EVSE 0, must target specific EVSE`
          )
          return false
        }

        // TxProfile should have a transactionId when used with active transaction
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

    // Validate schedule ID is positive
    if (schedule.id <= 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Invalid schedule ID ${schedule.id.toString()}, must be positive`
      )
      return false
    }

    // Validate charging schedule periods array is not empty
    if (schedule.chargingSchedulePeriod.length === 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Schedule must contain at least one charging schedule period`
      )
      return false
    }

    // Validate charging rate unit is valid (type system ensures it exists)
    if (!Object.values(OCPP20ChargingRateUnitEnumType).includes(schedule.chargingRateUnit)) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Invalid charging rate unit: ${schedule.chargingRateUnit}`
      )
      return false
    }

    // Validate duration constraints
    if (schedule.duration !== undefined && schedule.duration <= 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Schedule duration must be positive if specified`
      )
      return false
    }

    // Validate minimum charging rate if specified
    if (schedule.minChargingRate !== undefined && schedule.minChargingRate < 0) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Minimum charging rate cannot be negative`
      )
      return false
    }

    // Validate start schedule time constraints
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

    // Validate charging schedule periods
    let previousStartPeriod = -1
    for (const [periodIndex, period] of schedule.chargingSchedulePeriod.entries()) {
      // Validate start period is non-negative and increasing
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

      // Validate charging limit is positive
      if (period.limit <= 0) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Period ${periodIndex.toString()} charging limit must be positive`
        )
        return false
      }

      // Validate minimum charging rate constraint
      if (schedule.minChargingRate !== undefined && period.limit < schedule.minChargingRate) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Period ${periodIndex.toString()} limit cannot be below minimum charging rate`
        )
        return false
      }

      // Validate number of phases constraints
      if (period.numberPhases !== undefined) {
        if (period.numberPhases < 1 || period.numberPhases > 3) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.validateChargingSchedule: Period ${periodIndex.toString()} number of phases must be 1-3`
          )
          return false
        }

        // If phaseToUse is specified, validate it's within the number of phases
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

  /**
   * Validates incoming OCPP 2.0 request payload against JSON schema
   * @param chargingStation - The charging station instance processing the request
   * @param commandName - OCPP 2.0 command name to validate against
   * @param commandPayload - JSON payload to validate
   * @returns True if payload validation succeeds, false otherwise
   */
  private validatePayload (
    chargingStation: ChargingStation,
    commandName: OCPP20IncomingRequestCommand,
    commandPayload: JsonType
  ): boolean {
    if (this.payloadValidatorFunctions.has(commandName)) {
      return this.validateIncomingRequestPayload(chargingStation, commandName, commandPayload)
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema validation function found for command '${commandName}' PDU validation`
    )
    return false
  }
}
