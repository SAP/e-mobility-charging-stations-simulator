import { millisecondsToSeconds } from 'date-fns'

import type { ChargingStation } from '../../ChargingStation.js'

import {
  AttributeEnumType,
  DataEnumType,
  MutabilityEnumType,
  OCPP20ComponentName,
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  OCPP20VendorVariableName,
  PersistenceEnumType,
  ReasonCodeEnumType,
} from '../../../types/index.js'
import { Constants, convertToIntOrNaN } from '../../../utils/index.js'

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
  variable: string
  vendorSpecific?: boolean
}

/**
 * Build unique registry key from component and variable names.
 * @param component Component name (case-sensitive original form).
 * @param variable Variable name (case-sensitive original form).
 * @param instance Optional instance identifier appended to component name before separator.
 * @returns Composite key `${component}[.<instance>]::${variable}`.
 */
function key (component: string, variable: string, instance?: string): string {
  return `${component}${instance ? '.' + instance : ''}::${variable}`
}

export const VARIABLE_REGISTRY: Record<string, VariableMetadata> = {
  [key(OCPP20ComponentName.AuthCtrlr as string, OCPP20RequiredVariableName.AuthorizeRemoteStart)]: {
    component: OCPP20ComponentName.AuthCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Whether remote start requires authorization.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.AuthorizeRemoteStart as string,
  },
  // AuthCtrlr additions
  [key(OCPP20ComponentName.AuthCtrlr as string, OCPP20RequiredVariableName.LocalAuthorizeOffline)]:
    {
      component: OCPP20ComponentName.AuthCtrlr as string,
      dataType: DataEnumType.boolean,
      defaultValue: 'true',
      description: 'Start transaction offline for locally authorized identifiers.',
      mutability: MutabilityEnumType.ReadWrite,
      persistence: PersistenceEnumType.Persistent,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: OCPP20RequiredVariableName.LocalAuthorizeOffline as string,
    },
  [key(OCPP20ComponentName.AuthCtrlr as string, OCPP20RequiredVariableName.LocalPreAuthorize)]: {
    component: OCPP20ComponentName.AuthCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'false',
    description: 'Start transaction locally without waiting for CSMS authorization.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.LocalPreAuthorize as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20OptionalVariableName.WebSocketPingInterval
  )]: {
    allowZero: true,
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL.toString(),
    description: 'Interval between WS ping frames.',
    max: 3600,
    maxLength: 10,
    min: 0,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [
      AttributeEnumType.Actual,
      AttributeEnumType.MinSet,
      AttributeEnumType.MaxSet,
    ],
    unit: 'seconds',
    variable: OCPP20OptionalVariableName.WebSocketPingInterval as string,
  },
  [key(OCPP20ComponentName.ChargingStation as string, OCPP20VendorVariableName.ConnectionUrl)]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.string,
    defaultValue: 'ws://localhost',
    description: 'Central system connection URL.',
    enumeration: ['ws:', 'wss:', 'http:', 'https:'],
    maxLength: 512,
    mutability: MutabilityEnumType.ReadWrite, // restored to ReadWrite per OCPP spec for ConnectionUrl
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20VendorVariableName.ConnectionUrl as string,
    vendorSpecific: true,
  },

  // ClockCtrlr variable
  [key(OCPP20ComponentName.ClockCtrlr as string, OCPP20RequiredVariableName.DateTime)]: {
    component: OCPP20ComponentName.ClockCtrlr as string,
    dataType: DataEnumType.dateTime,
    description: 'Contains the current date and time (ClockCtrlr)',
    dynamicValueResolver: () => new Date().toISOString(),
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.DateTime as string,
  },

  [key(OCPP20ComponentName.ClockCtrlr as string, OCPP20RequiredVariableName.TimeSource)]: {
    component: OCPP20ComponentName.ClockCtrlr as string,
    dataType: DataEnumType.SequenceList,
    defaultValue: 'NTP,GPS,RTC',
    description: 'Ordered list of clock sources by preference.',
    enumeration: ['NTP', 'GPS', 'RTC', 'Manual'],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TimeSource as string,
  },
  // DeviceDataCtrlr BytesPerMessage instances per spec (GetReport, GetVariables, SetVariables)
  // Base BytesPerMessage metadata (non-instance) for read-only rejection semantics
  [key(OCPP20ComponentName.DeviceDataCtrlr as string, OCPP20RequiredVariableName.BytesPerMessage)]:
    {
      component: OCPP20ComponentName.DeviceDataCtrlr as string,
      dataType: DataEnumType.integer,
      defaultValue: '8192',
      description: 'Maximum number of bytes in a message (base).',
      max: 65535,
      min: 1,
      mutability: MutabilityEnumType.ReadOnly,
      persistence: PersistenceEnumType.Persistent,
      positive: true,
      supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
      variable: OCPP20RequiredVariableName.BytesPerMessage as string,
    },
  [key(
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
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    variable: OCPP20RequiredVariableName.BytesPerMessage as string,
  },
  [key(
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
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    variable: OCPP20RequiredVariableName.BytesPerMessage as string,
  },
  [key(
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
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    variable: OCPP20RequiredVariableName.BytesPerMessage as string,
  },
  [key(
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
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    unit: 'chars',
    variable: OCPP20RequiredVariableName.ConfigurationValueSize as string,
  },
  [key(
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
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    variable: OCPP20RequiredVariableName.ItemsPerMessage as string,
  },
  [key(
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
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    variable: OCPP20RequiredVariableName.ItemsPerMessage as string,
  },
  [key(
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
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    variable: OCPP20RequiredVariableName.ItemsPerMessage as string,
  },
  // DeviceDataCtrlr base + new limits
  [key(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.ReportingValueSize
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH.toString(),
    description: 'Maximum size of reported values (DeviceDataCtrlr).',
    max: Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH,
    maxLength: 5,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    unit: 'chars',
    variable: OCPP20RequiredVariableName.ReportingValueSize as string,
  },
  [key(OCPP20ComponentName.DeviceDataCtrlr as string, OCPP20RequiredVariableName.ValueSize)]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH.toString(),
    description: 'Maximum size for stored values (enforced before ReportingValueSize).',
    max: Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH,
    maxLength: 5,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
    unit: 'chars',
    variable: OCPP20RequiredVariableName.ValueSize as string,
  },
  // ChargingStation base component
  [key(OCPP20ComponentName.OCPPCommCtrlr as string, OCPP20OptionalVariableName.HeartbeatInterval)]:
    {
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
      supportedAttributes: [
        AttributeEnumType.Actual,
        AttributeEnumType.MinSet,
        AttributeEnumType.MaxSet,
      ],
      unit: 'seconds',
      variable: OCPP20OptionalVariableName.HeartbeatInterval as string,
    },
  [key(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.FileTransferProtocols
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'HTTP',
    description: 'Supported file transfer protocols.',
    enumeration: ['HTTP', 'HTTPS', 'FTP', 'SFTP'],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.FileTransferProtocols as string,
  },
  // OCPPCommCtrlr variables
  [key(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.MessageAttemptInterval,
    'TransactionEvent'
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '5',
    description: 'Retry interval for TransactionEvent message attempts before resubmitting.',
    instance: 'TransactionEvent',
    max: 3600,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [
      AttributeEnumType.Actual,
      AttributeEnumType.MinSet,
      AttributeEnumType.MaxSet,
    ],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.MessageAttemptInterval as string,
  },
  [key(
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
    supportedAttributes: [
      AttributeEnumType.Actual,
      AttributeEnumType.MinSet,
      AttributeEnumType.MaxSet,
    ],
    variable: OCPP20RequiredVariableName.MessageAttempts as string,
  },
  [key(
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
    supportedAttributes: [
      AttributeEnumType.Actual,
      AttributeEnumType.MinSet,
      AttributeEnumType.MaxSet,
    ],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.MessageTimeout as string,
  },
  [key(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.NetworkConfigurationPriority
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.SequenceList,
    defaultValue: '',
    description: 'Comma separated ordered list of network profile priorities.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.Target],
    supportsTarget: true,
    variable: OCPP20RequiredVariableName.NetworkConfigurationPriority as string,
  },
  [key(
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
    positive: true,
    supportedAttributes: [
      AttributeEnumType.Actual,
      AttributeEnumType.MinSet,
      AttributeEnumType.MaxSet,
    ],
    variable: OCPP20RequiredVariableName.NetworkProfileConnectionAttempts as string,
  },
  [key(OCPP20ComponentName.OCPPCommCtrlr as string, OCPP20RequiredVariableName.OfflineThreshold)]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '300',
    description: 'Offline duration threshold for status refresh.',
    max: 86400,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [
      AttributeEnumType.Actual,
      AttributeEnumType.MinSet,
      AttributeEnumType.MaxSet,
    ],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.OfflineThreshold as string,
  },
  [key(OCPP20ComponentName.OCPPCommCtrlr as string, OCPP20RequiredVariableName.ResetRetries)]: {
    allowZero: true,
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '2',
    description: 'Number of times to retry a reset.',
    max: 10,
    min: 0,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [
      AttributeEnumType.Actual,
      AttributeEnumType.MinSet,
      AttributeEnumType.MaxSet,
    ],
    variable: OCPP20RequiredVariableName.ResetRetries as string,
  },
  [key(
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
  [key(OCPP20ComponentName.SampledDataCtrlr as string, 'Current.Import')]: {
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
  // Additional decimal measurement variables (sample simulation values)
  [key(OCPP20ComponentName.SampledDataCtrlr as string, 'Energy.Active.Import.Register')]: {
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
  [key(OCPP20ComponentName.SampledDataCtrlr as string, 'Power.Active.Import')]: {
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
  [key(OCPP20ComponentName.SampledDataCtrlr as string, 'Voltage')]: {
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
  [key(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20RequiredVariableName.TxEndedMeasurands
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'Energy.Active.Import.Register,Current.Import',
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
  // SampledDataCtrlr variables
  [key(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20RequiredVariableName.TxStartedMeasurands
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'Energy.Active.Import.Register,Power.Active.Import',
    description: 'Measurands sampled at transaction start.',
    enumeration: [
      'Energy.Active.Import.Register',
      'Energy.Active.Export.Register',
      'Power.Active.Import',
      'Power.Active.Export',
      'Current.Import',
      'Voltage',
      'SoC',
    ],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TxStartedMeasurands as string,
  },
  [key(
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
    supportedAttributes: [
      AttributeEnumType.Actual,
      AttributeEnumType.MinSet,
      AttributeEnumType.MaxSet,
    ],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.TxUpdatedInterval as string,
  },
  [key(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20RequiredVariableName.TxUpdatedMeasurands
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'Energy.Active.Import.Register',
    description: 'Measurands included in periodic updates.',
    enumeration: [
      'Energy.Active.Import.Register',
      'Energy.Active.Export.Register',
      'Power.Active.Import',
      'Power.Active.Export',
      'Current.Import',
      'Voltage',
      'SoC',
    ],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TxUpdatedMeasurands as string,
  },
  // SecurityCtrlr variables
  [key(OCPP20ComponentName.SecurityCtrlr as string, OCPP20RequiredVariableName.CertificateEntries)]:
    {
      allowZero: true,
      component: OCPP20ComponentName.SecurityCtrlr as string,
      dataType: DataEnumType.integer,
      defaultValue: '0',
      description: 'Count of installed certificates.',
      min: 0,
      mutability: MutabilityEnumType.ReadOnly,
      persistence: PersistenceEnumType.Persistent,
      supportedAttributes: [AttributeEnumType.Actual, AttributeEnumType.MaxSet],
      variable: OCPP20RequiredVariableName.CertificateEntries as string,
    },
  [key(OCPP20ComponentName.SecurityCtrlr as string, OCPP20RequiredVariableName.OrganizationName)]: {
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
  [key(OCPP20ComponentName.SecurityCtrlr as string, OCPP20RequiredVariableName.SecurityProfile)]: {
    component: OCPP20ComponentName.SecurityCtrlr as string,
    dataType: DataEnumType.integer,
    description: 'Selected security profile.',
    enumeration: ['1', '2', '3'], // restricted to common profiles
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
  [key(OCPP20ComponentName.TxCtrlr as string, OCPP20RequiredVariableName.EVConnectionTimeOut)]: {
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
    supportedAttributes: [
      AttributeEnumType.Actual,
      AttributeEnumType.MinSet,
      AttributeEnumType.MaxSet,
    ],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.EVConnectionTimeOut as string,
  },

  // TxCtrlr variables
  [key(OCPP20ComponentName.TxCtrlr as string, OCPP20RequiredVariableName.StopTxOnEVSideDisconnect)]:
    {
      component: OCPP20ComponentName.TxCtrlr as string,
      dataType: DataEnumType.boolean,
      defaultValue: 'true',
      description: 'Deauthorize transaction when cable unplugged at EV.',
      mutability: MutabilityEnumType.ReadWrite,
      persistence: PersistenceEnumType.Persistent,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: OCPP20RequiredVariableName.StopTxOnEVSideDisconnect as string,
    },
  [key(OCPP20ComponentName.TxCtrlr as string, OCPP20RequiredVariableName.StopTxOnInvalidId)]: {
    component: OCPP20ComponentName.TxCtrlr as string,
    dataType: DataEnumType.boolean,
    defaultValue: 'true',
    description: 'Deauthorize transaction on invalid id token status.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.StopTxOnInvalidId as string,
  },
  [key(OCPP20ComponentName.TxCtrlr as string, OCPP20RequiredVariableName.TxStartPoint)]: {
    component: OCPP20ComponentName.TxCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'CablePluggedIn,EnergyTransfer',
    description: 'Trigger conditions for starting a transaction.',
    enumeration: ['CablePluggedIn', 'EnergyTransfer', 'Authorized', 'PowerPathClosed'],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TxStartPoint as string,
  },
  [key(OCPP20ComponentName.TxCtrlr as string, OCPP20RequiredVariableName.TxStopPoint)]: {
    component: OCPP20ComponentName.TxCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'EVSEIdle,CableUnplugged',
    description: 'Trigger conditions for ending a transaction.',
    enumeration: ['EVSEIdle', 'CableUnplugged', 'Deauthorized', 'PowerPathOpened'],
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TxStopPoint as string,
  },
}

/**
 * Apply optional metadata post-processing to a resolved variable value.
 * Executes `variableMetadata.postProcess` if defined; otherwise returns the original value.
 * @param chargingStation ChargingStation instance for context.
 * @param variableMetadata Variable metadata definition.
 * @param value Raw value prior to post processing.
 * @returns Post-processed value.
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
 * Build composite lookup key (lower-cased) including optional instance.
 * Format: `component[.instance].variable` all lower case.
 * @param component Component name.
 * @param instance Optional instance identifier.
 * @param variable Variable name.
 * @returns Composite lower-cased key string.
 */
export function buildVariableCompositeKey (
  component: string,
  instance: string | undefined,
  variable: string
): string {
  return `${component.toLowerCase()}${instance ? '.' + instance : ''}.${variable.toLowerCase()}`
}

/**
 * Truncate a reported value string to the configured maximum size.
 * @param value Original value string.
 * @param sizeRaw Raw size metadata value (string) or undefined.
 * @returns Possibly truncated value (enforced size) or original.
 */
export function enforceReportingValueSize (value: string, sizeRaw: string | undefined): string {
  const size = convertToIntOrNaN(sizeRaw ?? Constants.OCPP_VALUE_ABSOLUTE_MAX_LENGTH.toString())
  if (!Number.isNaN(size) && size > 0 && value.length > size) {
    return value.slice(0, size)
  }
  return value
}

/**
 * Retrieve variable metadata with case-insensitive fallback.
 * First tries exact case then canonical lower-cased registry.
 * @param component Component name.
 * @param variable Variable name.
 * @param instance Optional instance identifier when variable metadata is instance-scoped.
 * @returns VariableMetadata or undefined if not registered.
 */
export function getVariableMetadata (
  component: string,
  variable: string,
  instance?: string
): undefined | VariableMetadata {
  return (VARIABLE_REGISTRY[key(component, variable, instance)] ??
    VARIABLE_REGISTRY[key(component, variable)]) as undefined | VariableMetadata
}

/**
 * Check if variable persistence type is Persistent.
 * @param variableMetadata Variable metadata.
 * @returns True if persistence is Persistent.
 */
export function isPersistent (variableMetadata: VariableMetadata): boolean {
  return variableMetadata.persistence === PersistenceEnumType.Persistent
}

/**
 * Check if variable mutability type is ReadOnly.
 * @param variableMetadata Variable metadata.
 * @returns True if mutability is ReadOnly.
 */
export function isReadOnly (variableMetadata: VariableMetadata): boolean {
  return variableMetadata.mutability === MutabilityEnumType.ReadOnly
}

/**
 * Check if variable mutability type is WriteOnly.
 * @param variableMetadata Variable metadata.
 * @returns True if mutability is WriteOnly.
 */
export function isWriteOnly (variableMetadata: VariableMetadata): boolean {
  return variableMetadata.mutability === MutabilityEnumType.WriteOnly
}

/**
 * Resolve value for variable (dynamic or default).
 * @param chargingStation ChargingStation instance.
 * @param variableMetadata Variable metadata.
 * @returns Resolved value (dynamic or default or empty string).
 */
export function resolveValue (
  chargingStation: ChargingStation,
  variableMetadata: VariableMetadata
): string {
  if (variableMetadata.dynamicValueResolver) {
    return variableMetadata.dynamicValueResolver({ chargingStation })
  }
  // All defined persistence variants return defaultValue or empty
  return variableMetadata.defaultValue ?? ''
}

/**
 * Validate a raw variable value against metadata constraints.
 * Checks length, data type, range, enumeration, formatting rules.
 * @param variableMetadata Variable metadata definition.
 * @param rawValue Raw string value to validate.
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
      const decimalPattern = /^-?\d+(?:\.\d+)?$/
      if (!decimalPattern.test(rawValue)) {
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
      if (
        variableMetadata.enumeration?.length &&
        !variableMetadata.enumeration.includes(rawValue)
      ) {
        return {
          info: 'Value not in enumeration',
          ok: false,
          reason: ReasonCodeEnumType.InvalidValue,
        }
      }
      break
    }
    case DataEnumType.integer: {
      const signedIntegerPattern = /^-?\d+$/
      const decimalPattern = /^-?\d+\.\d+$/
      // Special zero-or-positive handling: negative or decimal value rejected with ValueZeroNotAllowed
      // for allowZero integer variables (e.g. WebSocketPingInterval) per test expectations.
      if (variableMetadata.allowZero && !variableMetadata.positive) {
        if (decimalPattern.test(rawValue)) {
          return {
            info: 'Integer >= 0 required',
            ok: false,
            reason: ReasonCodeEnumType.ValueZeroNotAllowed,
          }
        }
      }
      if (!signedIntegerPattern.test(rawValue)) {
        if (decimalPattern.test(rawValue)) {
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
      // Enforce positive-only first so zero/neg returns ValuePositiveOnly before min/max checks
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
      if (
        variableMetadata.enumeration &&
        variableMetadata.enumeration.length > 0 &&
        !variableMetadata.enumeration.includes(rawValue)
      ) {
        return {
          info: 'Value not in enumeration',
          ok: false,
          reason: ReasonCodeEnumType.InvalidValue,
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
      if (variableMetadata.enumeration?.length) {
        const enumeration = variableMetadata.enumeration ?? []
        const isUrlSchemeEnumeration = ['http:', 'https:', 'ws:', 'wss:'].every(s =>
          enumeration.includes(s)
        )
        if (isUrlSchemeEnumeration) {
          try {
            const url = new URL(rawValue)
            if (!variableMetadata.enumeration.includes(url.protocol)) {
              return {
                info: 'Unsupported URL scheme',
                ok: false,
                reason: ReasonCodeEnumType.InvalidURL,
              }
            }
          } catch {
            return { info: 'Invalid URL format', ok: false, reason: ReasonCodeEnumType.InvalidURL }
          }
        } else if (!variableMetadata.enumeration.includes(rawValue)) {
          return {
            info: 'Value not in enumeration',
            ok: false,
            reason: ReasonCodeEnumType.InvalidValue,
          }
        }
      }
      break
    }
    default:
      break
  }
  return { ok: true }
}
