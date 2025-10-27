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
import { Constants, convertToInt, logger } from '../../../utils/index.js'
import { type ChargingStation } from '../../ChargingStation.js'
import {
  addConfigurationKey,
  getConfigurationKey,
  setConfigurationKeyValue,
} from '../../ConfigurationKeyUtils.js'
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
// Read-only variables (original case).
const READ_ONLY_VARIABLES = new Set<string>([
  OCPP20RequiredVariableName.DateTime as string,
  OCPP20RequiredVariableName.ReportingValueSize as string,
])
// Non-persistent runtime variables (original case, excluding AuthorizeRemoteStart migrated to AuthCtrlr).
const RUNTIME_VARIABLES = new Set<string>([
  OCPP20RequiredVariableName.DateTime as string,
  OCPP20RequiredVariableName.TxUpdatedInterval as string,
])

// Canonical (lowercase) sets for case-insensitive matching.
const PERSISTENT_VARIABLES_CANONICAL = new Set<string>(
  [...PERSISTENT_VARIABLES].map(v => v.toLowerCase())
)
const WRITE_ONLY_VARIABLES_CANONICAL = new Set<string>(
  [...WRITE_ONLY_VARIABLES].map(v => v.toLowerCase())
)
const READ_ONLY_VARIABLES_CANONICAL = new Set<string>(
  [...READ_ONLY_VARIABLES].map(v => v.toLowerCase())
)
const RUNTIME_VARIABLES_CANONICAL = new Set<string>(
  [...RUNTIME_VARIABLES].map(v => v.toLowerCase())
)

