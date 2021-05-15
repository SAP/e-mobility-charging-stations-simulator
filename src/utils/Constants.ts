import { AvailabilityStatus, ChargingProfileStatus, ClearChargingProfileStatus, ConfigurationStatus, DefaultStatus, UnlockStatus } from '../types/ocpp/1.6/Responses';

export default class Constants {
  static readonly ENTITY_CHARGING_STATION = 'ChargingStation';
  static readonly ENTITY_AUTOMATIC_TRANSACTION_GENERATOR = 'AutomaticTransactionGenerator';

  static readonly OCPP_RESPONSE_ACCEPTED = Object.freeze({ status: DefaultStatus.ACCEPTED });
  static readonly OCPP_RESPONSE_REJECTED = Object.freeze({ status: DefaultStatus.REJECTED });
  static readonly OCPP_CONFIGURATION_RESPONSE_ACCEPTED = Object.freeze({ status: ConfigurationStatus.ACCEPTED });
  static readonly OCPP_CONFIGURATION_RESPONSE_REJECTED = Object.freeze({ status: ConfigurationStatus.REJECTED });
  static readonly OCPP_CONFIGURATION_RESPONSE_REBOOT_REQUIRED = Object.freeze({ status: ConfigurationStatus.REBOOT_REQUIRED });
  static readonly OCPP_CONFIGURATION_RESPONSE_NOT_SUPPORTED = Object.freeze({ status: ConfigurationStatus.NOT_SUPPORTED });
  static readonly OCPP_SET_CHARGING_PROFILE_RESPONSE_ACCEPTED = Object.freeze({ status: ChargingProfileStatus.ACCEPTED });
  static readonly OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED = Object.freeze({ status: ChargingProfileStatus.REJECTED });
  static readonly OCPP_SET_CHARGING_PROFILE_RESPONSE_NOT_SUPPORTED = Object.freeze({ status: ChargingProfileStatus.NOT_SUPPORTED });
  static readonly OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED = Object.freeze({ status: ClearChargingProfileStatus.ACCEPTED });
  static readonly OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN = Object.freeze({ status: ClearChargingProfileStatus.UNKNOWN });
  static readonly OCPP_RESPONSE_UNLOCKED = Object.freeze({ status: UnlockStatus.UNLOCKED });
  static readonly OCPP_RESPONSE_UNLOCK_FAILED = Object.freeze({ status: UnlockStatus.UNLOCK_FAILED });
  static readonly OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED = Object.freeze({ status: UnlockStatus.NOT_SUPPORTED });
  static readonly OCPP_AVAILABILITY_RESPONSE_ACCEPTED = Object.freeze({ status: AvailabilityStatus.ACCEPTED });
  static readonly OCPP_AVAILABILITY_RESPONSE_REJECTED = Object.freeze({ status: AvailabilityStatus.REJECTED });
  static readonly OCPP_AVAILABILITY_RESPONSE_SCHEDULED = Object.freeze({ status: AvailabilityStatus.SCHEDULED });

  static readonly OCPP_DEFAULT_BOOT_NOTIFICATION_INTERVAL = 60000; // Ms
  static readonly OCPP_ERROR_TIMEOUT = 60000; // 60 sec

  static readonly CHARGING_STATION_DEFAULT_RESET_TIME = 60000; // Ms
  static readonly CHARGING_STATION_ATG_WAIT_TIME = 2000; // Ms
  static readonly CHARGING_STATION_ATG_INITIALIZATION_TIME = 1000; // Ms

  static readonly TRANSACTION_DEFAULT_IDTAG = '00000000';

  static readonly WORKER_START_DELAY = 500;
  static readonly WORKER_POOL_MAX_INACTIVE_TIME = 60000;
}
