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
import { Constants, logger } from '../../../utils/index.js'
import { type ChargingStation } from '../../ChargingStation.js'
import {
  addConfigurationKey,
  getConfigurationKey,
  setConfigurationKeyValue,
  validateConfigurationValue,
} from '../../ConfigurationKeyUtils.js'

// Translation-only refactor eliminating duplicated persistence/validation logic.
// Persistent configuration-backed variables.
const PERSISTENT_VARIABLES = new Set<string>([
  OCPP20OptionalVariableName.HeartbeatInterval as string,
  OCPP20OptionalVariableName.WebSocketPingInterval as string,
  OCPP20RequiredVariableName.EVConnectionTimeOut as string,
  OCPP20RequiredVariableName.MessageTimeout as string,
  OCPP20VendorVariableName.ConnectionUrl as string,
])
// Write-only variables.
const WRITE_ONLY_VARIABLES = new Set<string>([OCPP20VendorVariableName.ConnectionUrl as string])
// Non-persistent runtime variables (transient overrides allowed).
const RUNTIME_VARIABLES = new Set<string>([
  OCPP20RequiredVariableName.AuthorizeRemoteStart as string,
  OCPP20RequiredVariableName.DateTime as string,
  OCPP20RequiredVariableName.TxUpdatedInterval as string,
])

export class OCPP20VariableManager {
  private static instance: null | OCPP20VariableManager = null

  // Track invalid mappings discovered at startup self-check (transient only).
  private readonly invalidVariables = new Set<string>()
  // Transient runtime overrides for non-persistent variables.
  private readonly runtimeOverrides = new Map<string, string>() // key format: component[.instance].variable

  private constructor () {
    // Lazy mapping check occurs on first request via performMappingSelfCheck.
  }

