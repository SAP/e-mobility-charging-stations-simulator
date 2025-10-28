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
  component: string
  dataType: DataEnumType
  defaultValue?: string
  description?: string
  dynamicValueResolver?: (ctx: { chargingStation: ChargingStation }) => string
  enumeration?: string[]
  max?: number
  maxLength?: number
  min?: number
  mutability: MutabilityEnumType
  persistence: PersistenceEnumType
  positive?: boolean
  postProcess?: (value: string, ctx: { chargingStation: ChargingStation }) => string
  rebootRequired?: boolean
  supportedAttributes: AttributeEnumType[]
  unit?: string
  variable: string
  vendorSpecific?: boolean
}

/**
 * Build unique registry key from component and variable names.
 * @param component Component name (case-sensitive original form).
 * @param variable Variable name (case-sensitive original form).
 * @returns Composite key `${component}::${variable}`.
 */
function key (component: string, variable: string): string {
  return `${component}::${variable}`
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
  // ChargingStation base component
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20OptionalVariableName.HeartbeatInterval
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
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
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'seconds',
    variable: OCPP20OptionalVariableName.WebSocketPingInterval as string,
  },
  // DateTime should be on ClockCtrlr per spec; keep ChargingStation entry for backward compatibility but add ClockCtrlr mapping below
  [key(OCPP20ComponentName.ChargingStation as string, OCPP20RequiredVariableName.DateTime)]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.dateTime,
    description: 'Current station date-time in ISO8601.',
    dynamicValueResolver: () => new Date().toISOString(),
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Volatile,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.DateTime as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20RequiredVariableName.EVConnectionTimeOut
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
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
  // MessageTimeout belongs to OCPPCommCtrlr(Default) per spec; retain ChargingStation mapping for compatibility
  [key(OCPP20ComponentName.ChargingStation as string, OCPP20RequiredVariableName.MessageTimeout)]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.DEFAULT_CONNECTION_TIMEOUT.toString(),
    description: 'Timeout for OCPP message response waiting.',
    max: 3600,
    maxLength: 10,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.MessageTimeout as string,
  },
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20RequiredVariableName.ReportingValueSize
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.integer,
    defaultValue: '2500',
    description: 'Maximum size of reported values.',
    max: 2500,
    maxLength: 5,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'chars',
    variable: OCPP20RequiredVariableName.ReportingValueSize as string,
  },
  [key(OCPP20ComponentName.ChargingStation as string, OCPP20RequiredVariableName.SecurityProfile)]:
    {
      component: OCPP20ComponentName.ChargingStation as string,
      dataType: DataEnumType.integer,
      description: 'Selected security profile.',
      enumeration: ['1', '2', '3', '4'],
      max: 4,
      maxLength: 1,
      min: 1,
      mutability: MutabilityEnumType.ReadWrite,
      persistence: PersistenceEnumType.Persistent,
      positive: true,
      rebootRequired: true,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: OCPP20RequiredVariableName.SecurityProfile as string,
    },
  // TxUpdatedInterval belongs to SampledDataCtrlr per spec; keep ChargingStation mapping for compatibility
  [key(
    OCPP20ComponentName.ChargingStation as string,
    OCPP20RequiredVariableName.TxUpdatedInterval
  )]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.DEFAULT_TX_UPDATED_INTERVAL.toString(),
    description: 'Interval for transaction update events.',
    max: 3600,
    maxLength: 10,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Volatile,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.TxUpdatedInterval as string,
  },
  [key(OCPP20ComponentName.ChargingStation as string, OCPP20VendorVariableName.ConnectionUrl)]: {
    component: OCPP20ComponentName.ChargingStation as string,
    dataType: DataEnumType.string,
    description: 'Central system connection URL.',
    enumeration: ['ws:', 'wss:', 'http:', 'https:'],
    maxLength: 512,
    mutability: MutabilityEnumType.WriteOnly,
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
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TimeSource as string,
  },
  [key(OCPP20ComponentName.DeviceDataCtrlr as string, OCPP20RequiredVariableName.BytesPerMessage)]:
    {
      component: OCPP20ComponentName.DeviceDataCtrlr as string,
      dataType: DataEnumType.integer,
      defaultValue: '8192',
      description: 'Maximum bytes for message payload (per instance).',
      max: 65535,
      min: 1,
      mutability: MutabilityEnumType.ReadOnly,
      persistence: PersistenceEnumType.Persistent,
      positive: true,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: OCPP20RequiredVariableName.BytesPerMessage as string,
    },
  [key(OCPP20ComponentName.DeviceDataCtrlr as string, OCPP20RequiredVariableName.ItemsPerMessage)]:
    {
      component: OCPP20ComponentName.DeviceDataCtrlr as string,
      dataType: DataEnumType.integer,
      defaultValue: '32',
      description: 'Maximum ComponentVariable entries per message (per instance).',
      max: 256,
      min: 1,
      mutability: MutabilityEnumType.ReadOnly,
      persistence: PersistenceEnumType.Persistent,
      positive: true,
      supportedAttributes: [AttributeEnumType.Actual],
      variable: OCPP20RequiredVariableName.ItemsPerMessage as string,
    },
  // DeviceDataCtrlr base + new limits
  [key(
    OCPP20ComponentName.DeviceDataCtrlr as string,
    OCPP20RequiredVariableName.ReportingValueSize
  )]: {
    component: OCPP20ComponentName.DeviceDataCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '2500',
    description: 'Maximum size of reported values (DeviceDataCtrlr).',
    max: 2500,
    maxLength: 5,
    min: 1,
    mutability: MutabilityEnumType.ReadOnly,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'chars',
    variable: OCPP20RequiredVariableName.ReportingValueSize as string,
  },
  [key(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.FileTransferProtocols
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'HTTP',
    description: 'Supported file transfer protocols.',
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.FileTransferProtocols as string,
  },
  // OCPPCommCtrlr variables
  [key(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.MessageAttemptInterval
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '5',
    description: 'Retry interval (TransactionEvent) before resubmitting failed message.',
    max: 3600,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.MessageAttemptInterval as string,
  },
  [key(OCPP20ComponentName.OCPPCommCtrlr as string, OCPP20RequiredVariableName.MessageAttempts)]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: '3',
    description: 'Max attempts (TransactionEvent) after initial send.',
    max: 10,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.MessageAttempts as string,
  },
  [key(OCPP20ComponentName.OCPPCommCtrlr as string, OCPP20RequiredVariableName.MessageTimeout)]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.integer,
    defaultValue: Constants.DEFAULT_CONNECTION_TIMEOUT.toString(),
    description: 'Timeout for OCPP message response waiting (Default instance).',
    max: 3600,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    supportedAttributes: [AttributeEnumType.Actual],
    unit: 'seconds',
    variable: OCPP20RequiredVariableName.MessageTimeout as string,
  },
  [key(
    OCPP20ComponentName.OCPPCommCtrlr as string,
    OCPP20RequiredVariableName.NetworkConfigurationPriority
  )]: {
    component: OCPP20ComponentName.OCPPCommCtrlr as string,
    dataType: DataEnumType.string,
    defaultValue: '',
    description: 'Comma separated ordered list of network profile priorities.',
    maxLength: 1024,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
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
    supportedAttributes: [AttributeEnumType.Actual],
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
    supportedAttributes: [AttributeEnumType.Actual],
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
    supportedAttributes: [AttributeEnumType.Actual],
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
  [key(
    OCPP20ComponentName.SampledDataCtrlr as string,
    OCPP20RequiredVariableName.TxEndedMeasurands
  )]: {
    component: OCPP20ComponentName.SampledDataCtrlr as string,
    dataType: DataEnumType.MemberList,
    defaultValue: 'Energy.Active.Import.Register,Current.Import',
    description: 'Measurands sampled at transaction end.',
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
    supportedAttributes: [AttributeEnumType.Actual],
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
      supportedAttributes: [AttributeEnumType.Actual],
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
    enumeration: ['1', '2', '3', '4'],
    max: 4,
    maxLength: 1,
    min: 1,
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    positive: true,
    rebootRequired: true,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.SecurityProfile as string,
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
    mutability: MutabilityEnumType.ReadWrite,
    persistence: PersistenceEnumType.Persistent,
    supportedAttributes: [AttributeEnumType.Actual],
    variable: OCPP20RequiredVariableName.TxStopPoint as string,
  },
}

