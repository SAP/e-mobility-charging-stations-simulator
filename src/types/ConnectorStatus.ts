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
  reservation?: Reservation
  status?: ConnectorStatusEnum
  transactionBeginMeterValue?: MeterValue
  transactionEnergyActiveImportRegisterValue?: number // In Wh
  transactionId?: number
  transactionIdTag?: string
  transactionRemoteStarted?: boolean
  transactionSetInterval?: NodeJS.Timeout
  transactionStart?: Date
  transactionStarted?: boolean
  type?: ConnectorEnumType
}
