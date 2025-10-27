// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { millisecondsToSeconds } from 'date-fns'

import {
  AttributeEnumType,
  type ComponentType,
  GetVariableStatusEnumType,
  MutabilityEnumType,
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
} from '../../ConfigurationKeyUtils.js'

/**
 * Configuration for a standard or vendor OCPP 2.0 variable
 */
interface StandardVariableConfig {
  attributeTypes: AttributeEnumType[]
  defaultValue?: string
  mutability: MutabilityEnumType
  persistent: boolean
}

/**
 * Centralized manager for OCPP 2.0 variables handling.
 * Manages standard variables and provides unified access to variable data.
 */
export class OCPP20VariableManager {
  private static instance: null | OCPP20VariableManager = null

  // runtime (non-persistent) variable values kept across lifetime until restart
  private readonly runtimeVariables = new Map<string, string>()
  private readonly standardVariables = new Map<string, StandardVariableConfig>()

  private constructor () {
    this.initializeStandardVariables()
  }

  public static getInstance (): OCPP20VariableManager {
    OCPP20VariableManager.instance ??= new OCPP20VariableManager()
    return OCPP20VariableManager.instance
  }

  public getVariables (
    chargingStation: ChargingStation,
    getVariableData: OCPP20GetVariableDataType[]
  ): OCPP20GetVariableResultType[] {
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

  public resetRuntimeVariables (): void {
    this.runtimeVariables.clear()
  }

  public setVariables (
    chargingStation: ChargingStation,
    setVariableData: OCPP20SetVariableDataType[]
  ): OCPP20SetVariableResultType[] {
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
      return {
        attributeStatus: GetVariableStatusEnumType.UnknownComponent,
        attributeStatusInfo: {
          additionalInfo: `Component ${component.name} is not supported by this charging station`,
          reasonCode: ReasonCodeEnumType.NotFound,
        },
        attributeType,
        component,
        variable,
      }
    }

    if (!this.isVariableSupported(chargingStation, component, variable)) {
      return {
        attributeStatus: GetVariableStatusEnumType.UnknownVariable,
        attributeStatusInfo: {
          additionalInfo: `Variable ${variable.name} is not supported for component ${component.name}`,
          reasonCode: ReasonCodeEnumType.NotFound,
        },
        attributeType,
        component,
        variable,
      }
    }

    if (attributeType && !this.isAttributeTypeSupported(variable, attributeType)) {
      return {
        attributeStatus: GetVariableStatusEnumType.NotSupportedAttributeType,
        attributeStatusInfo: {
          additionalInfo: `Attribute type ${attributeType} is not supported for variable ${variable.name}`,
          reasonCode: ReasonCodeEnumType.UnsupportedParam,
        },
        attributeType,
        component,
        variable,
      }
    }

    // WriteOnly get rejection
    const variableKey = `${component.name}.${variable.name}`
    const standardConfig = this.standardVariables.get(variableKey)
    if (standardConfig && standardConfig.mutability === MutabilityEnumType.WriteOnly) {
      return {
        attributeStatus: GetVariableStatusEnumType.Rejected,
        attributeStatusInfo: {
          additionalInfo: `Variable ${variable.name} is write-only`,
          reasonCode: ReasonCodeEnumType.WriteOnly,
        },
        attributeType,
        component,
        variable,
      }
    }

    const variableValue = this.getVariableValue(chargingStation, component, variable, attributeType)

    return {
      attributeStatus: GetVariableStatusEnumType.Accepted,
      attributeType,
      attributeValue: variableValue,
      component,
      variable,
    }
  }

