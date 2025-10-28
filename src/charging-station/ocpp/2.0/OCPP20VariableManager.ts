// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { millisecondsToSeconds } from 'date-fns'

import {
  AttributeEnumType,
  type ComponentType,
  GetVariableStatusEnumType,
  OCPP20ComponentName,
  type OCPP20GetVariableDataType,
  type OCPP20GetVariableResultType,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  type OCPP20SetVariableDataType,
  type OCPP20SetVariableResultType,
  ReasonCodeEnumType,
  SetVariableStatusEnumType,
  type VariableType,
} from '../../../types/index.js'
import { OCPP20VendorVariableName } from '../../../types/ocpp/2.0/Variables.js'
import { StandardParametersKey } from '../../../types/ocpp/Configuration.js'
import { Constants, convertToIntOrNaN, logger } from '../../../utils/index.js'
import { type ChargingStation } from '../../ChargingStation.js'
import {
  addConfigurationKey,
  getConfigurationKey,
  setConfigurationKeyValue,
} from '../../ConfigurationKeyUtils.js'
import { getVariableCharacteristics } from './OCPP20VariableCharacteristicsRegistry.js'
import { DEFAULT_MAX_LENGTH, VARIABLE_CONSTRAINTS } from './OCPP20VariableMetadata.js'

// Persistent configuration-backed variables (original case).
const PERSISTENT_VARIABLES = new Set<string>([
  // Optional configuration keys
  OCPP20OptionalVariableName.HeartbeatInterval as string,
  OCPP20OptionalVariableName.WebSocketPingInterval as string,
  OCPP20RequiredVariableName.BytesPerMessage as string,
  // Required configuration keys
  OCPP20RequiredVariableName.EVConnectionTimeOut as string,
  OCPP20RequiredVariableName.ItemsPerMessage as string,
  OCPP20RequiredVariableName.LocalAuthorizeOffline as string,
  OCPP20RequiredVariableName.LocalPreAuthorize as string,
  OCPP20RequiredVariableName.MessageAttemptInterval as string,
  OCPP20RequiredVariableName.MessageAttempts as string,
  OCPP20RequiredVariableName.MessageTimeout as string,
  OCPP20RequiredVariableName.NetworkConfigurationPriority as string,
  OCPP20RequiredVariableName.NetworkProfileConnectionAttempts as string,
  OCPP20RequiredVariableName.OfflineThreshold as string,
  OCPP20RequiredVariableName.OrganizationName as string,
  OCPP20RequiredVariableName.ReportingValueSize as string,
  OCPP20RequiredVariableName.ResetRetries as string,
  OCPP20RequiredVariableName.SecurityProfile as string,
  OCPP20RequiredVariableName.StopTxOnEVSideDisconnect as string,
  OCPP20RequiredVariableName.StopTxOnInvalidId as string,
  OCPP20RequiredVariableName.TimeSource as string,
  OCPP20RequiredVariableName.TxEndedMeasurands as string,
  OCPP20RequiredVariableName.TxStartedMeasurands as string,
  OCPP20RequiredVariableName.TxStartPoint as string,
  OCPP20RequiredVariableName.TxStopPoint as string,
  OCPP20RequiredVariableName.TxUpdatedMeasurands as string,
  OCPP20RequiredVariableName.UnlockOnEVSideDisconnect as string,
  // Vendor specific configuration keys
  OCPP20VendorVariableName.ConnectionUrl as string,
])
// Write-only variables (original case).
const WRITE_ONLY_VARIABLES = new Set<string>([OCPP20VendorVariableName.ConnectionUrl as string])
// Canonical (lowercase) set for case-insensitive matching of write-only variables.
const WRITE_ONLY_VARIABLES_CANONICAL = new Set<string>(
  [...WRITE_ONLY_VARIABLES].map(v => v.toLowerCase())
)

export class OCPP20VariableManager {
  private static instance: null | OCPP20VariableManager = null

  private readonly invalidVariables = new Set<string>() // keyed by canonical composite key
  private readonly runtimeOverrides = new Map<string, string>() // keyed by canonical composite key

