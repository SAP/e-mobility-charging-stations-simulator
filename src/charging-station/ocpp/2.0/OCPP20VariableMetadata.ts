import {
  OCPP20OptionalVariableName,
  OCPP20RequiredVariableName,
  OCPP20VendorVariableName,
} from '../../../types/ocpp/2.0/Variables.js'

export interface OCPP20VariableConstraintMetadata {
  allowZero?: boolean
  integer?: boolean
  maxLength?: number
  positive?: boolean
  urlProtocols?: string[]
}

export const VARIABLE_CONSTRAINTS: Record<string, OCPP20VariableConstraintMetadata> = {
  [OCPP20OptionalVariableName.HeartbeatInterval]: { integer: true, maxLength: 10, positive: true },
  [OCPP20OptionalVariableName.WebSocketPingInterval]: {
    allowZero: true,
    integer: true,
    maxLength: 10,
  },
  [OCPP20RequiredVariableName.BytesPerMessage]: { integer: true, maxLength: 7, positive: true },
  [OCPP20RequiredVariableName.EVConnectionTimeOut]: {
    integer: true,
    maxLength: 10,
    positive: true,
  },
  [OCPP20RequiredVariableName.ItemsPerMessage]: { integer: true, maxLength: 5, positive: true },
  [OCPP20RequiredVariableName.MessageTimeout]: { integer: true, maxLength: 10, positive: true },
  [OCPP20RequiredVariableName.ReportingValueSize]: { integer: true, maxLength: 5, positive: true },
  [OCPP20RequiredVariableName.TxUpdatedInterval]: { integer: true, maxLength: 10, positive: true },
  [OCPP20VendorVariableName.ConnectionUrl]: {
    maxLength: 512,
    urlProtocols: ['http:', 'https:', 'ws:', 'wss:'],
  },
}

export const DEFAULT_MAX_LENGTH = 1000
