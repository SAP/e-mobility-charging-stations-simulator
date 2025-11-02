import { millisecondsToSeconds } from 'date-fns'

import type { ChargingStation } from '../../ChargingStation.js'

import {
  AttributeEnumType,
  DataEnumType,
  MutabilityEnumType,
  OCPP20ComponentName,
  OCPP20DeviceInfoVariableName,
  OCPP20MeasurandEnumType,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  OCPP20UnitEnumType,
  OCPP20VendorVariableName,
  PersistenceEnumType,
  ReasonCodeEnumType,
} from '../../../types/index.js'
import { Constants, convertToIntOrNaN, has } from '../../../utils/index.js'

/**
 * Metadata describing a variable (component-level configuration or runtime state).
 *
 * Field notes:
 * - component: OCPP 2.0.1 Component name (registry key part)
 * - variable: Variable name (registry key part)
 * - instance: Optional instance qualifier (registry key part)
 * - mutability: ReadOnly | ReadWrite | WriteOnly (affects Get/SetVariables behavior)
 * - persistence: Persistent values survive restart; Volatile resolved dynamically or reset
 * - dataType: OCPP DataEnumType classification (string, integer, decimal, boolean, dateTime, list types)
 * - defaultValue: Used when no persistent value stored and no dynamicValueResolver provided
 * - dynamicValueResolver: Function returning a fresh value each resolution (overrides defaultValue)
 * - enumeration: Allowed discrete values for scalar types or list members (validated centrally)
 * - maxLength: Character length constraint applied before dataType-specific parsing
 * - min/max: Numeric bounds for integer/decimal
 * - positive: Enforces > 0 (combined with allowZero)
 * - allowZero: Permit zero when positive not set
 * - characteristics: Subset of OCPP characteristics currently modelled (maxLimit/minLimit/supportsMonitoring)
 * - supportedAttributes: Which OCPP attributes (Actual, Target, etc.) are supported
 * - supportsTarget: Allows Target attribute writes where applicable
 * - unit: Informational; not validated
 * - postProcess: Final transform applied on successful validation before persistence
 * - rebootRequired: Indicates changes require reboot (returned via SetVariablesResult)
 * - vendorSpecific: True when variable is not defined by core specification
 * - urlSchemes: (Deprecated usage) Optional list of allowed URL schemes including trailing colon, e.g. ['ws:', 'wss:'].
 *               If present, scheme-restricted URL validation is enforced.
 * - isUrl: When true (and urlSchemes absent) apply generic URL format validation only (any scheme allowed).
 *          Introduced to relax overly restrictive scheme lists for vendor variables like ConnectionUrl.
 */
export interface VariableMetadata {
  allowZero?: boolean
  characteristics?: { maxLimit?: number; minLimit?: number; supportsMonitoring?: boolean }
  component: string
  dataType: DataEnumType
  defaultValue?: string
  description?: string
  dynamicValueResolver?: (ctx: { chargingStation: ChargingStation }) => string
  enumeration?: string[]
  instance?: string
  isUrl?: boolean
  max?: number
  maxLength?: number
  min?: number
  mutability: MutabilityEnumType
  persistence: PersistenceEnumType
  positive?: boolean
  postProcess?: (value: string, ctx: { chargingStation: ChargingStation }) => string
  rebootRequired?: boolean
  supportedAttributes: AttributeEnumType[]
  supportsTarget?: boolean
  unit?: string
  urlSchemes?: string[]
  variable: string
  vendorSpecific?: boolean
}

/**
 * KEY SCHEMES
 * 1. Primary registry key (internal map key): `${component}[.<instance>]::${variable}` (case sensitive)
 *    - Built with buildRegistryKey().
 * 2. Case-insensitive composite key (lookup convenience): `${component}[.<instance>].${variable}` all lower case
 *    - Built with buildCaseInsensitiveCompositeKey().
 * Rationale: Maintain original case for canonical metadata storage while offering tolerant lookups.
 * @param component Component name.
 * @param variable Variable name.
 * @param instance Optional instance qualifier.
 * @returns Primary registry key string.
 */
function buildRegistryKey (component: string, variable: string, instance?: string): string {
  return `${component}${instance ? '.' + instance : ''}::${variable}`
}

// Hoisted regex patterns (avoid recreation per validation call)
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/
const SIGNED_INTEGER_PATTERN = /^-?\d+$/
const DECIMAL_ONLY_PATTERN = /^-?\d+\.\d+$/

