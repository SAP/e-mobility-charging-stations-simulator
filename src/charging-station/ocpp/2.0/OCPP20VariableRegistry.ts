import { millisecondsToSeconds } from 'date-fns'

import type { ChargingStation } from '../../ChargingStation.js'

import {
  AttributeEnumType,
  DataEnumType,
  MutabilityEnumType,
  OCPP20ComponentName,
  OCPP20DeviceInfoVariableName,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
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
  // AuthCtrlr variables
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
  // ChargingStation variables
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
    unit: 'seconds',
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

  // ClockCtrlr variables
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

  // DeviceDataCtrlr variables
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
    unit: 'chars',
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
    unit: 'chars',
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
    unit: 'chars',
    variable: OCPP20RequiredVariableName.ValueSize as string,
  },

  // OCPPCommCtrlr variables
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
    unit: 'seconds',
    variable: OCPP20OptionalVariableName.HeartbeatInterval as string,
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
    unit: 'seconds',
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
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.MessageTimeout as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.NetworkConfigurationPriority
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.SequenceList,
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
    unit: 'seconds',
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

  // SampledDataCtrlr variables
  [buildRegistryKey(OCPP20ComponentName.SampledDataCtrlr as string, 'Current.Import')]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.decimal,
    description: 'Instantaneous import current (A).',
    dynamicValueResolver: () => '0',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'A',
    variable: 'Current.Import',
  },
  [buildRegistryKey(
    OCPP20ComponentName.SampledDataCtrlr as string,
    'Energy.Active.Import.Register'
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.decimal,
    description: 'Cumulative active energy imported (Wh).',
    dynamicValueResolver: () => '0',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'Wh',
    variable: 'Energy.Active.Import.Register',
  },
  [buildRegistryKey(OCPP20ComponentName.SampledDataCtrlr as string, 'Power.Active.Import')]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.decimal,
    description: 'Instantaneous active power import (W).',
    dynamicValueResolver: () => '0',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'W',
    variable: 'Power.Active.Import',
  },
  [buildRegistryKey(OCPP20ComponentName.SampledDataCtrlr as string, 'Voltage')]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.decimal,
    description: 'RMS voltage (V).',
    dynamicValueResolver: () => '230',
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'V',
    variable: 'Voltage',
  },
  [buildRegistryKey(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20RequiredVariableName.TxEndedMeasurands
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.MemberList,
    // Default includes cumulative energy and interval energy plus voltage for billing context
    defaultValue: 'Energy.Active.Import.Register,Energy.Active.Import.Interval,Voltage',
    description: 'Measurands sampled at transaction end.',
    enumeration: [
      'Energy.Active.Import.Register',
      'Energy.Active.Import.Interval',
      'Energy.Active.Export.Register',
      'Power.Active.Import',
      'Power.Active.Export',
      'Power.Reactive.Import',
      'Power.Reactive.Export',
      'Power.Offered',
      'Current.Import',
      'Current.Export',
      'Voltage',
      'Frequency',
      'Temperature',
      'SoC',
      'RPM',
      'Power.Factor',
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
    defaultValue: 'Energy.Active.Import.Register,Power.Active.Import,Voltage',
    description: 'Measurands sampled at transaction start.',
    enumeration: [
      'Energy.Active.Import.Register',
      'Energy.Active.Import.Interval',
      'Energy.Active.Export.Register',
      'Power.Active.Import',
      'Power.Active.Export',
      'Power.Reactive.Import',
      'Power.Reactive.Export',
      'Power.Offered',
      'Current.Import',
      'Current.Export',
      'Voltage',
      'Frequency',
      'Temperature',
      'SoC',
      'RPM',
      'Power.Factor',
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
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.TxUpdatedInterval as string,
  },
  [buildRegistryKey(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20RequiredVariableName.TxUpdatedMeasurands
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'Energy.Active.Import.Register,Current.Import,Voltage',
    description: 'Measurands included in periodic updates.',
    enumeration: [
      'Energy.Active.Import.Register',
      'Energy.Active.Import.Interval',
      'Energy.Active.Export.Register',
      'Power.Active.Import',
      'Power.Active.Export',
      'Power.Reactive.Import',
      'Power.Reactive.Export',
      'Power.Offered',
      'Current.Import',
      'Current.Export',
      'Voltage',
      'Frequency',
      'Temperature',
      'SoC',
      'RPM',
      'Power.Factor',
    ],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TxUpdatedMeasurands as string,
  },

  // SecurityCtrlr variables
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

  // TxCtrlr variables
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
    unit: 'seconds',
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
      'ParkingBayOccupancy',
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
        'ParkingBayOccupancy',
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