  private getVariableValue (
    chargingStation: ChargingStation,
    component: ComponentType,
    variable: VariableType,
    attributeType?: AttributeEnumType
  ): string {
    const variableName = variable.name
    const componentName = component.name
    const variableKey = `${componentName}.${variableName}`

    if (componentName === (OCPP20ComponentName.ChargingStation as string)) {
      // Dynamic DateTime retrieval (UTC RFC3339)
      if (variableName === (OCPP20RequiredVariableName.DateTime as string)) {
        return new Date().toISOString()
      }

      if (variableName === (OCPP20OptionalVariableName.HeartbeatInterval as string)) {
        const hbConfigKey = chargingStation.ocppConfiguration?.configurationKey?.find(
          key => key.key === (OCPP20OptionalVariableName.HeartbeatInterval as string)
        )
        return (
          hbConfigKey?.value ??
          millisecondsToSeconds(chargingStation.getHeartbeatInterval()).toString()
        )
      }

      if (variableName === (OCPP20OptionalVariableName.WebSocketPingInterval as string)) {
        const wsConfigKey = chargingStation.ocppConfiguration?.configurationKey?.find(
          key => key.key === (OCPP20OptionalVariableName.WebSocketPingInterval as string)
        )
        return wsConfigKey?.value ?? chargingStation.getWebSocketPingInterval().toString()
      }

      if (variableName === (OCPP20RequiredVariableName.EVConnectionTimeOut as string)) {
        return Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString()
      }

      if (variableName === (OCPP20RequiredVariableName.MessageTimeout as string)) {
        return chargingStation.getConnectionTimeout().toString()
      }

      // Non-persistent runtime variables
      const config = this.standardVariables.get(variableKey)
      if (config && !config.persistent && this.runtimeVariables.has(variableKey)) {
        return this.runtimeVariables.get(variableKey) ?? ''
      }

      const configKey = chargingStation.ocppConfiguration?.configurationKey?.find(
        key => key.key === variableName
      )
      if (configKey?.value) {
        return configKey.value
      }
      return config?.defaultValue ?? ''
    }

    if (componentName === (OCPP20ComponentName.Connector as string)) {
      const connectorId = component.instance ? parseInt(component.instance, 10) : 1
      const connector = chargingStation.connectors.get(connectorId)

      if (connector) {
        switch (variableName) {
          default:
            return ''
        }
      }
    }

    if (componentName === (OCPP20ComponentName.EVSE as string)) {
      const evseId = component.instance ? parseInt(component.instance, 10) : 1
      const evse = chargingStation.evses.get(evseId)

      if (evse) {
        switch (variableName) {
          default:
            return ''
        }
      }
    }

    return ''
  }

  private initializeStandardVariables (): void {
    this.standardVariables.set(
      `${OCPP20ComponentName.ChargingStation}.${OCPP20OptionalVariableName.HeartbeatInterval}`,
      {
        attributeTypes: [AttributeEnumType.Actual],
        defaultValue: millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString(),
        mutability: MutabilityEnumType.ReadWrite,
        persistent: true,
      }
    )

    this.standardVariables.set(
      `${OCPP20ComponentName.ChargingStation}.${OCPP20OptionalVariableName.WebSocketPingInterval}`,
      {
        attributeTypes: [AttributeEnumType.Actual],
        defaultValue: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL.toString(),
        mutability: MutabilityEnumType.ReadWrite,
        persistent: true,
      }
    )

    this.standardVariables.set(
      `${OCPP20ComponentName.ChargingStation}.${OCPP20RequiredVariableName.EVConnectionTimeOut}`,
      {
        attributeTypes: [AttributeEnumType.Actual],
        defaultValue: Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString(),
        mutability: MutabilityEnumType.ReadWrite,
        persistent: true,
      }
    )

    this.standardVariables.set(
      `${OCPP20ComponentName.ChargingStation}.${OCPP20RequiredVariableName.MessageTimeout}`,
      {
        attributeTypes: [AttributeEnumType.Actual],
        defaultValue: Constants.DEFAULT_CONNECTION_TIMEOUT.toString(),
        mutability: MutabilityEnumType.ReadWrite,
        persistent: true,
      }
    )

    // New variables
    this.standardVariables.set(
      `${OCPP20ComponentName.ChargingStation}.${OCPP20RequiredVariableName.DateTime}`,
      {
        attributeTypes: [AttributeEnumType.Actual],
        mutability: MutabilityEnumType.ReadOnly,
        persistent: false,
      }
    )

    this.standardVariables.set(
      `${OCPP20ComponentName.ChargingStation}.${OCPP20RequiredVariableName.TxUpdatedInterval}`,
      {
        attributeTypes: [AttributeEnumType.Actual],
        defaultValue: '30', // implementation-defined baseline
        mutability: MutabilityEnumType.ReadWrite,
        persistent: false, // non-persistent, revert after restart
      }
    )

    this.standardVariables.set(
      `${OCPP20ComponentName.ChargingStation}.${OCPP20VendorVariableName.ConnectionUrl}`,
      {
        attributeTypes: [AttributeEnumType.Actual],
        mutability: MutabilityEnumType.WriteOnly,
        persistent: true,
      }
    )
  }

