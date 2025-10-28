import { AttributeEnumType, DataTypeEnumType, MutabilityEnumType, OCPP20ComponentName, PersistenceEnumType } from '../../../types/index.js'
import {
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  OCPP20VendorVariableName,
} from '../../../types/ocpp/2.0/Variables.js'

export interface VariableCharacteristics {
  component: string
  dataType: DataTypeEnumType
  description?: string
  enumeration?: string[]
  instanceScoped?: boolean
  max?: number
  maxLength?: number
  min?: number
  mutability: MutabilityEnumType
  persistence: PersistenceEnumType
  rebootRequired?: boolean
  supportedAttributes: AttributeEnumType[]
  supportsMonitoring?: boolean
  unit?: string
  variable: string
  vendorSpecific?: boolean
}

// Helper to build composite registry key
/**
 * Build a composite key used in the variable characteristics registry.
 * Combines component and variable names using '::' delimiter.
 * @param component Component name (original case)
 * @param variable Variable name (original case)
 * @returns Composite key in format '<component>::<variable>'
 */
function key (component: string, variable: string): string {
  return `${component}::${variable}`
}

export const VARIABLE_CHARACTERISTICS_REGISTRY: Record<string, VariableCharacteristics> = {
  [key(
    OCPP20ComponentName.AuthCtrlr as string,
    OCPP20RequiredVariableName.AuthorizeRemoteStart as string
  )]: {
    component: OCPP20ComponentName.AuthCtrlr as string,
    dataType: DataTypeEnumType.Boolean,
    description: 'Whether remote start requires authorization.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.AuthorizeRemoteStart as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20OptionalVariableName.HeartbeatInterval as string
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataTypeEnumType.Integer,
    description: 'Interval between Heartbeat messages.',
    max: 86400,
    maxLength: 10,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'seconds',
    variable: OCPP20OptionalVariableName.HeartbeatInterval as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20OptionalVariableName.WebSocketPingInterval as string
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataTypeEnumType.Integer,
    description: 'Interval between WS ping frames.',
    max: 3600,
    maxLength: 10,
    min: 0,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'seconds',
    variable: OCPP20OptionalVariableName.WebSocketPingInterval as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20RequiredVariableName.DateTime as string
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataTypeEnumType.DateTime,
    description: 'Current station date-time in ISO8601.',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.DateTime as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20RequiredVariableName.EVConnectionTimeOut as string
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataTypeEnumType.Integer,
    description: 'Timeout for EV to establish connection.',
    max: 3600,
    maxLength: 10,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.EVConnectionTimeOut as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20RequiredVariableName.MessageTimeout as string
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataTypeEnumType.Integer,
    description: 'Timeout for OCPP message response waiting.',
    max: 3600,
    maxLength: 10,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.MessageTimeout as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20RequiredVariableName.ReportingValueSize as string
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataTypeEnumType.Integer,
    description: 'Maximum size of reported values.',
    max: 2500,
    maxLength: 5,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'chars',
    variable: OCPP20RequiredVariableName.ReportingValueSize as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20RequiredVariableName.SecurityProfile as string
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataTypeEnumType.Integer,
    description: 'Selected security profile.',
    enumeration: ['1', '2', '3', '4'],
    max: 4,
    maxLength: 1,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    rebootRequired: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.SecurityProfile as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20RequiredVariableName.TxUpdatedInterval as string
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataTypeEnumType.Integer,
    description: 'Interval for transaction update events.',
    max: 3600,
    maxLength: 10,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.TxUpdatedInterval as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20VendorVariableName.ConnectionUrl as string
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataTypeEnumType.URI,
    description: 'Central system connection URL.',
    enumeration: ['ws:', 'wss:', 'http:', 'https:'],
    maxLength: 512,
    mutability: MutabilityEnumType.WriteOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20VendorVariableName.ConnectionUrl as string,
    vendorSpecific: true,
  },
  [key(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.ReportingValueSize as string
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataTypeEnumType.Integer,
    description: 'Maximum size of reported values (DeviceDataCtrlr).',
    max: 2500,
    maxLength: 5,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'chars',
    variable: OCPP20RequiredVariableName.ReportingValueSize as string,
  },
}

const VARIABLE_CHARACTERISTICS_REGISTRY_CANONICAL: Record<string, VariableCharacteristics> =
  Object.fromEntries(
    Object.entries(VARIABLE_CHARACTERISTICS_REGISTRY).map(([k, v]) => [k.toLowerCase(), v])
  )

/**
 * Retrieve variable characteristics with case-flexible lookup.
 * Attempts exact match first (original casing) then falls back to
 * lowercase canonical matching when strict mode is disabled or
 * the exact match fails.
 * @param component Component name (original case)
 * @param variable Variable name (original case)
 * @returns Variable characteristics or undefined if not registered
 */
export function getVariableCharacteristics (
  component: string,
  variable: string
): undefined | VariableCharacteristics {
  const exact = VARIABLE_CHARACTERISTICS_REGISTRY[key(component, variable)] as
    | undefined
    | VariableCharacteristics
  if (exact != null) {
    return exact
  }
  return VARIABLE_CHARACTERISTICS_REGISTRY_CANONICAL[
    key(component.toLowerCase(), variable.toLowerCase())
  ]
}
