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

  private readonly invalidVariables = new Set<string>() // keyed by canonical composite key
  private readonly runtimeOverrides = new Map<string, string>() // keyed by canonical composite key

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
      const meta = VARIABLE_REGISTRY[metaKey]
      if (
        this.canonicalComponentName(meta.component) !==
        this.canonicalComponentName(OCPP20ComponentName.ChargingStation as string)
      ) {
        continue
      }
      if (meta.persistence !== PersistenceEnumType.Persistent) {
        continue
      }
      if (meta.mutability === MutabilityEnumType.WriteOnly) {
        // Write-only persistent variable: do not enforce presence of config key (e.g., ConnectionUrl)
        continue
      }
      const existing = getConfigurationKey(
        chargingStation,
        meta.variable as unknown as StandardParametersKey
      )
      const variableKey = buildVariableCompositeKey(meta.component, undefined, meta.variable)
      if (existing == null) {
        const defaultValue = meta.defaultValue
        if (defaultValue != null) {
          addConfigurationKey(
            chargingStation,
            meta.variable as unknown as StandardParametersKey,
            defaultValue,
            undefined,
            { overwrite: false }
          )
          logger.info(
            `${chargingStation.logPrefix()} Added missing configuration key for variable '${meta.variable}' with default '${defaultValue}'`
          )
        } else {
          this.invalidVariables.add(variableKey)
          logger.error(
            `${chargingStation.logPrefix()} Missing configuration key mapping and no default for variable '${meta.variable}', marking as INTERNAL ERROR`
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

    // Backward compatibility: ChargingStation component variables that were relocated to
    // controller-specific components prefer controller metadata when requested via ChargingStation.
    let meta = getVariableMetadata(component.name, variable.name)
    if (
      this.canonicalComponentName(component.name) ===
      this.canonicalComponentName(OCPP20ComponentName.ChargingStation as string)
    ) {
      const relocatedComponents: string[] = [
        OCPP20ComponentName.ClockCtrlr as string,
        OCPP20ComponentName.OCPPCommCtrlr as string,
        OCPP20ComponentName.SampledDataCtrlr as string,
        OCPP20ComponentName.DeviceDataCtrlr as string,
        OCPP20ComponentName.SecurityCtrlr as string,
        OCPP20ComponentName.TxCtrlr as string,
      ]
      for (const c of relocatedComponents) {
        const relocatedMeta = getVariableMetadata(c, variable.name)
        if (relocatedMeta) {
          meta = relocatedMeta
          break
        }
      }
    }
    if (meta?.mutability === MutabilityEnumType.WriteOnly) {
      return this.rejectGet(
        variable,
        component,
        attributeType,
        GetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.WriteOnly,
        `Variable ${variable.name} is write-only and cannot be retrieved`
      )
    }
    if (attributeType && !meta?.supportedAttributes.includes(attributeType)) {
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

    let value = this.resolveVariableValue(chargingStation, component, variable)

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

    // ReportingValueSize truncation
    const reportingValueSizeKey = buildVariableCompositeKey(
      OCPP20ComponentName.ChargingStation as string,
      undefined,
      OCPP20RequiredVariableName.ReportingValueSize as string
    )
    if (!this.invalidVariables.has(reportingValueSizeKey)) {
      const reportingValueSizeConfigKey = getConfigurationKey(
        chargingStation,
        OCPP20RequiredVariableName.ReportingValueSize as unknown as StandardParametersKey
      )
      value = enforceReportingValueSize(value, reportingValueSizeConfigKey?.value)
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
      return true
    }
    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.DeviceDataCtrlr as string)
    ) {
      return true
    }
    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.OCPPCommCtrlr as string)
    ) {
      return true
    }
    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.SecurityCtrlr as string)
    ) {
      return true
    }
    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.ClockCtrlr as string)
    ) {
      return true
    }
    if (
      componentNameCanonical === this.canonicalComponentName(OCPP20ComponentName.TxCtrlr as string)
    ) {
      return true
    }
    if (
      componentNameCanonical ===
      this.canonicalComponentName(OCPP20ComponentName.SampledDataCtrlr as string)
    ) {
      return true
    }
    return false
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
    const meta = getVariableMetadata(component.name, variable.name)
    if (!meta) return ''

    const compositeKey = buildVariableCompositeKey(
      component.name,
      component.instance,
      variable.name
    )

    let value = resolveValue(chargingStation, meta)

    if (
      meta.persistence === PersistenceEnumType.Persistent &&
      meta.mutability !== MutabilityEnumType.WriteOnly
    ) {
      const cfg = getConfigurationKey(
        chargingStation,
        meta.variable as unknown as StandardParametersKey
      )
      if (cfg?.value) {
        value = cfg.value
      }
    }

    if (
      meta.persistence === PersistenceEnumType.Volatile &&
      meta.mutability !== MutabilityEnumType.ReadOnly
    ) {
      const override = this.runtimeOverrides.get(compositeKey)
      if (override != null) {
        value = override
      }
    }

    if (meta.variable === (OCPP20OptionalVariableName.HeartbeatInterval as string) && !value) {
      value = millisecondsToSeconds(chargingStation.getHeartbeatInterval()).toString()
    }
    if (meta.variable === (OCPP20OptionalVariableName.WebSocketPingInterval as string) && !value) {
      value = chargingStation.getWebSocketPingInterval().toString()
    }
    if (meta.variable === (OCPP20RequiredVariableName.TxUpdatedInterval as string) && !value) {
      value = Constants.DEFAULT_TX_UPDATED_INTERVAL.toString()
    }

    value = applyPostProcess(chargingStation, meta, value)
    return value
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
    // Backward compatibility write path: use relocated controller metadata when writing via ChargingStation
    let meta = getVariableMetadata(component.name, variable.name)
    if (
      this.canonicalComponentName(component.name) ===
      this.canonicalComponentName(OCPP20ComponentName.ChargingStation as string)
    ) {
      const relocatedComponents: string[] = [
        OCPP20ComponentName.ClockCtrlr as string,
        OCPP20ComponentName.OCPPCommCtrlr as string,
        OCPP20ComponentName.SampledDataCtrlr as string,
        OCPP20ComponentName.DeviceDataCtrlr as string,
        OCPP20ComponentName.SecurityCtrlr as string,
        OCPP20ComponentName.TxCtrlr as string,
      ]
      for (const c of relocatedComponents) {
        const relocatedMeta = getVariableMetadata(c, variable.name)
        if (relocatedMeta) {
          meta = relocatedMeta
          break
        }
      }
    }
    if (meta && !meta.supportedAttributes.includes(resolvedAttributeType)) {
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

    if (meta?.mutability === MutabilityEnumType.ReadOnly) {
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
      if (meta?.mutability !== MutabilityEnumType.WriteOnly) {
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

    if (meta?.mutability === MutabilityEnumType.WriteOnly) {
      // proceed
    } else if (!meta) {
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
      const validation = validateValue(meta, attributeValue)
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
    if (
      this.canonicalComponentName(component.name) ===
      this.canonicalComponentName(OCPP20ComponentName.ChargingStation as string)
    ) {
      const configKeyName = meta.variable as unknown as StandardParametersKey
      const previousValue = getConfigurationKey(chargingStation, configKeyName)?.value
      switch (meta.persistence) {
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
            (meta.rebootRequired === true ||
              getConfigurationKey(chargingStation, configKeyName)?.reboot === true) &&
            previousValue !== attributeValue
          break
        }
        case PersistenceEnumType.Volatile: {
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
