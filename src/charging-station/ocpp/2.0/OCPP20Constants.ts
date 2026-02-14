import {
  type ConnectorStatusTransition,
  OCPP20ConnectorStatusEnumType,
  OCPP20TriggerReasonEnumType,
} from '../../../types/index.js'
import { OCPPConstants } from '../OCPPConstants.js'

interface TriggerReasonMap {
  condition?: string
  priority: number
  source?: string
  triggerReason: OCPP20TriggerReasonEnumType
}

export class OCPP20Constants extends OCPPConstants {
  static readonly ChargingStationStatusTransitions: readonly ConnectorStatusTransition[] =
    Object.freeze([
      { to: OCPP20ConnectorStatusEnumType.Available },
      // { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Available },
      {
        from: OCPP20ConnectorStatusEnumType.Available,
        to: OCPP20ConnectorStatusEnumType.Unavailable,
      },
      {
        from: OCPP20ConnectorStatusEnumType.Available,
        to: OCPP20ConnectorStatusEnumType.Faulted,
      },
      { to: OCPP20ConnectorStatusEnumType.Unavailable },
      {
        from: OCPP20ConnectorStatusEnumType.Unavailable,
        to: OCPP20ConnectorStatusEnumType.Available,
      },
      // {
      //   from: OCPP20ConnectorStatusEnumType.Unavailable,
      //   to: OCPP20ConnectorStatusEnumType.Unavailable
      // },
      {
        from: OCPP20ConnectorStatusEnumType.Unavailable,
        to: OCPP20ConnectorStatusEnumType.Faulted,
      },
      { to: OCPP20ConnectorStatusEnumType.Faulted },
      {
        from: OCPP20ConnectorStatusEnumType.Faulted,
        to: OCPP20ConnectorStatusEnumType.Available,
      },
      {
        from: OCPP20ConnectorStatusEnumType.Faulted,
        to: OCPP20ConnectorStatusEnumType.Unavailable,
      },
      // { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Faulted }
    ])

  static readonly ConnectorStatusTransitions: readonly ConnectorStatusTransition[] = Object.freeze([
    { to: OCPP20ConnectorStatusEnumType.Available },
    // { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Available },
    {
      from: OCPP20ConnectorStatusEnumType.Available,
      to: OCPP20ConnectorStatusEnumType.Occupied,
    },
    {
      from: OCPP20ConnectorStatusEnumType.Available,
      to: OCPP20ConnectorStatusEnumType.Reserved,
    },
    {
      from: OCPP20ConnectorStatusEnumType.Available,
      to: OCPP20ConnectorStatusEnumType.Unavailable,
    },
    {
      from: OCPP20ConnectorStatusEnumType.Available,
      to: OCPP20ConnectorStatusEnumType.Faulted,
    },
    // { to: OCPP20ConnectorStatusEnumType.Occupied },
    {
      from: OCPP20ConnectorStatusEnumType.Occupied,
      to: OCPP20ConnectorStatusEnumType.Available,
    },
    // { from: OCPP20ConnectorStatusEnumType.Occupied, to: OCPP20ConnectorStatusEnumType.Occupied },
    // { from: OCPP20ConnectorStatusEnumType.Occupied, to: OCPP20ConnectorStatusEnumType.Reserved },
    {
      from: OCPP20ConnectorStatusEnumType.Occupied,
      to: OCPP20ConnectorStatusEnumType.Unavailable,
    },
    {
      from: OCPP20ConnectorStatusEnumType.Occupied,
      to: OCPP20ConnectorStatusEnumType.Faulted,
    },
    // { to: OCPP20ConnectorStatusEnumType.Reserved },
    {
      from: OCPP20ConnectorStatusEnumType.Reserved,
      to: OCPP20ConnectorStatusEnumType.Available,
    },
    {
      from: OCPP20ConnectorStatusEnumType.Reserved,
      to: OCPP20ConnectorStatusEnumType.Occupied,
    },
    // { from: OCPP20ConnectorStatusEnumType.Reserved, to: OCPP20ConnectorStatusEnumType.Reserved },
    {
      from: OCPP20ConnectorStatusEnumType.Reserved,
      to: OCPP20ConnectorStatusEnumType.Unavailable,
    },
    {
      from: OCPP20ConnectorStatusEnumType.Reserved,
      to: OCPP20ConnectorStatusEnumType.Faulted,
    },
    { to: OCPP20ConnectorStatusEnumType.Unavailable },
    {
      from: OCPP20ConnectorStatusEnumType.Unavailable,
      to: OCPP20ConnectorStatusEnumType.Available,
    },
    {
      from: OCPP20ConnectorStatusEnumType.Unavailable,
      to: OCPP20ConnectorStatusEnumType.Occupied,
    },
    // { from: OCPP20ConnectorStatusEnumType.Unavailable, to: OCPP20ConnectorStatusEnumType.Reserved },
    // { from: OCPP20ConnectorStatusEnumType.Unavailable, to: OCPP20ConnectorStatusEnumType.Unavailable },
    {
      from: OCPP20ConnectorStatusEnumType.Unavailable,
      to: OCPP20ConnectorStatusEnumType.Faulted,
    },
    { to: OCPP20ConnectorStatusEnumType.Faulted },
    {
      from: OCPP20ConnectorStatusEnumType.Faulted,
      to: OCPP20ConnectorStatusEnumType.Available,
    },
    {
      from: OCPP20ConnectorStatusEnumType.Faulted,
      to: OCPP20ConnectorStatusEnumType.Occupied,
    },
    {
      from: OCPP20ConnectorStatusEnumType.Faulted,
      to: OCPP20ConnectorStatusEnumType.Reserved,
    },
    {
      from: OCPP20ConnectorStatusEnumType.Faulted,
      to: OCPP20ConnectorStatusEnumType.Unavailable,
    },
    // { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Faulted }
  ])

