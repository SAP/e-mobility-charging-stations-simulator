import {
  AvailabilityStatus,
  ChargingProfileStatus,
  ClearChargingProfileStatus,
  ConfigurationStatus,
  DataTransferStatus,
  GenericStatus,
  MeterValueMeasurand,
  ReservationStatus,
  TriggerMessageStatus,
  UnlockStatus
} from '../../types/index.js'
import { Constants } from '../../utils/index.js'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class OCPPConstants {
  static readonly OCPP_WEBSOCKET_TIMEOUT = 60000 // Ms

  static readonly OCPP_MEASURANDS_SUPPORTED = Object.freeze([
    MeterValueMeasurand.STATE_OF_CHARGE,
    MeterValueMeasurand.VOLTAGE,
    MeterValueMeasurand.POWER_ACTIVE_IMPORT,
    MeterValueMeasurand.CURRENT_IMPORT,
    MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
  ])

  static readonly OCPP_REQUEST_EMPTY = Constants.EMPTY_FROZEN_OBJECT
  static readonly OCPP_RESPONSE_EMPTY = Constants.EMPTY_FROZEN_OBJECT
  static readonly OCPP_RESPONSE_ACCEPTED = Object.freeze({
    status: GenericStatus.Accepted
  })

  static readonly OCPP_RESPONSE_REJECTED = Object.freeze({
    status: GenericStatus.Rejected
  })

  static readonly OCPP_CONFIGURATION_RESPONSE_ACCEPTED = Object.freeze({
    status: ConfigurationStatus.ACCEPTED
  })

  static readonly OCPP_CONFIGURATION_RESPONSE_REJECTED = Object.freeze({
    status: ConfigurationStatus.REJECTED
  })

  static readonly OCPP_CONFIGURATION_RESPONSE_REBOOT_REQUIRED = Object.freeze({
    status: ConfigurationStatus.REBOOT_REQUIRED
  })

  static readonly OCPP_CONFIGURATION_RESPONSE_NOT_SUPPORTED = Object.freeze({
    status: ConfigurationStatus.NOT_SUPPORTED
  })

  static readonly OCPP_SET_CHARGING_PROFILE_RESPONSE_ACCEPTED = Object.freeze({
    status: ChargingProfileStatus.ACCEPTED
  })

  static readonly OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED = Object.freeze({
    status: ChargingProfileStatus.REJECTED
  })

  static readonly OCPP_SET_CHARGING_PROFILE_RESPONSE_NOT_SUPPORTED = Object.freeze({
    status: ChargingProfileStatus.NOT_SUPPORTED
  })

  static readonly OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED = Object.freeze({
    status: ClearChargingProfileStatus.ACCEPTED
  })

  static readonly OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN = Object.freeze({
    status: ClearChargingProfileStatus.UNKNOWN
  })

  static readonly OCPP_RESPONSE_UNLOCKED = Object.freeze({
    status: UnlockStatus.UNLOCKED
  })

  static readonly OCPP_RESPONSE_UNLOCK_FAILED = Object.freeze({
    status: UnlockStatus.UNLOCK_FAILED
  })

  static readonly OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED = Object.freeze({
    status: UnlockStatus.NOT_SUPPORTED
  })

  static readonly OCPP_AVAILABILITY_RESPONSE_ACCEPTED = Object.freeze({
    status: AvailabilityStatus.ACCEPTED
  })

  static readonly OCPP_AVAILABILITY_RESPONSE_REJECTED = Object.freeze({
    status: AvailabilityStatus.REJECTED
  })

  static readonly OCPP_AVAILABILITY_RESPONSE_SCHEDULED = Object.freeze({
    status: AvailabilityStatus.SCHEDULED
  })

  static readonly OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED = Object.freeze({
    status: TriggerMessageStatus.ACCEPTED
  })

  static readonly OCPP_TRIGGER_MESSAGE_RESPONSE_REJECTED = Object.freeze({
    status: TriggerMessageStatus.REJECTED
  })

  static readonly OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED = Object.freeze({
    status: TriggerMessageStatus.NOT_IMPLEMENTED
  })

  static readonly OCPP_DATA_TRANSFER_RESPONSE_ACCEPTED = Object.freeze({
    status: DataTransferStatus.ACCEPTED
  })

  static readonly OCPP_DATA_TRANSFER_RESPONSE_REJECTED = Object.freeze({
    status: DataTransferStatus.REJECTED
  })

  static readonly OCPP_DATA_TRANSFER_RESPONSE_UNKNOWN_VENDOR_ID = Object.freeze({
    status: DataTransferStatus.UNKNOWN_VENDOR_ID
  })

  static readonly OCPP_RESERVATION_RESPONSE_ACCEPTED = Object.freeze({
    status: ReservationStatus.ACCEPTED
  }) // Reservation has been made

  static readonly OCPP_RESERVATION_RESPONSE_FAULTED = Object.freeze({
    status: ReservationStatus.FAULTED
  }) // Reservation has not been made, because of connector in FAULTED state

  static readonly OCPP_RESERVATION_RESPONSE_OCCUPIED = Object.freeze({
    status: ReservationStatus.OCCUPIED
  }) // Reservation has not been made, because all connectors are OCCUPIED

  static readonly OCPP_RESERVATION_RESPONSE_REJECTED = Object.freeze({
    status: ReservationStatus.REJECTED
  }) // Reservation has not been made, because charging station is not configured to accept reservations

  static readonly OCPP_RESERVATION_RESPONSE_UNAVAILABLE = Object.freeze({
    status: ReservationStatus.UNAVAILABLE
  }) // Reservation has not been made, because connector is in UNAVAILABLE state

  static readonly OCPP_CANCEL_RESERVATION_RESPONSE_ACCEPTED = Object.freeze({
    status: GenericStatus.Accepted
  }) // Reservation for id has been cancelled

  static readonly OCPP_CANCEL_RESERVATION_RESPONSE_REJECTED = Object.freeze({
    status: GenericStatus.Rejected
  }) // Reservation could not be cancelled, because there is no reservation active for id

  protected constructor () {
    // This is intentional
  }
}