  public static getInstance (): OCPP20VariableManager {
    OCPP20VariableManager.instance ??= new OCPP20VariableManager()
    return OCPP20VariableManager.instance
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
    for (const variableName of PERSISTENT_VARIABLES) {
      if (variableName === (OCPP20VendorVariableName.ConnectionUrl as string)) {
        continue
      }
      const existing = getConfigurationKey(
        chargingStation,
        variableName as unknown as StandardParametersKey
      )
      const variableKey = `${OCPP20ComponentName.ChargingStation as string}.${variableName}`
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
          this.invalidVariables.delete(variableKey)
        } else {
          this.invalidVariables.add(variableKey)
          logger.error(
            `${chargingStation.logPrefix()} Missing configuration key mapping and no default for variable '${variableName}', marking as INTERNAL ERROR`
          )
        }
      } else {
        this.invalidVariables.delete(variableKey)
      }
    }
  }

  public resetRuntimeOverrides (): void {
    this.resetRuntimeVariables()
  }

  // Compatibility method retained for existing callers (ChargingStation.reset())
  // Clears transient runtime overrides for non-persistent variables.
  public resetRuntimeVariables (): void {
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

    // Enforce write-only semantics: reject GetVariables on write-only variables.
    if (WRITE_ONLY_VARIABLES.has(variable.name)) {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.UnsupportedParam,
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

    const variableKey = `${component.name}${component.instance ? '.' + component.instance : ''}.${variable.name}`
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

    const value = this.resolveVariableValue(chargingStation, component, variable)

    return {
      attributeStatus: GetVariableStatusEnumType.Accepted,
      attributeType,
      attributeValue: value,
      component,
      variable,
    }
  }

  private isComponentValid (chargingStation: ChargingStation, component: ComponentType): boolean {
    const componentName = component.name
    if (componentName === (OCPP20ComponentName.ChargingStation as string)) {
      return true
    }
    if (
      componentName === (OCPP20ComponentName.Connector as string) &&
      chargingStation.connectors.size > 0
    ) {
      if (component.instance != null) {
        const connectorId = parseInt(component.instance, 10)
        return chargingStation.connectors.has(connectorId)
      }
      return true
    }
    if (componentName === (OCPP20ComponentName.EVSE as string) && chargingStation.hasEvses) {
      if (component.instance != null) {
        const evseId = parseInt(component.instance, 10)
        return chargingStation.evses.has(evseId)
      }
      return true
    }
    return false
  }

  private isVariableSupported (component: ComponentType, variable: VariableType): boolean {
    if (component.name === (OCPP20ComponentName.ChargingStation as string)) {
      const supported = [...PERSISTENT_VARIABLES.values(), ...RUNTIME_VARIABLES.values()]
      return supported.includes(variable.name)
    }
    if (component.name === (OCPP20ComponentName.Connector as string)) {
      // AuthorizeRemoteStart supported on Connector component
      return variable.name === (OCPP20RequiredVariableName.AuthorizeRemoteStart as string)
    }
    if (component.name === (OCPP20ComponentName.EVSE as string)) {
      // AuthorizeRemoteStart supported on EVSE component
      return variable.name === (OCPP20RequiredVariableName.AuthorizeRemoteStart as string)
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
    const variableName = variable.name
    const componentName = component.name
    const variableKey = `${componentName}${component.instance ? '.' + component.instance : ''}.${variableName}`

    if (componentName === (OCPP20ComponentName.ChargingStation as string)) {
      if (variableName === (OCPP20RequiredVariableName.DateTime as string)) {
        return new Date().toISOString()
      }
      if (variableName === (OCPP20OptionalVariableName.HeartbeatInterval as string)) {
        const hbConfigKey = getConfigurationKey(
          chargingStation,
          variableName as unknown as StandardParametersKey
        )
        return (
          hbConfigKey?.value ??
          millisecondsToSeconds(chargingStation.getHeartbeatInterval()).toString()
        )
      }
      if (variableName === (OCPP20OptionalVariableName.WebSocketPingInterval as string)) {
        const wsConfigKey = getConfigurationKey(
          chargingStation,
          variableName as unknown as StandardParametersKey
        )
        return wsConfigKey?.value ?? chargingStation.getWebSocketPingInterval().toString()
      }
      if (variableName === (OCPP20RequiredVariableName.EVConnectionTimeOut as string)) {
        const cfg = getConfigurationKey(
          chargingStation,
          variableName as unknown as StandardParametersKey
        )
        return cfg?.value ?? Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString()
      }
      if (variableName === (OCPP20RequiredVariableName.MessageTimeout as string)) {
        const cfg = getConfigurationKey(
          chargingStation,
          variableName as unknown as StandardParametersKey
        )
        return cfg?.value ?? chargingStation.getConnectionTimeout().toString()
      }
      if (RUNTIME_VARIABLES.has(variableName) && this.runtimeOverrides.has(variableKey)) {
        return this.runtimeOverrides.get(variableKey) ?? ''
      }
      // Default fallback for TxUpdatedInterval runtime variable after reset
      if (variableName === (OCPP20RequiredVariableName.TxUpdatedInterval as string)) {
        return Constants.DEFAULT_TX_UPDATED_INTERVAL.toString()
      }
      const configKey = getConfigurationKey(
        chargingStation,
        variableName as unknown as StandardParametersKey
      )
      return configKey?.value ?? ''
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

    const variableKey = `${component.name}${component.instance ? '.' + component.instance : ''}.${variable.name}`
    if (this.invalidVariables.has(variableKey)) {
      if (!WRITE_ONLY_VARIABLES.has(variable.name)) {
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
      !WRITE_ONLY_VARIABLES.has(variable.name) &&
      !PERSISTENT_VARIABLES.has(variable.name) &&
      !RUNTIME_VARIABLES.has(variable.name)
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

    const validation = validateConfigurationValue(variable.name, attributeValue)
    if (!validation.valid) {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.PropertyConstraintViolation,
        validation.additionalInfo ?? 'Property constraint violation'
      )
    }

    // Immutable DateTime enforcement
    if (variable.name === (OCPP20RequiredVariableName.DateTime as string)) {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.ImmutableVariable,
        'Variable DateTime is immutable'
      )
    }

    let rebootRequired = false
    if (component.name === (OCPP20ComponentName.ChargingStation as string)) {
      if (PERSISTENT_VARIABLES.has(variable.name)) {
        const configKeyName = variable.name as unknown as StandardParametersKey
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
      } else if (RUNTIME_VARIABLES.has(variable.name)) {
        this.runtimeOverrides.set(variableKey, attributeValue)
      }
      if (
        variable.name === (OCPP20OptionalVariableName.HeartbeatInterval as string) &&
        !Number.isNaN(parseInt(attributeValue, 10)) &&
        parseInt(attributeValue, 10) > 0
      ) {
        chargingStation.restartHeartbeat()
      }
      if (
        variable.name === (OCPP20OptionalVariableName.WebSocketPingInterval as string) &&
        !Number.isNaN(parseInt(attributeValue, 10)) &&
        parseInt(attributeValue, 10) >= 0
      ) {
        chargingStation.restartWebSocketPing()
      }
    }
    // Support runtime override on Connector for AuthorizeRemoteStart
    if (component.name === (OCPP20ComponentName.Connector as string)) {
      if (variable.name === (OCPP20RequiredVariableName.AuthorizeRemoteStart as string)) {
        this.runtimeOverrides.set(variableKey, attributeValue)
      }
    }

    if (rebootRequired) {
      return {
        attributeStatus: SetVariableStatusEnumType.RebootRequired,
        attributeStatusInfo: {
          additionalInfo: 'Value changed, reboot required to take effect',
          reasonCode: ReasonCodeEnumType.ChangeRequiresReboot,
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
