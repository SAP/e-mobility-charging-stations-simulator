import {
  type AutomaticTransactionGeneratorConfiguration,
  type ChargingStationInfo,
  CurrentType,
  OCPPVersion,
  VendorParametersKey,
} from '../types/index.js'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Constants {
  static readonly DEFAULT_ATG_CONFIGURATION: Readonly<AutomaticTransactionGeneratorConfiguration> =
    Object.freeze({
      enable: false,
      maxDelayBetweenTwoTransactions: 30,
      maxDuration: 120,
      minDelayBetweenTwoTransactions: 15,
      minDuration: 60,
      probabilityOfStart: 1,
      stopAbsoluteDuration: false,
      stopAfterHours: 0.25,
    })

  static readonly DEFAULT_ATG_WAIT_TIME_MS = 1000

  static readonly DEFAULT_AUTH_CACHE_CLEANUP_INTERVAL_SECONDS = 300

  static readonly DEFAULT_AUTH_CACHE_MAX_ENTRIES = 1000

  static readonly DEFAULT_AUTH_CACHE_RATE_LIMIT_MAX_REQUESTS = 10

  static readonly DEFAULT_AUTH_CACHE_RATE_LIMIT_WINDOW_MS = 60000

  static readonly DEFAULT_AUTH_CACHE_TTL_SECONDS = 3600

  static readonly DEFAULT_BOOT_NOTIFICATION_INTERVAL_MS = 60000

  static readonly DEFAULT_CIRCULAR_BUFFER_CAPACITY = 386

  static readonly DEFAULT_EV_CONNECTION_TIMEOUT_SECONDS = 180

  static readonly DEFAULT_FLUCTUATION_PERCENT = 5

  static readonly DEFAULT_HASH_ALGORITHM = 'sha384'

  static readonly DEFAULT_HEARTBEAT_INTERVAL_MS = 60000

  static readonly DEFAULT_LOG_STATISTICS_INTERVAL_SECONDS = 60

  static readonly DEFAULT_MESSAGE_BUFFER_FLUSH_INTERVAL_MS = 60000

  static readonly DEFAULT_MESSAGE_TIMEOUT_SECONDS = 30

  static readonly DEFAULT_METER_VALUES_INTERVAL_MS = 60000

  static readonly DEFAULT_PERFORMANCE_DIRECTORY = 'performance'

  static readonly DEFAULT_PERFORMANCE_RECORDS_DB_NAME = 'e-mobility-charging-stations-simulator'
  static readonly DEFAULT_PERFORMANCE_RECORDS_FILENAME = 'performanceRecords.json'
  static readonly DEFAULT_STATION_INFO: Readonly<Partial<ChargingStationInfo>> = Object.freeze({
    automaticTransactionGeneratorPersistentConfiguration: true,
    autoReconnectMaxRetries: -1,
    autoStart: true,
    beginEndMeterValues: false,
    currentOutType: CurrentType.AC,
    customValueLimitationMeterValues: true,
    enableStatistics: false,
    firmwareUpgrade: {
      reset: true,
      versionUpgrade: {
        step: 1,
      },
    },
    // See https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
    firmwareVersionPattern:
      '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$',
    mainVoltageMeterValues: true,
    meteringPerTransaction: true,
    ocppPersistentConfiguration: true,
    ocppStrictCompliance: true,
    ocppVersion: OCPPVersion.VERSION_16,
    outOfOrderEndMeterValues: false,
    phaseLineToLineVoltageMeterValues: false,
    reconnectExponentialDelay: false,
    registrationMaxRetries: -1,
    remoteAuthorization: true,
    resetTime: 30000,
    stationInfoPersistentConfiguration: true,
    stopTransactionsOnStopped: true,
    supervisionUrlOcppConfiguration: false,
    supervisionUrlOcppKey: VendorParametersKey.ConnectionUrl,
    transactionDataMeterValues: false,
    useConnectorId0: true,
  })

  static readonly DEFAULT_TX_UPDATED_INTERVAL_SECONDS = 30

  static readonly DEFAULT_UI_SERVER_HOST = 'localhost'
  static readonly DEFAULT_UI_SERVER_PORT = 8080

  static readonly DEFAULT_WS_HANDSHAKE_TIMEOUT_SECONDS = 30
  static readonly DEFAULT_WS_PING_INTERVAL_SECONDS = 30
  static readonly DEFAULT_WS_RECONNECT_DELAY_SECONDS = 30
  static readonly DEFAULT_WS_RECONNECT_TIMEOUT_OFFSET_MS = 1000

  static readonly EMPTY_FROZEN_OBJECT = Object.freeze({})

  static readonly EMPTY_FUNCTION: () => void = Object.freeze(() => {
    /* This is intentional */
  })

  static readonly MAX_RANDOM_INTEGER = 281474976710655 // 2^48 - 1 (randomInit() limit)

  // Node.js setInterval/setTimeout maximum safe delay value (2^31-1 ms ≈ 24.8 days)
  // Values exceeding this limit cause Node.js to reset the delay to 1ms
  static readonly MAX_SETINTERVAL_DELAY_MS = 2147483647

  static readonly PERFORMANCE_RECORDS_TABLE = 'performance_records'

  static readonly STOP_CHARGING_STATIONS_TIMEOUT_MS = 60000

  static readonly STOP_MESSAGE_SEQUENCE_TIMEOUT_MS = 30000
}