  static readonly TriggerReasonMapping: readonly TriggerReasonMap[] = Object.freeze([
    // Priority 1: Remote Commands (highest priority)
    {
      condition: 'RequestStartTransaction command',
      priority: 1,
      source: 'remote_command',
      triggerReason: OCPP20TriggerReasonEnumType.RemoteStart,
    },
    {
      condition: 'RequestStopTransaction command',
      priority: 1,
      source: 'remote_command',
      triggerReason: OCPP20TriggerReasonEnumType.RemoteStop,
    },
    {
      condition: 'Reset command',
      priority: 1,
      source: 'remote_command',
      triggerReason: OCPP20TriggerReasonEnumType.ResetCommand,
    },
    {
      condition: 'TriggerMessage command',
      priority: 1,
      source: 'remote_command',
      triggerReason: OCPP20TriggerReasonEnumType.Trigger,
    },
    {
      condition: 'UnlockConnector command',
      priority: 1,
      source: 'remote_command',
      triggerReason: OCPP20TriggerReasonEnumType.UnlockCommand,
    },
    // Priority 2: Authorization Events
    {
      condition: 'idToken or groupIdToken authorization',
      priority: 2,
      source: 'local_authorization',
      triggerReason: OCPP20TriggerReasonEnumType.Authorized,
    },
    {
      condition: 'Deauthorization event',
      priority: 2,
      source: 'local_authorization',
      triggerReason: OCPP20TriggerReasonEnumType.Deauthorized,
    },
    {
      condition: 'Stop authorization',
      priority: 2,
      source: 'local_authorization',
      triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
    },
    // Priority 3: Cable Physical Actions
    {
      condition: 'Cable plugged in event',
      priority: 3,
      source: 'cable_action',
      triggerReason: OCPP20TriggerReasonEnumType.CablePluggedIn,
    },
    {
      condition: 'EV cable/detection event',
      priority: 3,
      source: 'cable_action',
      triggerReason: OCPP20TriggerReasonEnumType.EVDetected,
    },
    {
      condition: 'Cable unplugged event',
      priority: 3,
      source: 'cable_action',
      triggerReason: OCPP20TriggerReasonEnumType.EVDeparted,
    },
    // Priority 4: Charging State Changes
    {
      condition: 'Charging state transition',
      priority: 4,
      source: 'charging_state',
      triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
    },
    // Priority 5: System Events
    {
      condition: 'EV communication lost',
      priority: 5,
      source: 'system_event',
      triggerReason: OCPP20TriggerReasonEnumType.EVCommunicationLost,
    },
    {
      condition: 'EV connect timeout',
      priority: 5,
      source: 'system_event',
      triggerReason: OCPP20TriggerReasonEnumType.EVConnectTimeout,
    },
    {
      condition: 'EV departure system event',
      priority: 5,
      source: 'system_event',
      triggerReason: OCPP20TriggerReasonEnumType.EVDeparted,
    },
    {
      condition: 'EV detection system event',
      priority: 5,
      source: 'system_event',
      triggerReason: OCPP20TriggerReasonEnumType.EVDetected,
    },
    // Priority 6: Meter Value Events
    {
      condition: 'Signed meter value received',
      priority: 6,
      source: 'meter_value',
      triggerReason: OCPP20TriggerReasonEnumType.SignedDataReceived,
    },
    {
      condition: 'Periodic meter value',
      priority: 6,
      source: 'meter_value',
      triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
    },
    {
      condition: 'Clock-based meter value',
      priority: 6,
      source: 'meter_value',
      triggerReason: OCPP20TriggerReasonEnumType.MeterValueClock,
    },
    // Priority 7: Energy and Time Limits
    {
      condition: 'Energy limit reached',
      priority: 7,
      source: 'energy_limit',
      triggerReason: OCPP20TriggerReasonEnumType.EnergyLimitReached,
    },
    {
      condition: 'Time limit reached',
      priority: 7,
      source: 'time_limit',
      triggerReason: OCPP20TriggerReasonEnumType.TimeLimitReached,
    },
    // Priority 8: Abnormal Conditions (lowest priority)
    {
      condition: 'Abnormal condition detected',
      priority: 8,
      source: 'abnormal_condition',
      triggerReason: OCPP20TriggerReasonEnumType.AbnormalCondition,
    },
  ])
}
