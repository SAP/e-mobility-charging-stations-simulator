import type { SampledValueTemplate } from './MeasurandPerPhaseSampledValueTemplates.js'
import type { OCPP20TransactionEventRequest } from './ocpp/2.0/Transaction.js'
import type { ChargingProfile } from './ocpp/ChargingProfile.js'
import type { ConnectorEnumType } from './ocpp/ConnectorEnumType.js'
import type { ConnectorStatusEnum } from './ocpp/ConnectorStatusEnum.js'
import type { MeterValue } from './ocpp/MeterValues.js'
import type { AvailabilityType } from './ocpp/Requests.js'
import type { Reservation } from './ocpp/Reservation.js'

export interface ConnectorEntry {
  readonly connectorId: number
  readonly connectorStatus: ConnectorStatus
  readonly evseId: number | undefined
}

export interface ConnectorStatus {
  authorizeIdTag?: string
  availability: AvailabilityType
  bootStatus?: ConnectorStatusEnum
  chargingProfiles?: ChargingProfile[]
  energyActiveImportRegisterValue?: number // In Wh
  idTagAuthorized?: boolean
  idTagLocalAuthorized?: boolean
  localAuthorizeIdTag?: string
  locked?: boolean
  MeterValues: SampledValueTemplate[]
  publicKeySentInTransaction?: boolean
  remoteStartId?: number
  reservation?: Reservation
  status?: ConnectorStatusEnum
  transactionBeginMeterValue?: MeterValue
  transactionDeauthorized?: boolean
  transactionDeauthorizedEnergyWh?: number
  transactionEndedMeterValues?: MeterValue[]
  transactionEndedMeterValuesSetInterval?: NodeJS.Timeout
  transactionEnergyActiveImportRegisterValue?: number // In Wh
  transactionEventQueue?: QueuedTransactionEvent[]
  transactionEvseSent?: boolean
  transactionGroupIdToken?: string
  transactionId?: number | string
  transactionIdTag?: string
  transactionIdTokenSent?: boolean
  transactionPending?: boolean
  transactionRemoteStarted?: boolean
  transactionSeqNo?: number
  transactionStart?: Date
  transactionStarted?: boolean
  transactionUpdatedMeterValuesSetInterval?: NodeJS.Timeout
  type?: ConnectorEnumType
}

export interface QueuedTransactionEvent {
  request: OCPP20TransactionEventRequest
  seqNo: number
  timestamp: Date
}
