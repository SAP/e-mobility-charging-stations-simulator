import {
  AvailabilityStatus,
  ChargingProfileStatus,
  ClearChargingProfileStatus,
  ConfigurationStatus,
  DefaultStatus,
  TriggerMessageStatus,
  UnlockStatus,
} from '../types/ocpp/Responses';

import { MeterValueMeasurand } from '../types/ocpp/MeterValues';

export default class Constants {
  static readonly OCPP_RESPONSE_EMPTY = Object.freeze({});
  static readonly OCPP_RESPONSE_ACCEPTED = Object.freeze({ status: DefaultStatus.ACCEPTED });
  static readonly OCPP_RESPONSE_REJECTED = Object.freeze({ status: DefaultStatus.REJECTED });
  static readonly OCPP_CONFIGURATION_RESPONSE_ACCEPTED = Object.freeze({
    status: ConfigurationStatus.ACCEPTED,
  });

  static readonly OCPP_CONFIGURATION_RESPONSE_REJECTED = Object.freeze({
    status: ConfigurationStatus.REJECTED,
  });

  static readonly OCPP_CONFIGURATION_RESPONSE_REBOOT_REQUIRED = Object.freeze({
    status: ConfigurationStatus.REBOOT_REQUIRED,
  });

  static readonly OCPP_CONFIGURATION_RESPONSE_NOT_SUPPORTED = Object.freeze({
    status: ConfigurationStatus.NOT_SUPPORTED,
  });

  static readonly OCPP_SET_CHARGING_PROFILE_RESPONSE_ACCEPTED = Object.freeze({
    status: ChargingProfileStatus.ACCEPTED,
  });

  static readonly OCPP_SET_CHARGING_PROFILE_RESPONSE_REJECTED = Object.freeze({
    status: ChargingProfileStatus.REJECTED,
  });

  static readonly OCPP_SET_CHARGING_PROFILE_RESPONSE_NOT_SUPPORTED = Object.freeze({
    status: ChargingProfileStatus.NOT_SUPPORTED,
  });

  static readonly OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_ACCEPTED = Object.freeze({
    status: ClearChargingProfileStatus.ACCEPTED,
  });

  static readonly OCPP_CLEAR_CHARGING_PROFILE_RESPONSE_UNKNOWN = Object.freeze({
    status: ClearChargingProfileStatus.UNKNOWN,
  });

  static readonly OCPP_RESPONSE_UNLOCKED = Object.freeze({ status: UnlockStatus.UNLOCKED });
  static readonly OCPP_RESPONSE_UNLOCK_FAILED = Object.freeze({
    status: UnlockStatus.UNLOCK_FAILED,
  });

  static readonly OCPP_RESPONSE_UNLOCK_NOT_SUPPORTED = Object.freeze({
    status: UnlockStatus.NOT_SUPPORTED,
  });

  static readonly OCPP_AVAILABILITY_RESPONSE_ACCEPTED = Object.freeze({
    status: AvailabilityStatus.ACCEPTED,
  });

  static readonly OCPP_AVAILABILITY_RESPONSE_REJECTED = Object.freeze({
    status: AvailabilityStatus.REJECTED,
  });

  static readonly OCPP_AVAILABILITY_RESPONSE_SCHEDULED = Object.freeze({
    status: AvailabilityStatus.SCHEDULED,
  });

  static readonly OCPP_TRIGGER_MESSAGE_RESPONSE_ACCEPTED = Object.freeze({
    status: TriggerMessageStatus.ACCEPTED,
  });

  static readonly OCPP_TRIGGER_MESSAGE_RESPONSE_REJECTED = Object.freeze({
    status: TriggerMessageStatus.REJECTED,
  });

  static readonly OCPP_TRIGGER_MESSAGE_RESPONSE_NOT_IMPLEMENTED = Object.freeze({
    status: TriggerMessageStatus.NOT_IMPLEMENTED,
  });

  static readonly OCPP_DEFAULT_BOOT_NOTIFICATION_INTERVAL = 60000; // Ms
  static readonly OCPP_WEBSOCKET_TIMEOUT = 60000; // Ms
  static readonly OCPP_TRIGGER_MESSAGE_DELAY = 500; // Ms

  static readonly CHARGING_STATION_DEFAULT_RESET_TIME = 60000; // Ms
  static readonly CHARGING_STATION_ATG_INITIALIZATION_TIME = 1000; // Ms
  static readonly CHARGING_STATION_ATG_DEFAULT_STOP_AFTER_HOURS = 0.25; // Hours
  static readonly CHARGING_STATION_CONFIGURATION_SECTIONS = Object.freeze([
    'stationInfo',
    'configurationKey',
    'configurationHash',
  ]);

  static readonly DEFAULT_CIRCULAR_BUFFER_CAPACITY = Number.MAX_SAFE_INTEGER;

  static readonly DEFAULT_HASH_ALGORITHM = 'sha384';

  static readonly DEFAULT_IDTAG = '00000000';

  static readonly DEFAULT_CONNECTION_TIMEOUT = 30;

  static readonly DEFAULT_LOG_STATISTICS_INTERVAL = 60; // Seconds

  static readonly DEFAULT_HEARTBEAT_INTERVAL = 60000; // Ms

  static readonly SUPPORTED_MEASURANDS = Object.freeze([
    MeterValueMeasurand.STATE_OF_CHARGE,
    MeterValueMeasurand.VOLTAGE,
    MeterValueMeasurand.POWER_ACTIVE_IMPORT,
    MeterValueMeasurand.CURRENT_IMPORT,
    MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
  ]);

  static readonly DEFAULT_FLUCTUATION_PERCENT = 5;

  static readonly DEFAULT_PERFORMANCE_RECORDS_FILENAME = 'performanceRecords.json';
  static readonly DEFAULT_PERFORMANCE_RECORDS_DB_NAME = 'e-mobility-charging-stations-simulator';
  static readonly PERFORMANCE_RECORDS_TABLE = 'performance_records';

  static readonly DEFAULT_UI_WEBSOCKET_SERVER_HOST = 'localhost';
  static readonly DEFAULT_UI_WEBSOCKET_SERVER_PORT = 8080;
}
