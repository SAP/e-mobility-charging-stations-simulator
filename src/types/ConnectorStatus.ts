import type { SampledValueTemplate } from './MeasurandPerPhaseSampledValueTemplates.js'
import type { ChargingProfile } from './ocpp/ChargingProfile.js'
import type { ConnectorEnumType } from './ocpp/ConnectorEnumType.js'
import type { ConnectorStatusEnum } from './ocpp/ConnectorStatusEnum.js'
import type { MeterValue } from './ocpp/MeterValues.js'
import type { AvailabilityType } from './ocpp/Requests.js'
import type { Reservation } from './ocpp/Reservation.js'

export interface ConnectorStatus {
  authorizeIdTag?: string
  availability: AvailabilityType
  bootStatus?: ConnectorStatusEnum
  chargingProfiles?: ChargingProfile[]
  energyActiveImportRegisterValue?: number // In Wh
  idTagAuthorized?: boolean
  idTagLocalAuthorized?: boolean
  localAuthorizeIdTag?: string
  MeterValues: SampledValueTemplate[]
  remoteStartId?: number
  reservation?: Reservation
  status?: ConnectorStatusEnum
  transactionBeginMeterValue?: MeterValue
  transactionEnergyActiveImportRegisterValue?: number // In Wh
  /**
   * OCPP 2.0.1 E01.FR.16 compliance: Track if evse has been sent for current transaction.
   * The evse field should only be provided in the first TransactionEventRequest
   * that occurs after the EV has connected.
   */
  transactionEvseSent?: boolean
  transactionId?: number | string
  transactionIdTag?: string
  /**
   * OCPP 2.0.1 E03.FR.01 compliance: Track if idToken has been sent for current transaction.
   * The idToken field should be provided once in the first TransactionEventRequest
   * that occurs after the transaction has been authorized.
   */
  transactionIdTokenSent?: boolean
  transactionRemoteStarted?: boolean
  transactionSeqNo?: number
  transactionSetInterval?: NodeJS.Timeout
  transactionStart?: Date
  transactionStarted?: boolean
  type?: ConnectorEnumType
}
