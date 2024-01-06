import type { SampledValueTemplate } from './MeasurandPerPhaseSampledValueTemplates.js'
import type { ChargingProfile } from './ocpp/ChargingProfile.js'
import type { ConnectorStatusEnum } from './ocpp/ConnectorStatusEnum.js'
import type { MeterValue } from './ocpp/MeterValues.js'
import type { AvailabilityType } from './ocpp/Requests.js'
import type { Reservation } from './ocpp/Reservation.js'

export interface ConnectorStatus {
  availability: AvailabilityType
  bootStatus?: ConnectorStatusEnum
  status?: ConnectorStatusEnum
  MeterValues: SampledValueTemplate[]
  authorizeIdTag?: string
  idTagAuthorized?: boolean
  localAuthorizeIdTag?: string
  idTagLocalAuthorized?: boolean
  transactionRemoteStarted?: boolean
  transactionStarted?: boolean
  transactionStart?: Date
  transactionId?: number
  transactionSetInterval?: NodeJS.Timeout
  transactionIdTag?: string
  energyActiveImportRegisterValue?: number // In Wh
  transactionEnergyActiveImportRegisterValue?: number // In Wh
  transactionBeginMeterValue?: MeterValue
  chargingProfiles?: ChargingProfile[]
  reservation?: Reservation
}
