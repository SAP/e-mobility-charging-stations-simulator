import type { AutomaticTransactionGeneratorConfiguration } from '../types';

export class Constants {
  static readonly DEFAULT_BOOT_NOTIFICATION_INTERVAL = 60000; // Ms
  static readonly DEFAULT_HEARTBEAT_INTERVAL = 60000; // Ms
  static readonly DEFAULT_METER_VALUES_INTERVAL = 60000; // Ms

  static readonly CHARGING_STATION_DEFAULT_RESET_TIME = 60000; // Ms
  static readonly CHARGING_STATION_ATG_AVAILABILITY_TIME = 1000; // Ms
  static readonly CHARGING_STATION_ATG_INITIALIZATION_TIME = 1000; // Ms

  static readonly DEFAULT_ATG_CONFIGURATION: AutomaticTransactionGeneratorConfiguration =
    Object.freeze({
      enable: false,
      minDuration: 60,
      maxDuration: 120,
      minDelayBetweenTwoTransactions: 15,
      maxDelayBetweenTwoTransactions: 30,
      probabilityOfStart: 1,
      stopAfterHours: 0.25,
      stopOnConnectionFailure: true,
    });

  // See https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
  static readonly SEMVER_PATTERN =
    '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$';

  static readonly DEFAULT_CIRCULAR_BUFFER_CAPACITY = 4096;

  static readonly DEFAULT_HASH_ALGORITHM = 'sha384';

  static readonly DEFAULT_IDTAG = '00000000';

  static readonly DEFAULT_CONNECTION_TIMEOUT = 30;

  static readonly DEFAULT_LOG_STATISTICS_INTERVAL = 60; // Seconds

  static readonly DEFAULT_FLUCTUATION_PERCENT = 5;

  static readonly DEFAULT_PERFORMANCE_DIRECTORY = 'performance';
  static readonly DEFAULT_PERFORMANCE_RECORDS_FILENAME = 'performanceRecords.json';
  static readonly DEFAULT_PERFORMANCE_RECORDS_DB_NAME = 'e-mobility-charging-stations-simulator';
  static readonly PERFORMANCE_RECORDS_TABLE = 'performance_records';

  static readonly DEFAULT_UI_SERVER_HOST = 'localhost';
  static readonly DEFAULT_UI_SERVER_PORT = 8080;

  static readonly UNKNOWN_COMMAND = 'unknown command';

  static readonly MAX_RANDOM_INTEGER = 281474976710654;

  static readonly STOP_CHARGING_STATIONS_TIMEOUT = 120000; // Ms

  static readonly EMPTY_FROZEN_OBJECT = Object.freeze({});
  static readonly EMPTY_FUNCTION = Object.freeze(() => {
    /* This is intentional */
  });

  static readonly DEFAULT_MESSAGE_BUFFER_FLUSH_INTERVAL = 60000; // Ms

  private constructor() {
    // This is intentional
  }
}
