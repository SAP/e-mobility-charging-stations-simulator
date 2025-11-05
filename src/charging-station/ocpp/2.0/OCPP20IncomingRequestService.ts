// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import type { ChargingStation } from '../../../charging-station/index.js'
import type {
  OCPP20ChargingProfileType,
  OCPP20IdTokenType,
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
  type OCPP20ClearCacheRequest,
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
import { restoreConnectorStatus, sendAndSetConnectorStatus } from '../OCPPServiceUtils.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'
import { OCPP20VariableManager } from './OCPP20VariableManager.js'
import { getVariableMetadata, VARIABLE_REGISTRY } from './OCPP20VariableRegistry.js'

const moduleName = 'OCPP20IncomingRequestService'

export class OCPP20IncomingRequestService extends OCPPIncomingRequestService {
  protected payloadValidateFunctions: Map<OCPP20IncomingRequestCommand, ValidateFunction<JsonType>>

  private readonly incomingRequestHandlers: Map<
    OCPP20IncomingRequestCommand,
    IncomingRequestHandler
  >

  private readonly reportDataCache: Map<number, ReportDataType[]>

  public constructor () {
    // if (new.target.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target.name} instances directly`)
    // }
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
        this.handleRequestRequestStartTransaction.bind(this) as unknown as IncomingRequestHandler,
      ],
      [
        OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
        this.handleRequestRequestStopTransaction.bind(this) as unknown as IncomingRequestHandler,
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
    this.payloadValidateFunctions = new Map<
      OCPP20IncomingRequestCommand,
      ValidateFunction<JsonType>
    >([
      [
        OCPP20IncomingRequestCommand.CLEAR_CACHE,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20ClearCacheRequest>(
            'assets/json-schemas/ocpp/2.0/ClearCacheRequest.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20IncomingRequestCommand.GET_BASE_REPORT,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20GetBaseReportRequest>(
            'assets/json-schemas/ocpp/2.0/GetBaseReportRequest.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20IncomingRequestCommand.GET_VARIABLES,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20GetVariablesRequest>(
            'assets/json-schemas/ocpp/2.0/GetVariablesRequest.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20RequestStopTransactionRequest>(
            'assets/json-schemas/ocpp/2.0/RequestStopTransactionRequest.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20IncomingRequestCommand.RESET,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20ResetRequest>(
            'assets/json-schemas/ocpp/2.0/ResetRequest.json',
            moduleName,
            'constructor'
          )
        ),
      ],
      [
        OCPP20IncomingRequestCommand.SET_VARIABLES,
        this.ajv.compile(
          OCPP20ServiceUtils.parseJsonSchemaFile<OCPP20SetVariablesRequest>(
            'assets/json-schemas/ocpp/2.0/SetVariablesRequest.json',
            moduleName,
            'constructor'
          )
        ),
      ],
    ])
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
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetVariables: Processed ${String(commandPayload.getVariableData.length)} variable requests, returning ${String(results.length)} results`
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
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestSetVariables: Processed ${String(commandPayload.setVariableData.length)} variable requests, returning ${String(results.length)} results`
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
        )} while the charging station is in pending state on the central server`,
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
        )} while the charging station is not registered on the central server`,
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

  private async handleRequestRequestStartTransaction (
    chargingStation: ChargingStation,
    commandPayload: OCPP20RequestStartTransactionRequest
  ): Promise<OCPP20RequestStartTransactionResponse> {
    const { chargingProfile, evseId, groupIdToken, idToken, remoteStartId } = commandPayload
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: Remote start transaction request received on EVSE ${evseId?.toString() ?? 'undefined'} with idToken ${idToken.idToken} and remoteStartId ${remoteStartId.toString()}`
    )

    // Validate that EVSE ID is provided
    if (evseId == null) {
      const errorMsg = 'EVSE ID is required for RequestStartTransaction'
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: ${errorMsg}`
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
      const errorMsg = `EVSE ${String(evseId)} not found on charging station`
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: ${errorMsg}`
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
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: ${errorMsg}`
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
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: Connector ${connectorId.toString()} already has an active transaction`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        transactionId: generateUUID(),
      }
    }

    // Authorize idToken
    let isAuthorized = false
    try {
      isAuthorized = await this.isIdTokenAuthorized(chargingStation, idToken)
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: Authorization error for ${idToken.idToken}:`,
        error
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        transactionId: generateUUID(),
      }
    }

    if (!isAuthorized) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: IdToken ${idToken.idToken} is not authorized`
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
        isGroupAuthorized = await this.isIdTokenAuthorized(chargingStation, groupIdToken)
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: Group authorization error for ${groupIdToken.idToken}:`,
          error
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          transactionId: generateUUID(),
        }
      }

      if (!isGroupAuthorized) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: GroupIdToken ${groupIdToken.idToken} is not authorized`
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
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: Charging profile validation error:`,
          error
        )
        return {
          status: RequestStartStopStatusEnumType.Rejected,
          transactionId: generateUUID(),
        }
      }

      if (!isValidProfile) {
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: Invalid charging profile`
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
      connectorStatus.transactionStarted = true
      connectorStatus.transactionId = transactionId
      connectorStatus.transactionIdTag = idToken.idToken
      connectorStatus.transactionStart = new Date()
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.remoteStartId = remoteStartId

      // Update connector status to Occupied
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
        // TODO: Implement charging profile storage
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: Charging profile stored for transaction ${transactionId} (TODO: implement profile storage)`
        )
      }

      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: Remote start transaction accepted on EVSE ${evseId.toString()}, connector ${connectorId.toString()} with transaction ID ${transactionId} for idToken ${idToken.idToken}`
      )

      return {
        status: RequestStartStopStatusEnumType.Accepted,
        transactionId,
      }
    } catch (error) {
      await this.resetConnectorOnStartTransactionError(chargingStation, connectorId, evseId)
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStartTransaction: Error starting transaction:`,
        error
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
        transactionId: generateUUID(),
      }
    }
  }

  private async handleRequestRequestStopTransaction (
    chargingStation: ChargingStation,
    commandPayload: OCPP20RequestStopTransactionRequest
  ): Promise<OCPP20RequestStopTransactionResponse> {
    const { transactionId } = commandPayload
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStopTransaction: Remote stop transaction request received for transaction ID ${transactionId}`
    )

    if (!validateUUID(transactionId)) {
      logger.warn(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStopTransaction: Invalid transaction ID format (expected UUID): ${transactionId}`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
      }
    }

    const connectorId = chargingStation.getConnectorIdByTransactionId(transactionId)
    if (connectorId == null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStopTransaction: Transaction ID ${transactionId} not found on any connector`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
      }
    }

    try {
      const stopResponse = await OCPP20ServiceUtils.requestStopTransaction(
        chargingStation,
        connectorId
      )

      if (stopResponse.status === GenericStatus.Accepted) {
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStopTransaction: Remote stop transaction accepted for transaction ID ${transactionId} on connector ${connectorId.toString()}`
        )
        return {
          status: RequestStartStopStatusEnumType.Accepted,
        }
      }

      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStopTransaction: Remote stop transaction rejected for transaction ID ${transactionId} on connector ${connectorId.toString()}`
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
      }
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestRequestStopTransaction: Error occurred during remote stop transaction for transaction ID ${transactionId} on connector ${connectorId.toString()}:`,
        error
      )
      return {
        status: RequestStartStopStatusEnumType.Rejected,
      }
    }
  }

  private handleRequestReset (
    chargingStation: ChargingStation,
    commandPayload: OCPP20ResetRequest
  ): OCPP20ResetResponse {
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
            additionalInfo: `EVSE ${evseId.toString()} does not exist on this charging station`,
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

            // TODO: Implement EVSE-specific transaction termination
            // For now, accept and schedule the reset
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

            // TODO: Implement proper transaction termination with TransactionEventRequest
            // For now, reset immediately and let the reset handle transaction cleanup
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

            // TODO: Send StatusNotification(Unavailable) for all connectors
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

            // TODO: Implement proper monitoring of EVSE transaction completion
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

  // Helper methods for RequestStartTransaction
  private async isIdTokenAuthorized (
    chargingStation: ChargingStation,
    idToken: OCPP20IdTokenType
  ): Promise<boolean> {
    // TODO: Implement proper authorization logic
    // This should check:
    // 1. Local authorization list if enabled
    // 2. Remote authorization via AuthorizeRequest if needed
    // 3. Cache for known tokens
    // 4. Return false if authorization fails

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.isIdTokenAuthorized: Validating idToken ${idToken.idToken} of type ${idToken.type}`
    )

    // For now, return true to allow development/testing
    // TODO: Implement actual async authorization logic
    return await Promise.resolve(true)
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

  private scheduleEvseReset (
    chargingStation: ChargingStation,
    evseId: number,
    terminateTransactions: boolean
  ): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.scheduleEvseReset: Scheduling EVSE ${evseId.toString()} reset${terminateTransactions ? ' with transaction termination' : ''}`
    )

    setTimeout(
      () => {
        // TODO: Implement actual EVSE-specific reset logic
        // This should:
        // 1. Send StatusNotification(Unavailable) for EVSE connectors (B11.FR.08)
        // 2. Terminate active transactions if needed
        // 3. Reset EVSE state
        // 4. Restore EVSE to appropriate state after reset

        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.scheduleEvseReset: EVSE ${evseId.toString()} reset executed`
        )
      },
      terminateTransactions ? 1000 : 100
    ) // Small delay for immediate execution
  }

  private scheduleEvseResetOnIdle (chargingStation: ChargingStation, evseId: number): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.scheduleEvseResetOnIdle: Monitoring EVSE ${evseId.toString()} for transaction completion`
    )

    // TODO: Implement proper monitoring logic
    const checkInterval = setInterval(() => {
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
          clearInterval(checkInterval)
          this.scheduleEvseReset(chargingStation, evseId, false)
        }
      }
    }, 5000) // Check every 5 seconds
  }

  private scheduleResetOnIdle (chargingStation: ChargingStation): void {
    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.scheduleResetOnIdle: Monitoring charging station for transaction completion`
    )

    // TODO: Implement proper monitoring logic
    const checkInterval = setInterval(() => {
      const hasActiveTransactions = chargingStation.getNumberOfRunningTransactions() > 0

      if (!hasActiveTransactions) {
        clearInterval(checkInterval)
        // TODO: Use OCPP2 stop transaction reason when implemented
        chargingStation.reset(StopTransactionReason.REMOTE).catch((error: unknown) => {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.scheduleResetOnIdle: Error during scheduled reset:`,
            error
          )
        })
      }
    }, 5000) // Check every 5 seconds
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

  private validateChargingProfile (
    chargingStation: ChargingStation,
    chargingProfile: OCPP20ChargingProfileType,
    evseId: number
  ): boolean {
    // TODO: Implement proper charging profile validation
    // This should validate:
    // 1. Profile structure and required fields
    // 2. Schedule periods and limits
    // 3. Compatibility with EVSE capabilities
    // 4. Time constraints and validity

    logger.debug(
      `${chargingStation.logPrefix()} ${moduleName}.validateChargingProfile: Validating charging profile ${String(chargingProfile.id)} for EVSE ${String(evseId)}`
    )

    // For now, return true to allow development/testing
    return true
  }

  private validatePayload (
    chargingStation: ChargingStation,
    commandName: OCPP20IncomingRequestCommand,
    commandPayload: JsonType
  ): boolean {
    if (this.payloadValidateFunctions.has(commandName)) {
      return this.validateIncomingRequestPayload(chargingStation, commandName, commandPayload)
    }
    logger.warn(
      `${chargingStation.logPrefix()} ${moduleName}.validatePayload: No JSON schema validation function found for command '${commandName}' PDU validation`
    )
    return false
  }
}
