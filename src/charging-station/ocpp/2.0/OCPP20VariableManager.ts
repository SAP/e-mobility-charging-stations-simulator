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
  ReasonCodeEnumType,
  type VariableType,
} from '../../../types/index.js'
import { Constants, logger } from '../../../utils/index.js'
import { type ChargingStation } from '../../ChargingStation.js'

/**
 * Configuration for a standard OCPP 2.0 variable
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

  private readonly standardVariables = new Map<string, StandardVariableConfig>()

  private constructor () {
    this.initializeStandardVariables()
  }

  public static getInstance (): OCPP20VariableManager {
    OCPP20VariableManager.instance ??= new OCPP20VariableManager()
    return OCPP20VariableManager.instance
  }

  /**
   * Get variable data for a charging station
   * @param chargingStation - The charging station instance
   * @param getVariableData - Array of variable data to retrieve
   * @returns Array of variable results
   */
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
          attributeType: variableData.attributeType,
          component: variableData.component,
          statusInfo: {
            additionalInfo: 'Internal error occurred while retrieving variable',
            reasonCode: ReasonCodeEnumType.InternalError,
          },
          variable: variableData.variable,
        })
      }
    }

    return results
  }

  /**
   * Get a single variable
   * @param chargingStation - The charging station instance
   * @param variableData - Variable data to retrieve
   * @returns Variable result
   */
  private getVariable (
    chargingStation: ChargingStation,
    variableData: OCPP20GetVariableDataType
  ): OCPP20GetVariableResultType {
    const { attributeType, component, variable } = variableData

    // Check if component is valid for this charging station
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

    // Check if variable exists
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

    // Check if attribute type is supported
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

    // Get the variable value
    const variableValue = this.getVariableValue(chargingStation, component, variable, attributeType)

    return {
      attributeStatus: GetVariableStatusEnumType.Accepted,
      attributeType,
      attributeValue: variableValue,
      component,
      variable,
    }
  }

  /**
   * Get the actual variable value from the charging station
   * @param chargingStation - The charging station instance
   * @param component - The component containing the variable
   * @param variable - The variable to get the value for
   * @param attributeType - The type of attribute (Actual, Target, etc.)
   * @returns The variable value as string
   */
  private getVariableValue (
    chargingStation: ChargingStation,
    component: ComponentType,
    variable: VariableType,
    attributeType?: AttributeEnumType
  ): string {
    const variableName = variable.name
    const componentName = component.name

    // Handle standard ChargingStation variables
    if (componentName === (OCPP20ComponentName.ChargingStation as string)) {
      if (variableName === (OCPP20OptionalVariableName.HeartbeatInterval as string)) {
        return millisecondsToSeconds(chargingStation.getHeartbeatInterval()).toString()
      }

      if (variableName === (OCPP20OptionalVariableName.WebSocketPingInterval as string)) {
        return chargingStation.getWebSocketPingInterval().toString()
      }

      if (variableName === (OCPP20RequiredVariableName.EVConnectionTimeOut as string)) {
        return Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString()
      }

      if (variableName === (OCPP20RequiredVariableName.MessageTimeout as string)) {
        return chargingStation.getConnectionTimeout().toString()
      }

      // Try to get from OCPP configuration
      const configKey = chargingStation.ocppConfiguration?.configurationKey?.find(
        key => key.key === variableName
      )
      return configKey?.value ?? ''
    }

    // Handle Connector variables
    if (componentName === (OCPP20ComponentName.Connector as string)) {
      const connectorId = component.instance ? parseInt(component.instance, 10) : 1
      const connector = chargingStation.connectors.get(connectorId)

      if (connector) {
        // Add connector-specific variable handling here
        switch (variableName) {
          // Add connector variables as needed
          default:
            return ''
        }
      }
    }

    // Handle EVSE variables
    if (componentName === (OCPP20ComponentName.EVSE as string)) {
      const evseId = component.instance ? parseInt(component.instance, 10) : 1
      const evse = chargingStation.evses.get(evseId)

      if (evse) {
        // Add EVSE-specific variable handling here
        switch (variableName) {
          // Add EVSE variables as needed
          default:
            return ''
        }
      }
    }

    return ''
  }

  /**
   * Initialize standard OCPP 2.0 variables configuration
   */
  private initializeStandardVariables (): void {
    // ChargingStation component variables
    this.standardVariables.set(
      `${OCPP20ComponentName.ChargingStation}.${OCPP20OptionalVariableName.HeartbeatInterval}`,
      {
        attributeTypes: [AttributeEnumType.Actual, AttributeEnumType.Target],
        defaultValue: millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString(),
        mutability: MutabilityEnumType.ReadWrite,
        persistent: true,
      }
    )

    this.standardVariables.set(
      `${OCPP20ComponentName.ChargingStation}.${OCPP20OptionalVariableName.WebSocketPingInterval}`,
      {
        attributeTypes: [AttributeEnumType.Actual, AttributeEnumType.Target],
        defaultValue: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL.toString(),
        mutability: MutabilityEnumType.ReadWrite,
        persistent: true,
      }
    )

    this.standardVariables.set(
      `${OCPP20ComponentName.ChargingStation}.${OCPP20RequiredVariableName.EVConnectionTimeOut}`,
      {
        attributeTypes: [AttributeEnumType.Actual, AttributeEnumType.Target],
        defaultValue: Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString(),
        mutability: MutabilityEnumType.ReadWrite,
        persistent: true,
      }
    )

    this.standardVariables.set(
      `${OCPP20ComponentName.ChargingStation}.${OCPP20RequiredVariableName.MessageTimeout}`,
      {
        attributeTypes: [AttributeEnumType.Actual, AttributeEnumType.Target],
        defaultValue: Constants.DEFAULT_CONNECTION_TIMEOUT.toString(),
        mutability: MutabilityEnumType.ReadWrite,
        persistent: true,
      }
    )

    // Add more standard variables as needed
  }

  /**
   * Check if attribute type is supported for the variable
   * @param variable - The variable to check attribute support for
   * @param attributeType - The attribute type to validate
   * @returns True if the attribute type is supported by the variable
   */
  private isAttributeTypeSupported (
    variable: VariableType,
    attributeType: AttributeEnumType
  ): boolean {
    // Most variables support only Actual attribute by default
    // Only certain variables support other attribute types like Target, MinSet, MaxSet
    if (attributeType === AttributeEnumType.Actual) {
      return true
    }

    // For other attribute types, check if variable supports them
    // This is a simplified implementation - in production you'd have a configuration map
    const variablesWithConfigurableAttributes: string[] = [
      OCPP20OptionalVariableName.WebSocketPingInterval,
      // Add other variables that support configuration
    ]

    return variablesWithConfigurableAttributes.includes(variable.name)
  }

  /**
   * Check if a component is valid for the charging station
   * @param chargingStation - The charging station instance to validate against
   * @param component - The component to check validity for
   * @returns True if the component is valid for the charging station
   */
  private isComponentValid (chargingStation: ChargingStation, component: ComponentType): boolean {
    const componentName = component.name

    // Always support ChargingStation component
    if (componentName === (OCPP20ComponentName.ChargingStation as string)) {
      return true
    }

    // Support Connector components if station has connectors
    if (
      componentName === (OCPP20ComponentName.Connector as string) &&
      chargingStation.connectors.size > 0
    ) {
      // Check if specific connector instance exists
      if (component.instance != null) {
        const connectorId = parseInt(component.instance, 10)
        return chargingStation.connectors.has(connectorId)
      }
      return true
    }

    // Support EVSE components if station has EVSEs
    if (componentName === (OCPP20ComponentName.EVSE as string) && chargingStation.hasEvses) {
      // Check if specific EVSE instance exists
      if (component.instance != null) {
        const evseId = parseInt(component.instance, 10)
        return chargingStation.evses.has(evseId)
      }
      return true
    }

    // Other components can be added here as needed
    return false
  }

  /**
   * Check if a variable is supported by the component
   * @param chargingStation - The charging station instance
   * @param component - The component to check
   * @param variable - The variable to validate
   * @returns True if the variable is supported by the component
   */
  private isVariableSupported (
    chargingStation: ChargingStation,
    component: ComponentType,
    variable: VariableType
  ): boolean {
    const variableKey = `${component.name}.${variable.name}`

    // Check standard variables
    if (this.standardVariables.has(variableKey)) {
      return true
    }

    // Check known optional and required variables
    const knownVariables = [
      ...Object.values(OCPP20OptionalVariableName),
      ...Object.values(OCPP20RequiredVariableName),
    ]

    return knownVariables.includes(
      variable.name as OCPP20OptionalVariableName | OCPP20RequiredVariableName
    )
  }
}