  private isAttributeTypeSupported (
    variable: VariableType,
    attributeType: AttributeEnumType
  ): boolean {
    if (attributeType === AttributeEnumType.Actual) {
      return true
    }

    const variablesWithConfigurableAttributes: string[] = []

    return variablesWithConfigurableAttributes.includes(variable.name)
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

  private isVariableSupported (
    chargingStation: ChargingStation,
    component: ComponentType,
    variable: VariableType
  ): boolean {
    const variableKey = `${component.name}.${variable.name}`

    if (this.standardVariables.has(variableKey)) {
      return true
    }

    const knownVariables = [
      ...Object.values(OCPP20OptionalVariableName),
      ...Object.values(OCPP20RequiredVariableName),
      ...Object.values(OCPP20VendorVariableName),
    ]

    return knownVariables.includes(
      variable.name as
        | OCPP20OptionalVariableName
        | OCPP20RequiredVariableName
        | OCPP20VendorVariableName
    )
  }

  private setVariable (
    chargingStation: ChargingStation,
    variableData: OCPP20SetVariableDataType
  ): OCPP20SetVariableResultType {
    const { attributeType, attributeValue, component, variable } = variableData
    const resolvedAttributeType = attributeType ?? AttributeEnumType.Actual

    if (!this.isComponentValid(chargingStation, component)) {
      return {
        attributeStatus: SetVariableStatusEnumType.UnknownComponent,
        attributeStatusInfo: {
          additionalInfo: `Component ${component.name} is not supported by this charging station`,
          reasonCode: ReasonCodeEnumType.NotFound,
        },
        attributeType: resolvedAttributeType,
        component,
        variable,
      }
    }

    if (!this.isVariableSupported(chargingStation, component, variable)) {
      return {
        attributeStatus: SetVariableStatusEnumType.UnknownVariable,
        attributeStatusInfo: {
          additionalInfo: `Variable ${variable.name} is not supported for component ${component.name}`,
          reasonCode: ReasonCodeEnumType.NotFound,
        },
        attributeType: resolvedAttributeType,
        component,
        variable,
      }
    }

    if (!this.isAttributeTypeSupported(variable, resolvedAttributeType)) {
      return {
        attributeStatus: SetVariableStatusEnumType.NotSupportedAttributeType,
        attributeStatusInfo: {
          additionalInfo: `Attribute type ${resolvedAttributeType} is not supported for variable ${variable.name}`,
          reasonCode: ReasonCodeEnumType.UnsupportedParam,
        },
        attributeType: resolvedAttributeType,
        component,
        variable,
      }
    }

    const variableKey = `${component.name}.${variable.name}`
    const standardConfig = this.standardVariables.get(variableKey)
    if (standardConfig && standardConfig.mutability === MutabilityEnumType.ReadOnly) {
      return {
        attributeStatus: SetVariableStatusEnumType.Rejected,
        attributeStatusInfo: {
          additionalInfo: `Variable ${variable.name} is immutable`,
          reasonCode: ReasonCodeEnumType.ImmutableVariable,
        },
        attributeType: resolvedAttributeType,
        component,
        variable,
      }
    }

    if (attributeValue.length > 1000) {
      return {
        attributeStatus: SetVariableStatusEnumType.Rejected,
        attributeStatusInfo: {
          additionalInfo: `Attribute value length ${attributeValue.length.toString()} exceeds maximum allowed`,
          reasonCode: ReasonCodeEnumType.PropertyConstraintViolation,
        },
        attributeType: resolvedAttributeType,
        component,
        variable,
      }
    }

    // Central validation
    const validation = this.validateValue(variableKey, variable, attributeValue)
    if (!validation.valid) {
      return {
        attributeStatus: SetVariableStatusEnumType.Rejected,
        attributeStatusInfo: {
          additionalInfo: validation.additionalInfo,
          reasonCode: validation.reasonCode ?? ReasonCodeEnumType.PropertyConstraintViolation,
        },
        attributeType: resolvedAttributeType,
        component,
        variable,
      }
    }

    let rebootRequired = false
    let previousValue: string | undefined

    if (component.name === (OCPP20ComponentName.ChargingStation as string)) {
      // Only persist if configured as persistent and Actual attribute
      if (
        standardConfig?.persistent === true &&
        resolvedAttributeType === AttributeEnumType.Actual
      ) {
        const configKeyName = variable.name as unknown as StandardParametersKey
        let configKey = getConfigurationKey(chargingStation, configKeyName)
        previousValue = configKey?.value
        if (configKey == null) {
          addConfigurationKey(chargingStation, configKeyName, attributeValue, undefined, {
            overwrite: false,
          })
          configKey = getConfigurationKey(chargingStation, configKeyName)
          previousValue = configKey?.value
        } else if (configKey.value !== attributeValue) {
          setConfigurationKeyValue(chargingStation, configKeyName, attributeValue)
        }
        rebootRequired = configKey?.reboot === true && previousValue !== attributeValue
      } else if (standardConfig && !standardConfig.persistent) {
        // store runtime only
        this.runtimeVariables.set(variableKey, attributeValue)
      }

      if (
        variable.name === (OCPP20OptionalVariableName.HeartbeatInterval as string) &&
        resolvedAttributeType === AttributeEnumType.Actual &&
        !Number.isNaN(parseInt(attributeValue, 10)) &&
        parseInt(attributeValue, 10) > 0
      ) {
        chargingStation.restartHeartbeat()
      }

      if (
        variable.name === (OCPP20OptionalVariableName.WebSocketPingInterval as string) &&
        resolvedAttributeType === AttributeEnumType.Actual &&
        !Number.isNaN(parseInt(attributeValue, 10)) &&
        parseInt(attributeValue, 10) > 0
      ) {
        chargingStation.restartWebSocketPing()
      }
    }

    return {
      attributeStatus: rebootRequired
        ? SetVariableStatusEnumType.RebootRequired
        : SetVariableStatusEnumType.Accepted,
      attributeStatusInfo: {
        additionalInfo: rebootRequired
          ? 'Value changed, reboot required to take effect'
          : 'Value accepted',
        reasonCode: rebootRequired
          ? ReasonCodeEnumType.ChangeRequiresReboot
          : ReasonCodeEnumType.NoError,
      },
      attributeType: resolvedAttributeType,
      component,
      variable,
    }
  }

  private validateValue (
    variableKey: string,
    variable: VariableType,
    value: string
  ): { additionalInfo?: string; reasonCode?: ReasonCodeEnumType; valid: boolean } {
    // Variable-specific validation per OCPP 2.0.1 semantics

    // SampledDataCtrlr.TxUpdatedInterval: positive integer > 0
    if (variable.name === (OCPP20RequiredVariableName.TxUpdatedInterval as string)) {
      if (!/^-?[0-9]+$/.test(value)) {
        return {
          additionalInfo: 'Positive integer > 0 required',
          reasonCode: ReasonCodeEnumType.PropertyConstraintViolation,
          valid: false,
        }
      }
      const intValue = parseInt(value, 10)
      if (intValue === 0) {
        return {
          additionalInfo: 'Zero not allowed',
          reasonCode: ReasonCodeEnumType.ValueZeroNotAllowed,
          valid: false,
        }
      }
      if (intValue < 0) {
        return {
          additionalInfo: 'Negative not allowed',
          reasonCode: ReasonCodeEnumType.ValuePositiveOnly,
          valid: false,
        }
      }
    }

    // OCPPCommCtrlr.HeartbeatInterval: must be positive integer > 0
    if (variable.name === (OCPP20OptionalVariableName.HeartbeatInterval as string)) {
      if (!/^-?[0-9]+$/.test(value)) {
        return {
          additionalInfo: 'Positive integer > 0 required',
          reasonCode: ReasonCodeEnumType.PropertyConstraintViolation,
          valid: false,
        }
      }
      const intValue = parseInt(value, 10)
      if (intValue === 0) {
        return {
          additionalInfo: 'Zero not allowed',
          reasonCode: ReasonCodeEnumType.ValueZeroNotAllowed,
          valid: false,
        }
      }
      if (intValue < 0) {
        return {
          additionalInfo: 'Negative not allowed',
          reasonCode: ReasonCodeEnumType.ValuePositiveOnly,
          valid: false,
        }
      }
    }

    // OCPPCommCtrlr.WebSocketPingInterval: integer; 0 disables; negative not allowed
    if (variable.name === (OCPP20OptionalVariableName.WebSocketPingInterval as string)) {
      if (!/^-?[0-9]+$/.test(value)) {
        return {
          additionalInfo: 'Integer >= 0 required',
          reasonCode: ReasonCodeEnumType.PropertyConstraintViolation,
          valid: false,
        }
      }
      const intValue = parseInt(value, 10)
      if (intValue < 0) {
        return {
          additionalInfo: 'Negative not allowed',
          reasonCode: ReasonCodeEnumType.ValuePositiveOnly,
          valid: false,
        }
      }
    }

    // TxCtrlr.EVConnectionTimeOut: positive integer > 0
    if (variable.name === (OCPP20RequiredVariableName.EVConnectionTimeOut as string)) {
      if (!/^-?[0-9]+$/.test(value)) {
        return {
          additionalInfo: 'Positive integer > 0 required',
          reasonCode: ReasonCodeEnumType.PropertyConstraintViolation,
          valid: false,
        }
      }
      const intValue = parseInt(value, 10)
      if (intValue === 0) {
        return {
          additionalInfo: 'Zero not allowed',
          reasonCode: ReasonCodeEnumType.ValueZeroNotAllowed,
          valid: false,
        }
      }
      if (intValue < 0) {
        return {
          additionalInfo: 'Negative not allowed',
          reasonCode: ReasonCodeEnumType.ValuePositiveOnly,
          valid: false,
        }
      }
    }

    // OCPPCommCtrlr.MessageTimeout (Default attribute): positive integer > 0
    if (variable.name === (OCPP20RequiredVariableName.MessageTimeout as string)) {
      if (!/^-?[0-9]+$/.test(value)) {
        return {
          additionalInfo: 'Positive integer > 0 required',
          reasonCode: ReasonCodeEnumType.PropertyConstraintViolation,
          valid: false,
        }
      }
      const intValue = parseInt(value, 10)
      if (intValue === 0) {
        return {
          additionalInfo: 'Zero not allowed',
          reasonCode: ReasonCodeEnumType.ValueZeroNotAllowed,
          valid: false,
        }
      }
      if (intValue < 0) {
        return {
          additionalInfo: 'Negative not allowed',
          reasonCode: ReasonCodeEnumType.ValuePositiveOnly,
          valid: false,
        }
      }
    }

    // Vendor variable ChargingStation.ConnectionUrl: validate URL and scheme
    if (variable.name === (OCPP20VendorVariableName.ConnectionUrl as string)) {
      try {
        const url = new URL(value)
        if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
          return {
            additionalInfo: 'Unsupported URL scheme',
            reasonCode: ReasonCodeEnumType.InvalidURL,
            valid: false,
          }
        }
      } catch {
        return {
          additionalInfo: 'Invalid URL format',
          reasonCode: ReasonCodeEnumType.InvalidURL,
          valid: false,
        }
      }
    }

    return { valid: true }
  }
}
