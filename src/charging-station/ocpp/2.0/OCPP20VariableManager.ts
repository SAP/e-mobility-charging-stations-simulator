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
  PersistenceEnumType,
  ReasonCodeEnumType,
  SetVariableStatusEnumType,
  type VariableType,
} from '../../../types/index.js'
import { StandardParametersKey } from '../../../types/ocpp/Configuration.js'
import { Constants, convertToIntOrNaN, logger } from '../../../utils/index.js'
import { type ChargingStation } from '../../ChargingStation.js'
import {
  addConfigurationKey,
  getConfigurationKey,
  setConfigurationKeyValue,
} from '../../ConfigurationKeyUtils.js'
import {
  applyPostProcess,
  buildVariableCompositeKey,
  enforceReportingValueSize,
  getVariableMetadata,
  resolveValue,
  validateValue,
  VARIABLE_REGISTRY,
} from './OCPP20VariableRegistry.js'

export class OCPP20VariableManager {
  private static instance: null | OCPP20VariableManager = null

  private readonly invalidVariables = new Set<string>() // composite key (lower case)
  private readonly runtimeOverrides = new Map<string, string>() // composite key (lower case)

  private constructor () {
    /* This is intentional */
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
    this.invalidVariables.clear()
    for (const metaKey of Object.keys(VARIABLE_REGISTRY)) {
      const variableMetaData = VARIABLE_REGISTRY[metaKey]
      // Only enforce persistent RW variables on ChargingStation base component
      if (variableMetaData.component !== (OCPP20ComponentName.ChargingStation as string)) {
        continue
      }
      if (variableMetaData.persistence !== PersistenceEnumType.Persistent) {
        continue
      }
      if (variableMetaData.mutability === MutabilityEnumType.WriteOnly) {
        continue
      }
      const configurationKey = getConfigurationKey(
        chargingStation,
        variableMetaData.variable as unknown as StandardParametersKey
      )
      const variableKey = buildVariableCompositeKey(
        variableMetaData.component,
        undefined,
        variableMetaData.variable
      )
      if (configurationKey == null) {
        const defaultValue = variableMetaData.defaultValue
        if (defaultValue != null) {
          addConfigurationKey(
            chargingStation,
            variableMetaData.variable as unknown as StandardParametersKey,
            defaultValue,
            undefined,
            { overwrite: false }
          )
          logger.info(
            `${chargingStation.logPrefix()} Added missing configuration key for variable '${variableMetaData.variable}' with default '${defaultValue}'`
          )
        } else {
          this.invalidVariables.add(variableKey)
          logger.error(
            `${chargingStation.logPrefix()} Missing configuration key mapping and no default for variable '${variableMetaData.variable}', marking as INTERNAL ERROR`
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

    const variableMetaData = getVariableMetadata(component.name, variable.name)
    if (variableMetaData?.mutability === MutabilityEnumType.WriteOnly) {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.WriteOnly,
        `Variable ${variable.name} is write-only and cannot be retrieved`
      )
    }
    if (attributeType && !variableMetaData?.supportedAttributes.includes(attributeType)) {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.NotSupportedAttributeType,
        ReasonCodeEnumType.UnsupportedParam,
        `Attribute type ${attributeType} is not supported for variable ${variable.name}`
      )
    }

    const variableKey = buildVariableCompositeKey(component.name, component.instance, variable.name)
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

    let variableValue = this.resolveVariableValue(chargingStation, component, variable)

    if (variableValue.length === 0) {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.InvalidValue,
        'Resolved variable value is empty'
      )
    }

    // ReportingValueSize truncation (DeviceDataCtrlr authoritative)
    const reportingValueSizeKey = buildVariableCompositeKey(
      OCPP20ComponentName.DeviceDataCtrlr as string,
      undefined,
      OCPP20RequiredVariableName.ReportingValueSize as string
    )
    if (!this.invalidVariables.has(reportingValueSizeKey)) {
      const reportingValueSizeConfigKey = getConfigurationKey(
        chargingStation,
        OCPP20RequiredVariableName.ReportingValueSize as unknown as StandardParametersKey
      )
      variableValue = enforceReportingValueSize(variableValue, reportingValueSizeConfigKey?.value)
    }

    return {
      attributeStatus: GetVariableStatusEnumType.Accepted,
      attributeType,
      attributeValue: variableValue,
      component,
      variable,
    }
  }

  private isComponentValid (_chargingStation: ChargingStation, component: ComponentType): boolean {
    const supported = new Set<string>([
      OCPP20ComponentName.AuthCtrlr as string,
      OCPP20ComponentName.ChargingStation as string,
      OCPP20ComponentName.ClockCtrlr as string,
      OCPP20ComponentName.DeviceDataCtrlr as string,
      OCPP20ComponentName.OCPPCommCtrlr as string,
      OCPP20ComponentName.SampledDataCtrlr as string,
      OCPP20ComponentName.SecurityCtrlr as string,
      OCPP20ComponentName.TxCtrlr as string,
    ])
    return supported.has(component.name)
  }

  private isVariableSupported (component: ComponentType, variable: VariableType): boolean {
    return getVariableMetadata(component.name, variable.name) != null
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
    const variableMetaData = getVariableMetadata(component.name, variable.name)
    if (!variableMetaData) return ''

    const compositeKey = buildVariableCompositeKey(
      component.name,
      component.instance,
      variable.name
    )

    let value = resolveValue(chargingStation, variableMetaData)

    if (
      variableMetaData.persistence === PersistenceEnumType.Persistent &&
      variableMetaData.mutability !== MutabilityEnumType.WriteOnly
    ) {
      const cfg = getConfigurationKey(
        chargingStation,
        variableMetaData.variable as unknown as StandardParametersKey
      )
      if (cfg?.value) {
        value = cfg.value
      }
    }

    if (
      variableMetaData.persistence === PersistenceEnumType.Volatile &&
      variableMetaData.mutability !== MutabilityEnumType.ReadOnly
    ) {
      const override = this.runtimeOverrides.get(compositeKey)
      if (override != null) {
        value = override
      }
    }

    if (
      variableMetaData.variable === (OCPP20OptionalVariableName.HeartbeatInterval as string) &&
      !value
    ) {
      value = millisecondsToSeconds(chargingStation.getHeartbeatInterval()).toString()
    }
    if (
      variableMetaData.variable === (OCPP20OptionalVariableName.WebSocketPingInterval as string) &&
      !value
    ) {
      value = chargingStation.getWebSocketPingInterval().toString()
    }
    if (
      variableMetaData.variable === (OCPP20RequiredVariableName.TxUpdatedInterval as string) &&
      !value
    ) {
      value = Constants.DEFAULT_TX_UPDATED_INTERVAL.toString()
    }

    value = applyPostProcess(chargingStation, variableMetaData, value)
    return value
  }

  private setVariable (
    chargingStation: ChargingStation,
    variableData: OCPP20SetVariableDataType
  ): OCPP20SetVariableResultType {
    const { attributeType, attributeValue, component, variable } = variableData
    const resolvedAttributeType = attributeType ?? AttributeEnumType.Actual
    const variableName = variable.name

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

    const variableMetaData = getVariableMetadata(component.name, variable.name)
    if (variableMetaData && !variableMetaData.supportedAttributes.includes(resolvedAttributeType)) {
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

    if (variableMetaData?.mutability === MutabilityEnumType.ReadOnly) {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.ReadOnly,
        `Variable ${variable.name} is read-only`
      )
    }

    const variableKey = buildVariableCompositeKey(component.name, component.instance, variable.name)
    if (this.invalidVariables.has(variableKey)) {
      if (variableMetaData?.mutability !== MutabilityEnumType.WriteOnly) {
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

    if (variableMetaData?.mutability === MutabilityEnumType.WriteOnly) {
      // proceed
    } else if (!variableMetaData) {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.UnsupportedParam,
        `Variable ${variable.name} unsupported for write operations`
      )
    }

    if (
      component.name === (OCPP20ComponentName.AuthCtrlr as string) &&
      variableName === (OCPP20RequiredVariableName.AuthorizeRemoteStart as string)
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
      const validation = validateValue(variableMetaData, attributeValue)
      if (!validation.ok) {
        return this.rejectSet(
          variable,
          component,
          resolvedAttributeType,
          SetVariableStatusEnumType.Rejected,
          validation.reason ?? ReasonCodeEnumType.InvalidValue,
          validation.info ?? 'Invalid value'
        )
      }
    }

    let rebootRequired = false
    if (component.name === (OCPP20ComponentName.ChargingStation as string)) {
      const configKeyName = variableMetaData.variable as unknown as StandardParametersKey
      const previousValue = getConfigurationKey(chargingStation, configKeyName)?.value
      switch (variableMetaData.persistence) {
        case PersistenceEnumType.Persistent: {
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
            (variableMetaData.rebootRequired === true ||
              getConfigurationKey(chargingStation, configKeyName)?.reboot === true) &&
            previousValue !== attributeValue
          break
        }
        case PersistenceEnumType.Volatile: {
          // Handled generically below; no action here to avoid duplication
          break
        }
      }
      if (
        variableName === (OCPP20OptionalVariableName.HeartbeatInterval as string) &&
        !Number.isNaN(convertToIntOrNaN(attributeValue)) &&
        convertToIntOrNaN(attributeValue) > 0
      ) {
        chargingStation.restartHeartbeat()
      }
      if (
        variableName === (OCPP20OptionalVariableName.WebSocketPingInterval as string) &&
        !Number.isNaN(convertToIntOrNaN(attributeValue)) &&
        convertToIntOrNaN(attributeValue) >= 0
      ) {
        chargingStation.restartWebSocketPing()
      }
    }
    // Apply volatile runtime override generically (single location)
    if (variableMetaData.persistence === PersistenceEnumType.Volatile) {
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