const toIntOrNaN = (value: string): number => {
  try {
    return convertToInt(value)
  } catch {
    return Number.NaN
  }
}

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
    if (variableConstraintMetadata?.integer) {
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
      if (variableConstraintMetadata.positive) {
        if (!Number.isInteger(numValue) || numValue <= 0) {
          return { additionalInfo: 'Positive integer > 0 required', valid: false }
        }
      } else if (variableConstraintMetadata.allowZero) {
        if (!Number.isInteger(numValue) || numValue < 0) {
          return { additionalInfo: 'Integer >= 0 required', valid: false }
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (variableConstraintMetadata?.urlProtocols) {
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
    // Clear invalidVariables; rebuild based on current configuration state in canonical form.
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

    if (WRITE_ONLY_VARIABLES_CANONICAL.has(this.canonicalVariableName(variable.name))) {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.WriteOnly,
        `Variable ${variable.name} is write-only and cannot be retrieved`
      )
    }
    if (attributeType && attributeType !== AttributeEnumType.Actual) {
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
      const maxSize = toIntOrNaN(maxSizeRaw)
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
    const componentNameCanonical = this.canonicalComponentName(component.name)
    const variableNameCanonical = this.canonicalVariableName(variable.name)
    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.ChargingStation as string)
    ) {
      return (
        PERSISTENT_VARIABLES_CANONICAL.has(variableNameCanonical) ||
        RUNTIME_VARIABLES_CANONICAL.has(variableNameCanonical)
      )
    }
    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.AuthCtrlr as string)
    ) {
      return (
        variableNameCanonical ===
        this.canonicalVariableName(OCPP20RequiredVariableName.AuthorizeRemoteStart as string)
      )
    }
    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.DeviceDataCtrlr as string)
    ) {
      return (
        variableNameCanonical ===
        this.canonicalVariableName(OCPP20RequiredVariableName.ReportingValueSize as string)
      )
    }
    return false
  }

  private rejectGet (
    variable: VariableType,
    component: ComponentType,
    attributeType: AttributeEnumType | undefined,
    status: GetVariableStatusEnumType,
    reason: ReasonCodeEnumType,
    info: string
  ): OCPP20GetVariableResultType {
    return {
      attributeStatus: status,
      attributeStatusInfo: {
        additionalInfo: info,
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
    return {
      attributeStatus: status,
      attributeStatusInfo: {
        additionalInfo: info,
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
    const variableNameOriginalCase = variable.name
    const variableNameCanonical = this.canonicalVariableName(variableNameOriginalCase)
    const componentNameCanonical = this.canonicalComponentName(component.name)

    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.ChargingStation as string)
    ) {
      // Find the original mapped variable name (persistent or runtime) ignoring case
      const mappedOriginalName =
        [...PERSISTENT_VARIABLES, ...RUNTIME_VARIABLES].find(
          v => this.canonicalVariableName(v) === variableNameCanonical
        ) ?? variableNameOriginalCase

      if (
        this.canonicalVariableName(mappedOriginalName) ===
        this.canonicalVariableName(OCPP20RequiredVariableName.DateTime as string)
      ) {
        return new Date().toISOString()
      }
      if (
        this.canonicalVariableName(mappedOriginalName) ===
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
        this.canonicalVariableName(mappedOriginalName) ===
        this.canonicalVariableName(OCPP20OptionalVariableName.WebSocketPingInterval as string)
      ) {
        const wsConfigKey = getConfigurationKey(
          chargingStation,
          OCPP20OptionalVariableName.WebSocketPingInterval as unknown as StandardParametersKey
        )
        return wsConfigKey?.value ?? chargingStation.getWebSocketPingInterval().toString()
      }
      if (
        this.canonicalVariableName(mappedOriginalName) ===
        this.canonicalVariableName(OCPP20RequiredVariableName.EVConnectionTimeOut as string)
      ) {
        const cfg = getConfigurationKey(
          chargingStation,
          OCPP20RequiredVariableName.EVConnectionTimeOut as unknown as StandardParametersKey
        )
        return cfg?.value ?? Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString()
      }
      if (
        this.canonicalVariableName(mappedOriginalName) ===
        this.canonicalVariableName(OCPP20RequiredVariableName.MessageTimeout as string)
      ) {
        const cfg = getConfigurationKey(
          chargingStation,
          OCPP20RequiredVariableName.MessageTimeout as unknown as StandardParametersKey
        )
        return cfg?.value ?? chargingStation.getConnectionTimeout().toString()
      }
      const variableKey = this.buildKey(component, variable)
      if (
        RUNTIME_VARIABLES_CANONICAL.has(variableNameCanonical) &&
        this.runtimeOverrides.has(variableKey)
      ) {
        return this.runtimeOverrides.get(variableKey) ?? ''
      }
      if (
        this.canonicalVariableName(mappedOriginalName) ===
        this.canonicalVariableName(OCPP20RequiredVariableName.TxUpdatedInterval as string)
      ) {
        return Constants.DEFAULT_TX_UPDATED_INTERVAL.toString()
      }
      // Fallback to configuration key lookup using mapped original variable name
      const mappedConfigKey = getConfigurationKey(
        chargingStation,
        mappedOriginalName as unknown as StandardParametersKey
      )
      return mappedConfigKey?.value ?? ''
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
      const variableKey = this.buildKey(component, variable)
      if (
        variableNameCanonical ===
        this.canonicalVariableName(OCPP20RequiredVariableName.AuthorizeRemoteStart as string)
      ) {
        // Return runtime override if present; otherwise default to 'true' per spec implicit default
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

    if (READ_ONLY_VARIABLES_CANONICAL.has(this.canonicalVariableName(variable.name))) {
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

    if (
      !WRITE_ONLY_VARIABLES_CANONICAL.has(this.canonicalVariableName(variable.name)) &&
      !PERSISTENT_VARIABLES_CANONICAL.has(this.canonicalVariableName(variable.name)) &&
      !RUNTIME_VARIABLES_CANONICAL.has(this.canonicalVariableName(variable.name)) &&
      !(
        this.canonicalComponentName(component.name) ===
          this.canonicalComponentName(OCPP20ComponentName.AuthCtrlr as string) &&
        this.canonicalVariableName(variable.name) ===
          this.canonicalVariableName(OCPP20RequiredVariableName.AuthorizeRemoteStart as string)
      )
    ) {
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
        } else if (
          validation.additionalInfo?.includes('Invalid URL') ||
          validation.additionalInfo?.includes('Unsupported URL scheme')
        ) {
          mappedReason = ReasonCodeEnumType.InvalidURL
        }
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

    if (READ_ONLY_VARIABLES_CANONICAL.has(this.canonicalVariableName(variable.name))) {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.ReadOnly,
        `Variable ${variable.name} is read-only`
      )
    }

    let rebootRequired = false
    if (
      this.canonicalComponentName(component.name) ===
      this.canonicalComponentName(OCPP20ComponentName.ChargingStation as string)
    ) {
      // Map incoming variable name to original defined variable name for persistence/runtime operations (case-insensitive)
      const incomingCanonical = this.canonicalVariableName(variable.name)
      const mappedOriginalName =
        [...PERSISTENT_VARIABLES, ...RUNTIME_VARIABLES].find(
          v => this.canonicalVariableName(v) === incomingCanonical
        ) ?? variable.name
      const mappedCanonical = this.canonicalVariableName(mappedOriginalName)
      if (PERSISTENT_VARIABLES_CANONICAL.has(mappedCanonical)) {
        const configKeyName = mappedOriginalName as unknown as StandardParametersKey
        let configKey = getConfigurationKey(chargingStation, configKeyName)
        const previousValue = configKey?.value
        if (configKey == null) {
          addConfigurationKey(chargingStation, configKeyName, attributeValue, undefined, {
            overwrite: false,
          })
          configKey = getConfigurationKey(chargingStation, configKeyName)
        } else if (configKey.value !== attributeValue) {
          setConfigurationKeyValue(chargingStation, configKeyName, attributeValue)
        }
        rebootRequired = configKey?.reboot === true && previousValue !== attributeValue
      } else if (RUNTIME_VARIABLES_CANONICAL.has(mappedCanonical)) {
        // For runtime variables keep key built from incoming variable for override map consistency
        this.runtimeOverrides.set(variableKey, attributeValue)
      }
      if (
        mappedCanonical ===
          this.canonicalVariableName(OCPP20OptionalVariableName.HeartbeatInterval as string) &&
        !Number.isNaN(toIntOrNaN(attributeValue)) &&
        toIntOrNaN(attributeValue) > 0
      ) {
        chargingStation.restartHeartbeat()
      }
      if (
        mappedCanonical ===
          this.canonicalVariableName(OCPP20OptionalVariableName.WebSocketPingInterval as string) &&
        !Number.isNaN(toIntOrNaN(attributeValue)) &&
        toIntOrNaN(attributeValue) >= 0
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