// Spec references policy:
// - CSV (dm_components_vars.csv) is the canonical source for standard variables.
// - Only add rationale comments where simulator intentionally restricts or extends (e.g. enumeration trimming, volatile choice).
// - Avoid verbose line or row numbers; keep comments concise.
export const VARIABLE_REGISTRY: Record<string, VariableMetadata> = {
  // AlignedDataCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.AlignedDataCtrlr as string, 'Available')]: {
    component: OCPP20ComponentName.AlignedDataCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'If this variable reports a value of true, Clock-Aligned Data is supported.',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Available',
  },
  [buildRegistryKey(OCPP20ComponentName.AlignedDataCtrlr as string, 'Enabled')]: {
    component: OCPP20ComponentName.AlignedDataCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'If this variable reports a value of true, Clock-Aligned Data is enabled',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Enabled',
  },
  [buildRegistryKey(OCPP20ComponentName.AlignedDataCtrlr as string, 'Interval')]: {
    component: OCPP20ComponentName.AlignedDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '900',
    description:
      'Size (in seconds) of the clock-aligned data interval, intended to be transmitted in the MeterValuesRequest message.',
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: 'Interval',
  },
  [buildRegistryKey(OCPP20ComponentName.AlignedDataCtrlr as string, 'Measurands')]: {
    component: OCPP20ComponentName.AlignedDataCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
    description:
      'Clock-aligned measurand(s) to be included in MeterValuesRequest, every AlignedDataInterval seconds.',
    enumeration: [
      OCPP20MeasurandEnumType.CURRENT_EXPORT,
      OCPP20MeasurandEnumType.CURRENT_IMPORT,
      OCPP20MeasurandEnumType.CURRENT_OFFERED,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_EXPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_REACTIVE_EXPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_EXPORT_INTERVAL,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
      OCPP20MeasurandEnumType.ENERGY_REACTIVE_EXPORT_INTERVAL,
      OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_INTERVAL,
      OCPP20MeasurandEnumType.FREQUENCY,
      OCPP20MeasurandEnumType.POWER_ACTIVE_EXPORT,
      OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
      OCPP20MeasurandEnumType.POWER_FACTOR,
      OCPP20MeasurandEnumType.POWER_OFFERED,
      OCPP20MeasurandEnumType.POWER_REACTIVE_EXPORT,
      OCPP20MeasurandEnumType.POWER_REACTIVE_IMPORT,
      OCPP20MeasurandEnumType.STATE_OF_CHARGE,
      OCPP20MeasurandEnumType.VOLTAGE,
    ],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Measurands',
  },
  [buildRegistryKey(OCPP20ComponentName.AlignedDataCtrlr as string, 'SendDuringIdle')]: {
    component: OCPP20ComponentName.AlignedDataCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'If set to true, the Charging Station SHALL NOT send clock aligned meter values when a transaction is ongoing.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'SendDuringIdle',
  },
  [buildRegistryKey(OCPP20ComponentName.AlignedDataCtrlr as string, 'SignReadings')]: {
    component: OCPP20ComponentName.AlignedDataCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'If set to true, the Charging Station SHALL include signed meter values in the SampledValueType in the MeterValuesRequest to the CSMS.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'SignReadings',
  },
  [buildRegistryKey(OCPP20ComponentName.AlignedDataCtrlr as string, 'TxEndedInterval')]: {
    component: OCPP20ComponentName.AlignedDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '900',
    description:
      'Size (in seconds) of the clock-aligned data interval, intended to be transmitted in the TransactionEventRequest (eventType = Ended) message.',
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: 'TxEndedInterval',
  },
  [buildRegistryKey(OCPP20ComponentName.AlignedDataCtrlr as string, 'TxEndedMeasurands')]: {
    component: OCPP20ComponentName.AlignedDataCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL},${OCPP20MeasurandEnumType.VOLTAGE}`,
    description:
      'Clock-aligned measurands to be included in the meterValues element of TransactionEventRequest (eventType = Ended), every SampledDataTxEndedInterval seconds from the start of the transaction.',
    enumeration: [
      OCPP20MeasurandEnumType.CURRENT_EXPORT,
      OCPP20MeasurandEnumType.CURRENT_IMPORT,
      OCPP20MeasurandEnumType.CURRENT_OFFERED,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_EXPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_REACTIVE_EXPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_EXPORT_INTERVAL,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
      OCPP20MeasurandEnumType.ENERGY_REACTIVE_EXPORT_INTERVAL,
      OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_INTERVAL,
      OCPP20MeasurandEnumType.FREQUENCY,
      OCPP20MeasurandEnumType.POWER_ACTIVE_EXPORT,
      OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
      OCPP20MeasurandEnumType.POWER_FACTOR,
      OCPP20MeasurandEnumType.POWER_OFFERED,
      OCPP20MeasurandEnumType.POWER_REACTIVE_EXPORT,
      OCPP20MeasurandEnumType.POWER_REACTIVE_IMPORT,
      OCPP20MeasurandEnumType.STATE_OF_CHARGE,
      OCPP20MeasurandEnumType.VOLTAGE,
    ],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'TxEndedMeasurands',
  },

  // AuthCacheCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.AuthCacheCtrlr as string, 'Available')]: {
    component: OCPP20ComponentName.AuthCacheCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Authorization caching is available, but not necessarily enabled.',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Available',
  },
  [buildRegistryKey(OCPP20ComponentName.AuthCacheCtrlr as string, 'DisablePostAuthorize')]: {
    component: OCPP20ComponentName.AuthCacheCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'When set to true this variable disables the behavior to request authorization for an idToken that is stored in the cache with a status other than Accepted, as stated in C10.FR.03 and C12.FR.05.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'DisablePostAuthorize',
  },
  [buildRegistryKey(OCPP20ComponentName.AuthCacheCtrlr as string, 'Enabled')]: {
    component: OCPP20ComponentName.AuthCacheCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'If set to true, Authorization caching is enabled.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Enabled',
  },
  [buildRegistryKey(OCPP20ComponentName.AuthCacheCtrlr as string, 'LifeTime')]: {
    component: OCPP20ComponentName.AuthCacheCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '86400',
    description:
      'Indicates how long it takes until a token expires in the authorization cache since it is last used',
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'LifeTime',
  },
  [buildRegistryKey(OCPP20ComponentName.AuthCacheCtrlr as string, 'Policy')]: {
    component: OCPP20ComponentName.AuthCacheCtrlr as string,
    dataType: DataEnumType.OptionList,
    defaultValue: 'LRU',
    description:
      'Cache Entry Replacement Policy: least recently used, least frequently used, first in first out, other custom mechanism.',
    enumeration: ['LRU', 'LFU', 'FIFO', 'Custom'],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Policy',
  },
  [buildRegistryKey(OCPP20ComponentName.AuthCacheCtrlr as string, 'Storage')]: {
    characteristics: {
      maxLimit: 1048576, // 1MB default
    },
    component: OCPP20ComponentName.AuthCacheCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '0',
    description:
      'Indicates the number of bytes currently used by the Authorization Cache. MaxLimit indicates the maximum number of bytes that can be used by the Authorization Cache.',
    min: 0,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    unit: OCPP20UnitEnumType.BYTES,
    variable: 'Storage',
  },

  // AuthCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.AuthCtrlr as string, 'AdditionalInfoItemsPerMessage')]: {
    component: OCPP20ComponentName.AuthCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '10',
    description: 'Maximum number of AdditionalInfo items that can be sent in one message.',
    max: 100,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'AdditionalInfoItemsPerMessage',
  },
  [buildRegistryKey(OCPP20ComponentName.AuthCtrlr as string, 'DisableRemoteAuthorization')]: {
    component: OCPP20ComponentName.AuthCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'When set to true, instructs the Charging Station to not issue any AuthorizationRequests but only use Authorization Cache and Local Authorization List.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'DisableRemoteAuthorization',
  },

  [buildRegistryKey(OCPP20ComponentName.AuthCtrlr as string, 'Enabled')]: {
    component: OCPP20ComponentName.AuthCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description:
      'If set to false, no authorization is done before starting a transaction or when reading an idToken.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Enabled',
  },
  [buildRegistryKey(OCPP20ComponentName.AuthCtrlr as string, 'MasterPassGroupId')]: {
    component: OCPP20ComponentName.AuthCtrlr as string,
    dataType: DataEnumType.string,
    description:
      'IdTokens that have this id as groupId belong to the Master Pass Group. They can stop any ongoing transaction but cannot start transactions.',
    maxLength: 36,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'MasterPassGroupId',
  },
  [buildRegistryKey(OCPP20ComponentName.AuthCtrlr as string, 'OfflineTxForUnknownIdEnabled')]: {
    component: OCPP20ComponentName.AuthCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'Support for unknown offline transactions.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'OfflineTxForUnknownIdEnabled',
  },
  [buildRegistryKey(
    OCPP20ComponentName.AuthCtrlr as string,
    OCPP20RequiredVariableName.AuthorizeRemoteStart
  )]: {
    component: OCPP20ComponentName.AuthCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Whether remote start requires authorization.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.AuthorizeRemoteStart as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.AuthCtrlr as string,
    OCPP20RequiredVariableName.LocalAuthorizeOffline
  )]: {
    component: OCPP20ComponentName.AuthCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Start transaction offline for locally authorized identifiers.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.LocalAuthorizeOffline as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.AuthCtrlr as string,
    OCPP20RequiredVariableName.LocalPreAuthorize
  )]: {
    component: OCPP20ComponentName.AuthCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'Start transaction locally without waiting for CSMS authorization.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.LocalPreAuthorize as string,
  },

  // CHAdeMOCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.CHAdeMOCtrlr as string, 'AutoManufacturerCode')]: {
    component: OCPP20ComponentName.CHAdeMOCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '0',
    description: "Auto manufacturer code (H'700.0)",
    min: 0,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'AutoManufacturerCode',
  },
  [buildRegistryKey(OCPP20ComponentName.CHAdeMOCtrlr as string, 'CHAdeMOProtocolNumber')]: {
    component: OCPP20ComponentName.CHAdeMOCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '66048',
    description: "CHAdeMO protocol number (H'102.0)",
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'CHAdeMOProtocolNumber',
  },
  [buildRegistryKey(OCPP20ComponentName.CHAdeMOCtrlr as string, 'DynamicControl')]: {
    component: OCPP20ComponentName.CHAdeMOCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: "Vehicle is compatible with dynamic control (H'110.0.0)",
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'DynamicControl',
  },
  [buildRegistryKey(OCPP20ComponentName.CHAdeMOCtrlr as string, 'HighCurrentControl')]: {
    component: OCPP20ComponentName.CHAdeMOCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: "Vehicle is compatible with high current control (H'110.0.1)",
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'HighCurrentControl',
  },
  [buildRegistryKey(OCPP20ComponentName.CHAdeMOCtrlr as string, 'HighVoltageControl')]: {
    component: OCPP20ComponentName.CHAdeMOCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: "Vehicle is compatible with high voltage control (H'110.1.2)",
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'HighVoltageControl',
  },
  [buildRegistryKey(OCPP20ComponentName.CHAdeMOCtrlr as string, 'SelftestActive')]: {
    component: OCPP20ComponentName.CHAdeMOCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'Self-test is active or self-test is started by setting to true.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'SelftestActive',
  },
  [buildRegistryKey(OCPP20ComponentName.CHAdeMOCtrlr as string, 'VehicleStatus')]: {
    component: OCPP20ComponentName.CHAdeMOCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: "Vehicle status (H'102.5.3)",
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'VehicleStatus',
  },

  // ChargingStation Component
  [buildRegistryKey(
    OCPP20ComponentName.ChargingStation as string,
    'AllowNewSessionsPendingFirmwareUpdate'
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'Indicates whether new sessions can be started on EVSEs while Charging Station is waiting for all EVSEs to become Available in order to start a pending firmware update.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'AllowNewSessionsPendingFirmwareUpdate',
  },
  [buildRegistryKey(OCPP20ComponentName.ChargingStation as string, 'Available')]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Component exists (ChargingStation level).',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Available',
  },
  [buildRegistryKey(OCPP20ComponentName.ChargingStation as string, 'Model')]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.string,
    description: 'Charging station model as reported in BootNotification.',
    maxLength: 50,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Model',
  },
  [buildRegistryKey(OCPP20ComponentName.ChargingStation as string, 'SupplyPhases')]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.integer,
    defaultValue: '3',
    description: 'Number of alternating current phases connected/available.',
    max: 3,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'SupplyPhases',
  },
  [buildRegistryKey(OCPP20ComponentName.ChargingStation as string, 'VendorName')]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.string,
    description: 'Charging station vendor name as reported in BootNotification.',
    maxLength: 50,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'VendorName',
  },
  [buildRegistryKey(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20DeviceInfoVariableName.AvailabilityState
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.OptionList,
    description: 'Current availability state for the ChargingStation.',
    enumeration: ['Operative', 'Inoperative'],
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20DeviceInfoVariableName.AvailabilityState as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20OptionalVariableName.WebSocketPingInterval
  )]: {
    allowZero: true,
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL.toString(),
    description:
      'Interval in seconds between WebSocket ping (keep-alive) frames. 0 disables pings.',
    max: 3600,
    maxLength: 10,
    min: 0,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: OCPP20OptionalVariableName.WebSocketPingInterval as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20VendorVariableName.ConnectionUrl
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.string,
    defaultValue: 'ws://localhost',
    description: 'Central system connection URL.',
    isUrl: true,
    maxLength: 512,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20VendorVariableName.ConnectionUrl as string,
    vendorSpecific: true,
  },

  // ClockCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.ClockCtrlr as string, 'NextTimeOffsetTransitionDateTime')]:
    {
      component: OCPP20ComponentName.ClockCtrlr as string,
      dataType: DataEnumType.dateTime,
      description: 'Date time of the next time offset transition.',
      mutability: MutabilityEnumType.ReadWrite,
      persistence: PersistenceEnumType.Persistent,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: 'NextTimeOffsetTransitionDateTime',
    },
  [buildRegistryKey(OCPP20ComponentName.ClockCtrlr as string, 'NtpServerUri')]: {
    component: OCPP20ComponentName.ClockCtrlr as string,
    dataType: DataEnumType.string,
    description: 'This contains the address of the NTP server.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'NtpServerUri',
  },
  [buildRegistryKey(OCPP20ComponentName.ClockCtrlr as string, 'NtpSource')]: {
    component: OCPP20ComponentName.ClockCtrlr as string,
    dataType: DataEnumType.OptionList,
    description:
      'When an NTP client is implemented, this variable can be used to configure the client',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'NtpSource',
  },
  [buildRegistryKey(OCPP20ComponentName.ClockCtrlr as string, 'TimeAdjustmentReportingThreshold')]:
    {
      component: OCPP20ComponentName.ClockCtrlr as string,
      dataType: DataEnumType.integer,
      description:
        'If set, then time adjustments with an absolute value in seconds larger than this need to be reported as a security event SettingSystemTime',
      mutability: MutabilityEnumType.ReadWrite,
      persistence: PersistenceEnumType.Persistent,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: 'TimeAdjustmentReportingThreshold',
    },
  [buildRegistryKey(OCPP20ComponentName.ClockCtrlr as string, 'TimeOffset')]: {
    component: OCPP20ComponentName.ClockCtrlr as string,
    dataType: DataEnumType.string,
    description:
      'A Time Offset with respect to Coordinated Universal Time (aka UTC or Greenwich Mean Time) in the form of an [RFC3339] time (zone) offset suffix, including the mandatory "+" or "-" prefix.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'TimeOffset',
  },
  [buildRegistryKey(OCPP20ComponentName.ClockCtrlr as string, 'TimeZone')]: {
    component: OCPP20ComponentName.ClockCtrlr as string,
    dataType: DataEnumType.string,
    description:
      'Configured current local time zone in the format: "Europe/Oslo", "Asia/Singapore" etc. For display purposes.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'TimeZone',
  },
  [buildRegistryKey(OCPP20ComponentName.ClockCtrlr as string, OCPP20RequiredVariableName.DateTime)]:
    {
      component: OCPP20ComponentName.ClockCtrlr as string,
      dataType: DataEnumType.dateTime,
      description: 'Contains the current date and time (ClockCtrlr).',
      dynamicValueResolver: () => new Date().toISOString(),
      mutability: MutabilityEnumType.ReadOnly,
      persistence: PersistenceEnumType.Volatile,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: OCPP20RequiredVariableName.DateTime as string,
    },
  [buildRegistryKey(
    OCPP20ComponentName.ClockCtrlr as string,
    OCPP20RequiredVariableName.TimeSource
  )]: {
    component: OCPP20ComponentName.ClockCtrlr as string,
    dataType: DataEnumType.SequenceList,
    defaultValue: 'NTP,GPS,RealTimeClock,Heartbeat',
    description: 'Ordered list of clock sources by preference.',
    enumeration: [
      'Heartbeat',
      'NTP',
      'GPS',
      'RealTimeClock',
      'MobileNetwork',
      'RadioTimeTransmitter',
    ],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TimeSource as string,
  },

  // DeviceDataCtrlr Component
  [buildRegistryKey(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.BytesPerMessage
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '8192',
    description: 'Maximum number of bytes in a message.',
    max: 65535,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.BytesPerMessage as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.BytesPerMessage,
    'GetReport'
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '8192',
    description: 'Maximum number of bytes in a GetReport message.',
    instance: 'GetReport',
    max: 65535,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.BytesPerMessage as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.BytesPerMessage,
    'GetVariables'
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '8192',
    description: 'Maximum number of bytes in a GetVariables message.',
    instance: 'GetVariables',
    max: 65535,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.BytesPerMessage as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.BytesPerMessage,
    'SetVariables'
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '8192',
    description: 'Maximum number of bytes in a SetVariables message.',
    instance: 'SetVariables',
    max: 65535,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.BytesPerMessage as string,
  },
  // Value size family: ValueSize (broadest), ConfigurationValueSize (affects setting), ReportingValueSize (affects reporting). Simulator sets same absolute cap; truncate occurs at reporting step.
  [buildRegistryKey(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.ConfigurationValueSize
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH.toString(),
    description: 'Maximum size allowed for configuration values when setting.',
    max: Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH,
    maxLength: 5,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.CHARS,
    variable: OCPP20RequiredVariableName.ConfigurationValueSize as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.ItemsPerMessage,
    'GetReport'
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '32',
    description: 'Maximum ComponentVariable entries in a GetReport message.',
    instance: 'GetReport',
    max: 256,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.ItemsPerMessage as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.ItemsPerMessage,
    'GetVariables'
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '32',
    description: 'Maximum ComponentVariable entries in a GetVariables message.',
    instance: 'GetVariables',
    max: 256,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.ItemsPerMessage as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.ItemsPerMessage,
    'SetVariables'
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '32',
    description: 'Maximum ComponentVariable entries in a SetVariables message.',
    instance: 'SetVariables',
    max: 256,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.ItemsPerMessage as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.ReportingValueSize
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH.toString(),
    description: 'Maximum size of reported values.',
    max: Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH,
    maxLength: 5,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.CHARS,
    variable: OCPP20RequiredVariableName.ReportingValueSize as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.ValueSize
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH.toString(),
    description: 'Unified maximum size for any stored or reported value.',
    max: Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH,
    maxLength: 5,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.CHARS,
    variable: OCPP20RequiredVariableName.ValueSize as string,
  },

  // EVSE Component
  [buildRegistryKey(OCPP20ComponentName.EVSE as string, 'AllowReset')]: {
    component: OCPP20ComponentName.EVSE as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Can be used to announce that an EVSE can be reset individually',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'AllowReset',
  },
  [buildRegistryKey(OCPP20ComponentName.EVSE as string, 'AvailabilityState')]: {
    component: OCPP20ComponentName.EVSE as string,
    dataType: DataEnumType.OptionList,
    defaultValue: 'Operative',
    description: 'This variable reports current availability state for the EVSE',
    enumeration: ['Operative', 'Inoperative'],
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'AvailabilityState',
  },
  [buildRegistryKey(OCPP20ComponentName.EVSE as string, 'Available')]: {
    component: OCPP20ComponentName.EVSE as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Component exists',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Available',
  },
  [buildRegistryKey(OCPP20ComponentName.EVSE as string, 'EvseId')]: {
    component: OCPP20ComponentName.EVSE as string,
    dataType: DataEnumType.string,
    defaultValue: '1',
    description:
      'The name of the EVSE in the string format as required by ISO 15118 and IEC 63119-2.',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'EvseId',
  },
  [buildRegistryKey(OCPP20ComponentName.EVSE as string, 'ISO15118EvseId')]: {
    component: OCPP20ComponentName.EVSE as string,
    dataType: DataEnumType.string,
    defaultValue: 'DE*ICE*E*1234567890*1',
    description:
      'The name of the EVSE in the string format as required by ISO 15118 and IEC 63119-2.',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'ISO15118EvseId',
  },
  [buildRegistryKey(OCPP20ComponentName.EVSE as string, 'Power')]: {
    characteristics: {
      maxLimit: 22000, // 22kW default
    },
    component: OCPP20ComponentName.EVSE as string,
    dataType: DataEnumType.decimal,
    defaultValue: '0',
    description: 'The maximum power that this EVSE can provide and instantaneous power',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    supportsTarget: false,
    unit: OCPP20UnitEnumType.WATT,
    variable: 'Power',
  },
  [buildRegistryKey(OCPP20ComponentName.EVSE as string, 'SupplyPhases')]: {
    component: OCPP20ComponentName.EVSE as string,
    dataType: DataEnumType.integer,
    defaultValue: '3',
    description: 'Number of alternating current phases connected/available.',
    max: 3,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'SupplyPhases',
  },

  // ISO15118Ctrlr Component
  [buildRegistryKey(
    OCPP20ComponentName.ISO15118Ctrlr as string,
    'CentralContractValidationAllowed'
  )]: {
    component: OCPP20ComponentName.ISO15118Ctrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'If this variable exists and has the value true, then Charging Station can provide a contract certificate that it cannot validate, to the CSMS for validation as part of the AuthorizeRequest.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'CentralContractValidationAllowed',
  },
  [buildRegistryKey(
    OCPP20ComponentName.ISO15118Ctrlr as string,
    'ContractCertificateInstallationEnabled'
  )]: {
    component: OCPP20ComponentName.ISO15118Ctrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'If this variable is true, then ISO 15118 contract certificate installation/update as described by use case M01 - Certificate installation EV and M02 - Certificate Update EV is enabled.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'ContractCertificateInstallationEnabled',
  },
  [buildRegistryKey(OCPP20ComponentName.ISO15118Ctrlr as string, 'ContractValidationOffline')]: {
    component: OCPP20ComponentName.ISO15118Ctrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'If this variable is true, then Charging Station will try to validate a contract certificate when it is offline',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'ContractValidationOffline',
  },
  [buildRegistryKey(OCPP20ComponentName.ISO15118Ctrlr as string, 'CountryName')]: {
    component: OCPP20ComponentName.ISO15118Ctrlr as string,
    dataType: DataEnumType.string,
    defaultValue: 'DE',
    description:
      'The countryName of the SECC in the ISO 3166-1 format. It is used as the countryName (C) of the SECC leaf certificate.',
    maxLength: 2,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'CountryName',
  },
  [buildRegistryKey(OCPP20ComponentName.ISO15118Ctrlr as string, 'MaxScheduleEntries')]: {
    component: OCPP20ComponentName.ISO15118Ctrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '24',
    description: 'Maximum number of allowed schedule periods.',
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'MaxScheduleEntries',
  },
  [buildRegistryKey(OCPP20ComponentName.ISO15118Ctrlr as string, 'OrganizationName')]: {
    component: OCPP20ComponentName.ISO15118Ctrlr as string,
    dataType: DataEnumType.string,
    defaultValue: 'Example Charging Services Ltd',
    description:
      'The organizationName of the CSO operating the charging station. It is used as the organizationName (O) of the SECC leaf certificate.',
    maxLength: 64,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'OrganizationName',
  },
  [buildRegistryKey(OCPP20ComponentName.ISO15118Ctrlr as string, 'PnCEnabled')]: {
    component: OCPP20ComponentName.ISO15118Ctrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'If this variable is true, then ISO 15118 plug and charge as described by use case C07 - Authorization using Contract Certificates is enabled.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'PnCEnabled',
  },
  [buildRegistryKey(OCPP20ComponentName.ISO15118Ctrlr as string, 'RequestedEnergyTransferMode')]: {
    component: OCPP20ComponentName.ISO15118Ctrlr as string,
    dataType: DataEnumType.OptionList,
    defaultValue: 'DC_extended',
    description: 'The requested energy transfer mode.',
    enumeration: [
      'AC_single_phase_core',
      'AC_three_phase_core',
      'DC_core',
      'DC_extended',
      'DC_combo_core',
      'DC_unique',
    ],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'RequestedEnergyTransferMode',
  },
  [buildRegistryKey(OCPP20ComponentName.ISO15118Ctrlr as string, 'RequestMeteringReceipt')]: {
    component: OCPP20ComponentName.ISO15118Ctrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'If true, then Charging Station shall request a metering receipt from EV.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'RequestMeteringReceipt',
  },
  [buildRegistryKey(OCPP20ComponentName.ISO15118Ctrlr as string, 'SeccId')]: {
    component: OCPP20ComponentName.ISO15118Ctrlr as string,
    dataType: DataEnumType.string,
    defaultValue: 'DE*ICE*E*1234567890',
    description: 'The ID of the SECC in string format as defined by ISO15118.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'SeccId',
  },
  [buildRegistryKey(
    OCPP20ComponentName.ISO15118Ctrlr as string,
    'V2GCertificateInstallationEnabled'
  )]: {
    component: OCPP20ComponentName.ISO15118Ctrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'If this variable is true, then ISO 15118 V2G Charging Station certificate installation as described by use case A02 - Update Charging Station Certificate by request of CSMS and A03 - Update Charging Station Certificate initiated by the Charging Station is enabled.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'V2GCertificateInstallationEnabled',
  },

  // LocalAuthListCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.LocalAuthListCtrlr as string, 'Available')]: {
    component: OCPP20ComponentName.LocalAuthListCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Local Authorization List is available.',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Available',
  },
  [buildRegistryKey(OCPP20ComponentName.LocalAuthListCtrlr as string, 'BytesPerMessage')]: {
    component: OCPP20ComponentName.LocalAuthListCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '8192',
    description: 'Maximum number of bytes in a SendLocalList message.',
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'BytesPerMessage',
  },
  [buildRegistryKey(OCPP20ComponentName.LocalAuthListCtrlr as string, 'DisablePostAuthorize')]: {
    component: OCPP20ComponentName.LocalAuthListCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'When set to true this variable disables the behavior to request authorization for an idToken that is stored in the local authorization list with a status other than Accepted, as stated in C14.FR.03.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'DisablePostAuthorize',
  },
  [buildRegistryKey(OCPP20ComponentName.LocalAuthListCtrlr as string, 'Enabled')]: {
    component: OCPP20ComponentName.LocalAuthListCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'If this variable exists and reports a value of true, Local Authorization List is enabled.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Enabled',
  },
  [buildRegistryKey(OCPP20ComponentName.LocalAuthListCtrlr as string, 'Entries')]: {
    component: OCPP20ComponentName.LocalAuthListCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '0',
    description: 'Amount of IdTokens currently in the Local Authorization List',
    min: 0,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Entries',
  },
  [buildRegistryKey(OCPP20ComponentName.LocalAuthListCtrlr as string, 'ItemsPerMessage')]: {
    component: OCPP20ComponentName.LocalAuthListCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '100',
    description: 'Maximum number of records in SendLocalList',
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'ItemsPerMessage',
  },
  [buildRegistryKey(OCPP20ComponentName.LocalAuthListCtrlr as string, 'Storage')]: {
    characteristics: {
      maxLimit: 1048576, // 1MB default
    },
    component: OCPP20ComponentName.LocalAuthListCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '0',
    description:
      'Indicates the number of bytes currently used by the Local Authorization List. MaxLimit indicates the maximum number of bytes that can be used by the Local Authorization List.',
    min: 0,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    unit: OCPP20UnitEnumType.BYTES,
    variable: 'Storage',
  },

  // MonitoringCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.MonitoringCtrlr as string, 'ActiveMonitoringBase')]: {
    component: OCPP20ComponentName.MonitoringCtrlr as string,
    dataType: DataEnumType.OptionList,
    defaultValue: 'All',
    description:
      'Shows the currently used MonitoringBase. Valid values according MonitoringBaseEnumType: All, FactoryDefault, HardwiredOnly.',
    enumeration: ['All', 'FactoryDefault', 'HardwiredOnly'],
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'ActiveMonitoringBase',
  },
  [buildRegistryKey(OCPP20ComponentName.MonitoringCtrlr as string, 'ActiveMonitoringLevel')]: {
    component: OCPP20ComponentName.MonitoringCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '9',
    description:
      'Shows the currently used MonitoringLevel. Valid values are severity levels of SetMonitoringLevelRequest: 0-9.',
    max: 9,
    min: 0,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'ActiveMonitoringLevel',
  },
  [buildRegistryKey(OCPP20ComponentName.MonitoringCtrlr as string, 'Available')]: {
    component: OCPP20ComponentName.MonitoringCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Whether monitoring is available',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Available',
  },
  [buildRegistryKey(
    OCPP20ComponentName.MonitoringCtrlr as string,
    'BytesPerMessage',
    'ClearVariableMonitoring'
  )]: {
    component: OCPP20ComponentName.MonitoringCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '8192',
    description: 'Maximum number of bytes in a ClearVariableMonitoring message.',
    instance: 'ClearVariableMonitoring',
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'BytesPerMessage',
  },
  [buildRegistryKey(
    OCPP20ComponentName.MonitoringCtrlr as string,
    'BytesPerMessage',
    'SetVariableMonitoring'
  )]: {
    component: OCPP20ComponentName.MonitoringCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '8192',
    description: 'Maximum number of bytes in a SetVariableMonitoring message',
    instance: 'SetVariableMonitoring',
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'BytesPerMessage',
  },
  [buildRegistryKey(OCPP20ComponentName.MonitoringCtrlr as string, 'Enabled')]: {
    component: OCPP20ComponentName.MonitoringCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Whether monitoring is enabled.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Enabled',
  },
  [buildRegistryKey(
    OCPP20ComponentName.MonitoringCtrlr as string,
    'ItemsPerMessage',
    'ClearVariableMonitoring'
  )]: {
    component: OCPP20ComponentName.MonitoringCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '100',
    description: 'Maximum number of IDs in a ClearVariableMonitoringRequest.',
    instance: 'ClearVariableMonitoring',
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'ItemsPerMessage',
  },
  [buildRegistryKey(
    OCPP20ComponentName.MonitoringCtrlr as string,
    'ItemsPerMessage',
    'SetVariableMonitoring'
  )]: {
    component: OCPP20ComponentName.MonitoringCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '100',
    description:
      'Maximum number of setMonitoringData elements that can be sent in one setVariableMonitoringRequest message.',
    instance: 'SetVariableMonitoring',
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'ItemsPerMessage',
  },
  [buildRegistryKey(OCPP20ComponentName.MonitoringCtrlr as string, 'MonitoringBase')]: {
    component: OCPP20ComponentName.MonitoringCtrlr as string,
    dataType: DataEnumType.OptionList,
    defaultValue: 'All',
    description: 'Currently used monitoring base (readonly)',
    enumeration: ['All', 'FactoryDefault', 'HardwiredOnly'],
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'MonitoringBase',
  },
  [buildRegistryKey(OCPP20ComponentName.MonitoringCtrlr as string, 'MonitoringLevel')]: {
    component: OCPP20ComponentName.MonitoringCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '9',
    description: 'Currently used monitoring level (readonly)',
    max: 9,
    min: 0,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'MonitoringLevel',
  },
  [buildRegistryKey(OCPP20ComponentName.MonitoringCtrlr as string, 'OfflineQueuingSeverity')]: {
    component: OCPP20ComponentName.MonitoringCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '5',
    description:
      'When set and the Charging Station is offline, the Charging Station shall queue any notifyEventRequest messages triggered by a monitor with a severity number equal to or lower than the severity configured here.',
    max: 9,
    min: 0,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'OfflineQueuingSeverity',
  },

  // OCPPCommCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.OCPPCommCtrlr as string, 'ActiveNetworkProfile')]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.string,
    description:
      'Indicates the configuration profile the station uses at that moment to connect to the network.',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'ActiveNetworkProfile',
  },
  [buildRegistryKey(OCPP20ComponentName.OCPPCommCtrlr as string, 'FieldLength')]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    description:
      'This variable is used to report the length of <field> in <message> when it is larger than the length that is defined in the standard OCPP message schema.',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'FieldLength',
  },
  [buildRegistryKey(OCPP20ComponentName.OCPPCommCtrlr as string, 'PublicKeyWithSignedMeterValue')]:
    {
      component: OCPP20ComponentName.OCPPCommCtrlr as string,
      dataType: DataEnumType.OptionList,
      description:
        'This Configuration Variable can be used to configure whether a public key needs to be sent with a signed meter value.',
      mutability: MutabilityEnumType.ReadWrite,
      persistence: PersistenceEnumType.Persistent,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: 'PublicKeyWithSignedMeterValue',
    },
  [buildRegistryKey(OCPP20ComponentName.OCPPCommCtrlr as string, 'QueueAllMessages')]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'When this variable is set to true, the Charging Station will queue all message until they are delivered to the CSMS.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'QueueAllMessages',
  },
  [buildRegistryKey(OCPP20ComponentName.OCPPCommCtrlr as string, 'RetryBackOffRandomRange')]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    description:
      'When the Charging Station is reconnecting, after a connection loss, it will use this variable as the maximum value for the random part of the back-off time',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'RetryBackOffRandomRange',
  },
  [buildRegistryKey(OCPP20ComponentName.OCPPCommCtrlr as string, 'RetryBackOffRepeatTimes')]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    description:
      'When the Charging Station is reconnecting, after a connection loss, it will use this variable for the amount of times it will double the previous back-off time.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'RetryBackOffRepeatTimes',
  },
  [buildRegistryKey(OCPP20ComponentName.OCPPCommCtrlr as string, 'RetryBackOffWaitMinimum')]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    description:
      'When the Charging Station is reconnecting, after a connection loss, it will use this variable as the minimum back-off time, the first time it tries to reconnect.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'RetryBackOffWaitMinimum',
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20OptionalVariableName.HeartbeatInterval
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: millisecondsToSeconds(Constants.DEFAULT_HEARTBEAT_INTERVAL).toString(),
    description: 'Interval between Heartbeat messages.',
    max: 86400,
    maxLength: 10,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: OCPP20OptionalVariableName.HeartbeatInterval as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20OptionalVariableName.WebSocketPingInterval
  )]: {
    allowZero: true,
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '30',
    description:
      '0 disables client side websocket Ping/Pong. Positive values are interpreted as number of seconds between pings. Negative values are not allowed.',
    min: 0,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: OCPP20OptionalVariableName.WebSocketPingInterval as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.FileTransferProtocols
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'HTTPS,FTPS,SFTP',
    description: 'Supported file transfer protocols.',
    enumeration: ['HTTP', 'HTTPS', 'FTP', 'FTPS', 'SFTP'],
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.FileTransferProtocols as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.MessageAttemptInterval,
    'TransactionEvent'
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '5',
    description: 'Interval (seconds) between retry attempts for TransactionEvent messages.',
    instance: 'TransactionEvent',
    max: 3600,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: OCPP20RequiredVariableName.MessageAttemptInterval as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.MessageAttempts,
    'TransactionEvent'
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '3',
    description: 'Maximum number of TransactionEvent message attempts after initial send.',
    instance: 'TransactionEvent',
    max: 10,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.MessageAttempts as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.MessageTimeout,
    'Default'
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.DEFAULT_CONNECTION_TIMEOUT.toString(),
    description: 'Timeout (in seconds) waiting for responses to general OCPP messages.',
    instance: 'Default',
    max: 3600,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: OCPP20RequiredVariableName.MessageTimeout as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.NetworkConfigurationPriority
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.string,
    defaultValue: '1,2,3',
    description: 'Comma separated ordered list of network profile priorities.',
    enumeration: ['1', '2', '3'],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.NetworkConfigurationPriority as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.NetworkProfileConnectionAttempts
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '3',
    description: 'Connection attempts before switching profile.',
    max: 100,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.NetworkProfileConnectionAttempts as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.OfflineThreshold
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '300',
    description: 'Offline duration threshold for status refresh.',
    max: 86400,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: OCPP20RequiredVariableName.OfflineThreshold as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.ResetRetries
  )]: {
    allowZero: true,
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '2',
    description: 'Number of times to retry a reset.',
    max: 10,
    min: 0,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.ResetRetries as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.UnlockOnEVSideDisconnect
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Unlock cable when unplugged at EV side.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.UnlockOnEVSideDisconnect as string,
  },

  // ReservationCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.ReservationCtrlr as string, 'Available')]: {
    component: OCPP20ComponentName.ReservationCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Whether reservation is supported.',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Available',
  },
  [buildRegistryKey(OCPP20ComponentName.ReservationCtrlr as string, 'Enabled')]: {
    component: OCPP20ComponentName.ReservationCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'Whether reservation is enabled.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Enabled',
  },
  [buildRegistryKey(OCPP20ComponentName.ReservationCtrlr as string, 'NonEvseSpecific')]: {
    component: OCPP20ComponentName.ReservationCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'If this configuration variable is present and set to true: Charging Station supports Reservation where EVSE id is not specified.',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'NonEvseSpecific',
  },

  // SampledDataCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.SampledDataCtrlr as string, 'Available')]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'If this variable reports a value of true, Sampled Data is supported',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Available',
  },
  [buildRegistryKey(OCPP20ComponentName.SampledDataCtrlr as string, 'Enabled')]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'If this variable reports a value of true, Sampled Data is enabled.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Enabled',
  },
  [buildRegistryKey(OCPP20ComponentName.SampledDataCtrlr as string, 'RegisterValuesWithoutPhases')]:
    {
      component: OCPP20ComponentName.SampledDataCtrlr as string,
      dataType: DataEnumType.boolean,
      defaultValue: 'false',
      description:
        'If this variable reports a value of true, then meter values of measurand Energy.Active.Import.Register will only report the total energy over all phases without reporting the individual phase values.',
      mutability: MutabilityEnumType.ReadWrite,
      persistence: PersistenceEnumType.Persistent,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: 'RegisterValuesWithoutPhases',
    },
  [buildRegistryKey(OCPP20ComponentName.SampledDataCtrlr as string, 'SignReadings')]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'If set to true, the Charging Station SHALL include signed meter values in the TransactionEventRequest to the CSMS',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'SignReadings',
  },
  [buildRegistryKey(OCPP20ComponentName.SampledDataCtrlr as string, 'TxEndedInterval')]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '60',
    description:
      'Interval between sampling of metering data, intended to be transmitted in the TransactionEventRequest (eventType = Ended) message.',
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: 'TxEndedInterval',
  },
  [buildRegistryKey(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20MeasurandEnumType.CURRENT_IMPORT
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.decimal,
    description: 'Instantaneous import current (A).',
    dynamicValueResolver: () => '0',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.AMP,
    variable: OCPP20MeasurandEnumType.CURRENT_IMPORT,
  },
  [buildRegistryKey(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.decimal,
    description: 'Cumulative active energy imported (Wh).',
    dynamicValueResolver: () => '0',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.WATT_HOUR,
    variable: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
  },
  [buildRegistryKey(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.decimal,
    description: 'Instantaneous active power import (W).',
    dynamicValueResolver: () => '0',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.WATT,
    variable: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
  },
  [buildRegistryKey(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20MeasurandEnumType.VOLTAGE
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.decimal,
    description: 'RMS voltage (V).',
    dynamicValueResolver: () => '230',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.VOLT,
    variable: OCPP20MeasurandEnumType.VOLTAGE,
  },
  [buildRegistryKey(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20RequiredVariableName.TxEndedMeasurands
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.MemberList,
    // Default includes cumulative energy and interval energy plus voltage for billing context
    defaultValue: `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL},${OCPP20MeasurandEnumType.VOLTAGE}`,
    description: 'Measurands sampled at transaction end.',
    enumeration: [
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_EXPORT_REGISTER,
      OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
      OCPP20MeasurandEnumType.POWER_ACTIVE_EXPORT,
      OCPP20MeasurandEnumType.POWER_REACTIVE_IMPORT,
      OCPP20MeasurandEnumType.POWER_REACTIVE_EXPORT,
      OCPP20MeasurandEnumType.POWER_OFFERED,
      OCPP20MeasurandEnumType.CURRENT_IMPORT,
      OCPP20MeasurandEnumType.CURRENT_EXPORT,
      OCPP20MeasurandEnumType.VOLTAGE,
      OCPP20MeasurandEnumType.FREQUENCY,
      OCPP20MeasurandEnumType.STATE_OF_CHARGE,
      OCPP20MeasurandEnumType.POWER_FACTOR,
    ],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TxEndedMeasurands as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20RequiredVariableName.TxStartedMeasurands
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT},${OCPP20MeasurandEnumType.VOLTAGE}`,
    description: 'Measurands sampled at transaction start.',
    enumeration: [
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_EXPORT_REGISTER,
      OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
      OCPP20MeasurandEnumType.POWER_ACTIVE_EXPORT,
      OCPP20MeasurandEnumType.POWER_REACTIVE_IMPORT,
      OCPP20MeasurandEnumType.POWER_REACTIVE_EXPORT,
      OCPP20MeasurandEnumType.POWER_OFFERED,
      OCPP20MeasurandEnumType.CURRENT_IMPORT,
      OCPP20MeasurandEnumType.CURRENT_EXPORT,
      OCPP20MeasurandEnumType.VOLTAGE,
      OCPP20MeasurandEnumType.FREQUENCY,
      OCPP20MeasurandEnumType.STATE_OF_CHARGE,
      OCPP20MeasurandEnumType.POWER_FACTOR,
    ],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TxStartedMeasurands as string,
  },
  // Volatile rationale: sampling interval affects runtime only; simulator does not persist across restarts.
  [buildRegistryKey(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20RequiredVariableName.TxUpdatedInterval
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.DEFAULT_TX_UPDATED_INTERVAL.toString(),
    description:
      'Interval between sampling of metering data for Updated TransactionEvent messages.',
    max: 3600,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Volatile,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: OCPP20RequiredVariableName.TxUpdatedInterval as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20RequiredVariableName.TxUpdatedMeasurands
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.CURRENT_IMPORT},${OCPP20MeasurandEnumType.VOLTAGE}`,
    description: 'Measurands included in periodic updates.',
    enumeration: [
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_EXPORT_REGISTER,
      OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
      OCPP20MeasurandEnumType.POWER_ACTIVE_EXPORT,
      OCPP20MeasurandEnumType.POWER_REACTIVE_IMPORT,
      OCPP20MeasurandEnumType.POWER_REACTIVE_EXPORT,
      OCPP20MeasurandEnumType.POWER_OFFERED,
      OCPP20MeasurandEnumType.CURRENT_IMPORT,
      OCPP20MeasurandEnumType.CURRENT_EXPORT,
      OCPP20MeasurandEnumType.VOLTAGE,
      OCPP20MeasurandEnumType.FREQUENCY,
      OCPP20MeasurandEnumType.STATE_OF_CHARGE,
      OCPP20MeasurandEnumType.POWER_FACTOR,
    ],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TxUpdatedMeasurands as string,
  },

  // SecurityCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.SecurityCtrlr as string, 'AdditionalRootCertificateCheck')]:
    {
      component: OCPP20ComponentName.SecurityCtrlr as string,
      dataType: DataEnumType.boolean,
      defaultValue: 'false',
      description: 'Required for all security profiles except profile 1.',
      mutability: MutabilityEnumType.ReadWrite,
      persistence: PersistenceEnumType.Persistent,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: 'AdditionalRootCertificateCheck',
    },
  [buildRegistryKey(OCPP20ComponentName.SecurityCtrlr as string, 'BasicAuthPassword')]: {
    component: OCPP20ComponentName.SecurityCtrlr as string,
    dataType: DataEnumType.string,
    description: 'The basic authentication password is used for HTTP Basic Authentication.',
    mutability: MutabilityEnumType.WriteOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'BasicAuthPassword',
  },
  [buildRegistryKey(OCPP20ComponentName.SecurityCtrlr as string, 'CertSigningRepeatTimes')]: {
    component: OCPP20ComponentName.SecurityCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '3',
    description:
      'Number of times to resend a SignCertificateRequest when CSMS does nor return a signed certificate.',
    min: 0,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'CertSigningRepeatTimes',
  },
  [buildRegistryKey(OCPP20ComponentName.SecurityCtrlr as string, 'CertSigningWaitMinimum')]: {
    component: OCPP20ComponentName.SecurityCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '60',
    description:
      'Seconds to wait before generating another CSR in case CSMS does not return a signed certificate.',
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: 'CertSigningWaitMinimum',
  },
  [buildRegistryKey(OCPP20ComponentName.SecurityCtrlr as string, 'Identity')]: {
    component: OCPP20ComponentName.SecurityCtrlr as string,
    dataType: DataEnumType.string,
    description: 'The Charging Station identity.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Identity',
  },
  [buildRegistryKey(OCPP20ComponentName.SecurityCtrlr as string, 'MaxCertificateChainSize')]: {
    component: OCPP20ComponentName.SecurityCtrlr as string,
    dataType: DataEnumType.integer,
    description:
      "Limit of the size of the 'certificateChain' field from the CertificateSignedRequest",
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'MaxCertificateChainSize',
  },
  [buildRegistryKey(
    OCPP20ComponentName.SecurityCtrlr as string,
    OCPP20RequiredVariableName.CertificateEntries
  )]: {
    allowZero: true,
    component: OCPP20ComponentName.SecurityCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '0',
    description: 'Count of installed certificates.',
    min: 0,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.CertificateEntries as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.SecurityCtrlr as string,
    OCPP20RequiredVariableName.OrganizationName
  )]: {
    component: OCPP20ComponentName.SecurityCtrlr as string,
    dataType: DataEnumType.string,
    defaultValue: 'ChangeMeOrg',
    description: 'Organization name for client certificate subject.',
    maxLength: 128,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    rebootRequired: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.OrganizationName as string,
  },
  // Enumeration limited to profiles 1..3 commonly used; spec allows additional profiles via extensions.
  [buildRegistryKey(
    OCPP20ComponentName.SecurityCtrlr as string,
    OCPP20RequiredVariableName.SecurityProfile
  )]: {
    component: OCPP20ComponentName.SecurityCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '1',
    description: 'Selected security profile.',
    enumeration: ['1', '2', '3'],
    max: 3,
    maxLength: 1,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    rebootRequired: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.SecurityProfile as string,
  },
  // Vendor-specific write-only placeholder to exercise WriteOnly path.
  [buildRegistryKey(
    OCPP20ComponentName.SecurityCtrlr as string,
    OCPP20VendorVariableName.CertificatePrivateKey
  )]: {
    component: OCPP20ComponentName.SecurityCtrlr as string,
    dataType: DataEnumType.string,
    description: 'Private key material upload placeholder; write-only for security.',
    maxLength: 2048,
    mutability: MutabilityEnumType.WriteOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20VendorVariableName.CertificatePrivateKey as string,
    vendorSpecific: true,
  },

  // SmartChargingCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.SmartChargingCtrlr as string, 'ACPhaseSwitchingSupported')]:
    {
      component: OCPP20ComponentName.SmartChargingCtrlr as string,
      dataType: DataEnumType.boolean,
      defaultValue: 'false',
      description:
        'This variable can be used to indicate an on-load/in-transaction capability. If defined and true, this EVSE supports the selection of which phase to use for 1 phase AC charging.',
      mutability: MutabilityEnumType.ReadOnly,
      persistence: PersistenceEnumType.Persistent,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: 'ACPhaseSwitchingSupported',
    },
  [buildRegistryKey(OCPP20ComponentName.SmartChargingCtrlr as string, 'Available')]: {
    component: OCPP20ComponentName.SmartChargingCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Whether smart charging is supported.',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Available',
  },
  [buildRegistryKey(OCPP20ComponentName.SmartChargingCtrlr as string, 'Enabled')]: {
    component: OCPP20ComponentName.SmartChargingCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Whether smart charging is enabled.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Enabled',
  },
  [buildRegistryKey(
    OCPP20ComponentName.SmartChargingCtrlr as string,
    'Entries',
    'ChargingProfiles'
  )]: {
    component: OCPP20ComponentName.SmartChargingCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '0',
    description:
      'Entries(ChargingProfiles) is the amount of Charging profiles currently installed on the Charging Station',
    instance: 'ChargingProfiles',
    min: 0,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Entries',
  },
  [buildRegistryKey(
    OCPP20ComponentName.SmartChargingCtrlr as string,
    'ExternalControlSignalsEnabled'
  )]: {
    component: OCPP20ComponentName.SmartChargingCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'Indicates whether a Charging Station should respond to external control signals that influence charging.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'ExternalControlSignalsEnabled',
  },
  [buildRegistryKey(OCPP20ComponentName.SmartChargingCtrlr as string, 'LimitChangeSignificance')]: {
    component: OCPP20ComponentName.SmartChargingCtrlr as string,
    dataType: DataEnumType.decimal,
    defaultValue: '1.0',
    description:
      'If at the Charging Station side a change in the limit in a ChargingProfile is lower than this percentage, the Charging Station MAY skip sending a NotifyChargingLimitRequest or a TransactionEventRequest message to the CSMS.',
    max: 100.0,
    min: 0.0,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.PERCENT,
    variable: 'LimitChangeSignificance',
  },
  [buildRegistryKey(
    OCPP20ComponentName.SmartChargingCtrlr as string,
    'NotifyChargingLimitWithSchedules'
  )]: {
    component: OCPP20ComponentName.SmartChargingCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'Indicates if the Charging Station should include the externally set charging limit/schedule in the message when it sends a NotifyChargingLimitRequest message.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'NotifyChargingLimitWithSchedules',
  },
  [buildRegistryKey(OCPP20ComponentName.SmartChargingCtrlr as string, 'PeriodsPerSchedule')]: {
    component: OCPP20ComponentName.SmartChargingCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '24',
    description: 'Maximum number of periods that may be defined per ChargingSchedule.',
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'PeriodsPerSchedule',
  },
  [buildRegistryKey(OCPP20ComponentName.SmartChargingCtrlr as string, 'Phases3to1')]: {
    component: OCPP20ComponentName.SmartChargingCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'If defined and true, this Charging Station supports switching from 3 to 1 phase during a transaction',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Phases3to1',
  },
  [buildRegistryKey(OCPP20ComponentName.SmartChargingCtrlr as string, 'ProfileStackLevel')]: {
    component: OCPP20ComponentName.SmartChargingCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '10',
    description:
      'Maximum acceptable value for stackLevel in a ChargingProfile. Since the lowest stackLevel is 0, this means that if SmartChargingCtrlr.ProfileStackLevel = 1, there can be at most 2 valid charging profiles per Charging Profile Purpose per EVSE.',
    min: 0,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'ProfileStackLevel',
  },
  [buildRegistryKey(OCPP20ComponentName.SmartChargingCtrlr as string, 'RateUnit')]: {
    component: OCPP20ComponentName.SmartChargingCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'A,W',
    description:
      "A list of supported quantities for use in a ChargingSchedule. Allowed values: 'A' and 'W'",
    enumeration: ['A', 'W'],
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'RateUnit',
  },

  // TariffCostCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.TariffCostCtrlr as string, 'Available', 'Cost')]: {
    component: OCPP20ComponentName.TariffCostCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'Instance Cost: Whether costs are supported.',
    instance: 'Cost',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Available',
  },
  [buildRegistryKey(OCPP20ComponentName.TariffCostCtrlr as string, 'Available', 'Tariff')]: {
    component: OCPP20ComponentName.TariffCostCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'Instance Tariff: Whether tariffs are supported.',
    instance: 'Tariff',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Available',
  },
  [buildRegistryKey(OCPP20ComponentName.TariffCostCtrlr as string, 'Currency')]: {
    component: OCPP20ComponentName.TariffCostCtrlr as string,
    dataType: DataEnumType.string,
    defaultValue: 'EUR',
    description: 'Currency used by this Charging Station in a ISO 4217 formatted currency code.',
    maxLength: 3,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Currency',
  },
  [buildRegistryKey(OCPP20ComponentName.TariffCostCtrlr as string, 'Enabled', 'Cost')]: {
    component: OCPP20ComponentName.TariffCostCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'Instance Cost: Whether costs are enabled.',
    instance: 'Cost',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Enabled',
  },
  [buildRegistryKey(OCPP20ComponentName.TariffCostCtrlr as string, 'Enabled', 'Tariff')]: {
    component: OCPP20ComponentName.TariffCostCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'Instance Tariff: Whether tariffs are enabled.',
    instance: 'Tariff',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'Enabled',
  },
  [buildRegistryKey(OCPP20ComponentName.TariffCostCtrlr as string, 'TariffFallbackMessage')]: {
    component: OCPP20ComponentName.TariffCostCtrlr as string,
    dataType: DataEnumType.string,
    defaultValue: 'Standard charging rate applies',
    description:
      'Message (and/or tariff information) to be shown to an EV Driver when there is no driver specific tariff information available.',
    maxLength: 512,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'TariffFallbackMessage',
  },
  [buildRegistryKey(OCPP20ComponentName.TariffCostCtrlr as string, 'TotalCostFallbackMessage')]: {
    component: OCPP20ComponentName.TariffCostCtrlr as string,
    dataType: DataEnumType.string,
    defaultValue: 'Cost information not available',
    description:
      'Message to be shown to an EV Driver when the Charging Station cannot retrieve the cost for a transaction at the end of the transaction.',
    maxLength: 512,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'TotalCostFallbackMessage',
  },

  // TxCtrlr Component
  [buildRegistryKey(OCPP20ComponentName.TxCtrlr as string, 'ChargingTime')]: {
    component: OCPP20ComponentName.TxCtrlr as string,
    dataType: DataEnumType.decimal,
    description: 'Time from earliest to latest substantive energy transfer',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: 'ChargingTime',
  },
  [buildRegistryKey(OCPP20ComponentName.TxCtrlr as string, 'MaxEnergyOnInvalidId')]: {
    component: OCPP20ComponentName.TxCtrlr as string,
    dataType: DataEnumType.integer,
    description:
      'Maximum amount of energy in Wh delivered when an identifier is deauthorized by the CSMS after start of a transaction.',
    min: 0,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.WATT_HOUR,
    variable: 'MaxEnergyOnInvalidId',
  },
  [buildRegistryKey(OCPP20ComponentName.TxCtrlr as string, 'TxBeforeAcceptedEnabled')]: {
    component: OCPP20ComponentName.TxCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description:
      'Allow charging before having received a BootNotificationResponse with RegistrationStatus: Accepted.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: 'TxBeforeAcceptedEnabled',
  },
  [buildRegistryKey(
    OCPP20ComponentName.TxCtrlr as string,
    OCPP20RequiredVariableName.EVConnectionTimeOut
  )]: {
    component: OCPP20ComponentName.TxCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.DEFAULT_EV_CONNECTION_TIMEOUT.toString(),
    description: 'Timeout for EV to establish connection.',
    max: 3600,
    maxLength: 10,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: OCPP20UnitEnumType.SECONDS,
    variable: OCPP20RequiredVariableName.EVConnectionTimeOut as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.TxCtrlr as string,
    OCPP20RequiredVariableName.StopTxOnEVSideDisconnect
  )]: {
    component: OCPP20ComponentName.TxCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Deauthorize transaction when cable unplugged at EV.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.StopTxOnEVSideDisconnect as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.TxCtrlr as string,
    OCPP20RequiredVariableName.StopTxOnInvalidId
  )]: {
    component: OCPP20ComponentName.TxCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Deauthorize transaction on invalid id token status.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.StopTxOnInvalidId as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.TxCtrlr as string,
    OCPP20RequiredVariableName.TxStartPoint
  )]: {
    component: OCPP20ComponentName.TxCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'Authorized,EVConnected',
    description: 'Trigger conditions for starting a transaction.',
    enumeration: [
      'Authorized',
      'EVConnected',
      'PowerPathClosed',
      'EnergyTransfer',
      'ParkingBayOccupied',
      'DataSigned',
    ],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TxStartPoint as string,
  },
  [buildRegistryKey(OCPP20ComponentName.TxCtrlr as string, OCPP20RequiredVariableName.TxStopPoint)]:
    {
      component: OCPP20ComponentName.TxCtrlr as string,
      dataType: DataEnumType.MemberList,
      defaultValue: 'EVConnected,PowerPathClosed',
      description: 'Trigger conditions for ending a transaction.',
      enumeration: [
        'Authorized',
        'EVConnected',
        'PowerPathClosed',
        'EnergyTransfer',
        'ParkingBayOccupied',
      ],
      mutability: MutabilityEnumType.ReadWrite,
      persistence: PersistenceEnumType.Persistent,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: OCPP20RequiredVariableName.TxStopPoint as string,
    },
}

/**
 * Build composite lookup key (lower-cased) including optional instance.
 * Format: `component[.instance].variable` all lower case.
 * @param component Component name.
 * @param instance Optional instance qualifier.
 * @param variable Variable name.
 * @returns Lower-case composite key for lookup.
 */
export function buildCaseInsensitiveCompositeKey (
  component: string,
  instance: string | undefined,
  variable: string
): string {
  return `${component.toLowerCase()}${instance ? '.' + instance : ''}.${variable.toLowerCase()}`
}

// Lowercase fallback registry (composite key) for case-insensitive lookups.
const VARIABLE_REGISTRY_LOOKUP_CI: Record<string, VariableMetadata> = Object.values(
  VARIABLE_REGISTRY
).reduce<Record<string, VariableMetadata>>((acc, vm) => {
  acc[buildCaseInsensitiveCompositeKey(vm.component, vm.instance, vm.variable)] = vm
  return acc
}, {})

/**
 * Apply optional metadata post-processing to a resolved variable value.
 * @param chargingStation Charging station context.
 * @param variableMetadata Variable metadata entry.
 * @param value Resolved raw value.
 * @returns Post-processed value (or original when no postProcess defined).
 */
export function applyPostProcess (
  chargingStation: ChargingStation,
  variableMetadata: VariableMetadata,
  value: string
): string {
  if (variableMetadata.postProcess) {
    return variableMetadata.postProcess(value, { chargingStation })
  }
  return value
}

/**
 * Enforce reporting/value size limit on a string.
 * @param value Incoming value string.
 * @param sizeLimitRaw Raw size limit value (string form).
 * @returns Possibly truncated value respecting size limit.
 */
export function enforceReportingValueSize (value: string, sizeLimitRaw: string): string {
  const sizeLimit = convertToIntOrNaN(sizeLimitRaw)
  if (!Number.isNaN(sizeLimit) && sizeLimit > 0 && value.length > sizeLimit) {
    return value.slice(0, sizeLimit)
  }
  return value
}

/**
 * Retrieve variable metadata with case-insensitive fallback.
 * @param component Component name.
 * @param variable Variable name.
 * @param instance Optional instance qualifier.
 * @returns Matching variable metadata or undefined.
 */
export function getVariableMetadata (
  component: string,
  variable: string,
  instance?: string
): undefined | VariableMetadata {
  const withInstanceKey = buildRegistryKey(component, variable, instance)
  if (has(withInstanceKey, VARIABLE_REGISTRY)) {
    return VARIABLE_REGISTRY[withInstanceKey]
  }
  const withoutInstanceKey = buildRegistryKey(component, variable)
  if (has(withoutInstanceKey, VARIABLE_REGISTRY)) {
    return VARIABLE_REGISTRY[withoutInstanceKey]
  }
  const lcWithKey = buildCaseInsensitiveCompositeKey(component, instance, variable)
  if (has(lcWithKey, VARIABLE_REGISTRY_LOOKUP_CI)) {
    return VARIABLE_REGISTRY_LOOKUP_CI[lcWithKey]
  }
  return VARIABLE_REGISTRY_LOOKUP_CI[
    buildCaseInsensitiveCompositeKey(component, undefined, variable)
  ] as undefined | VariableMetadata
}

/**
 * Check if variable metadata is persistent.
 * @param variableMetadata Variable metadata entry.
 * @returns True when persistence is Persistent.
 */
export function isPersistent (variableMetadata: VariableMetadata): boolean {
  return variableMetadata.persistence === PersistenceEnumType.Persistent
}

/**
 * Check if variable metadata is read-only.
 * @param variableMetadata Variable metadata entry.
 * @returns True when mutability is ReadOnly.
 */
export function isReadOnly (variableMetadata: VariableMetadata): boolean {
  return variableMetadata.mutability === MutabilityEnumType.ReadOnly
}

/**
 * Check if variable metadata is write-only.
 * @param variableMetadata Variable metadata entry.
 * @returns True when mutability is WriteOnly.
 */
export function isWriteOnly (variableMetadata: VariableMetadata): boolean {
  return variableMetadata.mutability === MutabilityEnumType.WriteOnly
}

/**
 * Resolve variable value using dynamicValueResolver if present else defaultValue.
 * @param chargingStation Charging station context.
 * @param variableMetadata Variable metadata entry.
 * @returns Resolved value string (empty when no default).
 */
export function resolveValue (
  chargingStation: ChargingStation,
  variableMetadata: VariableMetadata
): string {
  if (variableMetadata.dynamicValueResolver) {
    return variableMetadata.dynamicValueResolver({ chargingStation })
  }
  return variableMetadata.defaultValue ?? ''
}

/**
 * Validate raw value against variable metadata constraints.
 * Performs length, datatype specific and enumeration checks.
 * @param variableMetadata Variable metadata entry.
 * @param rawValue Raw value string to validate.
 * @returns Validation result with ok flag and optional reason/info.
 */
export function validateValue (
  variableMetadata: VariableMetadata,
  rawValue: string
): { info?: string; ok: boolean; reason?: ReasonCodeEnumType } {
  if (variableMetadata.maxLength != null && rawValue.length > variableMetadata.maxLength) {
    return {
      info: 'Value exceeds maximum length (' + String(variableMetadata.maxLength) + ')',
      ok: false,
      reason: ReasonCodeEnumType.InvalidValue,
    }
  }
  switch (variableMetadata.dataType) {
    case DataEnumType.boolean: {
      if (rawValue !== 'true' && rawValue !== 'false') {
        return {
          info: 'Boolean must be "true" or "false"',
          ok: false,
          reason: ReasonCodeEnumType.InvalidValue,
        }
      }
      break
    }
    case DataEnumType.dateTime: {
      if (isNaN(Date.parse(rawValue))) {
        return {
          info: 'Invalid dateTime format',
          ok: false,
          reason: ReasonCodeEnumType.InvalidValue,
        }
      }
      break
    }
    case DataEnumType.decimal: {
      if (!DECIMAL_PATTERN.test(rawValue)) {
        return {
          info: 'Invalid decimal format',
          ok: false,
          reason: ReasonCodeEnumType.InvalidValue,
        }
      }
      const num = Number(rawValue)
      if (variableMetadata.positive && num <= 0) {
        return {
          info: 'Positive decimal > 0 required',
          ok: false,
          reason: ReasonCodeEnumType.ValuePositiveOnly,
        }
      }
      if (!variableMetadata.positive && !variableMetadata.allowZero && num === 0) {
        return {
          info: 'Zero value not allowed',
          ok: false,
          reason: ReasonCodeEnumType.ValueZeroNotAllowed,
        }
      }
      if (variableMetadata.min != null && num < variableMetadata.min) {
        return {
          info: 'Decimal value below minimum (' + String(variableMetadata.min) + ')',
          ok: false,
          reason: ReasonCodeEnumType.ValueTooLow,
        }
      }
      if (variableMetadata.max != null && num > variableMetadata.max) {
        return {
          info: 'Decimal value above maximum (' + String(variableMetadata.max) + ')',
          ok: false,
          reason: ReasonCodeEnumType.ValueTooHigh,
        }
      }
      break
    }
    case DataEnumType.integer: {
      if (variableMetadata.allowZero && !variableMetadata.positive) {
        if (DECIMAL_ONLY_PATTERN.test(rawValue)) {
          return {
            info: 'Integer >= 0 required',
            ok: false,
            reason: ReasonCodeEnumType.ValueZeroNotAllowed,
          }
        }
      }
      if (!SIGNED_INTEGER_PATTERN.test(rawValue)) {
        if (DECIMAL_ONLY_PATTERN.test(rawValue)) {
          return {
            info: variableMetadata.positive
              ? 'Positive integer > 0 required (no decimals)'
              : 'Integer must not be decimal',
            ok: false,
            reason:
              variableMetadata.allowZero && !variableMetadata.positive
                ? ReasonCodeEnumType.ValueZeroNotAllowed
                : ReasonCodeEnumType.InvalidValue,
          }
        }
        return {
          info: 'Non-empty digits only string required',
          ok: false,
          reason: ReasonCodeEnumType.InvalidValue,
        }
      }
      const num = Number(rawValue)
      if (variableMetadata.allowZero && !variableMetadata.positive && num < 0) {
        return {
          info: 'Integer >= 0 required',
          ok: false,
          reason: ReasonCodeEnumType.ValueZeroNotAllowed,
        }
      }
      if (variableMetadata.positive && num <= 0) {
        return {
          info: 'Positive integer > 0 required',
          ok: false,
          reason: ReasonCodeEnumType.ValuePositiveOnly,
        }
      }
      if (variableMetadata.min != null && num < variableMetadata.min) {
        return {
          info: 'Integer value below minimum (' + String(variableMetadata.min) + ')',
          ok: false,
          reason: ReasonCodeEnumType.ValueTooLow,
        }
      }
      if (variableMetadata.max != null && num > variableMetadata.max) {
        return {
          info: 'Integer value above maximum (' + String(variableMetadata.max) + ')',
          ok: false,
          reason: ReasonCodeEnumType.ValueTooHigh,
        }
      }
      if (!variableMetadata.positive && !variableMetadata.allowZero && num === 0) {
        return {
          info: 'Zero value not allowed',
          ok: false,
          reason: ReasonCodeEnumType.ValueZeroNotAllowed,
        }
      }
      break
    }
    case DataEnumType.MemberList:
    case DataEnumType.SequenceList: {
      if (rawValue.trim().length === 0) {
        return { info: 'List cannot be empty', ok: false, reason: ReasonCodeEnumType.InvalidValue }
      }
      if (rawValue.startsWith(',') || rawValue.endsWith(',')) {
        return {
          info: 'No leading/trailing comma',
          ok: false,
          reason: ReasonCodeEnumType.InvalidValue,
        }
      }
      const tokens = rawValue.split(',').map(t => t.trim())
      if (tokens.some(t => t.length === 0)) {
        return { info: 'Empty list member', ok: false, reason: ReasonCodeEnumType.InvalidValue }
      }
      const seen = new Set<string>()
      for (const t of tokens) {
        if (seen.has(t)) {
          return {
            info: 'Duplicate list member',
            ok: false,
            reason: ReasonCodeEnumType.InvalidValue,
          }
        }
        seen.add(t)
      }
      if (variableMetadata.enumeration?.length) {
        for (const t of tokens) {
          if (!variableMetadata.enumeration.includes(t)) {
            return {
              info: 'Member not in enumeration',
              ok: false,
              reason: ReasonCodeEnumType.InvalidValue,
            }
          }
        }
      }
      break
    }
    case DataEnumType.string: {
      if (variableMetadata.urlSchemes?.length) {
        const schemeValidation = validateUrlScheme(rawValue, variableMetadata.urlSchemes)
        if (!schemeValidation.ok) {
          return schemeValidation
        }
      } else if (variableMetadata.isUrl) {
        const generic = validateGenericUrl(rawValue)
        if (!generic.ok) {
          return generic
        }
      }
      break
    }
    default:
      break
  }
  // Centralized enumeration membership for scalar (non-list) types including string.
  if (
    variableMetadata.enumeration?.length &&
    variableMetadata.dataType !== DataEnumType.MemberList &&
    variableMetadata.dataType !== DataEnumType.SequenceList
  ) {
    if (!variableMetadata.enumeration.includes(rawValue)) {
      return {
        info: 'Value not in enumeration',
        ok: false,
        reason: ReasonCodeEnumType.InvalidValue,
      }
    }
  }
  return { ok: true }
}

/**
 * Validate URL using generic parsing (any scheme accepted).
 * @param value Raw URL string.
 * @returns Validation result with ok flag and optional reason/info.
 */
function validateGenericUrl (value: string): {
  info?: string
  ok: boolean
  reason?: ReasonCodeEnumType
} {
  if (!URL.canParse(value)) {
    return { info: 'Invalid URL format', ok: false, reason: ReasonCodeEnumType.InvalidURL }
  }
  return { ok: true }
}

/**
 * Validate URL scheme against an allowed list after generic format check.
 * @param value Raw URL string.
 * @param allowedSchemes Allowed protocol schemes (with trailing colon).
 * @returns Validation result with ok flag and optional reason/info.
 */
function validateUrlScheme (
  value: string,
  allowedSchemes: string[]
): { info?: string; ok: boolean; reason?: ReasonCodeEnumType } {
  const generic = validateGenericUrl(value)
  if (!generic.ok) {
    return generic
  }
  const url = new URL(value)
  if (!allowedSchemes.includes(url.protocol)) {
    return { info: 'Unsupported URL scheme', ok: false, reason: ReasonCodeEnumType.InvalidURL }
  }
  return { ok: true }
}