const VARIABLE_REGISTRY_CANONICAL: Record<string, VariableMetadata> = Object.fromEntries(
  Object.entries(VARIABLE_REGISTRY).map(([k, v]) => [k.toLowerCase(), v])
)

/**
 * Apply optional metadata post-processing to a resolved variable value.
 * Executes `meta.postProcess` if defined; otherwise returns the original value.
 * @param chargingStation ChargingStation instance for context.
 * @param meta Variable metadata definition.
 * @param value Raw value prior to post processing.
 * @returns Post-processed value.
 */
export function applyPostProcess (
  chargingStation: ChargingStation,
  meta: VariableMetadata,
  value: string
): string {
  if (meta.postProcess) {
    return meta.postProcess(value, { chargingStation })
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
  const size = convertToIntOrNaN(sizeRaw ?? '2500')
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
 * @returns VariableMetadata or undefined if not registered.
 */
export function getVariableMetadata (
  component: string,
  variable: string
): undefined | VariableMetadata {
  const exact = VARIABLE_REGISTRY[key(component, variable)] as undefined | VariableMetadata
  if (exact) return exact
  return VARIABLE_REGISTRY_CANONICAL[key(component.toLowerCase(), variable.toLowerCase())]
}

/**
 * Check if variable persistence type is Persistent.
 * @param meta Variable metadata.
 * @returns True if persistence is Persistent.
 */
export function isPersistent (meta: VariableMetadata): boolean {
  return meta.persistence === PersistenceEnumType.Persistent
}

/**
 * Check if variable mutability type is ReadOnly.
 * @param meta Variable metadata.
 * @returns True if mutability is ReadOnly.
 */
export function isReadOnly (meta: VariableMetadata): boolean {
  return meta.mutability === MutabilityEnumType.ReadOnly
}

/**
 * Check if variable mutability type is WriteOnly.
 * @param meta Variable metadata.
 * @returns True if mutability is WriteOnly.
 */
export function isWriteOnly (meta: VariableMetadata): boolean {
  return meta.mutability === MutabilityEnumType.WriteOnly
}

/**
 * Resolve value for variable (dynamic or default).
 * @param chargingStation ChargingStation instance.
 * @param meta Variable metadata.
 * @returns Resolved value (dynamic or default or empty string).
 */
export function resolveValue (chargingStation: ChargingStation, meta: VariableMetadata): string {
  if (meta.dynamicValueResolver) {
    return meta.dynamicValueResolver({ chargingStation })
  }
  // All defined persistence variants return defaultValue or empty
  return meta.defaultValue ?? ''
}

/**
 * Validate a raw variable value against metadata constraints.
 * Checks length, data type, range, enumeration, formatting rules.
 * @param meta Variable metadata definition.
 * @param raw Raw string value to validate.
 * @returns Validation result with ok flag and optional reason/info.
 */
export function validateValue (
  meta: VariableMetadata,
  raw: string
): { info?: string; ok: boolean; reason?: ReasonCodeEnumType } {
  if (meta.maxLength != null && raw.length > meta.maxLength) {
    return {
      info: 'Value exceeds maximum length (' + String(meta.maxLength) + ')',
      ok: false,
      reason: ReasonCodeEnumType.InvalidValue,
    }
  }
  switch (meta.dataType) {
    case DataEnumType.boolean: {
      if (raw !== 'true' && raw !== 'false') {
        return {
          info: 'Boolean must be "true" or "false"',
          ok: false,
          reason: ReasonCodeEnumType.InvalidValue,
        }
      }
      break
    }
    case DataEnumType.dateTime: {
      if (isNaN(Date.parse(raw))) {
        return {
          info: 'Invalid dateTime format',
          ok: false,
          reason: ReasonCodeEnumType.InvalidValue,
        }
      }
      break
    }
    case DataEnumType.integer: {
      const signedIntegerPattern = /^-?\d+$/
      if (!signedIntegerPattern.test(raw)) {
        if (/^-?\d+\.\d+$/.test(raw)) {
          return { info: 'Positive integer', ok: false, reason: ReasonCodeEnumType.InvalidValue }
        }
        return {
          info: 'Non-empty digits only string required',
          ok: false,
          reason: ReasonCodeEnumType.InvalidValue,
        }
      }
      const num = Number(raw)
      if (meta.positive && num <= 0) {
        return {
          info: 'Positive integer > 0 required',
          ok: false,
          reason: ReasonCodeEnumType.ValuePositiveOnly,
        }
      }
      if (meta.allowZero && num < 0) {
        return {
          info: 'Integer >= 0 required',
          ok: false,
          reason: ReasonCodeEnumType.ValueZeroNotAllowed,
        }
      }
      if ((meta.min != null && num < meta.min) || (meta.max != null && num > meta.max)) {
        return {
          info:
            'Integer value out of range (' +
            (meta.min != null ? String(meta.min) : '') +
            '-' +
            (meta.max != null ? String(meta.max) : '') +
            ')',
          ok: false,
          reason: ReasonCodeEnumType.ValueOutOfRange,
        }
      }
      if (
        meta.enumeration &&
        meta.enumeration.length > 0 &&
        meta.enumeration[0] !== 'ws:' &&
        meta.enumeration[0] !== 'wss:' &&
        !meta.enumeration.includes(raw)
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
      // Generic comma separated list validation
      if (raw.trim().length === 0) {
        return { info: 'List cannot be empty', ok: false, reason: ReasonCodeEnumType.InvalidValue }
      }
      if (raw.startsWith(',') || raw.endsWith(',')) {
        return {
          info: 'No leading/trailing comma allowed',
          ok: false,
          reason: ReasonCodeEnumType.InvalidValue,
        }
      }
      const tokens = raw.split(',').map(t => t.trim())
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
      // Optional enumeration enforcement if provided on metadata (not currently used for list variables)
      if (meta.enumeration?.length) {
        for (const t of tokens) {
          if (!meta.enumeration.includes(t)) {
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
      if (
        meta.enumeration?.length &&
        ['http:', 'https:', 'ws:', 'wss:'].includes(meta.enumeration[0])
      ) {
        try {
          const url = new URL(raw)
          if (!meta.enumeration.includes(url.protocol)) {
            return {
              info: 'Unsupported URL scheme',
              ok: false,
              reason: ReasonCodeEnumType.InvalidURL,
            }
          }
        } catch {
          return { info: 'Invalid URL format', ok: false, reason: ReasonCodeEnumType.InvalidURL }
        }
      }
      break
    }
    default:
      break
  }
  return { ok: true }
}