  private constructor () {
    /* This is intentional */
  }

  public static getInstance (): OCPP20VariableManager {
    OCPP20VariableManager.instance ??= new OCPP20VariableManager()
    return OCPP20VariableManager.instance
  }

  public static validateConfigurationValue (
    variableName: string,
    value: string
  ): { additionalInfo?: string; valid: boolean } {
    const variableConstraintMetadata = VARIABLE_CONSTRAINTS[variableName]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const effectiveMaxLength = variableConstraintMetadata?.maxLength ?? DEFAULT_MAX_LENGTH
    if (value.length > effectiveMaxLength) {
      return {
        additionalInfo: `Value exceeds maximum length (${effectiveMaxLength.toString()})`,
        valid: false,
      }
    }
    const valueTrimmed = value.trim()
    if (valueTrimmed !== value || valueTrimmed.length === 0) {
      return { additionalInfo: 'Non-empty digits only string required', valid: false }
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (variableConstraintMetadata?.integer === true) {
      const isDigitsOnly = /^\d+$/.test(valueTrimmed)
      if (!isDigitsOnly) {
        const isSignedInteger = /^[+-]?\d+$/.test(valueTrimmed)
        const isDecimal = /^[+-]?\d+\.\d+$/.test(valueTrimmed)
        if (valueTrimmed.startsWith('+')) {
          return { additionalInfo: 'Non-empty digits only string required', valid: false }
        }
        if (isSignedInteger || isDecimal) {
          if (variableConstraintMetadata.positive) {
            return { additionalInfo: 'Positive integer > 0 required', valid: false }
          } else {
            return { additionalInfo: 'Integer >= 0 required', valid: false }
          }
        }
        return { additionalInfo: 'Non-empty digits only string required', valid: false }
      }
      const numValue = Number(valueTrimmed)
      if (variableConstraintMetadata.positive === true) {
        if (!Number.isInteger(numValue) || numValue <= 0) {
          return { additionalInfo: 'Positive integer > 0 required', valid: false }
        }
      } else if (variableConstraintMetadata.allowZero === true) {
        if (!Number.isInteger(numValue) || numValue < 0) {
          return { additionalInfo: 'Integer >= 0 required', valid: false }
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (variableConstraintMetadata?.urlProtocols != null) {
      try {
        const url = new URL(valueTrimmed)
        if (!variableConstraintMetadata.urlProtocols.includes(url.protocol)) {
          return { additionalInfo: 'Unsupported URL scheme', valid: false }
        }
      } catch {
        return { additionalInfo: 'Invalid URL format', valid: false }
      }
    }
    return { valid: true }
  }

  public getVariables (
    chargingStation: ChargingStation,
    getVariableData: OCPP20GetVariableDataType[]
  ): OCPP20GetVariableResultType[] {
    this.performMappingSelfCheck(chargingStation)
    const results: OCPP20GetVariableResultType[] = []
    for (const variableData of getVariableData) {
      try {
        const result = this.getVariable(chargingStation, variableData)
        results.push(result)
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} Error getting variable ${variableData.variable.name}:`,
          error
        )
        results.push({
          attributeStatus: GetVariableStatusEnumType.Rejected,
          attributeStatusInfo: {
            additionalInfo: 'Internal error occurred while retrieving variable',
            reasonCode: ReasonCodeEnumType.InternalError,
          },
          attributeType: variableData.attributeType,
          component: variableData.component,
          variable: variableData.variable,
        })
      }
    }
    return results
  }

  public performMappingSelfCheck (chargingStation: ChargingStation): void {
    this.invalidVariables.clear()
    for (const variableName of PERSISTENT_VARIABLES) {
      if (variableName === (OCPP20VendorVariableName.ConnectionUrl as string)) {
        continue
      }
      const existing = getConfigurationKey(
        chargingStation,
        variableName as unknown as StandardParametersKey
      )
      const variableKey = this.buildKeyFromNames(
        OCPP20ComponentName.ChargingStation as string,
        undefined,
        variableName
      )
      if (existing == null) {
        let defaultValue: string | undefined
        switch (variableName) {
          case OCPP20OptionalVariableName.HeartbeatInterval as string:
            defaultValue = millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString()
            break
          case OCPP20OptionalVariableName.WebSocketPingInterval as string:
            defaultValue = Constants.DEFAULT_WEBSOCKET_PING_INTERVAL.toString()
            break
          case OCPP20RequiredVariableName.EVConnectionTimeOut as string:
            defaultValue = Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString()
            break
          case OCPP20RequiredVariableName.MessageTimeout as string:
            defaultValue = Constants.DEFAULT_CONNECTION_TIMEOUT.toString()
            break
          case OCPP20RequiredVariableName.ReportingValueSize as string:
            // Spec max limit 2500; choose full limit as default
            defaultValue = '2500'
            break
        }
        if (defaultValue != null) {
          addConfigurationKey(
            chargingStation,
            variableName as unknown as StandardParametersKey,
            defaultValue,
            undefined,
            { overwrite: false }
          )
          logger.info(
            `${chargingStation.logPrefix()} Added missing configuration key for variable '${variableName}' with default '${defaultValue}'`
          )
        } else {
          this.invalidVariables.add(variableKey)
          logger.error(
            `${chargingStation.logPrefix()} Missing configuration key mapping and no default for variable '${variableName}', marking as INTERNAL ERROR`
          )
        }
      }
    }
  }

  public resetRuntimeOverrides (): void {
    this.runtimeOverrides.clear()
  }

  public setVariables (
    chargingStation: ChargingStation,
    setVariableData: OCPP20SetVariableDataType[]
  ): OCPP20SetVariableResultType[] {
    this.performMappingSelfCheck(chargingStation)
    const results: OCPP20SetVariableResultType[] = []
    for (const variableData of setVariableData) {
      try {
        const result = this.setVariable(chargingStation, variableData)
        results.push(result)
      } catch (error) {
        logger.error(
          `${chargingStation.logPrefix()} Error setting variable ${variableData.variable.name}:`,
          error
        )
        results.push({
          attributeStatus: SetVariableStatusEnumType.Rejected,
          attributeStatusInfo: {
            additionalInfo: 'Internal error occurred while setting variable',
            reasonCode: ReasonCodeEnumType.InternalError,
          },
          attributeType: variableData.attributeType ?? AttributeEnumType.Actual,
          component: variableData.component,
          variable: variableData.variable,
        })
      }
    }
    return results
  }

  private buildKey (component: ComponentType, variable: VariableType): string {
    return `${this.canonicalComponentName(component.name)}${component.instance ? '.' + component.instance : ''}.${this.canonicalVariableName(variable.name)}`
  }

  private buildKeyFromNames (
    componentName: string,
    instance: string | undefined,
    variableName: string
  ): string {
    return `${this.canonicalComponentName(componentName)}${instance ? '.' + instance : ''}.${this.canonicalVariableName(variableName)}`
  }

  private canonicalComponentName (name: string): string {
    return name.toLowerCase()
  }

  private canonicalVariableName (name: string): string {
    return name.toLowerCase()
  }

  private getVariable (
    chargingStation: ChargingStation,
    variableData: OCPP20GetVariableDataType
  ): OCPP20GetVariableResultType {
    const { attributeType, component, variable } = variableData

    if (!this.isComponentValid(chargingStation, component)) {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.UnknownComponent,
        ReasonCodeEnumType.NotFound,
        `Component ${component.name} is not supported by this charging station`
      )
    }

    if (!this.isVariableSupported(component, variable)) {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.UnknownVariable,
        ReasonCodeEnumType.NotFound,
        `Variable ${variable.name} is not supported for component ${component.name}`
      )
    }

    const characteristics = getVariableCharacteristics(component.name, variable.name)
    if (characteristics?.mutability === 'WriteOnly') {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.WriteOnly,
        `Variable ${variable.name} is write-only and cannot be retrieved`
      )
    }
    if (attributeType && !characteristics?.supportedAttributes.includes(attributeType)) {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.NotSupportedAttributeType,
        ReasonCodeEnumType.UnsupportedParam,
        `Attribute type ${attributeType} is not supported for variable ${variable.name}`
      )
    }

    const variableKey = this.buildKey(component, variable)
    if (this.invalidVariables.has(variableKey)) {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.InternalError,
        'Variable mapping invalid (startup self-check failed)'
      )
    }

    let value = this.resolveVariableValue(chargingStation, component, variable)

    // Enforce non-empty Accepted values (reject if empty string)
    if (value.length === 0) {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.InvalidValue,
        'Resolved variable value is empty'
      )
    }

    // Apply ReportingValueSize truncation if defined
    const reportingValueSizeKey = this.buildKeyFromNames(
      OCPP20ComponentName.ChargingStation as string,
      undefined,
      OCPP20RequiredVariableName.ReportingValueSize as string
    )
    if (!this.invalidVariables.has(reportingValueSizeKey)) {
      const reportingValueSizeConfigKey = getConfigurationKey(
        chargingStation,
        OCPP20RequiredVariableName.ReportingValueSize as unknown as StandardParametersKey
      )
      const maxSizeRaw = reportingValueSizeConfigKey?.value ?? '2500'
      const maxSize = convertToIntOrNaN(maxSizeRaw)
      if (!Number.isNaN(maxSize) && maxSize > 0 && value.length > maxSize) {
        value = value.slice(0, maxSize)
      }
    }

    return {
      attributeStatus: GetVariableStatusEnumType.Accepted,
      attributeType,
      attributeValue: value,
      component,
      variable,
    }
  }

  private isComponentValid (chargingStation: ChargingStation, component: ComponentType): boolean {
    const componentNameCanonical = this.canonicalComponentName(component.name)
    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.ChargingStation as string)
    ) {
      return true
    }
    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.AuthCtrlr as string)
    ) {
      // AuthCtrlr has no instance-specific validation in this implementation
      return true
    }
    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.DeviceDataCtrlr as string)
    ) {
      return true
    }
    return false
  }

  private isVariableSupported (component: ComponentType, variable: VariableType): boolean {
    return getVariableCharacteristics(component.name, variable.name) != null
  }

  private rejectGet (
    variable: VariableType,
    component: ComponentType,
    attributeType: AttributeEnumType | undefined,
    status: GetVariableStatusEnumType,
    reason: ReasonCodeEnumType,
    info: string
  ): OCPP20GetVariableResultType {
    const truncatedInfo = info.length > 50 ? info.slice(0, 50) : info
    return {
      attributeStatus: status,
      attributeStatusInfo: {
        additionalInfo: truncatedInfo,
        reasonCode: reason,
      },
      attributeType,
      component,
      variable,
    }
  }

  private rejectSet (
    variable: VariableType,
    component: ComponentType,
    attributeType: AttributeEnumType,
    status: SetVariableStatusEnumType,
    reason: ReasonCodeEnumType,
    info: string
  ): OCPP20SetVariableResultType {
    const truncatedInfo = info.length > 50 ? info.slice(0, 50) : info
    return {
      attributeStatus: status,
      attributeStatusInfo: {
        additionalInfo: truncatedInfo,
        reasonCode: reason,
      },
      attributeType,
      component,
      variable,
    }
  }

  private resolveVariableValue (
    chargingStation: ChargingStation,
    component: ComponentType,
    variable: VariableType
  ): string {
    const componentNameCanonical = this.canonicalComponentName(component.name)
    const variableNameCanonical = this.canonicalVariableName(variable.name)

    // Fetch characteristics strictly from registry
    const characteristics = getVariableCharacteristics(component.name, variable.name)

    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.ChargingStation as string)
    ) {
      // Special dynamic values
      if (characteristics?.dataType === 'dateTime' && characteristics.mutability === 'ReadOnly') {
        return new Date().toISOString()
      }

      // HeartbeatInterval / WebSocketPingInterval need dynamic fallback to running timers when no config key value yet
      if (
        variableNameCanonical ===
        this.canonicalVariableName(OCPP20OptionalVariableName.HeartbeatInterval as string)
      ) {
        const hbConfigKey = getConfigurationKey(
          chargingStation,
          OCPP20OptionalVariableName.HeartbeatInterval as unknown as StandardParametersKey
        )
        return (
          hbConfigKey?.value ??
          millisecondsToSeconds(chargingStation.getHeartbeatInterval()).toString()
        )
      }
      if (
        variableNameCanonical ===
        this.canonicalVariableName(OCPP20OptionalVariableName.WebSocketPingInterval as string)
      ) {
        const wsConfigKey = getConfigurationKey(
          chargingStation,
          OCPP20OptionalVariableName.WebSocketPingInterval as unknown as StandardParametersKey
        )
        return wsConfigKey?.value ?? chargingStation.getWebSocketPingInterval().toString()
      }

      // Configuration-backed persistent integer defaults when not yet mapped
      if (
        variableNameCanonical ===
        this.canonicalVariableName(OCPP20RequiredVariableName.EVConnectionTimeOut as string)
      ) {
        const cfg = getConfigurationKey(
          chargingStation,
          OCPP20RequiredVariableName.EVConnectionTimeOut as unknown as StandardParametersKey
        )
        return cfg?.value ?? Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString()
      }
      if (
        variableNameCanonical ===
        this.canonicalVariableName(OCPP20RequiredVariableName.MessageTimeout as string)
      ) {
        const cfg = getConfigurationKey(
          chargingStation,
          OCPP20RequiredVariableName.MessageTimeout as unknown as StandardParametersKey
        )
        return cfg?.value ?? chargingStation.getConnectionTimeout().toString()
      }

      if (
        variableNameCanonical ===
        this.canonicalVariableName(OCPP20RequiredVariableName.ReportingValueSize as string)
      ) {
        const cfg = getConfigurationKey(
          chargingStation,
          OCPP20RequiredVariableName.ReportingValueSize as unknown as StandardParametersKey
        )
        return cfg?.value ?? '2500'
      }

      // Persistence strategy: Persistent uses configuration, Volatile uses runtime override map
      if (characteristics) {
        const variableKey = this.buildKey(component, variable)
        switch (characteristics.persistence) {
          case 'Persistent': {
            const cfg = getConfigurationKey(
              chargingStation,
              variable.name as unknown as StandardParametersKey
            )
            return cfg?.value ?? ''
          }
          case 'Volatile': {
            if (
              variableNameCanonical ===
              this.canonicalVariableName(OCPP20RequiredVariableName.TxUpdatedInterval as string)
            ) {
              return (
                this.runtimeOverrides.get(variableKey) ??
                Constants.DEFAULT_TX_UPDATED_INTERVAL.toString()
              )
            }
            return this.runtimeOverrides.get(variableKey) ?? ''
          }
        }
      }
    }

    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.DeviceDataCtrlr as string)
    ) {
      if (
        variableNameCanonical ===
        this.canonicalVariableName(OCPP20RequiredVariableName.ReportingValueSize as string)
      ) {
        const cfg = getConfigurationKey(
          chargingStation,
          OCPP20RequiredVariableName.ReportingValueSize as unknown as StandardParametersKey
        )
        return cfg?.value ?? '2500'
      }
    }

    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.AuthCtrlr as string)
    ) {
      if (
        variableNameCanonical ===
        this.canonicalVariableName(OCPP20RequiredVariableName.AuthorizeRemoteStart as string)
      ) {
        const variableKey = this.buildKey(component, variable)
        return this.runtimeOverrides.get(variableKey) ?? 'true'
      }
    }

    // Future: Connector/EVSE variables support.
    return ''
  }

  private setVariable (
    chargingStation: ChargingStation,
    variableData: OCPP20SetVariableDataType
  ): OCPP20SetVariableResultType {
    const { attributeType, attributeValue, component, variable } = variableData
    const resolvedAttributeType = attributeType ?? AttributeEnumType.Actual
    const variableCanonical = this.canonicalVariableName(variable.name)

    if (!this.isComponentValid(chargingStation, component)) {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.UnknownComponent,
        ReasonCodeEnumType.NotFound,
        `Component ${component.name} is not supported by this charging station`
      )
    }
    if (!this.isVariableSupported(component, variable)) {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.UnknownVariable,
        ReasonCodeEnumType.NotFound,
        `Variable ${variable.name} is not supported for component ${component.name}`
      )
    }
    const characteristics = getVariableCharacteristics(component.name, variable.name)
    if (characteristics && !characteristics.supportedAttributes.includes(resolvedAttributeType)) {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.NotSupportedAttributeType,
        ReasonCodeEnumType.UnsupportedParam,
        `Attribute type ${resolvedAttributeType} is not supported for variable ${variable.name}`
      )
    }
    if (resolvedAttributeType !== AttributeEnumType.Actual) {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.NotSupportedAttributeType,
        ReasonCodeEnumType.UnsupportedParam,
        `Attribute type ${resolvedAttributeType} is not supported for variable ${variable.name}`
      )
    }

    /* characteristics already retrieved above */
    if (characteristics?.mutability === 'ReadOnly') {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.ReadOnly,
        `Variable ${variable.name} is read-only`
      )
    }

    const variableKey = this.buildKey(component, variable)
    if (this.invalidVariables.has(variableKey)) {
      if (!WRITE_ONLY_VARIABLES_CANONICAL.has(this.canonicalVariableName(variable.name))) {
        return this.rejectSet(
          variable,
          component,
          resolvedAttributeType,
          SetVariableStatusEnumType.Rejected,
          ReasonCodeEnumType.InternalError,
          'Variable mapping invalid (startup self-check failed)'
        )
      } else {
        this.invalidVariables.delete(variableKey)
      }
    }

    if (characteristics?.mutability === 'WriteOnly') {
      // WriteOnly is allowed for set; skip unsupported check.
    } else if (!characteristics) {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.UnsupportedParam,
        `Variable ${variable.name} unsupported for write operations`
      )
    }

    // Early boolean semantics for AuthCtrlr.AuthorizeRemoteStart
    if (
      this.canonicalComponentName(component.name) ===
        this.canonicalComponentName(OCPP20ComponentName.AuthCtrlr as string) &&
      this.canonicalVariableName(variable.name) ===
        this.canonicalVariableName(OCPP20RequiredVariableName.AuthorizeRemoteStart as string)
    ) {
      if (attributeValue !== 'true' && attributeValue !== 'false') {
        return this.rejectSet(
          variable,
          component,
          resolvedAttributeType,
          SetVariableStatusEnumType.Rejected,
          ReasonCodeEnumType.InvalidValue,
          'AuthorizeRemoteStart must be "true" or "false"'
        )
      }
    } else {
      // Registry-driven validation
      {
        const raw = attributeValue
        if (characteristics.maxLength != null && raw.length > characteristics.maxLength) {
          return this.rejectSet(
            variable,
            component,
            resolvedAttributeType,
            SetVariableStatusEnumType.Rejected,
            ReasonCodeEnumType.InvalidValue,
            `Value exceeds maximum length (${characteristics.maxLength.toString()})`
          )
        }
        switch (characteristics.dataType) {
          case 'boolean': {
            if (raw !== 'true' && raw !== 'false') {
              return this.rejectSet(
                variable,
                component,
                resolvedAttributeType,
                SetVariableStatusEnumType.Rejected,
                ReasonCodeEnumType.InvalidValue,
                'Boolean must be "true" or "false"'
              )
            }
            break
          }
          case 'dateTime': {
            // Setting dateTime not supported (read-only) but validate fallback if attempted
            if (isNaN(Date.parse(raw))) {
              return this.rejectSet(
                variable,
                component,
                resolvedAttributeType,
                SetVariableStatusEnumType.Rejected,
                ReasonCodeEnumType.InvalidValue,
                'Invalid dateTime format'
              )
            }
            break
          }
          case 'integer': {
            // Accept optional leading '-' for signed integers at parsing stage
            // Distinguish decimals and plus sign early to retain legacy InvalidValue mapping
            const signedIntegerPattern = /^-?\d+$/
            const decimalPattern = /^-?\d+\.\d+$/
            if (!signedIntegerPattern.test(raw)) {
              // Reject plus sign prefix explicitly with Non-empty digits message (tests expect this for '+10')
              if (raw.startsWith('+')) {
                return this.rejectSet(
                  variable,
                  component,
                  resolvedAttributeType,
                  SetVariableStatusEnumType.Rejected,
                  ReasonCodeEnumType.InvalidValue,
                  'Non-empty digits only string required'
                )
              }
              // Reject decimals or malformed signed numbers with specialized messages
              if (decimalPattern.test(raw) || /^[+-]?\d+\.\d+$/.test(raw)) {
                if (characteristics.min === 1) {
                  return this.rejectSet(
                    variable,
                    component,
                    resolvedAttributeType,
                    SetVariableStatusEnumType.Rejected,
                    ReasonCodeEnumType.InvalidValue,
                    'Positive integer > 0 required'
                  )
                }
                if (characteristics.min === 0) {
                  return this.rejectSet(
                    variable,
                    component,
                    resolvedAttributeType,
                    SetVariableStatusEnumType.Rejected,
                    ReasonCodeEnumType.ValueZeroNotAllowed,
                    'Integer >= 0 required'
                  )
                }
                return this.rejectSet(
                  variable,
                  component,
                  resolvedAttributeType,
                  SetVariableStatusEnumType.Rejected,
                  ReasonCodeEnumType.InvalidValue,
                  'Non-empty digits only string required'
                )
              }
              return this.rejectSet(
                variable,
                component,
                resolvedAttributeType,
                SetVariableStatusEnumType.Rejected,
                ReasonCodeEnumType.InvalidValue,
                'Non-empty digits only string required'
              )
            }
            const num = Number(raw)
            // Specialized positive-only rejection (min === 1) covers zero and negatives
            if (characteristics.min === 1 && num <= 0) {
              return this.rejectSet(
                variable,
                component,
                resolvedAttributeType,
                SetVariableStatusEnumType.Rejected,
                ReasonCodeEnumType.ValuePositiveOnly,
                'Positive integer > 0 required'
              )
            }
            // allowZero (min === 0) rejection for negatives only (zero accepted)
            if (characteristics.min === 0 && num < 0) {
              return this.rejectSet(
                variable,
                component,
                resolvedAttributeType,
                SetVariableStatusEnumType.Rejected,
                ReasonCodeEnumType.ValueZeroNotAllowed,
                'Integer >= 0 required'
              )
            }
            if (
              (characteristics.min != null && num < characteristics.min) ||
              (characteristics.max != null && num > characteristics.max)
            ) {
              return this.rejectSet(
                variable,
                component,
                resolvedAttributeType,
                SetVariableStatusEnumType.Rejected,
                ReasonCodeEnumType.ValueOutOfRange,
                `Integer value out of range (${characteristics.min?.toString() ?? ''}-${characteristics.max?.toString() ?? ''})`
              )
            }
            if (characteristics.enumeration && !characteristics.enumeration.includes(raw)) {
              return this.rejectSet(
                variable,
                component,
                resolvedAttributeType,
                SetVariableStatusEnumType.Rejected,
                ReasonCodeEnumType.InvalidValue,
                'Value not in enumeration'
              )
            }
            break
          }
          case 'URI': {
            try {
              const url = new URL(raw)
              if (
                characteristics.enumeration &&
                !characteristics.enumeration.some(p => url.protocol === p)
              ) {
                return this.rejectSet(
                  variable,
                  component,
                  resolvedAttributeType,
                  SetVariableStatusEnumType.Rejected,
                  ReasonCodeEnumType.InvalidURL,
                  'Unsupported URL scheme'
                )
              }
            } catch {
              return this.rejectSet(
                variable,
                component,
                resolvedAttributeType,
                SetVariableStatusEnumType.Rejected,
                ReasonCodeEnumType.InvalidURL,
                'Invalid URL format'
              )
            }
            break
          }
          default:
            break
        }
      }
      // Perform legacy validation only if registry did not already reject integer/boolean/URI/dateTime
      // This avoids overriding specialized reason codes (e.g., ValuePositiveOnly) set above.
      // Perform legacy validation ONLY for integer variables needing digit-only checks not already rejected
      // Skip for URI, boolean, dateTime to avoid duplicate URL/boolean errors and preserve specialized reason codes
      if (characteristics.dataType === 'integer') {
        const validation = OCPP20VariableManager.validateConfigurationValue(
          variable.name,
          attributeValue
        )
        if (!validation.valid) {
          let mappedReason = ReasonCodeEnumType.InvalidValue
          if (validation.additionalInfo?.includes('Positive integer > 0')) {
            if (attributeValue.includes('.') || attributeValue.startsWith('+')) {
              mappedReason = ReasonCodeEnumType.InvalidValue
            } else {
              mappedReason = ReasonCodeEnumType.ValuePositiveOnly
            }
          } else if (validation.additionalInfo?.includes('Integer >= 0')) {
            mappedReason = ReasonCodeEnumType.ValueZeroNotAllowed
          }
          // URL related messages should not occur here for integer dataType, but safeguard
          return this.rejectSet(
            variable,
            component,
            resolvedAttributeType,
            SetVariableStatusEnumType.Rejected,
            mappedReason,
            validation.additionalInfo ?? 'Invalid value'
          )
        }
      }
    }

    // read-only already handled above via characteristics
    let rebootRequired = false
    if (
      this.canonicalComponentName(component.name) ===
      this.canonicalComponentName(OCPP20ComponentName.ChargingStation as string)
    ) {
      const configKeyName = characteristics.variable as unknown as StandardParametersKey
      const previousValue = getConfigurationKey(chargingStation, configKeyName)?.value
      switch (characteristics.persistence) {
        case 'Persistent': {
          let configKey = getConfigurationKey(chargingStation, configKeyName)
          if (configKey == null) {
            addConfigurationKey(chargingStation, configKeyName, attributeValue, undefined, {
              overwrite: false,
            })
            configKey = getConfigurationKey(chargingStation, configKeyName)
          } else if (configKey.value !== attributeValue) {
            setConfigurationKeyValue(chargingStation, configKeyName, attributeValue)
          }
          rebootRequired =
            (characteristics.rebootRequired === true ||
              getConfigurationKey(chargingStation, configKeyName)?.reboot === true) &&
            previousValue !== attributeValue
          break
        }
        case 'Volatile': {
          this.runtimeOverrides.set(variableKey, attributeValue)
          break
        }
      }
      if (
        variableCanonical ===
          this.canonicalVariableName(OCPP20OptionalVariableName.HeartbeatInterval as string) &&
        !Number.isNaN(convertToIntOrNaN(attributeValue)) &&
        convertToIntOrNaN(attributeValue) > 0
      ) {
        chargingStation.restartHeartbeat()
      }
      if (
        variableCanonical ===
          this.canonicalVariableName(OCPP20OptionalVariableName.WebSocketPingInterval as string) &&
        !Number.isNaN(convertToIntOrNaN(attributeValue)) &&
        convertToIntOrNaN(attributeValue) >= 0
      ) {
        chargingStation.restartWebSocketPing()
      }
    }
    if (
      this.canonicalComponentName(component.name) ===
        this.canonicalComponentName(OCPP20ComponentName.AuthCtrlr as string) &&
      this.canonicalVariableName(variable.name) ===
        this.canonicalVariableName(OCPP20RequiredVariableName.AuthorizeRemoteStart as string)
    ) {
      // Store override after early validation
      this.runtimeOverrides.set(variableKey, attributeValue)
    }

    if (rebootRequired) {
      return {
        attributeStatus: SetVariableStatusEnumType.RebootRequired,
        attributeStatusInfo: {
          additionalInfo: 'Value changed, reboot required to take effect',
          reasonCode: ReasonCodeEnumType.NoError,
        },
        attributeType: resolvedAttributeType,
        component,
        variable,
      }
    }

    return {
      attributeStatus: SetVariableStatusEnumType.Accepted,
      attributeType: resolvedAttributeType,
      component,
      variable,
    }
  }
}
