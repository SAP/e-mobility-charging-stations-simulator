// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import type { ChargingStation } from '../../../charging-station/index.js'

import { OCPPError } from '../../../exception/index.js'
import {
  AttributeEnumType,
  ConnectorEnumType,
  ConnectorStatusEnum,
  DataEnumType,
  ErrorType,
  GenericDeviceModelStatusEnumType,
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
  type OCPP20ResetRequest,
  type OCPP20ResetResponse,
  type OCPP20SetVariablesRequest,
  type OCPP20SetVariablesResponse,
  OCPPVersion,
  ReasonCodeEnumType,
  ReportBaseEnumType,
  type ReportDataType,
  ResetEnumType,
  ResetStatusEnumType,
  StopTransactionReason,
} from '../../../types/index.js'
import { isAsyncFunction, logger } from '../../../utils/index.js'
import { OCPPIncomingRequestService } from '../OCPPIncomingRequestService.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'
import { OCPP20VariableManager } from './OCPP20VariableManager.js'

const moduleName = 'OCPP20IncomingRequestService'

export class OCPP20IncomingRequestService extends OCPPIncomingRequestService {
  protected payloadValidateFunctions: Map<OCPP20IncomingRequestCommand, ValidateFunction<JsonType>>

  private readonly incomingRequestHandlers: Map<
    OCPP20IncomingRequestCommand,
    IncomingRequestHandler
  >

  public constructor () {
    // if (new.target.name === moduleName) {
    //   throw new TypeError(`Cannot construct ${new.target.name} instances directly`)
    // }
    super(OCPPVersion.VERSION_201)
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

    // Use VariableManager to get variables
    const variableManager = OCPP20VariableManager.getInstance()

    // Get variables using VariableManager
    const results = variableManager.getVariables(chargingStation, commandPayload.getVariableData)
    getVariablesResponse.getVariableResult = results

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

    const variableManager = OCPP20VariableManager.getInstance()
    const results = variableManager.setVariables(chargingStation, commandPayload.setVariableData)
    setVariablesResponse.setVariableResult = results

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
          // Call the method to build the response
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
            if (!configKey.readonly) {
              variableAttributes.push({
                type: AttributeEnumType.Target as string,
                value: undefined,
              })
            }

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

        // 3. EVSE and connector information
        if (chargingStation.evses.size > 0) {
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
        } else if (chargingStation.connectors.size > 0) {
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

        if (chargingStation.evses.size > 0) {
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
        } else if (chargingStation.connectors.size > 0) {
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

    const reportData = this.buildReportData(chargingStation, commandPayload.reportBase)
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
    const reportData = this.buildReportData(chargingStation, reportBase)

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
