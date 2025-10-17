// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { ValidateFunction } from 'ajv'

import type { ChargingStation } from '../../../charging-station/index.js'

import { OCPPError } from '../../../exception/index.js'
import {
  type ComponentType,
  ErrorType,
  type EVSEType,
  GenericDeviceModelStatusEnumType,
  type IncomingRequestHandler,
  type JsonType,
  type OCPP20ClearCacheRequest,
  type OCPP20GetBaseReportRequest,
  type OCPP20GetBaseReportResponse,
  OCPP20IncomingRequestCommand,
  type OCPP20NotifyReportRequest,
  type OCPP20NotifyReportResponse,
  OCPP20RequestCommand,
  OCPPVersion,
  ReportBaseEnumType,
  type ReportDataType,
  type VariableAttributeType,
  type VariableCharacteristicsType,
  type VariableType,
} from '../../../types/index.js'
import { isAsyncFunction, logger } from '../../../utils/index.js'
import { OCPPIncomingRequestService } from '../OCPPIncomingRequestService.js'
import { OCPP20Constants } from './OCPP20Constants.js'
import { OCPP20ServiceUtils } from './OCPP20ServiceUtils.js'

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
      [OCPP20IncomingRequestCommand.CLEAR_CACHE, this.handleRequestClearCache.bind(this)],
      [OCPP20IncomingRequestCommand.GET_BASE_REPORT, this.handleRequestGetBaseReport.bind(this)],
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
    ])
    this.validatePayload = this.validatePayload.bind(this)
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
    // Emit command name event to allow delayed handling
    this.emit(commandName, chargingStation, commandPayload, response)
  }

  private handleRequestGetBaseReport (
    chargingStation: ChargingStation,
    commandPayload: OCPP20GetBaseReportRequest
  ): OCPP20GetBaseReportResponse {
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetBaseReport: GetBaseReport request received with requestId ${commandPayload.requestId} and reportBase ${commandPayload.reportBase}`
    )
    // Build report data to check if any data is available
    const reportData = this.buildReportData(chargingStation, commandPayload.reportBase)
    if (reportData.length === 0) {
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetBaseReport: No data available for reportBase ${commandPayload.reportBase}`
      )
      return {
        status: GenericDeviceModelStatusEnumType.EmptyResultSet,
      }
    }
    // Trigger NotifyReport asynchronously
    this.sendNotifyReport(chargingStation, commandPayload.requestId, reportData).catch(
      (error: Error) => {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.handleRequestGetBaseReport: Error sending NotifyReport:`,
          error
        )
      }
    )
    return {
      status: GenericDeviceModelStatusEnumType.Accepted,
    }
  }

  private async sendNotifyReport (
    chargingStation: ChargingStation,
    requestId: number,
    reportData: ReportDataType[]
  ): Promise<void> {
    await chargingStation.ocppRequestService.requestHandler<
      OCPP20NotifyReportRequest,
      OCPP20NotifyReportResponse
    >(chargingStation, OCPP20RequestCommand.NOTIFY_REPORT, {
      reportData,
      requestId,
      seqNo: 0,
      tbc: false,
    })
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.sendNotifyReport: NotifyReport sent for requestId ${requestId} with ${reportData.length} report items`
    )
  }

  private buildReportData (
    chargingStation: ChargingStation,
    reportBase: string
  ): ReportDataType[] {
    // Validate reportBase parameter
    if (!Object.values(ReportBaseEnumType).includes(reportBase as ReportBaseEnumType)) {
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
                name: OCPP20Constants.ComponentName.OCPP_COMM_CTRLR,
              },
              variable: {
                name: configKey.key,
              },
              variableAttribute: [
                {
                  type: 'Actual',
                  value: configKey.value,
                },
              ],
              variableCharacteristics: {
                dataType: 'string',
                supportsMonitoring: false,
              },
            })
          }
        }
        break

      case ReportBaseEnumType.FullInventory:
        // Include all device model variables
        // 1. Station information
        if (chargingStation.stationInfo) {
          const stationInfo = chargingStation.stationInfo
          if (stationInfo.chargePointModel) {
            reportData.push({
              component: { name: OCPP20Constants.ComponentName.CHARGING_STATION },
              variable: { name: 'Model' },
              variableAttribute: [{ type: 'Actual', value: stationInfo.chargePointModel }],
              variableCharacteristics: { dataType: 'string', supportsMonitoring: false },
            })
          }
          if (stationInfo.chargePointVendor) {
            reportData.push({
              component: { name: OCPP20Constants.ComponentName.CHARGING_STATION },
              variable: { name: 'VendorName' },
              variableAttribute: [{ type: 'Actual', value: stationInfo.chargePointVendor }],
              variableCharacteristics: { dataType: 'string', supportsMonitoring: false },
            })
          }
          if (stationInfo.chargePointSerialNumber) {
            reportData.push({
              component: { name: OCPP20Constants.ComponentName.CHARGING_STATION },
              variable: { name: 'SerialNumber' },
              variableAttribute: [{ type: 'Actual', value: stationInfo.chargePointSerialNumber }],
              variableCharacteristics: { dataType: 'string', supportsMonitoring: false },
            })
          }
          if (stationInfo.firmwareVersion) {
            reportData.push({
              component: { name: OCPP20Constants.ComponentName.CHARGING_STATION },
              variable: { name: 'FirmwareVersion' },
              variableAttribute: [{ type: 'Actual', value: stationInfo.firmwareVersion }],
              variableCharacteristics: { dataType: 'string', supportsMonitoring: false },
            })
          }
        }

        // 2. OCPP configuration
        if (chargingStation.ocppConfiguration?.configurationKey) {
          for (const configKey of chargingStation.ocppConfiguration.configurationKey) {
            reportData.push({
              component: { name: 'OCPPCommCtrlr' },
              variable: { name: configKey.key },
              variableAttribute: [{ type: 'Actual', value: configKey.value }],
              variableCharacteristics: { dataType: 'string', supportsMonitoring: false },
            })
          }
        }

        // 3. EVSE and connector information
        if (chargingStation.evses.size > 0) {
          for (const [evseId, evse] of chargingStation.evses) {
            reportData.push({
              component: {
                evse: { id: evseId },
                name: 'EVSE',
              },
              variable: { name: 'AvailabilityState' },
              variableAttribute: [{ type: 'Actual', value: evse.availability }],
              variableCharacteristics: { dataType: 'string', supportsMonitoring: true },
            })
            if (evse.connectors) {
              for (const [connectorId, connector] of evse.connectors) {
                reportData.push({
                  component: {
                    evse: { connectorId, id: evseId },
                    name: 'Connector',
                  },
                  variable: { name: 'ConnectorType' },
                  variableAttribute: [
                    { type: 'Actual', value: String(connector.connectorType) },
                  ],
                  variableCharacteristics: { dataType: 'string', supportsMonitoring: false },
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
                  name: 'Connector',
                },
                variable: { name: 'ConnectorType' },
                variableAttribute: [{ type: 'Actual', value: String(connector.connectorType) }],
                variableCharacteristics: { dataType: 'string', supportsMonitoring: false },
              })
            }
          }
        }
        break

      case ReportBaseEnumType.SummaryInventory:
        // Include essential variables only
        if (chargingStation.stationInfo) {
          const stationInfo = chargingStation.stationInfo
          if (stationInfo.chargePointModel) {
            reportData.push({
              component: { name: OCPP20Constants.ComponentName.CHARGING_STATION },
              variable: { name: 'Model' },
              variableAttribute: [{ type: 'Actual', value: stationInfo.chargePointModel }],
              variableCharacteristics: { dataType: 'string', supportsMonitoring: false },
            })
          }
          if (stationInfo.chargePointVendor) {
            reportData.push({
              component: { name: OCPP20Constants.ComponentName.CHARGING_STATION },
              variable: { name: 'VendorName' },
              variableAttribute: [{ type: 'Actual', value: stationInfo.chargePointVendor }],
              variableCharacteristics: { dataType: 'string', supportsMonitoring: false },
            })
          }
          if (stationInfo.firmwareVersion) {
            reportData.push({
              component: { name: OCPP20Constants.ComponentName.CHARGING_STATION },
              variable: { name: 'FirmwareVersion' },
              variableAttribute: [{ type: 'Actual', value: stationInfo.firmwareVersion }],
              variableCharacteristics: { dataType: 'string', supportsMonitoring: false },
            })
          }
        }
        break

      default:
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.buildReportData: Unknown reportBase '${reportBase}'`
        )
    }

    return reportData
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
