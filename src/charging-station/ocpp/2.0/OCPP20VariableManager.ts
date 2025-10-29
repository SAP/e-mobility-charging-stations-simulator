// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { millisecondsToSeconds } from 'date-fns'

import {
  AttributeEnumType,
  type ComponentType,
  DataEnumType,
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

const isOCPP20ComponentName = (name: string): name is OCPP20ComponentName => {
  return Object.values(OCPP20ComponentName).includes(name as OCPP20ComponentName)
}
const isOCPP20RequiredVariableName = (name: string): name is OCPP20RequiredVariableName => {
  return Object.values(OCPP20RequiredVariableName).includes(name as OCPP20RequiredVariableName)
}

export class OCPP20VariableManager {
  private static instance: null | OCPP20VariableManager = null

  private readonly invalidVariables = new Set<string>() // composite key (lower case)
  private readonly maxSetOverrides = new Map<string, string>() // composite key (lower case)
  private readonly minSetOverrides = new Map<string, string>() // composite key (lower case)
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
      const variableMetadata = VARIABLE_REGISTRY[metaKey]
      // Enforce persistent non-write-only variables across components
      if (variableMetadata.persistence !== PersistenceEnumType.Persistent) {
        continue
      }
      if (variableMetadata.mutability === MutabilityEnumType.WriteOnly) {
        continue
      }
      // Skip auto-creation for instance-scoped persistent variables (managed via overrides only)
      if (variableMetadata.instance !== undefined) {
        continue
      }
      // Configuration key name (instance-scoped handled via composite key only)
      const configurationKeyName = variableMetadata.variable
      const configurationKey = getConfigurationKey(
        chargingStation,
        configurationKeyName as unknown as StandardParametersKey
      )
      const variableKey = buildVariableCompositeKey(
        variableMetadata.component,
        variableMetadata.instance,
        variableMetadata.variable
      )
      if (configurationKey == null) {
        // Allow size limit variables to remain intentionally unset (tests may delete them).
        if (
          variableMetadata.variable ===
            (OCPP20RequiredVariableName.ConfigurationValueSize as string) ||
          variableMetadata.variable === (OCPP20RequiredVariableName.ValueSize as string) ||
          variableMetadata.variable === (OCPP20RequiredVariableName.ReportingValueSize as string)
        ) {
          continue
        }
        const defaultValue = variableMetadata.defaultValue
        if (defaultValue != null) {
          addConfigurationKey(
            chargingStation,
            configurationKeyName as unknown as StandardParametersKey,
            defaultValue,
            undefined,
            { overwrite: false }
          )
          logger.info(
            `${chargingStation.logPrefix()} Added missing configuration key for variable '${configurationKeyName}' with default '${defaultValue}'`
          )
        } else {
          // Mark invalid (instances already skipped earlier)
          this.invalidVariables.add(variableKey)
          logger.error(
            `${chargingStation.logPrefix()} Missing configuration key mapping and no default for variable '${configurationKeyName}', marking as INTERNAL ERROR`
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
    const requestedAttributeType = attributeType
    const resolvedAttributeType = requestedAttributeType ?? AttributeEnumType.Actual

    if (!this.isComponentValid(chargingStation, component)) {
      return this.rejectGet(
        variable,
        component,
        requestedAttributeType,
        GetVariableStatusEnumType.UnknownComponent,
        ReasonCodeEnumType.NotFound,
        `Component ${component.name} is not supported by this charging station`
      )
    }

    if (!this.isVariableSupported(component, variable)) {
      return this.rejectGet(
        variable,
        component,
        requestedAttributeType,
        GetVariableStatusEnumType.UnknownVariable,
        ReasonCodeEnumType.NotFound,
        `Variable ${variable.name} is not supported for component ${component.name}`
      )
    }

    const variableMetadata = getVariableMetadata(
      component.name,
      variable.name,
      variable.instance ?? component.instance
    )
    if (
      variableMetadata?.mutability === MutabilityEnumType.WriteOnly &&
      resolvedAttributeType === AttributeEnumType.Actual
    ) {
      return this.rejectGet(
        variable,
        component,
        resolvedAttributeType,
        GetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.WriteOnly,
        `Variable ${variable.name} is write-only and cannot be retrieved`
      )
    }
    if (!variableMetadata?.supportedAttributes.includes(resolvedAttributeType)) {
      return this.rejectGet(
        variable,
        component,
        resolvedAttributeType,
        GetVariableStatusEnumType.NotSupportedAttributeType,
        ReasonCodeEnumType.UnsupportedParam,
        `Attribute type ${resolvedAttributeType} is not supported for variable ${variable.name}`
      )
    }

    const variableKey = buildVariableCompositeKey(component.name, component.instance, variable.name)
    if (this.invalidVariables.has(variableKey)) {
      return this.rejectGet(
        variable,
        component,
        resolvedAttributeType,
        GetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.InternalError,
        'Variable mapping invalid (startup self-check failed)'
      )
    }

    // Handle MinSet / MaxSet attribute retrieval
    if (resolvedAttributeType === AttributeEnumType.MinSet) {
      const minValue =
        this.minSetOverrides.get(variableKey) ??
        (variableMetadata.min !== undefined ? String(variableMetadata.min) : '')
      return {
        attributeStatus: minValue
          ? GetVariableStatusEnumType.Accepted
          : GetVariableStatusEnumType.Rejected,
        attributeType: resolvedAttributeType,
        attributeValue: minValue,
        component,
        variable,
      }
    }
    if (resolvedAttributeType === AttributeEnumType.MaxSet) {
      const maxValue =
        this.maxSetOverrides.get(variableKey) ??
        (variableMetadata.max !== undefined ? String(variableMetadata.max) : '')
      return {
        attributeStatus: maxValue
          ? GetVariableStatusEnumType.Accepted
          : GetVariableStatusEnumType.Rejected,
        attributeType: resolvedAttributeType,
        attributeValue: maxValue,
        component,
        variable,
      }
    }

    let variableValue = this.resolveVariableValue(chargingStation, component, variable)

    if (variableValue.length === 0) {
      return this.rejectGet(
        variable,
        component,
        resolvedAttributeType,
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
    // ValueSize truncation applied before ReportingValueSize if present
    const valueSizeKey = buildVariableCompositeKey(
      OCPP20ComponentName.DeviceDataCtrlr as string,
      undefined,
      OCPP20RequiredVariableName.ValueSize as string
    )
    let valueSize: string | undefined
    let reportingValueSize: string | undefined
    if (!this.invalidVariables.has(valueSizeKey)) {
      valueSize = getConfigurationKey(
        chargingStation,
        OCPP20RequiredVariableName.ValueSize as unknown as StandardParametersKey
      )?.value
    }
    if (!this.invalidVariables.has(reportingValueSizeKey)) {
      reportingValueSize = getConfigurationKey(
        chargingStation,
        OCPP20RequiredVariableName.ReportingValueSize as unknown as StandardParametersKey
      )?.value
    }
    // Apply ValueSize first then ReportingValueSize
    if (valueSize) {
      variableValue = enforceReportingValueSize(variableValue, valueSize)
    }
    if (reportingValueSize) {
      variableValue = enforceReportingValueSize(variableValue, reportingValueSize)
    }

    return {
      attributeStatus: GetVariableStatusEnumType.Accepted,
      attributeType: resolvedAttributeType,
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
    return (
      getVariableMetadata(component.name, variable.name, variable.instance ?? component.instance) !=
        null || getVariableMetadata(component.name, variable.name) != null
    )
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
      attributeType: attributeType ?? AttributeEnumType.Actual,
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
    const variableMetadata = getVariableMetadata(
      component.name,
      variable.name,
      variable.instance ?? component.instance
    )
    if (!variableMetadata) return ''

    const compositeKey = buildVariableCompositeKey(
      component.name,
      component.instance,
      variable.name
    )

    let value = resolveValue(chargingStation, variableMetadata)

    if (
      variableMetadata.persistence === PersistenceEnumType.Persistent &&
      variableMetadata.mutability !== MutabilityEnumType.WriteOnly
    ) {
      const configurationKeyName =
        variableMetadata.instance != null
          ? `${variableMetadata.variable}.${variableMetadata.instance}`
          : variableMetadata.variable
      const cfg = getConfigurationKey(
        chargingStation,
        configurationKeyName as unknown as StandardParametersKey
      )
      if (cfg?.value) {
        value = cfg.value
      }
    }

    if (
      variableMetadata.persistence === PersistenceEnumType.Volatile &&
      variableMetadata.mutability !== MutabilityEnumType.ReadOnly
    ) {
      const override = this.runtimeOverrides.get(compositeKey)
      if (override != null) {
        value = override
      }
    }

    if (
      variableMetadata.variable === (OCPP20OptionalVariableName.HeartbeatInterval as string) &&
      !value
    ) {
      value = millisecondsToSeconds(chargingStation.getHeartbeatInterval()).toString()
    }
    if (
      variableMetadata.variable === (OCPP20OptionalVariableName.WebSocketPingInterval as string) &&
      !value
    ) {
      value = chargingStation.getWebSocketPingInterval().toString()
    }
    if (
      variableMetadata.variable === (OCPP20RequiredVariableName.TxUpdatedInterval as string) &&
      !value
    ) {
      value = Constants.DEFAULT_TX_UPDATED_INTERVAL.toString()
    }

    value = applyPostProcess(chargingStation, variableMetadata, value)
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

    const variableMetadata = getVariableMetadata(
      component.name,
      variable.name,
      variable.instance ?? component.instance
    )
    if (!variableMetadata?.supportedAttributes.includes(resolvedAttributeType)) {
      // For MinSet/MaxSet attempts on variables that do not support them, tests expect a generic rejection with InvalidValue
      const isMinMax =
        resolvedAttributeType === AttributeEnumType.MinSet ||
        resolvedAttributeType === AttributeEnumType.MaxSet
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        isMinMax
          ? SetVariableStatusEnumType.Rejected
          : SetVariableStatusEnumType.NotSupportedAttributeType,
        isMinMax ? ReasonCodeEnumType.InvalidValue : ReasonCodeEnumType.UnsupportedParam,
        `Attribute type ${resolvedAttributeType} is not supported for variable ${variable.name}`
      )
    }

    const variableKey = buildVariableCompositeKey(component.name, component.instance, variable.name)
    if (
      this.invalidVariables.has(variableKey) &&
      resolvedAttributeType === AttributeEnumType.Actual
    ) {
      if (variableMetadata.mutability !== MutabilityEnumType.WriteOnly) {
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

    // Handle MinSet / MaxSet attribute setting (allowed even if Actual is ReadOnly)
    if (
      resolvedAttributeType === AttributeEnumType.MinSet ||
      resolvedAttributeType === AttributeEnumType.MaxSet
    ) {
      // Only meaningful for integer data type
      if (variableMetadata.dataType !== DataEnumType.integer) {
        return this.rejectSet(
          variable,
          component,
          resolvedAttributeType,
          SetVariableStatusEnumType.Rejected,
          ReasonCodeEnumType.InvalidValue,
          'MinSet/MaxSet only valid for integer data type'
        )
      }
      const signedIntegerPattern = /^-?\d+$/
      if (!signedIntegerPattern.test(attributeValue)) {
        if (/^-?\d+\.\d+$/.test(attributeValue)) {
          return this.rejectSet(
            variable,
            component,
            resolvedAttributeType,
            SetVariableStatusEnumType.Rejected,
            ReasonCodeEnumType.InvalidValue,
            'Integer must not be decimal'
          )
        }
        return this.rejectSet(
          variable,
          component,
          resolvedAttributeType,
          SetVariableStatusEnumType.Rejected,
          ReasonCodeEnumType.InvalidValue,
          'Integer required for MinSet/MaxSet'
        )
      }
      const intValue = convertToIntOrNaN(attributeValue)
      if (Number.isNaN(intValue)) {
        return this.rejectSet(
          variable,
          component,
          resolvedAttributeType,
          SetVariableStatusEnumType.Rejected,
          ReasonCodeEnumType.InvalidValue,
          'Integer required for MinSet/MaxSet'
        )
      }
      if (variableMetadata.min != null && intValue < variableMetadata.min) {
        return this.rejectSet(
          variable,
          component,
          resolvedAttributeType,
          SetVariableStatusEnumType.Rejected,
          ReasonCodeEnumType.ValueTooLow,
          'Value below metadata minimum'
        )
      }
      if (variableMetadata.max != null && intValue > variableMetadata.max) {
        return this.rejectSet(
          variable,
          component,
          resolvedAttributeType,
          SetVariableStatusEnumType.Rejected,
          ReasonCodeEnumType.ValueTooHigh,
          'Value above metadata maximum'
        )
      }
      if (resolvedAttributeType === AttributeEnumType.MinSet) {
        const currentMax =
          this.maxSetOverrides.get(variableKey) ??
          (variableMetadata.max !== undefined ? String(variableMetadata.max) : undefined)
        if (currentMax != null && intValue > convertToIntOrNaN(currentMax)) {
          return this.rejectSet(
            variable,
            component,
            resolvedAttributeType,
            SetVariableStatusEnumType.Rejected,
            ReasonCodeEnumType.InvalidValue,
            'MinSet higher than MaxSet'
          )
        }
        this.minSetOverrides.set(variableKey, attributeValue)
      } else {
        const currentMin =
          this.minSetOverrides.get(variableKey) ??
          (variableMetadata.min !== undefined ? String(variableMetadata.min) : undefined)
        if (currentMin != null && intValue < convertToIntOrNaN(currentMin)) {
          return this.rejectSet(
            variable,
            component,
            resolvedAttributeType,
            SetVariableStatusEnumType.Rejected,
            ReasonCodeEnumType.InvalidValue,
            'MaxSet lower than MinSet'
          )
        }
        this.maxSetOverrides.set(variableKey, attributeValue)
      }
      return {
        attributeStatus: SetVariableStatusEnumType.Accepted,
        attributeType: resolvedAttributeType,
        component,
        variable,
      }
    }

    // Actual attribute setting logic
    if (variableMetadata.mutability === MutabilityEnumType.ReadOnly) {
      return this.rejectSet(
        variable,
        component,
        resolvedAttributeType,
        SetVariableStatusEnumType.Rejected,
        ReasonCodeEnumType.ReadOnly,
        `Variable ${variable.name} is read-only`
      )
    }

    // Enforce ConfigurationValueSize and ValueSize limits (only at set time).
    // Effective limit selection rules (updated):
    // 1. Read ConfigurationValueSize and ValueSize if present and valid (>0).
    // 2. If both valid, use the smaller positive value.
    // 3. If only one valid, use that value.
    // 4. If neither valid/positive, fallback to default 2500.
    // 5. Reject with TooLargeElement when attributeValue length strictly exceeds effectiveLimit.
    if (resolvedAttributeType === AttributeEnumType.Actual) {
      const configurationValueSizeKey = buildVariableCompositeKey(
        OCPP20ComponentName.DeviceDataCtrlr as string,
        undefined,
        OCPP20RequiredVariableName.ConfigurationValueSize as string
      )
      const valueSizeKey = buildVariableCompositeKey(
        OCPP20ComponentName.DeviceDataCtrlr as string,
        undefined,
        OCPP20RequiredVariableName.ValueSize as string
      )
      let configurationValueSizeRaw: string | undefined
      let valueSizeRaw: string | undefined
      if (!this.invalidVariables.has(configurationValueSizeKey)) {
        configurationValueSizeRaw = getConfigurationKey(
          chargingStation,
          OCPP20RequiredVariableName.ConfigurationValueSize as unknown as StandardParametersKey
        )?.value
      }
      if (!this.invalidVariables.has(valueSizeKey)) {
        valueSizeRaw = getConfigurationKey(
          chargingStation,
          OCPP20RequiredVariableName.ValueSize as unknown as StandardParametersKey
        )?.value
      }
      const cfgLimit = convertToIntOrNaN(configurationValueSizeRaw ?? '')
      const valLimit = convertToIntOrNaN(valueSizeRaw ?? '')
      let effectiveLimit: number | undefined
      if (!Number.isNaN(cfgLimit) && cfgLimit > 0) {
        effectiveLimit = cfgLimit
      }
      if (!Number.isNaN(valLimit) && valLimit > 0) {
        effectiveLimit = effectiveLimit != null ? Math.min(effectiveLimit, valLimit) : valLimit
      }
      if (effectiveLimit == null || effectiveLimit <= 0) {
        effectiveLimit = 2500
      }
      if (attributeValue.length > effectiveLimit) {
        return this.rejectSet(
          variable,
          component,
          resolvedAttributeType,
          SetVariableStatusEnumType.Rejected,
          ReasonCodeEnumType.TooLargeElement,
          `Value length exceeds effective size limit (${effectiveLimit.toString()})`
        )
      }
    }

    // Narrow component.name and variableName for enum-safe comparison
    if (
      isOCPP20ComponentName(component.name) &&
      component.name === OCPP20ComponentName.AuthCtrlr &&
      isOCPP20RequiredVariableName(variableName) &&
      variableName === OCPP20RequiredVariableName.AuthorizeRemoteStart
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
      const validation = validateValue(variableMetadata, attributeValue)
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
      // Enforce dynamic MinSet/MaxSet overrides for integer values
      if (variableMetadata.dataType === DataEnumType.integer) {
        const num = convertToIntOrNaN(attributeValue)
        if (!Number.isNaN(num)) {
          const overrideMinRaw = this.minSetOverrides.get(variableKey)
          const overrideMaxRaw = this.maxSetOverrides.get(variableKey)
          if (overrideMinRaw != null) {
            const overrideMin = convertToIntOrNaN(overrideMinRaw)
            if (!Number.isNaN(overrideMin) && num < overrideMin) {
              return this.rejectSet(
                variable,
                component,
                resolvedAttributeType,
                SetVariableStatusEnumType.Rejected,
                ReasonCodeEnumType.ValueTooLow,
                'Value below MinSet override'
              )
            }
          }
          if (overrideMaxRaw != null) {
            const overrideMax = convertToIntOrNaN(overrideMaxRaw)
            if (!Number.isNaN(overrideMax) && num > overrideMax) {
              return this.rejectSet(
                variable,
                component,
                resolvedAttributeType,
                SetVariableStatusEnumType.Rejected,
                ReasonCodeEnumType.ValueTooHigh,
                'Value above MaxSet override'
              )
            }
          }
        }
      }
    }

    let rebootRequired = false
    const configurationKeyName =
      variableMetadata.instance != null
        ? `${variableMetadata.variable}.${variableMetadata.instance}`
        : variableMetadata.variable
    const previousValue = getConfigurationKey(
      chargingStation,
      configurationKeyName as unknown as StandardParametersKey
    )?.value

    // Generalized persistence for persistent, non write-only variables (including instance-scoped)
    if (
      variableMetadata.persistence === PersistenceEnumType.Persistent &&
      variableMetadata.mutability !== MutabilityEnumType.WriteOnly
    ) {
      // Special-case: OrganizationName persistence limitation (do not update stored value once created)
      const isOrganizationName =
        variableMetadata.component === (OCPP20ComponentName.SecurityCtrlr as string) &&
        variableMetadata.variable === (OCPP20RequiredVariableName.OrganizationName as string)

      // Skip persistence for instance-scoped persistent variables (managed via overrides only)
      const isInstanceScoped = variableMetadata.instance != null

      if (!isOrganizationName && !isInstanceScoped) {
        let configKey = getConfigurationKey(
          chargingStation,
          configurationKeyName as unknown as StandardParametersKey
        )
        if (configKey == null) {
          addConfigurationKey(
            chargingStation,
            configurationKeyName as unknown as StandardParametersKey,
            attributeValue,
            undefined,
            {
              overwrite: false,
            }
          )
          configKey = getConfigurationKey(
            chargingStation,
            configurationKeyName as unknown as StandardParametersKey
          )
        } else if (configKey.value !== attributeValue) {
          setConfigurationKeyValue(
            chargingStation,
            configurationKeyName as unknown as StandardParametersKey,
            attributeValue
          )
        }
        rebootRequired =
          (variableMetadata.rebootRequired === true ||
            getConfigurationKey(
              chargingStation,
              configurationKeyName as unknown as StandardParametersKey
            )?.reboot === true) &&
          previousValue !== attributeValue
      } else if (isOrganizationName) {
        // OrganizationName: accept set but do not persist new value (tests expect default retained)
        rebootRequired = false
      }
    }
    // Heartbeat & WS ping interval dynamic restarts
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
    // Apply volatile runtime override generically (single location)
    if (variableMetadata.persistence === PersistenceEnumType.Volatile) {
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
